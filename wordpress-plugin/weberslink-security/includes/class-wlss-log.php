<?php
defined( 'ABSPATH' ) || exit;

/** Security activity log. */
class WLSS_Log {

	const DB_VERSION = '1';

	public static function table() {
		global $wpdb;
		return $wpdb->prefix . 'wlss_log';
	}

	public static function activate() {
		self::create_table();
		update_option( 'wlss_db_version', self::DB_VERSION );
		if ( ! wp_next_scheduled( 'wlss_daily' ) ) {
			wp_schedule_event( time() + HOUR_IN_SECONDS, 'daily', 'wlss_daily' );
		}
	}

	public static function deactivate() {
		wp_clear_scheduled_hook( 'wlss_daily' );
	}

	public static function maybe_upgrade() {
		if ( get_option( 'wlss_db_version' ) !== self::DB_VERSION ) {
			self::create_table();
			update_option( 'wlss_db_version', self::DB_VERSION );
		}
	}

	public static function create_table() {
		global $wpdb;
		require_once ABSPATH . 'wp-admin/includes/upgrade.php';
		$c = $wpdb->get_charset_collate();
		dbDelta( 'CREATE TABLE ' . self::table() . " (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			created_at datetime NOT NULL,
			event varchar(40) NOT NULL,
			user_login varchar(60) NOT NULL DEFAULT '',
			ip varchar(45) NOT NULL DEFAULT '',
			details varchar(500) NOT NULL DEFAULT '',
			PRIMARY KEY  (id),
			KEY event (event),
			KEY created_at (created_at)
		) $c;" );
	}

	public static function events() {
		return array(
			'login_ok'        => __( 'Login', 'weberslink-security' ),
			'login_failed'    => __( 'Failed login', 'weberslink-security' ),
			'lockout'         => __( 'Lockout', 'weberslink-security' ),
			'blocked'         => __( 'Blocked address', 'weberslink-security' ),
			'tfa_on'          => __( '2FA enabled', 'weberslink-security' ),
			'tfa_off'         => __( '2FA disabled', 'weberslink-security' ),
			'tfa_failed'      => __( '2FA code rejected', 'weberslink-security' ),
			'tfa_recovery'    => __( '2FA recovery code used', 'weberslink-security' ),
			'password_reset'  => __( 'Password reset', 'weberslink-security' ),
			'user_created'    => __( 'User created', 'weberslink-security' ),
			'user_deleted'    => __( 'User deleted', 'weberslink-security' ),
			'role_changed'    => __( 'Role changed', 'weberslink-security' ),
			'plugin_on'       => __( 'Plugin activated', 'weberslink-security' ),
			'plugin_off'      => __( 'Plugin deactivated', 'weberslink-security' ),
			'theme_switched'  => __( 'Theme switched', 'weberslink-security' ),
		);
	}

	public static function init() {
		add_action( 'wlss_daily', array( __CLASS__, 'daily' ) );
		if ( ! wp_next_scheduled( 'wlss_daily' ) ) {
			wp_schedule_event( time() + HOUR_IN_SECONDS, 'daily', 'wlss_daily' );
		}
		add_action( 'after_password_reset', function ( $user ) {
			self::event( 'password_reset', $user->user_login );
		} );
		add_action( 'user_register', function ( $id ) {
			$u = get_userdata( $id );
			self::event( 'user_created', $u ? $u->user_login : '', 'role: ' . ( $u && $u->roles ? implode( ',', $u->roles ) : '-' ) );
		} );
		add_action( 'delete_user', function ( $id ) {
			$u = get_userdata( $id );
			self::event( 'user_deleted', $u ? $u->user_login : '#' . $id );
		} );
		add_action( 'set_user_role', function ( $id, $role, $old ) {
			$u = get_userdata( $id );
			self::event( 'role_changed', $u ? $u->user_login : '#' . $id, ( $old ? implode( ',', (array) $old ) : '-' ) . ' → ' . $role );
		}, 10, 3 );
		add_action( 'activated_plugin', function ( $p ) {
			self::event( 'plugin_on', '', $p );
		} );
		add_action( 'deactivated_plugin', function ( $p ) {
			self::event( 'plugin_off', '', $p );
		} );
		add_action( 'switch_theme', function ( $name ) {
			self::event( 'theme_switched', '', $name );
		} );
	}

	public static function event( $event, $user = '', $details = '', $ip = null ) {
		global $wpdb;
		if ( null === $ip ) {
			$ip = WLSS_Ip::client( $_SERVER, (string) WLSS_Settings::get( 'proxy_header' ) ); // phpcs:ignore
		}
		$wpdb->insert( self::table(), array(
			'created_at' => current_time( 'mysql', true ),
			'event'      => substr( $event, 0, 40 ),
			'user_login' => mb_substr( (string) $user, 0, 60 ),
			'ip'         => substr( (string) $ip, 0, 45 ),
			'details'    => mb_substr( (string) $details, 0, 500 ),
		) );
	}

	public static function query( $a ) {
		global $wpdb;
		$a     = array_merge( array( 'event' => '', 'search' => '', 'per_page' => 30, 'page' => 1 ), $a );
		$where = array( '1=1' );
		$vals  = array();
		if ( isset( self::events()[ $a['event'] ] ) ) {
			$where[] = 'event=%s';
			$vals[]  = $a['event'];
		}
		if ( '' !== $a['search'] ) {
			$like    = '%' . $wpdb->esc_like( $a['search'] ) . '%';
			$where[] = '(user_login LIKE %s OR ip LIKE %s OR details LIKE %s)';
			array_push( $vals, $like, $like, $like );
		}
		$w     = implode( ' AND ', $where );
		$cq    = 'SELECT COUNT(*) FROM ' . self::table() . " WHERE $w"; // phpcs:ignore
		$total = (int) ( $vals ? $wpdb->get_var( $wpdb->prepare( $cq, $vals ) ) : $wpdb->get_var( $cq ) ); // phpcs:ignore
		$sql   = 'SELECT * FROM ' . self::table() . " WHERE $w ORDER BY id DESC"; // phpcs:ignore
		$pv    = $vals;
		if ( (int) $a['per_page'] > 0 ) {
			$sql .= ' LIMIT %d OFFSET %d';
			$pv[] = (int) $a['per_page'];
			$pv[] = max( 0, ( (int) $a['page'] - 1 ) * (int) $a['per_page'] );
		}
		return array( 'total' => $total, 'rows' => (array) $wpdb->get_results( $pv ? $wpdb->prepare( $sql, $pv ) : $sql, ARRAY_A ) ); // phpcs:ignore
	}

	/** Counts per event over the last $days days. */
	public static function counts( $days = 7 ) {
		global $wpdb;
		$rows = (array) $wpdb->get_results( $wpdb->prepare( 'SELECT event, COUNT(*) c FROM ' . self::table() . ' WHERE created_at >= %s GROUP BY event', gmdate( 'Y-m-d H:i:s', time() - $days * DAY_IN_SECONDS ) ), ARRAY_A ); // phpcs:ignore
		$out  = array();
		foreach ( $rows as $r ) {
			$out[ $r['event'] ] = (int) $r['c'];
		}
		return $out;
	}

	public static function daily() {
		global $wpdb;
		$wpdb->query( $wpdb->prepare( 'DELETE FROM ' . self::table() . ' WHERE created_at < %s', gmdate( 'Y-m-d H:i:s', time() - (int) WLSS_Settings::get( 'keep_days' ) * DAY_IN_SECONDS ) ) ); // phpcs:ignore
	}
}
