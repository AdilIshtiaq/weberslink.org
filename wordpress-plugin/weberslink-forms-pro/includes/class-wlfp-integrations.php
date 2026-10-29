<?php
defined( 'ABSPATH' ) || exit;

/**
 * Feeds run after a submission (or after payment). Types: webhook, slack, discord, teams,
 * telegram, mailchimp, user_registration. Custom: add_filter('wlfp_feed_types') + add_action('wlfp_feed_{type}').
 */
class WLFP_Integrations {

	public static function init() {}

	public static function types() {
		return apply_filters( 'wlfp_feed_types', array(
			'webhook'           => __( 'Webhook (Zapier, Make, n8n, Google Sheets, any URL)', 'weberslink-forms-pro' ),
			'slack'             => __( 'Slack', 'weberslink-forms-pro' ),
			'discord'           => __( 'Discord', 'weberslink-forms-pro' ),
			'teams'             => __( 'Microsoft Teams', 'weberslink-forms-pro' ),
			'telegram'          => __( 'Telegram', 'weberslink-forms-pro' ),
			'mailchimp'         => __( 'Mailchimp', 'weberslink-forms-pro' ),
			'user_registration' => __( 'Create WordPress user', 'weberslink-forms-pro' ),
			'create_post'       => __( 'Create a post / page / custom post', 'weberslink-forms-pro' ),
		) );
	}

	public static function run( $form, $entry ) {
		foreach ( (array) $form['settings']['feeds'] as $feed ) {
			if ( empty( $feed['enabled'] ) || empty( $feed['type'] ) ) {
				continue;
			}
			if ( ! WLFP_Logic::passes( isset( $feed['conditional'] ) ? $feed['conditional'] : array(), $entry['data'] ) ) {
				continue;
			}
			$name = ! empty( $feed['name'] ) ? $feed['name'] : $feed['type'];
			try {
				$res = null;
				switch ( $feed['type'] ) {
					case 'webhook':
						$res = self::webhook( $feed, $form, $entry );
						break;
					case 'slack':
					case 'discord':
					case 'teams':
						$res = self::chat( $feed, $form, $entry );
						break;
					case 'telegram':
						$res = self::telegram( $feed, $form, $entry );
						break;
					case 'mailchimp':
						$res = self::mailchimp( $feed, $form, $entry );
						break;
					case 'user_registration':
						$res = self::register_user( $feed, $form, $entry );
						break;
					case 'create_post':
						$res = self::create_post( $feed, $form, $entry );
						break;
					default:
						do_action( 'wlfp_feed_' . $feed['type'], $feed, $form, $entry );
						$res = true;
				}
				if ( is_wp_error( $res ) ) {
					WLFP_Install::log( $form['id'], $entry['id'], 'feed:' . $feed['type'], 'failed', $name . ' failed', $res->get_error_message() );
				} else {
					WLFP_Install::log( $form['id'], $entry['id'], 'feed:' . $feed['type'], 'success', $name . ' ran', is_scalar( $res ) ? (string) $res : '' );
				}
			} catch ( Exception $e ) {
				WLFP_Install::log( $form['id'], $entry['id'], 'feed:' . $feed['type'], 'failed', $name . ' error', $e->getMessage() );
			}
		}
	}

	private static function m( $text, $form, $entry, $html = false ) {
		return WLFP_Merge::parse( (string) $text, $form, $entry['data'], $entry, $html );
	}

	private static function http_result( $r ) {
		if ( is_wp_error( $r ) ) {
			return $r;
		}
		$code = wp_remote_retrieve_response_code( $r );
		if ( $code < 200 || $code >= 300 ) {
			return new WP_Error( 'wlfp_http', 'HTTP ' . $code . ' ' . mb_substr( wp_remote_retrieve_body( $r ), 0, 300 ) );
		}
		return 'HTTP ' . $code;
	}

	/** Entry data as a flat, human-readable map, plus metadata. */
	public static function payload( $form, $entry ) {
		$out = array();
		foreach ( $form['fields'] as $f ) {
			if ( empty( $f['name'] ) || ! WLFP_Fields::stores_value( $f['type'] ) || ! isset( $entry['data'][ $f['name'] ] ) ) {
				continue;
			}
			$v = $entry['data'][ $f['name'] ];
			$out[ $f['name'] ] = in_array( $f['type'], array( 'name', 'address', 'checkbox', 'multiselect', 'repeater', 'likert' ), true ) ? $v : ( in_array( $f['type'], array( 'file', 'image' ), true ) ? wp_list_pluck( (array) $v, 'url' ) : ( 'password' === $f['type'] ? '' : $v ) );
		}
		return array( 'form_id' => $form['id'], 'form_title' => $form['title'], 'entry_id' => $entry['id'], 'submitted_at' => $entry['created_at'], 'ip' => $entry['ip'], 'source_url' => $entry['source_url'] ?? '', 'payment_status' => $entry['payment_status'], 'payment_total' => $entry['payment_total'], 'currency' => $entry['currency'], 'fields' => $out );
	}

	private static function webhook( $feed, $form, $entry ) {
		$url = esc_url_raw( self::m( $feed['url'] ?? '', $form, $entry ) );
		if ( ! $url || ! wp_http_validate_url( $url ) ) {
			return new WP_Error( 'wlfp_url', 'Invalid webhook URL' );
		}
		$method = 'GET' === strtoupper( $feed['method'] ?? 'POST' ) ? 'GET' : 'POST';
		$body   = self::payload( $form, $entry );
		if ( ! empty( $feed['mapping'] ) ) {
			$body = array();
			foreach ( preg_split( '/\r?\n/', $feed['mapping'] ) as $line ) {
				$kv = explode( '=', $line, 2 );
				if ( 2 === count( $kv ) && trim( $kv[0] ) ) {
					$body[ trim( $kv[0] ) ] = self::m( trim( $kv[1] ), $form, $entry );
				}
			}
		}
		$headers = array();
		foreach ( preg_split( '/\r?\n/', (string) ( $feed['headers'] ?? '' ) ) as $line ) {
			$kv = explode( ':', $line, 2 );
			if ( 2 === count( $kv ) && preg_match( '/^[A-Za-z0-9\-]+$/', trim( $kv[0] ) ) ) {
				$headers[ trim( $kv[0] ) ] = self::m( trim( $kv[1] ), $form, $entry );
			}
		}
		$args = array( 'method' => $method, 'timeout' => 10, 'headers' => $headers, 'user-agent' => 'WeberslinkForms/' . WLFP_VERSION );
		if ( 'GET' === $method ) {
			$url = add_query_arg( self::flat( $body ), $url );
		} elseif ( 'form' === ( $feed['format'] ?? 'json' ) ) {
			$args['body'] = self::flat( $body );
		} else {
			$args['headers']['Content-Type'] = 'application/json';
			$args['body']                    = wp_json_encode( $body );
		}
		return self::http_result( wp_remote_request( $url, $args ) );
	}

	private static function flat( $arr, $prefix = '' ) {
		$o = array();
		foreach ( (array) $arr as $k => $v ) {
			$key = '' === $prefix ? $k : $prefix . '[' . $k . ']';
			if ( is_array( $v ) ) {
				$o += self::flat( $v, $key );
			} else {
				$o[ $key ] = $v;
			}
		}
		return $o;
	}

	private static function chat( $feed, $form, $entry ) {
		$url = esc_url_raw( $feed['url'] ?? '' );
		if ( ! $url || ! wp_http_validate_url( $url ) ) {
			return new WP_Error( 'wlfp_url', 'Invalid webhook URL' );
		}
		$text = self::m( ! empty( $feed['message'] ) ? $feed['message'] : "New submission on {form_title}\n{all_data}", $form, $entry, false );
		$text = mb_substr( $text, 0, 1900 );
		if ( 'slack' === $feed['type'] ) {
			$body = array( 'text' => $text );
		} elseif ( 'discord' === $feed['type'] ) {
			$body = array( 'content' => $text );
		} else {
			$body = array( '@type' => 'MessageCard', '@context' => 'https://schema.org/extensions', 'summary' => $form['title'], 'text' => nl2br( esc_html( $text ) ) );
		}
		return self::http_result( wp_remote_post( $url, array( 'timeout' => 10, 'headers' => array( 'Content-Type' => 'application/json' ), 'body' => wp_json_encode( $body ) ) ) );
	}

	private static function telegram( $feed, $form, $entry ) {
		$token = preg_replace( '/[^0-9A-Za-z:_\-]/', '', $feed['token'] ?? '' );
		$chat  = sanitize_text_field( $feed['chat_id'] ?? '' );
		if ( ! $token || ! $chat ) {
			return new WP_Error( 'wlfp_cfg', 'Telegram token or chat id missing' );
		}
		$text = self::m( ! empty( $feed['message'] ) ? $feed['message'] : "New submission on {form_title}\n{all_data}", $form, $entry, false );
		return self::http_result( wp_remote_post( 'https://api.telegram.org/bot' . $token . '/sendMessage', array( 'timeout' => 10, 'body' => array( 'chat_id' => $chat, 'text' => mb_substr( $text, 0, 3900 ) ) ) ) );
	}

	private static function mailchimp( $feed, $form, $entry ) {
		$key = WLFP_Helpers::setting( 'mailchimp_key' );
		if ( ! $key || false === strpos( $key, '-' ) ) {
			return new WP_Error( 'wlfp_cfg', 'Mailchimp API key missing (Settings → Integrations)' );
		}
		$dc    = preg_replace( '/[^a-z0-9]/i', '', substr( strrchr( $key, '-' ), 1 ) );
		$email = sanitize_email( self::m( $feed['email'] ?? '', $form, $entry ) );
		$list  = preg_replace( '/[^a-z0-9]/i', '', $feed['list_id'] ?? '' );
		if ( ! is_email( $email ) || ! $list ) {
			return new WP_Error( 'wlfp_cfg', 'Email or audience ID missing' );
		}
		$merge = array();
		if ( ! empty( $feed['fname'] ) ) {
			$merge['FNAME'] = self::m( $feed['fname'], $form, $entry );
		}
		if ( ! empty( $feed['lname'] ) ) {
			$merge['LNAME'] = self::m( $feed['lname'], $form, $entry );
		}
		$body = array( 'email_address' => $email, 'status_if_new' => ! empty( $feed['double_optin'] ) ? 'pending' : 'subscribed', 'status' => ! empty( $feed['double_optin'] ) ? 'pending' : 'subscribed' );
		if ( $merge ) {
			$body['merge_fields'] = $merge;
		}
		if ( ! empty( $feed['tags'] ) ) {
			$body['tags'] = array_values( array_filter( array_map( 'trim', explode( ',', self::m( $feed['tags'], $form, $entry ) ) ) ) );
		}
		$hash = md5( strtolower( $email ) );
		return self::http_result( wp_remote_request( "https://{$dc}.api.mailchimp.com/3.0/lists/{$list}/members/{$hash}", array( 'method' => 'PUT', 'timeout' => 15, 'headers' => array( 'Authorization' => 'Basic ' . base64_encode( 'anystring:' . $key ), 'Content-Type' => 'application/json' ), 'body' => wp_json_encode( $body ) ) ) );
	}

	private static function create_post( $feed, $form, $entry ) {
		$pt  = sanitize_key( isset( $feed['post_type'] ) ? $feed['post_type'] : 'post' );
		$obj = post_type_exists( $pt ) ? get_post_type_object( $pt ) : null;
		if ( ! $obj || ! $obj->public ) {
			$pt = 'post';
		}
		$status = isset( $feed['status'] ) && in_array( $feed['status'], array( 'draft', 'pending', 'private', 'publish' ), true ) ? $feed['status'] : 'draft';
		$title  = wp_strip_all_tags( self::m( ! empty( $feed['title'] ) ? $feed['title'] : '{form_title}', $form, $entry ) );
		$body   = wp_kses_post( self::m( ! empty( $feed['content'] ) ? $feed['content'] : '{all_data}', $form, $entry, true ) );
		$author = isset( $feed['author'] ) ? (int) $feed['author'] : 0;
		if ( ! $author || ! get_userdata( $author ) ) {
			$admins = get_users( array( 'role' => 'administrator', 'number' => 1, 'fields' => 'ID' ) );
			$author = $admins ? (int) $admins[0] : 0;
		}
		$id = wp_insert_post( array( 'post_type' => $pt, 'post_status' => $status, 'post_title' => '' !== $title ? $title : __( 'Untitled', 'weberslink-forms-pro' ), 'post_content' => $body, 'post_author' => $author ), true );
		if ( is_wp_error( $id ) ) {
			return $id;
		}
		foreach ( preg_split( '/\r?\n/', (string) ( isset( $feed['meta'] ) ? $feed['meta'] : '' ) ) as $line ) {
			$kv = explode( '=', $line, 2 );
			$k  = 2 === count( $kv ) ? sanitize_key( trim( $kv[0] ) ) : '';
			if ( '' !== $k && '_' !== $k[0] ) { // Never write protected (underscore) meta.
				update_post_meta( $id, $k, sanitize_text_field( self::m( trim( $kv[1] ), $form, $entry ) ) );
			}
		}
		if ( 'post' === $pt && ! empty( $feed['category'] ) && term_exists( (int) $feed['category'], 'category' ) ) {
			wp_set_object_terms( $id, array( (int) $feed['category'] ), 'category' );
		}
		return $pt . ' #' . $id;
	}

	private static function register_user( $feed, $form, $entry ) {
		$email = sanitize_email( self::m( $feed['email'] ?? '', $form, $entry ) );
		if ( ! is_email( $email ) ) {
			return new WP_Error( 'wlfp_cfg', 'Invalid email' );
		}
		if ( email_exists( $email ) ) {
			return new WP_Error( 'wlfp_exists', 'A user with this email already exists' );
		}
		$login = sanitize_user( self::m( $feed['username'] ?? '', $form, $entry ), true );
		if ( ! $login ) {
			$login = sanitize_user( current( explode( '@', $email ) ), true );
		}
		$base = $login;
		$i    = 1;
		while ( username_exists( $login ) ) {
			$login = $base . ( $i++ );
		}
		$pw = self::m( $feed['password'] ?? '', $form, $entry );
		$pw = $pw ? $pw : wp_generate_password( 16 );
		$role = isset( $feed['role'] ) ? sanitize_key( $feed['role'] ) : 'subscriber';
		$blocked = apply_filters( 'wlfp_blocked_registration_roles', array( 'administrator', 'editor', 'shop_manager' ) );
		if ( in_array( $role, $blocked, true ) || ! get_role( $role ) ) {
			$role = 'subscriber';
		}
		$uid = wp_insert_user( array( 'user_login' => $login, 'user_email' => $email, 'user_pass' => $pw, 'first_name' => self::m( $feed['first_name'] ?? '', $form, $entry ), 'last_name' => self::m( $feed['last_name'] ?? '', $form, $entry ), 'role' => $role ) );
		if ( is_wp_error( $uid ) ) {
			return $uid;
		}
		if ( ! empty( $feed['notify'] ) ) {
			wp_new_user_notification( $uid, null, 'user' );
		}
		return 'user #' . $uid;
	}
}
