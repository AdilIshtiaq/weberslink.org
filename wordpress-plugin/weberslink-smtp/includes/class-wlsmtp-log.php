<?php
defined( 'ABSPATH' ) || exit;

class WLSMTP_Log {

	const DB_VERSION = '1';

	public static function table() {
		global $wpdb;
		return $wpdb->prefix . 'wlsmtp_log';
	}

	public static function activate() {
		self::create_table();
		update_option( 'wlsmtp_db_version', self::DB_VERSION );
		if ( ! wp_next_scheduled( 'wlsmtp_daily' ) ) {
			wp_schedule_event( time() + HOUR_IN_SECONDS, 'daily', 'wlsmtp_daily' );
		}
	}

	public static function deactivate() {
		wp_clear_scheduled_hook( 'wlsmtp_daily' );
	}

	public static function maybe_upgrade() {
		if ( get_option( 'wlsmtp_db_version' ) !== self::DB_VERSION ) {
			self::create_table();
			update_option( 'wlsmtp_db_version', self::DB_VERSION );
		}
	}

	public static function create_table() {
		global $wpdb;
		require_once ABSPATH . 'wp-admin/includes/upgrade.php';
		$c = $wpdb->get_charset_collate();
		dbDelta( 'CREATE TABLE ' . self::table() . " (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			created_at datetime NOT NULL,
			to_addr text,
			subject text,
			headers text,
			message longtext,
			content_type varchar(10) NOT NULL DEFAULT 'plain',
			attachments text,
			status varchar(10) NOT NULL DEFAULT 'pending',
			error text,
			debug_log text,
			attempts tinyint(3) unsigned NOT NULL DEFAULT 1,
			source varchar(120) NOT NULL DEFAULT '',
			transport varchar(10) NOT NULL DEFAULT '',
			PRIMARY KEY  (id),
			KEY status (status),
			KEY created_at (created_at)
		) $c;" );
	}

	public static function init() {
		add_action( 'wlsmtp_daily', array( __CLASS__, 'daily' ) );
		add_action( 'wlsmtp_retry', array( __CLASS__, 'retry' ) );
		if ( ! wp_next_scheduled( 'wlsmtp_daily' ) ) {
			wp_schedule_event( time() + HOUR_IN_SECONDS, 'daily', 'wlsmtp_daily' );
		}
	}

	/* ---------- CRUD ---------- */

	public static function insert( $row ) {
		global $wpdb;
		$row = array_merge( array( 'created_at' => current_time( 'mysql', true ), 'status' => 'pending', 'attempts' => 1 ), $row );
		$wpdb->insert( self::table(), $row );
		return (int) $wpdb->insert_id;
	}

	public static function update( $id, $cols ) {
		global $wpdb;
		$wpdb->update( self::table(), $cols, array( 'id' => (int) $id ) );
	}

	public static function get( $id ) {
		global $wpdb;
		return $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . self::table() . ' WHERE id=%d', (int) $id ), ARRAY_A ); // phpcs:ignore
	}

	public static function delete( $ids ) {
		global $wpdb;
		$ids = array_filter( array_map( 'intval', (array) $ids ) );
		if ( $ids ) {
			$wpdb->query( 'DELETE FROM ' . self::table() . ' WHERE id IN (' . implode( ',', $ids ) . ')' ); // phpcs:ignore
		}
	}

	public static function query( $a ) {
		global $wpdb;
		$a     = array_merge( array( 'status' => '', 'search' => '', 'from' => '', 'to' => '', 'per_page' => 25, 'page' => 1 ), $a );
		$where = array( '1=1' );
		$vals  = array();
		if ( in_array( $a['status'], array( 'sent', 'failed', 'pending' ), true ) ) {
			$where[] = 'status=%s';
			$vals[]  = $a['status'];
		}
		if ( '' !== $a['search'] ) {
			$like    = '%' . $wpdb->esc_like( $a['search'] ) . '%';
			$where[] = '(to_addr LIKE %s OR subject LIKE %s OR source LIKE %s)';
			array_push( $vals, $like, $like, $like );
		}
		if ( $a['from'] && strtotime( $a['from'] ) ) {
			$where[] = 'created_at >= %s';
			$vals[]  = gmdate( 'Y-m-d 00:00:00', strtotime( $a['from'] ) );
		}
		if ( $a['to'] && strtotime( $a['to'] ) ) {
			$where[] = 'created_at <= %s';
			$vals[]  = gmdate( 'Y-m-d 23:59:59', strtotime( $a['to'] ) );
		}
		$w     = implode( ' AND ', $where );
		$cq    = 'SELECT COUNT(*) FROM ' . self::table() . " WHERE $w"; // phpcs:ignore
		$total = (int) ( $vals ? $wpdb->get_var( $wpdb->prepare( $cq, $vals ) ) : $wpdb->get_var( $cq ) ); // phpcs:ignore
		$sql   = 'SELECT id, created_at, to_addr, subject, status, error, attempts, source, transport, attachments FROM ' . self::table() . " WHERE $w ORDER BY id DESC"; // phpcs:ignore
		$pv    = $vals;
		if ( (int) $a['per_page'] > 0 ) {
			$sql .= ' LIMIT %d OFFSET %d';
			$pv[] = (int) $a['per_page'];
			$pv[] = max( 0, ( (int) $a['page'] - 1 ) * (int) $a['per_page'] );
		}
		return array( 'total' => $total, 'rows' => (array) $wpdb->get_results( $pv ? $wpdb->prepare( $sql, $pv ) : $sql, ARRAY_A ) ); // phpcs:ignore
	}

	public static function counts( $days = 7 ) {
		global $wpdb;
		$since = gmdate( 'Y-m-d H:i:s', time() - $days * DAY_IN_SECONDS );
		$rows  = $wpdb->get_results( $wpdb->prepare( 'SELECT status, COUNT(*) c FROM ' . self::table() . ' WHERE created_at >= %s GROUP BY status', $since ), ARRAY_A ); // phpcs:ignore
		$out   = array( 'sent' => 0, 'failed' => 0, 'pending' => 0 );
		foreach ( (array) $rows as $r ) {
			$out[ $r['status'] ] = (int) $r['c'];
		}
		return $out;
	}

	/* ---------- housekeeping ---------- */

	public static function daily() {
		global $wpdb;
		$days = (int) WLSMTP_Settings::get( 'keep_days' );
		if ( $days > 0 ) {
			$wpdb->query( $wpdb->prepare( 'DELETE FROM ' . self::table() . ' WHERE created_at < %s', gmdate( 'Y-m-d H:i:s', time() - $days * DAY_IN_SECONDS ) ) ); // phpcs:ignore
		}
	}

	/** WP-Cron callback: send a failed email again (same log row, attempts + 1). */
	public static function retry( $id ) {
		$r = self::get( (int) $id );
		if ( ! $r || 'failed' !== $r['status'] || '' === (string) $r['message'] ) {
			return;
		}
		$headers = array_values( array_filter( preg_split( '/\r\n|\r|\n/', (string) $r['headers'] ) ) );
		WLSMTP_Mailer::$retry_id = (int) $r['id'];
		wp_mail( array_map( 'trim', explode( ',', (string) $r['to_addr'] ) ), (string) $r['subject'], (string) $r['message'], $headers );
		WLSMTP_Mailer::$retry_id = 0;
	}
}
