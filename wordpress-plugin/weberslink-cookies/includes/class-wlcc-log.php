<?php
defined( 'ABSPATH' ) || exit;

/** Consent log: proof that a choice was made, without storing the visitor's IP address. */
class WLCC_Log {

	const DB_VERSION = '1';

	public static function table() {
		global $wpdb;
		return $wpdb->prefix . 'wlcc_log';
	}

	public static function activate() {
		self::create_table();
		update_option( 'wlcc_db_version', self::DB_VERSION );
		if ( ! wp_next_scheduled( 'wlcc_daily' ) ) {
			wp_schedule_event( time() + HOUR_IN_SECONDS, 'daily', 'wlcc_daily' );
		}
	}

	public static function deactivate() {
		wp_clear_scheduled_hook( 'wlcc_daily' );
	}

	public static function maybe_upgrade() {
		if ( get_option( 'wlcc_db_version' ) !== self::DB_VERSION ) {
			self::create_table();
			update_option( 'wlcc_db_version', self::DB_VERSION );
		}
	}

	public static function create_table() {
		global $wpdb;
		require_once ABSPATH . 'wp-admin/includes/upgrade.php';
		$c = $wpdb->get_charset_collate();
		dbDelta( 'CREATE TABLE ' . self::table() . " (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			created_at datetime NOT NULL,
			consent_id char(16) NOT NULL DEFAULT '',
			action varchar(12) NOT NULL,
			prefs tinyint(1) NOT NULL DEFAULT 0,
			analytics tinyint(1) NOT NULL DEFAULT 0,
			marketing tinyint(1) NOT NULL DEFAULT 0,
			version int(10) unsigned NOT NULL DEFAULT 1,
			ip_hash char(16) NOT NULL DEFAULT '',
			PRIMARY KEY  (id),
			KEY created_at (created_at),
			KEY consent_id (consent_id)
		) $c;" );
	}

	public static function init() {
		add_action( 'wlcc_daily', array( __CLASS__, 'daily' ) );
		if ( ! wp_next_scheduled( 'wlcc_daily' ) ) {
			wp_schedule_event( time() + HOUR_IN_SECONDS, 'daily', 'wlcc_daily' );
		}
		add_action( 'rest_api_init', function () {
			register_rest_route( 'wlcc/v1', '/log', array( 'methods' => 'POST', 'callback' => array( __CLASS__, 'rest_log' ), 'permission_callback' => '__return_true' ) );
		} );
	}

	/** Pure: validate a posted choice. Returns a clean row or null. */
	public static function clean( $d ) {
		if ( ! is_array( $d ) ) {
			return null;
		}
		$action = isset( $d['action'] ) ? (string) $d['action'] : '';
		if ( ! in_array( $action, array( 'accept_all', 'reject_all', 'custom' ), true ) ) {
			return null;
		}
		$flag = function ( $k ) use ( $d ) {
			return ! empty( $d[ $k ] ) && ( true === $d[ $k ] || 1 === (int) $d[ $k ] || '1' === $d[ $k ] || 'true' === $d[ $k ] ) ? 1 : 0;
		};
		$row = array( 'action' => $action, 'prefs' => $flag( 'preferences' ), 'analytics' => $flag( 'analytics' ), 'marketing' => $flag( 'marketing' ), 'version' => max( 1, min( 100000, (int) ( isset( $d['version'] ) ? $d['version'] : 1 ) ) ), 'consent_id' => preg_match( '/^[a-f0-9]{16}$/', isset( $d['id'] ) ? (string) $d['id'] : '' ) ? $d['id'] : '' );
		if ( 'accept_all' === $action ) {
			$row['prefs'] = $row['analytics'] = $row['marketing'] = 1;
		} elseif ( 'reject_all' === $action ) {
			$row['prefs'] = $row['analytics'] = $row['marketing'] = 0;
		}
		return $row;
	}

	public static function ip_hash( $ip ) {
		return substr( hash_hmac( 'sha256', (string) $ip, wp_salt( 'auth' ) . 'wlcc' ), 0, 16 );
	}

	public static function rest_log( $req ) {
		if ( ! WLCC_Settings::get( 'log' ) ) {
			return new WP_REST_Response( array( 'ok' => true ), 200 );
		}
		$row = self::clean( $req->get_json_params() );
		if ( ! $row ) {
			return new WP_REST_Response( array( 'ok' => false ), 400 );
		}
		$ip   = isset( $_SERVER['REMOTE_ADDR'] ) ? (string) $_SERVER['REMOTE_ADDR'] : ''; // phpcs:ignore
		$hash = self::ip_hash( $ip );
		$key  = 'wlcc_rl_' . $hash;
		$n    = (int) get_transient( $key );
		if ( $n >= 20 ) {
			return new WP_REST_Response( array( 'ok' => false ), 429 );
		}
		set_transient( $key, $n + 1, HOUR_IN_SECONDS );
		global $wpdb;
		$wpdb->insert( self::table(), $row + array( 'created_at' => current_time( 'mysql', true ), 'ip_hash' => $hash ) );
		return new WP_REST_Response( array( 'ok' => true ), 200 );
	}

	public static function stats( $days = 30 ) {
		global $wpdb;
		$r = $wpdb->get_row( $wpdb->prepare( 'SELECT COUNT(*) total, SUM(action=%s) acc, SUM(action=%s) rej, SUM(action=%s) cus, SUM(prefs) p, SUM(analytics) a, SUM(marketing) m FROM ' . self::table() . ' WHERE created_at >= %s', 'accept_all', 'reject_all', 'custom', gmdate( 'Y-m-d H:i:s', time() - $days * DAY_IN_SECONDS ) ), ARRAY_A ); // phpcs:ignore
		return array_map( 'intval', is_array( $r ) ? $r : array() ) + array( 'total' => 0, 'acc' => 0, 'rej' => 0, 'cus' => 0, 'p' => 0, 'a' => 0, 'm' => 0 );
	}

	public static function query( $page = 1, $per = 30 ) {
		global $wpdb;
		$total = (int) $wpdb->get_var( 'SELECT COUNT(*) FROM ' . self::table() ); // phpcs:ignore
		$rows  = (array) $wpdb->get_results( $wpdb->prepare( 'SELECT * FROM ' . self::table() . ' ORDER BY id DESC LIMIT %d OFFSET %d', $per, max( 0, ( $page - 1 ) * $per ) ), ARRAY_A ); // phpcs:ignore
		return array( 'total' => $total, 'rows' => $rows );
	}

	public static function csv( $rows ) {
		$h = fopen( 'php://temp', 'r+' ); // phpcs:ignore
		fputcsv( $h, array( 'date_utc', 'consent_id', 'action', 'preferences', 'analytics', 'marketing', 'policy_version', 'ip_hash' ) ); // phpcs:ignore
		foreach ( $rows as $r ) {
			fputcsv( $h, array( $r['created_at'], $r['consent_id'], $r['action'], $r['prefs'], $r['analytics'], $r['marketing'], $r['version'], $r['ip_hash'] ) ); // phpcs:ignore
		}
		rewind( $h );
		$o = stream_get_contents( $h );
		fclose( $h ); // phpcs:ignore
		return $o;
	}

	public static function daily() {
		global $wpdb;
		$wpdb->query( $wpdb->prepare( 'DELETE FROM ' . self::table() . ' WHERE created_at < %s', gmdate( 'Y-m-d H:i:s', time() - (int) WLCC_Settings::get( 'keep_days' ) * DAY_IN_SECONDS ) ) ); // phpcs:ignore
	}
}
