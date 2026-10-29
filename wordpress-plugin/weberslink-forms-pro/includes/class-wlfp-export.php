<?php
defined( 'ABSPATH' ) || exit;

class WLFP_Export {

	public static function init() {
		add_action( 'admin_post_wlfp_export_entries', array( __CLASS__, 'entries_csv' ) );
		add_action( 'admin_post_wlfp_export_form', array( __CLASS__, 'form_json' ) );
		add_action( 'admin_post_wlfp_import_form', array( __CLASS__, 'form_import' ) );
		add_action( 'admin_post_wlfp_print_entry', array( __CLASS__, 'print_entry' ) );
	}

	private static function guard( $nonce_action ) {
		if ( ! WLFP_Helpers::can_manage() ) {
			wp_die( esc_html__( 'You do not have permission to do this.', 'weberslink-forms-pro' ), '', array( 'response' => 403 ) );
		}
		check_admin_referer( $nonce_action );
	}

	/** Neutralise spreadsheet formula injection. */
	public static function csv_cell( $v ) {
		$v = (string) $v;
		if ( '' !== $v && in_array( $v[0], array( '=', '+', '-', '@', "\t", "\r" ), true ) ) {
			$v = "'" . $v;
		}
		return $v;
	}

	public static function entries_csv() {
		self::guard( 'wlfp_export' );
		$form_id = isset( $_GET['form_id'] ) ? (int) $_GET['form_id'] : 0; // phpcs:ignore
		$form    = WLFP_Forms::get( $form_id );
		if ( ! $form ) {
			wp_die( esc_html__( 'Form not found.', 'weberslink-forms-pro' ) );
		}
		$ids = isset( $_GET['ids'] ) ? array_filter( array_map( 'intval', explode( ',', sanitize_text_field( wp_unslash( $_GET['ids'] ) ) ) ) ) : array(); // phpcs:ignore
		$q   = WLFP_Entries::query( array( 'form_id' => $form_id, 'status' => isset( $_GET['status'] ) ? sanitize_key( $_GET['status'] ) : 'all', 'search' => isset( $_GET['s'] ) ? sanitize_text_field( wp_unslash( $_GET['s'] ) ) : '', 'from' => isset( $_GET['from'] ) ? sanitize_text_field( wp_unslash( $_GET['from'] ) ) : '', 'to' => isset( $_GET['to'] ) ? sanitize_text_field( wp_unslash( $_GET['to'] ) ) : '', 'per_page' => 0, 'ids' => $ids, 'order' => 'ASC' ) ); // phpcs:ignore
		nocache_headers();
		header( 'Content-Type: text/csv; charset=utf-8' );
		header( 'Content-Disposition: attachment; filename=' . sanitize_file_name( $form['title'] ) . '-entries-' . gmdate( 'Y-m-d' ) . '.csv' );
		$out = fopen( 'php://output', 'w' ); // phpcs:ignore
		fwrite( $out, "\xEF\xBB\xBF" ); // phpcs:ignore -- BOM for Excel.
		$fields = WLFP_Forms::value_fields( $form );
		$head   = array( 'ID', 'Serial', 'Date (UTC)', 'Status', 'IP', 'Source URL', 'Payment status', 'Payment total', 'Currency', 'Transaction' );
		foreach ( $fields as $f ) {
			$head[] = $f['label'] ? $f['label'] : $f['name'];
		}
		fputcsv( $out, $head );
		foreach ( $q['rows'] as $e ) {
			$row = array( $e['id'], $e['serial'], $e['created_at'], $e['status'], $e['ip'], $e['source_url'], $e['payment_status'], $e['payment_total'], $e['currency'], $e['transaction_id'] );
			foreach ( $fields as $f ) {
				$row[] = self::csv_cell( isset( $e['data'][ $f['name'] ] ) ? WLFP_Fields::format_value( $f, $e['data'][ $f['name'] ], false ) : '' );
			}
			fputcsv( $out, $row );
		}
		fclose( $out ); // phpcs:ignore
		exit;
	}

	public static function form_json() {
		self::guard( 'wlfp_export' );
		$form = WLFP_Forms::get( isset( $_GET['form_id'] ) ? (int) $_GET['form_id'] : 0 ); // phpcs:ignore
		if ( ! $form ) {
			wp_die( esc_html__( 'Form not found.', 'weberslink-forms-pro' ) );
		}
		$j = array( 'plugin' => 'weberslink-forms-pro', 'version' => WLFP_VERSION, 'title' => $form['title'], 'fields' => $form['fields'], 'settings' => $form['settings'] );
		// Never export secrets that might live in feeds? Feeds hold URLs/tokens: strip tokens.
		foreach ( $j['settings']['feeds'] as &$feed ) {
			unset( $feed['token'] );
		}
		unset( $feed );
		nocache_headers();
		header( 'Content-Type: application/json; charset=utf-8' );
		header( 'Content-Disposition: attachment; filename=' . sanitize_file_name( $form['title'] ) . '.wlfp.json' );
		echo wp_json_encode( $j, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE ); // phpcs:ignore
		exit;
	}

	public static function form_import() {
		self::guard( 'wlfp_import' );
		if ( empty( $_FILES['wlfp_file']['tmp_name'] ) || UPLOAD_ERR_OK !== (int) $_FILES['wlfp_file']['error'] ) { // phpcs:ignore
			wp_safe_redirect( admin_url( 'admin.php?page=wlfp-tools&msg=import_fail' ) );
			exit;
		}
		$raw = file_get_contents( $_FILES['wlfp_file']['tmp_name'] ); // phpcs:ignore
		$j   = json_decode( (string) $raw, true );
		$ids = array();
		$list = isset( $j['fields'] ) ? array( $j ) : ( is_array( $j ) ? $j : array() );
		foreach ( $list as $item ) {
			if ( ! is_array( $item ) || ! isset( $item['fields'] ) || ! is_array( $item['fields'] ) ) {
				continue;
			}
			$ids[] = WLFP_Forms::save( 0, array( 'title' => isset( $item['title'] ) ? $item['title'] : 'Imported form', 'status' => 'draft', 'fields' => $item['fields'], 'settings' => isset( $item['settings'] ) ? $item['settings'] : array() ) );
		}
		wp_safe_redirect( admin_url( 'admin.php?page=wlfp-tools&msg=' . ( $ids ? 'imported&n=' . count( $ids ) : 'import_fail' ) ) );
		exit;
	}

	public static function print_entry() {
		self::guard( 'wlfp_print' );
		$e = WLFP_Entries::get( isset( $_GET['entry'] ) ? (int) $_GET['entry'] : 0 ); // phpcs:ignore
		$f = $e ? WLFP_Forms::get( $e['form_id'] ) : null;
		if ( ! $e || ! $f ) {
			wp_die( esc_html__( 'Entry not found.', 'weberslink-forms-pro' ) );
		}
		echo '<!doctype html><html><head><meta charset="utf-8"><title>' . esc_html( $f['title'] . ' #' . $e['serial'] ) . '</title><style>body{font:14px/1.5 Arial,sans-serif;margin:40px;color:#111}h1{font-size:20px}table{border-collapse:collapse;width:100%}td{border:1px solid #ddd;padding:8px 10px;vertical-align:top}td:first-child{width:32%;background:#f6f6f6;font-weight:600}.m{color:#666;font-size:12px;margin-bottom:16px}@media print{.np{display:none}}</style></head><body>';
		echo '<p class="np"><button onclick="window.print()">' . esc_html__( 'Print / Save as PDF', 'weberslink-forms-pro' ) . '</button></p>';
		echo '<h1>' . esc_html( $f['title'] ) . ' — #' . (int) $e['serial'] . '</h1><div class="m">' . esc_html( get_date_from_gmt( $e['created_at'], get_option( 'date_format' ) . ' ' . get_option( 'time_format' ) ) ) . ( $e['ip'] ? ' · ' . esc_html( $e['ip'] ) : '' ) . '</div>';
		echo WLFP_Merge::all_data( $f, $e['data'], true ); // phpcs:ignore
		if ( $e['payment_total'] > 0 ) {
			echo '<p><strong>' . esc_html__( 'Payment:', 'weberslink-forms-pro' ) . '</strong> ' . esc_html( WLFP_Helpers::money( $e['payment_total'], $e['currency'] ) . ' — ' . $e['payment_status'] ) . '</p>';
		}
		echo '</body></html>';
		exit;
	}
}
