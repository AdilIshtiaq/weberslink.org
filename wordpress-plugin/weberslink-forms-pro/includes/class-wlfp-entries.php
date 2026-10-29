<?php
defined( 'ABSPATH' ) || exit;

class WLFP_Entries {

	public static function table() {
		global $wpdb;
		return $wpdb->prefix . 'wlfp_entries';
	}

	public static function insert( $form, $data, $extra = array() ) {
		global $wpdb;
		$serial = (int) $wpdb->get_var( $wpdb->prepare( 'SELECT COALESCE(MAX(serial),0) FROM ' . self::table() . ' WHERE form_id=%d', $form['id'] ) ) + 1; // phpcs:ignore
		$row    = wp_parse_args( $extra, array(
			'form_id'        => $form['id'],
			'serial'         => $serial,
			'user_id'        => get_current_user_id(),
			'status'         => 'unread',
			'ip'             => WLFP_Helpers::ip(),
			'user_agent'     => isset( $_SERVER['HTTP_USER_AGENT'] ) ? substr( sanitize_text_field( wp_unslash( $_SERVER['HTTP_USER_AGENT'] ) ), 0, 255 ) : '',
			'source_url'     => '',
			'payment_status' => '',
			'payment_method' => '',
			'payment_total'  => 0,
			'currency'       => '',
			'transaction_id' => '',
			'data'           => wp_json_encode( $data ),
			'created_at'     => current_time( 'mysql', true ),
		) );
		if ( ! is_string( $row['data'] ) ) {
			$row['data'] = wp_json_encode( $row['data'] );
		}
		$wpdb->insert( self::table(), $row );
		return (int) $wpdb->insert_id;
	}

	public static function get( $id ) {
		global $wpdb;
		$r = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . self::table() . ' WHERE id=%d', (int) $id ), ARRAY_A ); // phpcs:ignore
		return $r ? self::hydrate( $r ) : null;
	}

	public static function hydrate( $r ) {
		$r['id']      = (int) $r['id'];
		$r['form_id'] = (int) $r['form_id'];
		$r['data']    = json_decode( (string) $r['data'], true );
		$r['data']    = is_array( $r['data'] ) ? $r['data'] : array();
		return $r;
	}

	public static function update_data( $id, $data ) {
		global $wpdb;
		$wpdb->update( self::table(), array( 'data' => wp_json_encode( $data ) ), array( 'id' => (int) $id ) );
	}

	public static function update( $id, $cols ) {
		global $wpdb;
		$wpdb->update( self::table(), $cols, array( 'id' => (int) $id ) );
	}

	public static function query( $args ) {
		global $wpdb;
		$a = wp_parse_args( $args, array( 'form_id' => 0, 'status' => '', 'search' => '', 'from' => '', 'to' => '', 'starred' => 0, 'payment' => '', 'per_page' => 20, 'page' => 1, 'orderby' => 'id', 'order' => 'DESC', 'ids' => array(), 'user_id' => 0 ) );
		$where = array( '1=1' );
		$vals  = array();
		if ( $a['form_id'] ) {
			$where[] = 'form_id=%d';
			$vals[]  = (int) $a['form_id'];
		}
		if ( $a['status'] && 'all' !== $a['status'] ) {
			$where[] = 'status=%s';
			$vals[]  = $a['status'];
		} elseif ( 'all' === $a['status'] || '' === $a['status'] ) {
			$where[] = "status NOT IN ('trashed','spam')";
		}
		if ( $a['user_id'] ) {
			$where[] = 'user_id=%d';
			$vals[]  = (int) $a['user_id'];
		}
		if ( $a['starred'] ) {
			$where[] = 'starred=1';
		}
		if ( $a['payment'] ) {
			$where[] = 'payment_status=%s';
			$vals[]  = $a['payment'];
		}
		if ( $a['search'] ) {
			$where[] = '(data LIKE %s OR ip LIKE %s OR transaction_id LIKE %s)';
			$like    = '%' . $wpdb->esc_like( $a['search'] ) . '%';
			array_push( $vals, $like, $like, $like );
		}
		if ( $a['from'] ) {
			$where[] = 'created_at >= %s';
			$vals[]  = gmdate( 'Y-m-d 00:00:00', strtotime( $a['from'] ) );
		}
		if ( $a['to'] ) {
			$where[] = 'created_at <= %s';
			$vals[]  = gmdate( 'Y-m-d 23:59:59', strtotime( $a['to'] ) );
		}
		if ( ! empty( $a['ids'] ) ) {
			$where[] = 'id IN (' . implode( ',', array_map( 'intval', (array) $a['ids'] ) ) . ')';
		}
		$orderby = in_array( $a['orderby'], array( 'id', 'created_at', 'payment_total', 'status' ), true ) ? $a['orderby'] : 'id';
		$order   = 'ASC' === strtoupper( $a['order'] ) ? 'ASC' : 'DESC';
		$w       = implode( ' AND ', $where );
		$count_q = 'SELECT COUNT(*) FROM ' . self::table() . " WHERE $w"; // phpcs:ignore
		$total   = (int) ( $vals ? $wpdb->get_var( $wpdb->prepare( $count_q, $vals ) ) : $wpdb->get_var( $count_q ) ); // phpcs:ignore
		$sql     = 'SELECT * FROM ' . self::table() . " WHERE $w ORDER BY $orderby $order"; // phpcs:ignore
		$pv      = $vals;
		if ( (int) $a['per_page'] > 0 ) {
			$sql .= ' LIMIT %d OFFSET %d';
			$pv[] = (int) $a['per_page'];
			$pv[] = max( 0, ( (int) $a['page'] - 1 ) * (int) $a['per_page'] );
		}
		$rows = $wpdb->get_results( $pv ? $wpdb->prepare( $sql, $pv ) : $sql, ARRAY_A ); // phpcs:ignore
		return array( 'total' => $total, 'rows' => array_map( array( __CLASS__, 'hydrate' ), (array) $rows ) );
	}

	/** True when another live entry already holds this exact value for the field (used by "unique" fields). */
	public static function value_exists( $form_id, $name, $value ) {
		global $wpdb;
		$like = '%' . $wpdb->esc_like( '"' . $name . '":' . wp_json_encode( $value ) ) . '%';
		return (bool) $wpdb->get_var( $wpdb->prepare( 'SELECT id FROM ' . self::table() . " WHERE form_id=%d AND status NOT IN ('spam','trashed') AND data LIKE %s LIMIT 1", (int) $form_id, $like ) ); // phpcs:ignore
	}

	public static function counts( $form_id = 0 ) {
		global $wpdb;
		$w = $form_id ? $wpdb->prepare( 'WHERE form_id=%d', (int) $form_id ) : '';
		$r = $wpdb->get_results( 'SELECT status, COUNT(*) c FROM ' . self::table() . " $w GROUP BY status", ARRAY_A ); // phpcs:ignore
		$o = array( 'unread' => 0, 'read' => 0, 'spam' => 0, 'trashed' => 0 );
		foreach ( (array) $r as $x ) {
			$o[ $x['status'] ] = (int) $x['c'];
		}
		return $o;
	}

	public static function delete( $id ) {
		global $wpdb;
		$e = self::get( $id );
		if ( $e ) {
			$form = WLFP_Forms::get( $e['form_id'] );
			if ( $form ) {
				foreach ( $form['fields'] as $f ) {
					if ( in_array( $f['type'], array( 'file', 'image' ), true ) && ! empty( $e['data'][ $f['name'] ] ) ) {
						WLFP_Uploads::delete_files( $e['data'][ $f['name'] ] );
					}
				}
			}
		}
		$wpdb->delete( self::table(), array( 'id' => (int) $id ) );
		$wpdb->delete( $wpdb->prefix . 'wlfp_entry_notes', array( 'entry_id' => (int) $id ) );
		$wpdb->delete( $wpdb->prefix . 'wlfp_logs', array( 'entry_id' => (int) $id ) );
	}

	public static function notes( $entry_id ) {
		global $wpdb;
		return (array) $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}wlfp_entry_notes WHERE entry_id=%d ORDER BY id DESC", (int) $entry_id ), ARRAY_A ); // phpcs:ignore
	}

	public static function add_note( $entry_id, $note ) {
		global $wpdb;
		$wpdb->insert( $wpdb->prefix . 'wlfp_entry_notes', array( 'entry_id' => (int) $entry_id, 'user_id' => get_current_user_id(), 'note' => sanitize_textarea_field( $note ), 'created_at' => current_time( 'mysql', true ) ) );
	}

	public static function logs( $entry_id ) {
		global $wpdb;
		return (array) $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}wlfp_logs WHERE entry_id=%d ORDER BY id ASC", (int) $entry_id ), ARRAY_A ); // phpcs:ignore
	}

	/** Human-readable value of one field for an entry (plain text). */
	public static function display_value( $field, $value, $html = false ) {
		return WLFP_Fields::format_value( $field, $value, $html );
	}
}
