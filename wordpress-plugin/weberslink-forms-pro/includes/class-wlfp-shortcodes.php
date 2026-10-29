<?php
defined( 'ABSPATH' ) || exit;

/**
 * [weberslink_my_entries form="1" fields="name,email" limit="10"]  – the logged-in user's own submissions.
 * [weberslink_entry_count form="1" limit="100" format="{count} of {limit} spots taken"]
 */
class WLFP_Shortcodes {

	public static function init() {
		add_shortcode( 'weberslink_my_entries', array( __CLASS__, 'my_entries' ) );
		add_shortcode( 'weberslink_entry_count', array( __CLASS__, 'entry_count' ) );
	}

	public static function my_entries( $atts ) {
		$a = shortcode_atts( array( 'form' => 0, 'fields' => '', 'limit' => 10 ), $atts, 'weberslink_my_entries' );
		if ( ! is_user_logged_in() ) {
			return '<p class="wlfp-notice">' . esc_html__( 'Please log in to see your submissions.', 'weberslink-forms-pro' ) . '</p>';
		}
		$form = WLFP_Forms::get( (int) $a['form'] );
		if ( ! $form ) {
			return '';
		}
		WLFP_Renderer::enqueue();
		$want = array_filter( array_map( 'trim', explode( ',', $a['fields'] ) ) );
		$cols = array();
		foreach ( WLFP_Forms::value_fields( $form ) as $f ) {
			if ( in_array( $f['type'], array( 'password', 'signature' ), true ) ) {
				continue;
			}
			if ( ! $want || in_array( $f['name'], $want, true ) ) {
				$cols[] = $f;
			}
		}
		$q = WLFP_Entries::query( array( 'form_id' => $form['id'], 'user_id' => get_current_user_id(), 'per_page' => max( 1, min( 100, (int) $a['limit'] ) ) ) );
		if ( ! $q['rows'] ) {
			return '<p class="wlfp-notice">' . esc_html__( 'You have not submitted anything yet.', 'weberslink-forms-pro' ) . '</p>';
		}
		$o = '<div class="wlfp-wrap"><div class="wlfp-likert-scroll"><table class="wlfp-likert wlfp-myentries"><thead><tr><th>' . esc_html__( 'Date', 'weberslink-forms-pro' ) . '</th>';
		foreach ( $cols as $c ) {
			$o .= '<th>' . esc_html( $c['label'] ? $c['label'] : $c['name'] ) . '</th>';
		}
		$o .= '</tr></thead><tbody>';
		foreach ( $q['rows'] as $e ) {
			$o .= '<tr><td>' . esc_html( get_date_from_gmt( $e['created_at'], get_option( 'date_format' ) ) ) . '</td>';
			foreach ( $cols as $c ) {
				$o .= '<td>' . ( isset( $e['data'][ $c['name'] ] ) ? WLFP_Fields::format_value( $c, $e['data'][ $c['name'] ], true ) : '' ) . '</td>';
			}
			$o .= '</tr>';
		}
		return $o . '</tbody></table></div></div>';
	}

	public static function entry_count( $atts ) {
		$a    = shortcode_atts( array( 'form' => 0, 'limit' => 0, 'format' => '{count}' ), $atts, 'weberslink_entry_count' );
		$form = WLFP_Forms::get( (int) $a['form'] );
		if ( ! $form ) {
			return '';
		}
		$n     = WLFP_Forms::entry_count( $form['id'] );
		$limit = (int) $a['limit'] ? (int) $a['limit'] : (int) $form['settings']['restrictions']['max_entries'];
		return esc_html( strtr( $a['format'], array( '{count}' => (string) $n, '{limit}' => (string) $limit, '{remaining}' => (string) max( 0, $limit - $n ) ) ) );
	}
}
