<?php
defined( 'ABSPATH' ) || exit;

/** Smart-code / merge-tag parser: {field:name}, {all_data}, {form_title}, {entry_id}, ... */
class WLFP_Merge {

	public static function tags_help() {
		return array( '{all_data}', '{field:FIELD_NAME}', '{form_title}', '{entry_id}', '{entry_serial}', '{entry_url}', '{site_name}', '{site_url}', '{admin_email}', '{date}', '{time}', '{ip}', '{source_url}', '{user_email}', '{user_name}', '{user_id}', '{payment_total}', '{payment_status}', '{transaction_id}', '{get:PARAM}' );
	}

	/**
	 * @param string $text   Template.
	 * @param array  $form   Form.
	 * @param array  $data   name => value.
	 * @param array  $entry  Entry row (optional).
	 * @param bool   $html   Output context.
	 */
	public static function parse( $text, $form, $data, $entry = null, $html = false ) {
		if ( false === strpos( (string) $text, '{' ) ) {
			return $text;
		}
		$fields = array();
		foreach ( $form['fields'] as $f ) {
			if ( ! empty( $f['name'] ) ) {
				$fields[ $f['name'] ] = $f;
			}
		}
		$user = wp_get_current_user();
		if ( $entry && ! empty( $entry['user_id'] ) ) {
			$u = get_userdata( (int) $entry['user_id'] );
			if ( $u ) {
				$user = $u;
			}
		}
		$esc = function ( $s ) use ( $html ) {
			return $html ? esc_html( $s ) : $s;
		};

		$text = preg_replace_callback( '/\{field:([a-z0-9_]+)(?::([a-z_]+))?\}/i', function ( $m ) use ( $fields, $data, $html, $esc ) {
			$n = $m[1];
			if ( ! isset( $fields[ $n ] ) || ! isset( $data[ $n ] ) ) {
				return '';
			}
			$f = $fields[ $n ];
			if ( ! empty( $m[2] ) && is_array( $data[ $n ] ) ) { // e.g. {field:name:first}.
				return $esc( isset( $data[ $n ][ $m[2] ] ) ? (string) $data[ $n ][ $m[2] ] : '' );
			}
			return WLFP_Fields::format_value( $f, $data[ $n ], $html );
		}, $text );

		$text = preg_replace_callback( '/\{get:([a-z0-9_\-]+)\}/i', function ( $m ) use ( $esc ) {
			return isset( $_GET[ $m[1] ] ) ? $esc( sanitize_text_field( wp_unslash( $_GET[ $m[1] ] ) ) ) : ''; // phpcs:ignore
		}, $text );

		$map = array(
			'{form_title}'     => $esc( $form['title'] ),
			'{form_id}'        => (string) $form['id'],
			'{entry_id}'       => $entry ? (string) $entry['id'] : '',
			'{entry_serial}'   => $entry ? (string) $entry['serial'] : '',
			'{entry_url}'      => $entry ? admin_url( 'admin.php?page=wlfp-entries&entry=' . (int) $entry['id'] ) : '',
			'{site_name}'      => $esc( wp_specialchars_decode( get_bloginfo( 'name' ), ENT_QUOTES ) ),
			'{site_url}'       => home_url( '/' ),
			'{admin_email}'    => get_option( 'admin_email' ),
			'{date}'           => wp_date( get_option( 'date_format' ) ),
			'{time}'           => wp_date( get_option( 'time_format' ) ),
			'{ip}'             => $entry ? $esc( $entry['ip'] ) : $esc( WLFP_Helpers::ip() ),
			'{source_url}'     => $entry ? $esc( (string) $entry['source_url'] ) : '',
			'{user_email}'     => $user && $user->exists() ? $user->user_email : '',
			'{user_name}'      => $user && $user->exists() ? $esc( $user->display_name ) : '',
			'{user_id}'        => $user && $user->exists() ? (string) $user->ID : '0',
			'{payment_total}'  => $entry ? WLFP_Helpers::money( $entry['payment_total'], $entry['currency'] ) : '',
			'{payment_status}' => $entry ? $esc( $entry['payment_status'] ) : '',
			'{transaction_id}' => $entry ? $esc( $entry['transaction_id'] ) : '',
		);
		$text = strtr( $text, $map );

		if ( false !== strpos( $text, '{all_data}' ) ) {
			$text = str_replace( '{all_data}', self::all_data( $form, $data, $html ), $text );
		}
		return apply_filters( 'wlfp_merge_parse', $text, $form, $data, $entry );
	}

	public static function all_data( $form, $data, $html = true ) {
		$rows = '';
		foreach ( $form['fields'] as $f ) {
			if ( empty( $f['name'] ) || ! WLFP_Fields::stores_value( $f['type'] ) || ! isset( $data[ $f['name'] ] ) || WLFP_Fields::is_empty( $data[ $f['name'] ] ) ) {
				continue;
			}
			$label = ! empty( $f['label'] ) ? $f['label'] : $f['name'];
			$val   = WLFP_Fields::format_value( $f, $data[ $f['name'] ], $html );
			if ( $html ) {
				$rows .= '<tr><td style="padding:8px 12px;border:1px solid #e5e5e5;background:#f7f7f7;font-weight:600;vertical-align:top;width:35%">' . esc_html( $label ) . '</td><td style="padding:8px 12px;border:1px solid #e5e5e5;vertical-align:top">' . $val . '</td></tr>';
			} else {
				$rows .= $label . ': ' . $val . "\n";
			}
		}
		return $html ? '<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;max-width:640px;font-family:Arial,Helvetica,sans-serif;font-size:14px">' . $rows . '</table>' : $rows;
	}
}
