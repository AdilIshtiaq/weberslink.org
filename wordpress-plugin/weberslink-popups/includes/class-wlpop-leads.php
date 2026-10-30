<?php
defined( 'ABSPATH' ) || exit;

/** Lead capture: storage, REST endpoints, spam protection, notifications, webhook, CSV. */
class WLPOP_Leads {

	const DB_VERSION = '1';

	public static function leads() {
		global $wpdb;
		return $wpdb->prefix . 'wlpop_leads';
	}

	public static function stats() {
		global $wpdb;
		return $wpdb->prefix . 'wlpop_stats';
	}

	public static function activate() {
		self::create_tables();
		update_option( 'wlpop_db_version', self::DB_VERSION );
	}

	public static function maybe_upgrade() {
		if ( get_option( 'wlpop_db_version' ) !== self::DB_VERSION ) {
			self::create_tables();
			update_option( 'wlpop_db_version', self::DB_VERSION );
		}
	}

	public static function create_tables() {
		global $wpdb;
		require_once ABSPATH . 'wp-admin/includes/upgrade.php';
		$c = $wpdb->get_charset_collate();
		dbDelta( 'CREATE TABLE ' . self::leads() . " (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			created_at datetime NOT NULL,
			popup_id varchar(12) NOT NULL,
			email varchar(190) NOT NULL,
			name varchar(120) NOT NULL DEFAULT '',
			page varchar(255) NOT NULL DEFAULT '',
			consent tinyint(1) NOT NULL DEFAULT 0,
			ip_hash char(16) NOT NULL DEFAULT '',
			PRIMARY KEY  (id),
			UNIQUE KEY popup_email (popup_id,email),
			KEY created_at (created_at)
		) $c;" );
		dbDelta( 'CREATE TABLE ' . self::stats() . " (
			popup_id varchar(12) NOT NULL,
			day date NOT NULL,
			views int(10) unsigned NOT NULL DEFAULT 0,
			closes int(10) unsigned NOT NULL DEFAULT 0,
			signups int(10) unsigned NOT NULL DEFAULT 0,
			PRIMARY KEY  (popup_id,day)
		) $c;" );
	}

	public static function init() {
		add_action( 'rest_api_init', function () {
			register_rest_route( 'wlpop/v1', '/lead', array( 'methods' => 'POST', 'callback' => array( __CLASS__, 'rest_lead' ), 'permission_callback' => '__return_true' ) );
			register_rest_route( 'wlpop/v1', '/event', array( 'methods' => 'POST', 'callback' => array( __CLASS__, 'rest_event' ), 'permission_callback' => '__return_true' ) );
		} );
	}

	/* ---------- pure validation ---------- */

	/**
	 * Validate a submission against its popup. Returns array( ok, status, error, row ).
	 * A filled honeypot "succeeds" silently so bots learn nothing.
	 */
	public static function validate( $in, $popup ) {
		$in = is_array( $in ) ? $in : array();
		if ( ! $popup || empty( $popup['enabled'] ) || empty( $popup['show_form'] ) ) {
			return array( 'ok' => false, 'status' => 404, 'error' => 'This form is not available.', 'row' => null );
		}
		if ( ! empty( $in['hp'] ) ) {
			return array( 'ok' => true, 'status' => 200, 'error' => '', 'row' => null, 'spam' => true );
		}
		$email = strtolower( trim( (string) ( isset( $in['email'] ) ? $in['email'] : '' ) ) );
		if ( '' === $email || strlen( $email ) > 190 || ! is_email( $email ) ) {
			return array( 'ok' => false, 'status' => 422, 'error' => 'Please enter a valid email address.', 'row' => null );
		}
		if ( '' !== (string) $popup['consent_text'] && empty( $in['consent'] ) ) {
			return array( 'ok' => false, 'status' => 422, 'error' => 'Please tick the box to agree.', 'row' => null );
		}
		$name = ! empty( $popup['ask_name'] ) ? mb_substr( trim( preg_replace( '/[\x00-\x1f\x7f]+/', ' ', strip_tags( (string) ( isset( $in['name'] ) ? $in['name'] : '' ) ) ) ), 0, 120 ) : '';
		$page = isset( $in['page'] ) ? (string) $in['page'] : '';
		$page = preg_match( '#^/[^\s]*$#', $page ) ? mb_substr( $page, 0, 255 ) : '';
		return array( 'ok' => true, 'status' => 200, 'error' => '', 'row' => array( 'popup_id' => $popup['id'], 'email' => $email, 'name' => $name, 'page' => $page, 'consent' => '' !== (string) $popup['consent_text'] ? 1 : 0 ) );
	}

	/** Neutralise spreadsheet formulas in a CSV cell. */
	public static function csv_cell( $v ) {
		$v = (string) $v;
		return ( '' !== $v && false !== strpos( "=+-@\t\r", $v[0] ) ) ? "'" . $v : $v;
	}

	public static function csv( $rows, $names = array() ) {
		$h = fopen( 'php://temp', 'r+' ); // phpcs:ignore
		fputcsv( $h, array( 'date_utc', 'email', 'name', 'popup', 'page', 'consent' ) ); // phpcs:ignore
		foreach ( $rows as $r ) {
			fputcsv( $h, array( $r['created_at'], self::csv_cell( $r['email'] ), self::csv_cell( $r['name'] ), self::csv_cell( isset( $names[ $r['popup_id'] ] ) ? $names[ $r['popup_id'] ] : $r['popup_id'] ), self::csv_cell( $r['page'] ), $r['consent'] ) ); // phpcs:ignore
		}
		rewind( $h );
		$o = stream_get_contents( $h );
		fclose( $h ); // phpcs:ignore
		return $o;
	}

	public static function ip_hash() {
		$ip = isset( $_SERVER['REMOTE_ADDR'] ) ? (string) $_SERVER['REMOTE_ADDR'] : ''; // phpcs:ignore
		return substr( hash_hmac( 'sha256', $ip, wp_salt( 'auth' ) . 'wlpop' ), 0, 16 );
	}

	private static function limited( $bucket, $max ) {
		$key = 'wlpop_rl_' . $bucket . '_' . self::ip_hash();
		$n   = (int) get_transient( $key );
		if ( $n >= $max ) {
			return true;
		}
		set_transient( $key, $n + 1, HOUR_IN_SECONDS );
		return false;
	}

	private static function bump( $popup_id, $col ) {
		global $wpdb;
		if ( ! in_array( $col, array( 'views', 'closes', 'signups' ), true ) ) {
			return;
		}
		$wpdb->query( $wpdb->prepare( 'INSERT INTO ' . self::stats() . " (popup_id,day,$col) VALUES (%s,%s,1) ON DUPLICATE KEY UPDATE $col=$col+1", $popup_id, gmdate( 'Y-m-d' ) ) ); // phpcs:ignore
	}

	/* ---------- REST ---------- */

	public static function rest_event( $req ) {
		$d = $req->get_json_params();
		$d = is_array( $d ) ? $d : array();
		$id = isset( $d['popup'] ) ? (string) $d['popup'] : '';
		$ty = isset( $d['type'] ) ? (string) $d['type'] : '';
		if ( ! WLPOP_Store::get( $id ) || ! in_array( $ty, array( 'view', 'close' ), true ) || self::limited( 'ev', 120 ) ) {
			return new WP_REST_Response( array( 'ok' => false ), 400 );
		}
		self::bump( $id, 'view' === $ty ? 'views' : 'closes' );
		return new WP_REST_Response( array( 'ok' => true ), 200 );
	}

	public static function rest_lead( $req ) {
		$d = $req->get_json_params();
		$d = is_array( $d ) ? $d : array();
		$p = WLPOP_Store::get( isset( $d['popup'] ) ? (string) $d['popup'] : '' );
		$v = self::validate( $d, $p );
		if ( ! $v['ok'] ) {
			return new WP_REST_Response( array( 'ok' => false, 'error' => $v['error'] ), $v['status'] );
		}
		$done = array( 'ok' => true, 'message' => $p['success_message'], 'redirect' => $p['redirect_url'] );
		if ( ! empty( $v['spam'] ) ) {
			return new WP_REST_Response( $done, 200 );
		}
		if ( self::limited( 'lead', 10 ) ) {
			return new WP_REST_Response( array( 'ok' => false, 'error' => 'Too many attempts. Please try again later.' ), 429 );
		}
		global $wpdb;
		$row     = $v['row'] + array( 'created_at' => current_time( 'mysql', true ), 'ip_hash' => self::ip_hash() );
		$wpdb->query( $wpdb->prepare( 'INSERT IGNORE INTO ' . self::leads() . ' (created_at,popup_id,email,name,page,consent,ip_hash) VALUES (%s,%s,%s,%s,%s,%d,%s)', $row['created_at'], $row['popup_id'], $row['email'], $row['name'], $row['page'], $row['consent'], $row['ip_hash'] ) ); // phpcs:ignore
		if ( $wpdb->rows_affected > 0 ) {
			self::bump( $p['id'], 'signups' );
			self::notify( $row, $p );
		}
		return new WP_REST_Response( $done, 200 );
	}

	private static function notify( $row, $p ) {
		$s = WLPOP_Store::settings();
		if ( $s['notify'] ) {
			$n = (int) get_transient( 'wlpop_notify_cap' );
			if ( $n < 30 ) { // never more than 30 emails an hour, even if bots rotate addresses
				set_transient( 'wlpop_notify_cap', $n + 1, HOUR_IN_SECONDS );
				$to = is_email( $s['notify_email'] ) ? $s['notify_email'] : get_option( 'admin_email' );
				wp_mail( $to, sprintf( /* translators: %s: popup */ __( 'New subscriber from "%s"', 'weberslink-popups' ), $p['name'] ), sprintf( "Email: %s\nName: %s\nPage: %s\n", $row['email'], $row['name'], $row['page'] ) );
			}
		}
		if ( '' !== $s['webhook'] ) {
			$body    = wp_json_encode( array( 'event' => 'lead', 'email' => $row['email'], 'name' => $row['name'], 'popup' => $p['name'], 'page' => $row['page'], 'consent' => (bool) $row['consent'], 'time' => gmdate( 'c' ) ) );
			$headers = array( 'Content-Type' => 'application/json' );
			if ( '' !== $s['webhook_secret'] ) {
				$headers['X-Wlpop-Signature'] = 'sha256=' . hash_hmac( 'sha256', $body, $s['webhook_secret'] );
			}
			wp_safe_remote_post( $s['webhook'], array( 'timeout' => 8, 'blocking' => false, 'headers' => $headers, 'body' => $body ) ); // blocks private/internal addresses
		}
	}
}
