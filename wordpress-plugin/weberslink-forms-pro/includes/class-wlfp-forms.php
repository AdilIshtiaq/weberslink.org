<?php
defined( 'ABSPATH' ) || exit;

class WLFP_Forms {

	public static function table() {
		global $wpdb;
		return $wpdb->prefix . 'wlfp_forms';
	}

	public static function default_settings() {
		return array(
			'confirmation'  => array( 'type' => 'message', 'message' => '<p>Thank you! Your submission has been received.</p>', 'url' => '', 'page_id' => 0, 'hide_form' => 1, 'scroll' => 1, 'rules' => array() ),
			'quiz'          => array( 'enabled' => 0, 'pass_percent' => 60 ),
			'reference'     => array( 'prefix' => '', 'pad' => 4, 'suffix' => '' ),
			'resume'        => array( 'enabled' => 0, 'button_text' => 'Save & continue later', 'expire_days' => 30, 'subject' => 'Continue your form: {form_title}', 'message' => '<p>Click the link below to pick up where you left off:</p><p><a href="{resume_link}">{resume_link}</a></p><p>The link works for a limited time.</p>' ),
			'conversation'  => array( 'enabled' => 0, 'auto_advance' => 1, 'next_text' => 'OK', 'welcome' => 0, 'welcome_title' => '', 'welcome_text' => '', 'start_text' => 'Start' ),
			'button'        => array( 'text' => 'Submit', 'align' => 'left', 'loading_text' => 'Sending…', 'style' => 'solid' ),
			'notifications' => array(
				array(
					'name'       => 'Admin notification',
					'enabled'    => 1,
					'to'         => '{admin_email}',
					'cc'         => '',
					'bcc'        => '',
					'reply_to'   => '',
					'from_name'  => '',
					'from_email' => '',
					'subject'    => 'New submission: {form_title}',
					'message'    => '{all_data}',
					'format'     => 'html',
					'attach'     => 0,
					'attach_pdf' => 0,
					'delay'      => 0,
					'delay_unit' => 'hours',
					'conditional' => array( 'enabled' => 0, 'match' => 'all', 'rules' => array() ),
				),
			),
			'feeds'         => array(),
			'restrictions'  => array(
				'limit_entries' => 0, 'max_entries' => 0, 'limit_msg' => 'This form is closed: the maximum number of entries has been reached.',
				'schedule' => 0, 'start' => '', 'end' => '', 'schedule_msg' => 'This form is not accepting responses right now.',
				'login_required' => 0, 'login_msg' => 'You must be logged in to submit this form.',
				'one_per_user' => 0, 'one_per_ip' => 0, 'dup_msg' => 'You have already submitted this form.',
				'daily_limit' => 0, 'daily_limit_msg' => 'Daily submission limit reached. Please try again tomorrow.',
			),
			'spam'          => array( 'honeypot' => 1, 'min_seconds' => 3, 'captcha' => 'none', 'keywords' => '', 'max_links' => 0, 'rate_limit' => 5, 'akismet' => 0 ),
			'style'         => array( 'preset' => 'inherit', 'primary' => '', 'text' => '', 'bg' => '', 'border' => '', 'radius' => '6', 'label_position' => 'top', 'input_size' => 'md', 'custom_css' => '', 'show_title' => 0, 'asterisk' => 'end' ),
			'payment'       => array( 'provider' => 'none', 'currency' => '', 'send_after_payment' => 1, 'coupons' => array(), 'tax_percent' => 0, 'recurring' => 0, 'interval' => 'month', 'success_url' => '', 'cancel_url' => '', 'description' => '{form_title}' ),
			'entries'       => array( 'store' => 1, 'delete_after_days' => 0 ),
			'steps'         => array( 'progress' => 'bar', 'show_prev' => 1, 'next_text' => 'Next', 'prev_text' => 'Back' ),
			'misc'          => array( 'autosave' => 0, 'ajax' => 1, 'prefill_get' => 1, 'label_ids' => 0 ),
		);
	}

	public static function normalize_settings( $settings ) {
		$settings = is_array( $settings ) ? $settings : array();
		$d        = self::default_settings();
		$out      = array();
		foreach ( $d as $k => $v ) {
			if ( in_array( $k, array( 'notifications', 'feeds' ), true ) ) {
				$out[ $k ] = isset( $settings[ $k ] ) && is_array( $settings[ $k ] ) ? array_values( $settings[ $k ] ) : $v;
			} else {
				$out[ $k ] = wp_parse_args( isset( $settings[ $k ] ) && is_array( $settings[ $k ] ) ? $settings[ $k ] : array(), $v );
			}
		}
		return $out;
	}

	public static function get( $id ) {
		global $wpdb;
		$row = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . self::table() . ' WHERE id=%d', (int) $id ), ARRAY_A ); // phpcs:ignore
		return $row ? self::hydrate( $row ) : null;
	}

	public static function hydrate( $row ) {
		$row['id']       = (int) $row['id'];
		$row['fields']   = json_decode( (string) $row['fields'], true );
		$row['fields']   = is_array( $row['fields'] ) ? $row['fields'] : array();
		$row['settings'] = self::normalize_settings( json_decode( (string) $row['settings'], true ) );
		return $row;
	}

	public static function all( $args = array() ) {
		global $wpdb;
		$where = '1=1';
		$vals  = array();
		if ( ! empty( $args['status'] ) ) {
			$where .= ' AND status=%s';
			$vals[] = $args['status'];
		}
		if ( ! empty( $args['search'] ) ) {
			$where .= ' AND title LIKE %s';
			$vals[] = '%' . $wpdb->esc_like( $args['search'] ) . '%';
		}
		$sql = 'SELECT * FROM ' . self::table() . " WHERE $where ORDER BY id DESC"; // phpcs:ignore
		if ( $vals ) {
			$sql = $wpdb->prepare( $sql, $vals ); // phpcs:ignore
		}
		$rows = $wpdb->get_results( $sql, ARRAY_A ); // phpcs:ignore
		return array_map( array( __CLASS__, 'hydrate' ), (array) $rows );
	}

	public static function count_by_status() {
		global $wpdb;
		$rows = $wpdb->get_results( 'SELECT status, COUNT(*) c FROM ' . self::table() . ' GROUP BY status', ARRAY_A ); // phpcs:ignore
		$out  = array( 'published' => 0, 'draft' => 0, 'trash' => 0 );
		foreach ( (array) $rows as $r ) {
			$out[ $r['status'] ] = (int) $r['c'];
		}
		return $out;
	}

	/** Create or update a form. $data: title, status, fields, settings. Returns id. */
	public static function save( $id, $data ) {
		global $wpdb;
		$now = current_time( 'mysql', true );
		$row = array(
			'title'      => isset( $data['title'] ) ? sanitize_text_field( $data['title'] ) : 'Untitled form',
			'status'     => isset( $data['status'] ) && in_array( $data['status'], array( 'published', 'draft', 'trash' ), true ) ? $data['status'] : 'published',
			'fields'     => wp_json_encode( self::sanitize_fields( isset( $data['fields'] ) ? $data['fields'] : array() ) ),
			'settings'   => wp_json_encode( WLFP_Helpers::clean( self::normalize_settings( isset( $data['settings'] ) ? $data['settings'] : array() ) ) ),
			'updated_at' => $now,
		);
		if ( $id ) {
			$old = self::get( $id );
			if ( $old && ( wp_json_encode( $old['fields'] ) !== $row['fields'] || wp_json_encode( $old['settings'] ) !== $row['settings'] || $old['title'] !== $row['title'] ) ) {
				self::add_revision( $old );
			}
			$wpdb->update( self::table(), $row, array( 'id' => (int) $id ) );
			return (int) $id;
		}
		$row['created_at'] = $now;
		$row['created_by'] = get_current_user_id();
		$wpdb->insert( self::table(), $row );
		return (int) $wpdb->insert_id;
	}

	/* ---------- revisions (version history) ---------- */

	public static function add_revision( $form ) {
		global $wpdb;
		$t = $wpdb->prefix . 'wlfp_revisions';
		$wpdb->insert( $t, array( 'form_id' => (int) $form['id'], 'user_id' => get_current_user_id(), 'title' => $form['title'], 'fields' => wp_json_encode( $form['fields'] ), 'settings' => wp_json_encode( $form['settings'] ), 'created_at' => current_time( 'mysql', true ) ) );
		$keep = (int) apply_filters( 'wlfp_revisions_to_keep', 25 );
		$ids  = $wpdb->get_col( $wpdb->prepare( "SELECT id FROM $t WHERE form_id=%d ORDER BY id DESC LIMIT %d, 1000", (int) $form['id'], $keep ) ); // phpcs:ignore
		if ( $ids ) {
			$wpdb->query( "DELETE FROM $t WHERE id IN (" . implode( ',', array_map( 'intval', $ids ) ) . ')' ); // phpcs:ignore
		}
	}

	public static function revisions( $form_id ) {
		global $wpdb;
		return (array) $wpdb->get_results( $wpdb->prepare( "SELECT id, user_id, title, created_at FROM {$wpdb->prefix}wlfp_revisions WHERE form_id=%d ORDER BY id DESC", (int) $form_id ), ARRAY_A ); // phpcs:ignore
	}

	public static function revision( $id, $form_id ) {
		global $wpdb;
		$r = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}wlfp_revisions WHERE id=%d AND form_id=%d", (int) $id, (int) $form_id ), ARRAY_A ); // phpcs:ignore
		if ( ! $r ) {
			return null;
		}
		$f = json_decode( (string) $r['fields'], true );
		return array( 'title' => $r['title'], 'fields' => is_array( $f ) ? $f : array(), 'settings' => self::normalize_settings( json_decode( (string) $r['settings'], true ) ) );
	}

	public static function sanitize_fields( $fields ) {
		$out  = array();
		$keys = array();
		foreach ( (array) $fields as $f ) {
			if ( ! is_array( $f ) || empty( $f['type'] ) ) {
				continue;
			}
			$f         = WLFP_Helpers::clean( $f );
			$f['type'] = sanitize_key( $f['type'] );
			$f['id']   = ! empty( $f['id'] ) ? sanitize_key( $f['id'] ) : WLFP_Helpers::uid();
			if ( isset( $f['name'] ) ) {
				$f['name'] = preg_replace( '/[^a-z0-9_]/', '', strtolower( str_replace( array( '-', ' ' ), '_', $f['name'] ) ) );
			}
			if ( WLFP_Fields::stores_value( $f['type'] ) ) {
				$base = ! empty( $f['name'] ) ? $f['name'] : sanitize_key( str_replace( ' ', '_', isset( $f['label'] ) ? $f['label'] : $f['type'] ) );
				$base = $base ? $base : $f['type'];
				$name = $base;
				$i    = 2;
				while ( isset( $keys[ $name ] ) ) {
					$name = $base . '_' . $i++;
				}
				$keys[ $name ] = 1;
				$f['name']     = $name;
			}
			$out[] = $f;
		}
		return $out;
	}

	public static function duplicate( $id ) {
		$f = self::get( $id );
		if ( ! $f ) {
			return 0;
		}
		return self::save( 0, array( 'title' => $f['title'] . ' (copy)', 'status' => 'draft', 'fields' => $f['fields'], 'settings' => $f['settings'] ) );
	}

	public static function delete( $id ) {
		global $wpdb;
		$ids = $wpdb->get_col( $wpdb->prepare( "SELECT id FROM {$wpdb->prefix}wlfp_entries WHERE form_id=%d", (int) $id ) ); // phpcs:ignore
		foreach ( $ids as $eid ) {
			WLFP_Entries::delete( (int) $eid );
		}
		$wpdb->delete( self::table(), array( 'id' => (int) $id ) );
		$wpdb->delete( $wpdb->prefix . 'wlfp_views', array( 'form_id' => (int) $id ) );
		$wpdb->delete( $wpdb->prefix . 'wlfp_logs', array( 'form_id' => (int) $id ) );
		$wpdb->delete( $wpdb->prefix . 'wlfp_revisions', array( 'form_id' => (int) $id ) );
		$wpdb->delete( $wpdb->prefix . 'wlfp_drafts', array( 'form_id' => (int) $id ) );
	}

	public static function set_status( $id, $status ) {
		global $wpdb;
		$wpdb->update( self::table(), array( 'status' => $status ), array( 'id' => (int) $id ) );
	}

	public static function entry_count( $id ) {
		global $wpdb;
		return (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$wpdb->prefix}wlfp_entries WHERE form_id=%d AND status <> 'trashed' AND status <> 'spam'", (int) $id ) ); // phpcs:ignore
	}

	/** Fields that have a posted value (vs. layout elements). */
	public static function value_fields( $form ) {
		return array_values( array_filter( $form['fields'], function ( $f ) {
			return WLFP_Fields::stores_value( $f['type'] );
		} ) );
	}
}
