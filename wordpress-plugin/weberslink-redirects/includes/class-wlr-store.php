<?php
defined( 'ABSPATH' ) || exit;

/** Database layer: redirect rules, the 404 log and the compiled rule cache. */
class WLR_Store {

	const DB_VERSION = '1';
	const CACHE      = 'wlr_cache';

	public static function t_rules() {
		global $wpdb;
		return $wpdb->prefix . 'wlr_rules';
	}

	public static function t_404() {
		global $wpdb;
		return $wpdb->prefix . 'wlr_404';
	}

	public static function activate() {
		self::create_tables();
		update_option( 'wlr_db_version', self::DB_VERSION );
		if ( ! wp_next_scheduled( 'wlr_daily' ) ) {
			wp_schedule_event( time() + HOUR_IN_SECONDS, 'daily', 'wlr_daily' );
		}
	}

	public static function deactivate() {
		wp_clear_scheduled_hook( 'wlr_daily' );
	}

	public static function maybe_upgrade() {
		if ( get_option( 'wlr_db_version' ) !== self::DB_VERSION ) {
			self::create_tables();
			update_option( 'wlr_db_version', self::DB_VERSION );
		}
	}

	public static function create_tables() {
		global $wpdb;
		require_once ABSPATH . 'wp-admin/includes/upgrade.php';
		$c = $wpdb->get_charset_collate();
		dbDelta( 'CREATE TABLE ' . self::t_rules() . " (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			source varchar(500) NOT NULL,
			match_type varchar(10) NOT NULL DEFAULT 'exact',
			target text,
			code smallint(5) unsigned NOT NULL DEFAULT 301,
			query_mode varchar(10) NOT NULL DEFAULT 'ignore',
			enabled tinyint(1) NOT NULL DEFAULT 1,
			hits bigint(20) unsigned NOT NULL DEFAULT 0,
			last_hit datetime DEFAULT NULL,
			note varchar(255) NOT NULL DEFAULT '',
			created_at datetime NOT NULL,
			PRIMARY KEY  (id),
			KEY enabled (enabled)
		) $c;" );
		dbDelta( 'CREATE TABLE ' . self::t_404() . " (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			path_hash char(32) NOT NULL,
			path varchar(255) NOT NULL,
			referrer varchar(255) NOT NULL DEFAULT '',
			hits int(10) unsigned NOT NULL DEFAULT 1,
			first_seen datetime NOT NULL,
			last_seen datetime NOT NULL,
			PRIMARY KEY  (id),
			UNIQUE KEY path_hash (path_hash),
			KEY last_seen (last_seen)
		) $c;" );
	}

	public static function init() {
		add_action( 'wlr_daily', array( __CLASS__, 'daily' ) );
		if ( ! wp_next_scheduled( 'wlr_daily' ) ) {
			wp_schedule_event( time() + HOUR_IN_SECONDS, 'daily', 'wlr_daily' );
		}
	}

	/* ---------- rules ---------- */

	private static function to_row( $r ) {
		return array(
			'source'     => $r['source'],
			'match_type' => $r['match'],
			'target'     => $r['target'],
			'code'       => (int) $r['code'],
			'query_mode' => $r['query'],
			'enabled'    => (int) $r['enabled'],
			'note'       => $r['note'],
		);
	}

	private static function from_row( $r ) {
		return array(
			'id'       => (int) $r['id'],
			'source'   => $r['source'],
			'match'    => $r['match_type'],
			'target'   => (string) $r['target'],
			'code'     => (int) $r['code'],
			'query'    => $r['query_mode'],
			'enabled'  => (int) $r['enabled'],
			'hits'     => (int) $r['hits'],
			'last_hit' => $r['last_hit'],
			'note'     => $r['note'],
		);
	}

	public static function add( $clean ) {
		global $wpdb;
		$wpdb->insert( self::t_rules(), self::to_row( $clean ) + array( 'created_at' => current_time( 'mysql', true ) ) );
		$id = (int) $wpdb->insert_id;
		self::rebuild_cache();
		return $id;
	}

	public static function exists( $source, $match = 'exact' ) {
		global $wpdb;
		return (bool) $wpdb->get_var( $wpdb->prepare( 'SELECT id FROM ' . self::t_rules() . ' WHERE source=%s AND match_type=%s LIMIT 1', $source, $match ) ); // phpcs:ignore
	}

	public static function update( $id, $clean ) {
		global $wpdb;
		$wpdb->update( self::t_rules(), self::to_row( $clean ), array( 'id' => (int) $id ) );
		self::rebuild_cache();
	}

	public static function get( $id ) {
		global $wpdb;
		$r = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . self::t_rules() . ' WHERE id=%d', (int) $id ), ARRAY_A ); // phpcs:ignore
		return $r ? self::from_row( $r ) : null;
	}

	public static function set_enabled( $ids, $on ) {
		global $wpdb;
		$ids = array_filter( array_map( 'intval', (array) $ids ) );
		if ( $ids ) {
			$wpdb->query( 'UPDATE ' . self::t_rules() . ' SET enabled=' . ( $on ? 1 : 0 ) . ' WHERE id IN (' . implode( ',', $ids ) . ')' ); // phpcs:ignore
			self::rebuild_cache();
		}
	}

	public static function delete( $ids ) {
		global $wpdb;
		$ids = array_filter( array_map( 'intval', (array) $ids ) );
		if ( $ids ) {
			$wpdb->query( 'DELETE FROM ' . self::t_rules() . ' WHERE id IN (' . implode( ',', $ids ) . ')' ); // phpcs:ignore
			self::rebuild_cache();
		}
	}

	public static function query( $a ) {
		global $wpdb;
		$a     = array_merge( array( 'search' => '', 'status' => '', 'per_page' => 25, 'page' => 1, 'orderby' => 'id' ), $a );
		$where = array( '1=1' );
		$vals  = array();
		if ( '' !== $a['search'] ) {
			$like    = '%' . $wpdb->esc_like( $a['search'] ) . '%';
			$where[] = '(source LIKE %s OR target LIKE %s OR note LIKE %s)';
			array_push( $vals, $like, $like, $like );
		}
		if ( 'on' === $a['status'] ) {
			$where[] = 'enabled=1';
		} elseif ( 'off' === $a['status'] ) {
			$where[] = 'enabled=0';
		}
		$order = 'hits' === $a['orderby'] ? 'hits DESC, id DESC' : 'id DESC';
		$w     = implode( ' AND ', $where );
		$cq    = 'SELECT COUNT(*) FROM ' . self::t_rules() . " WHERE $w"; // phpcs:ignore
		$total = (int) ( $vals ? $wpdb->get_var( $wpdb->prepare( $cq, $vals ) ) : $wpdb->get_var( $cq ) ); // phpcs:ignore
		$sql   = 'SELECT * FROM ' . self::t_rules() . " WHERE $w ORDER BY $order"; // phpcs:ignore
		$pv    = $vals;
		if ( (int) $a['per_page'] > 0 ) {
			$sql .= ' LIMIT %d OFFSET %d';
			$pv[] = (int) $a['per_page'];
			$pv[] = max( 0, ( (int) $a['page'] - 1 ) * (int) $a['per_page'] );
		}
		$rows = (array) $wpdb->get_results( $pv ? $wpdb->prepare( $sql, $pv ) : $sql, ARRAY_A ); // phpcs:ignore
		return array( 'total' => $total, 'rows' => array_map( array( __CLASS__, 'from_row' ), $rows ) );
	}

	public static function hit( $id ) {
		global $wpdb;
		$wpdb->query( $wpdb->prepare( 'UPDATE ' . self::t_rules() . ' SET hits=hits+1, last_hit=%s WHERE id=%d', current_time( 'mysql', true ), (int) $id ) ); // phpcs:ignore
	}

	/* ---------- compiled cache ---------- */

	/** Cache layout: array( 'opts' => matcher options, 'exact' => array( normalised path => rules ), 'other' => rules ). */
	public static function build_cache( $rules, $opts ) {
		$exact = array();
		$other = array();
		foreach ( $rules as $r ) {
			if ( 'exact' === $r['match'] ) {
				list( $p ) = WLR_Matcher::split( $r['source'] );
				$exact[ WLR_Matcher::norm( $p, $opts ) ][] = $r;
			} else {
				$other[] = $r;
			}
		}
		// folder rules: longest prefix first, so the most specific wins; regex rules keep creation order.
		usort( $other, function ( $a, $b ) {
			$ra = 'prefix' === $a['match'] ? 0 : 1;
			$rb = 'prefix' === $b['match'] ? 0 : 1;
			return $ra === $rb ? ( 0 === $ra ? strlen( $b['source'] ) - strlen( $a['source'] ) : $a['id'] - $b['id'] ) : $ra - $rb;
		} );
		return array( 'opts' => $opts, 'exact' => $exact, 'other' => $other );
	}

	public static function matcher_opts() {
		$s = WLR_Settings::all();
		return array( 'case_insensitive' => (int) $s['case_insensitive'], 'ignore_slash' => (int) $s['ignore_slash'] );
	}

	public static function rebuild_cache() {
		global $wpdb;
		$rows  = (array) $wpdb->get_results( 'SELECT id,source,match_type,target,code,query_mode,enabled FROM ' . self::t_rules() . ' WHERE enabled=1 ORDER BY id ASC LIMIT 5000', ARRAY_A ); // phpcs:ignore
		$rules = array_map( array( __CLASS__, 'from_row' ), array_map( function ( $r ) {
			return $r + array( 'hits' => 0, 'last_hit' => null, 'note' => '' );
		}, $rows ) );
		$c     = self::build_cache( $rules, self::matcher_opts() );
		update_option( self::CACHE, $c, true );
		return $c;
	}

	public static function cache() {
		$c = get_option( self::CACHE );
		if ( ! is_array( $c ) || ! isset( $c['exact'] ) || $c['opts'] !== self::matcher_opts() ) {
			$c = self::rebuild_cache();
		}
		return $c;
	}

	/* ---------- 404 log ---------- */

	public static function log_404( $path, $referrer ) {
		global $wpdb;
		$now = current_time( 'mysql', true );
		$wpdb->query( $wpdb->prepare( 'INSERT INTO ' . self::t_404() . ' (path_hash,path,referrer,hits,first_seen,last_seen) VALUES (%s,%s,%s,1,%s,%s) ON DUPLICATE KEY UPDATE hits=hits+1, last_seen=VALUES(last_seen), referrer=IF(VALUES(referrer)<>\'\',VALUES(referrer),referrer)', md5( strtolower( $path ) ), mb_substr( $path, 0, 255 ), mb_substr( $referrer, 0, 255 ), $now, $now ) ); // phpcs:ignore
	}

	public static function query_404( $a ) {
		global $wpdb;
		$a     = array_merge( array( 'search' => '', 'per_page' => 25, 'page' => 1 ), $a );
		$where = '1=1';
		$vals  = array();
		if ( '' !== $a['search'] ) {
			$where = 'path LIKE %s';
			$vals[] = '%' . $wpdb->esc_like( $a['search'] ) . '%';
		}
		$cq    = 'SELECT COUNT(*) FROM ' . self::t_404() . " WHERE $where"; // phpcs:ignore
		$total = (int) ( $vals ? $wpdb->get_var( $wpdb->prepare( $cq, $vals ) ) : $wpdb->get_var( $cq ) ); // phpcs:ignore
		$sql   = 'SELECT * FROM ' . self::t_404() . " WHERE $where ORDER BY hits DESC, last_seen DESC LIMIT %d OFFSET %d"; // phpcs:ignore
		$vals[] = (int) $a['per_page'];
		$vals[] = max( 0, ( (int) $a['page'] - 1 ) * (int) $a['per_page'] );
		return array( 'total' => $total, 'rows' => (array) $wpdb->get_results( $wpdb->prepare( $sql, $vals ), ARRAY_A ) ); // phpcs:ignore
	}

	public static function delete_404( $ids ) {
		global $wpdb;
		$ids = array_filter( array_map( 'intval', (array) $ids ) );
		if ( $ids ) {
			$wpdb->query( 'DELETE FROM ' . self::t_404() . ' WHERE id IN (' . implode( ',', $ids ) . ')' ); // phpcs:ignore
		}
	}

	public static function delete_404_path( $path ) {
		global $wpdb;
		$wpdb->delete( self::t_404(), array( 'path_hash' => md5( strtolower( $path ) ) ) );
	}

	public static function daily() {
		global $wpdb;
		$s = WLR_Settings::all();
		$wpdb->query( $wpdb->prepare( 'DELETE FROM ' . self::t_404() . ' WHERE last_seen < %s', gmdate( 'Y-m-d H:i:s', time() - (int) $s['keep_days'] * DAY_IN_SECONDS ) ) ); // phpcs:ignore
		$n = (int) $wpdb->get_var( 'SELECT COUNT(*) FROM ' . self::t_404() ); // phpcs:ignore
		if ( $n > (int) $s['max_404'] ) {
			$wpdb->query( 'DELETE FROM ' . self::t_404() . ' ORDER BY hits ASC, last_seen ASC LIMIT ' . (int) ( $n - (int) $s['max_404'] ) ); // phpcs:ignore
		}
	}
}
