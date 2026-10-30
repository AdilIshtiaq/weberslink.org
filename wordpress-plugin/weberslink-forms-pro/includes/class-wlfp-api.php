<?php
defined( 'ABSPATH' ) || exit;

/**
 * Read-only REST API secured by API keys (Settings → REST API).
 * Header:  Authorization: Bearer wlfp_xxxxxxxx...   (or X-WLFP-Key)
 * Routes:  GET /wp-json/weberslink-forms/v1/api/forms
 *          GET /wp-json/weberslink-forms/v1/api/forms/{id}
 *          GET /wp-json/weberslink-forms/v1/api/forms/{id}/entries?per_page=50&page=1&since=2026-01-01&stage=New
 *          GET /wp-json/weberslink-forms/v1/api/entries/{id}
 */
class WLFP_Api {

	const OPTION = 'wlfp_api_keys';

	public static function init() {
		add_action( 'rest_api_init', array( __CLASS__, 'routes' ) );
		add_action( 'admin_post_wlfp_api_create', array( __CLASS__, 'admin_create' ) );
		add_action( 'admin_post_wlfp_api_revoke', array( __CLASS__, 'admin_revoke' ) );
	}

	/** Returns array( plain_key, record ). The plain key is never stored. */
	public static function generate( $label ) {
		$key = 'wlfp_' . wp_generate_password( 40, false, false );
		return array( $key, array( 'label' => $label, 'hash' => hash( 'sha256', $key ), 'prefix' => substr( $key, 0, 9 ), 'created' => time(), 'last_used' => 0 ) );
	}

	/** Finds the id of the stored key matching $key (constant-time), or ''. */
	public static function match( $key, $keys ) {
		$h = hash( 'sha256', (string) $key );
		foreach ( (array) $keys as $id => $rec ) {
			if ( ! empty( $rec['hash'] ) && hash_equals( $rec['hash'], $h ) ) {
				return (string) $id;
			}
		}
		return '';
	}

	private static function request_key( $req ) {
		$h = $req->get_header( 'authorization' );
		if ( $h && preg_match( '/^Bearer\s+(\S+)$/i', $h, $m ) ) {
			return $m[1];
		}
		return (string) $req->get_header( 'x-wlfp-key' );
	}

	public static function authorize( $req ) {
		$key = self::request_key( $req );
		$ids = self::match( $key, get_option( self::OPTION, array() ) );
		if ( '' === $key || '' === $ids ) {
			return new WP_Error( 'wlfp_unauthorized', __( 'Invalid or missing API key.', 'weberslink-forms-pro' ), array( 'status' => 401 ) );
		}
		$keys = get_option( self::OPTION, array() );
		if ( isset( $keys[ $ids ] ) && time() - (int) $keys[ $ids ]['last_used'] > 300 ) {
			$keys[ $ids ]['last_used'] = time();
			update_option( self::OPTION, $keys, false );
		}
		return true;
	}

	public static function routes() {
		$ns   = 'weberslink-forms/v1';
		$perm = array( __CLASS__, 'authorize' );
		register_rest_route( $ns, '/api/forms', array( 'methods' => 'GET', 'callback' => array( __CLASS__, 'forms' ), 'permission_callback' => $perm ) );
		register_rest_route( $ns, '/api/forms/(?P<id>\d+)', array( 'methods' => 'GET', 'callback' => array( __CLASS__, 'form' ), 'permission_callback' => $perm ) );
		register_rest_route( $ns, '/api/forms/(?P<id>\d+)/entries', array( 'methods' => 'GET', 'callback' => array( __CLASS__, 'entries' ), 'permission_callback' => $perm ) );
		register_rest_route( $ns, '/api/entries/(?P<id>\d+)', array( 'methods' => 'GET', 'callback' => array( __CLASS__, 'entry' ), 'permission_callback' => $perm ) );
	}

	private static function form_summary( $f ) {
		return array( 'id' => $f['id'], 'title' => $f['title'], 'status' => $f['status'], 'entries' => WLFP_Forms::entry_count( $f['id'] ) );
	}

	public static function forms() {
		return rest_ensure_response( array_map( array( __CLASS__, 'form_summary' ), WLFP_Forms::all() ) );
	}

	public static function form( $req ) {
		$f = WLFP_Forms::get( (int) $req['id'] );
		if ( ! $f ) {
			return new WP_Error( 'wlfp_not_found', 'Form not found', array( 'status' => 404 ) );
		}
		$fields = array();
		foreach ( $f['fields'] as $x ) {
			$fields[] = array( 'key' => isset( $x['name'] ) ? $x['name'] : '', 'type' => $x['type'], 'label' => isset( $x['label'] ) ? $x['label'] : '', 'required' => ! empty( $x['required'] ) );
		}
		return rest_ensure_response( self::form_summary( $f ) + array( 'fields' => $fields ) );
	}

	public static function shape( $e, $form = null ) {
		$form = $form ? $form : WLFP_Forms::get( $e['form_id'] );
		$data = $e['data'];
		unset( $data['_payment'], $data['_quiz'] );
		return array(
			'id'          => $e['id'],
			'form_id'     => $e['form_id'],
			'serial'      => (int) $e['serial'],
			'reference'   => $form ? WLFP_Merge::reference( $form, $e ) : '',
			'created_at'  => $e['created_at'] . ' UTC',
			'status'      => $e['status'],
			'stage'       => WLFP_Helpers::entry_stage( $e ),
			'assigned_to' => (int) $e['assigned_to'],
			'payment'     => array( 'status' => $e['payment_status'], 'total' => (float) $e['payment_total'], 'currency' => $e['currency'], 'method' => $e['payment_method'], 'transaction' => $e['transaction_id'] ),
			'quiz'        => isset( $e['data']['_quiz'] ) ? $e['data']['_quiz'] : null,
			'source_url'  => $e['source_url'],
			'ip'          => $e['ip'],
			'fields'      => $data,
		);
	}

	public static function entries( $req ) {
		$form = WLFP_Forms::get( (int) $req['id'] );
		if ( ! $form ) {
			return new WP_Error( 'wlfp_not_found', 'Form not found', array( 'status' => 404 ) );
		}
		$per = max( 1, min( 200, (int) ( $req->get_param( 'per_page' ) ? $req->get_param( 'per_page' ) : 50 ) ) );
		$q   = WLFP_Entries::query( array(
			'form_id'  => $form['id'],
			'status'   => $req->get_param( 'status' ) ? sanitize_key( $req->get_param( 'status' ) ) : 'all',
			'from'     => $req->get_param( 'since' ) ? sanitize_text_field( $req->get_param( 'since' ) ) : '',
			'stage'    => $req->get_param( 'stage' ) ? sanitize_text_field( $req->get_param( 'stage' ) ) : '',
			'per_page' => $per,
			'page'     => max( 1, (int) $req->get_param( 'page' ) ),
		) );
		$res = rest_ensure_response( array_map( function ( $e ) use ( $form ) {
			return self::shape( $e, $form );
		}, $q['rows'] ) );
		$res->header( 'X-WP-Total', (string) $q['total'] );
		$res->header( 'X-WP-TotalPages', (string) max( 1, (int) ceil( $q['total'] / $per ) ) );
		return $res;
	}

	public static function entry( $req ) {
		$e = WLFP_Entries::get( (int) $req['id'] );
		return $e ? rest_ensure_response( self::shape( $e ) ) : new WP_Error( 'wlfp_not_found', 'Entry not found', array( 'status' => 404 ) );
	}

	/* ---------- admin: create / revoke ---------- */

	public static function admin_create() {
		if ( ! WLFP_Helpers::can_manage() ) {
			wp_die( esc_html__( 'You do not have permission to do this.', 'weberslink-forms-pro' ), '', array( 'response' => 403 ) );
		}
		check_admin_referer( 'wlfp_api_create' );
		$label = isset( $_POST['label'] ) ? sanitize_text_field( wp_unslash( $_POST['label'] ) ) : ''; // phpcs:ignore
		list( $key, $rec ) = self::generate( '' !== $label ? $label : 'API key' );
		$keys              = get_option( self::OPTION, array() );
		$id                = wp_generate_password( 8, false, false );
		$keys[ $id ]       = $rec;
		update_option( self::OPTION, $keys, false );
		set_transient( 'wlfp_new_api_key_' . get_current_user_id(), $key, 5 * MINUTE_IN_SECONDS );
		wp_safe_redirect( admin_url( 'admin.php?page=wlfp-settings&api=created#wlfp-api' ) );
		exit;
	}

	public static function admin_revoke() {
		if ( ! WLFP_Helpers::can_manage() ) {
			wp_die( esc_html__( 'You do not have permission to do this.', 'weberslink-forms-pro' ), '', array( 'response' => 403 ) );
		}
		check_admin_referer( 'wlfp_api_revoke' );
		$id   = isset( $_GET['key'] ) ? sanitize_key( wp_unslash( $_GET['key'] ) ) : ''; // phpcs:ignore
		$keys = get_option( self::OPTION, array() );
		unset( $keys[ $id ] );
		update_option( self::OPTION, $keys, false );
		wp_safe_redirect( admin_url( 'admin.php?page=wlfp-settings&api=revoked#wlfp-api' ) );
		exit;
	}

	public static function settings_html() {
		$keys = get_option( self::OPTION, array() );
		$new  = get_transient( 'wlfp_new_api_key_' . get_current_user_id() );
		echo '<h2 id="wlfp-api">' . esc_html__( 'REST API', 'weberslink-forms-pro' ) . '</h2>';
		echo '<p class="description">' . esc_html__( 'Read-only access to forms and entries for dashboards, Zapier-style tools and your own code. Send the key as', 'weberslink-forms-pro' ) . ' <code>Authorization: Bearer YOUR_KEY</code>. ' . esc_html__( 'Base URL:', 'weberslink-forms-pro' ) . ' <code>' . esc_html( rest_url( 'weberslink-forms/v1/api/' ) ) . '</code></p>';
		if ( $new ) {
			delete_transient( 'wlfp_new_api_key_' . get_current_user_id() );
			echo '<div class="notice notice-success inline"><p><strong>' . esc_html__( 'Copy your new key now — it is shown only once:', 'weberslink-forms-pro' ) . '</strong><br><code style="font-size:14px;user-select:all">' . esc_html( $new ) . '</code></p></div>';
		}
		if ( $keys ) {
			echo '<table class="widefat striped" style="max-width:760px"><thead><tr><th>' . esc_html__( 'Label', 'weberslink-forms-pro' ) . '</th><th>' . esc_html__( 'Key', 'weberslink-forms-pro' ) . '</th><th>' . esc_html__( 'Created', 'weberslink-forms-pro' ) . '</th><th>' . esc_html__( 'Last used', 'weberslink-forms-pro' ) . '</th><th></th></tr></thead><tbody>';
			foreach ( $keys as $id => $k ) {
				echo '<tr><td>' . esc_html( $k['label'] ) . '</td><td><code>' . esc_html( $k['prefix'] ) . '…</code></td><td>' . esc_html( wp_date( 'Y-m-d', (int) $k['created'] ) ) . '</td><td>' . ( $k['last_used'] ? esc_html( human_time_diff( (int) $k['last_used'] ) . ' ' . __( 'ago', 'weberslink-forms-pro' ) ) : '—' ) . '</td><td><a class="submitdelete" onclick="return confirm(\'' . esc_js( __( 'Revoke this key? Anything using it will stop working.', 'weberslink-forms-pro' ) ) . '\')" href="' . esc_url( wp_nonce_url( admin_url( 'admin-post.php?action=wlfp_api_revoke&key=' . $id ), 'wlfp_api_revoke' ) ) . '">' . esc_html__( 'Revoke', 'weberslink-forms-pro' ) . '</a></td></tr>';
			}
			echo '</tbody></table>';
		}
		echo '<p><button type="submit" form="wlfp-api-form" class="button">' . esc_html__( 'Create API key', 'weberslink-forms-pro' ) . '</button> <input type="text" form="wlfp-api-form" name="label" placeholder="' . esc_attr__( 'Label, e.g. Dashboard', 'weberslink-forms-pro' ) . '" /></p>';
	}
}
