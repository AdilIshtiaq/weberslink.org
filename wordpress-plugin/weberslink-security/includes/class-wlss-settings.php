<?php
defined( 'ABSPATH' ) || exit;

class WLSS_Settings {

	const OPTION = 'wlss_settings';

	public static function defaults() {
		return array(
			'limit_enabled'    => 1,
			'max_attempts'     => 5,
			'window_min'       => 15,
			'lock_min'         => 15,
			'escalate'         => 1,
			'allow_ips'        => '',
			'block_ips'        => '',
			'proxy_header'     => '', // '' | X-Forwarded-For | CF-Connecting-IP | X-Real-IP
			'lock_alert'       => 1,
			'tfa_enabled'      => 1,
			'tfa_roles'        => array( 'administrator', 'editor' ),
			'generic_errors'   => 1,
			'disable_xmlrpc'   => 1,
			'hide_version'     => 1,
			'block_enum'       => 1,
			'disable_editors'  => 0,
			'send_headers'     => 1,
			'hsts'             => 0,
			'no_app_passwords' => 0,
			'strong_passwords' => 1,
			'keep_days'        => 60,
		);
	}

	public static function proxy_headers() {
		return array( '' => 'REMOTE_ADDR only (recommended)', 'X-Forwarded-For' => 'X-Forwarded-For', 'CF-Connecting-IP' => 'CF-Connecting-IP (Cloudflare)', 'X-Real-IP' => 'X-Real-IP' );
	}

	public static function all() {
		$s = get_option( self::OPTION, array() );
		return array_merge( self::defaults(), is_array( $s ) ? $s : array() );
	}

	public static function get( $k ) {
		$s = self::all();
		return isset( $s[ $k ] ) ? $s[ $k ] : null;
	}

	private static function ip_lines( $text ) {
		$ok = array();
		foreach ( preg_split( '/\r\n|\r|\n|,/', (string) $text ) as $l ) {
			$l = trim( $l );
			if ( '' !== $l && WLSS_Ip::valid_entry( $l ) ) {
				$ok[ $l ] = $l;
			}
		}
		return implode( "\n", array_slice( array_values( $ok ), 0, 200 ) );
	}

	public static function sanitize( $in ) {
		$in  = is_array( $in ) ? $in : array();
		$out = array();
		foreach ( array( 'limit_enabled', 'escalate', 'lock_alert', 'tfa_enabled', 'generic_errors', 'disable_xmlrpc', 'hide_version', 'block_enum', 'disable_editors', 'send_headers', 'hsts', 'no_app_passwords', 'strong_passwords' ) as $b ) {
			$out[ $b ] = isset( $in[ $b ] ) ? 1 : 0;
		}
		$out['max_attempts'] = isset( $in['max_attempts'] ) ? max( 3, min( 50, (int) $in['max_attempts'] ) ) : 5;
		$out['window_min']   = isset( $in['window_min'] ) ? max( 1, min( 1440, (int) $in['window_min'] ) ) : 15;
		$out['lock_min']     = isset( $in['lock_min'] ) ? max( 1, min( 1440, (int) $in['lock_min'] ) ) : 15;
		$out['keep_days']    = isset( $in['keep_days'] ) ? max( 1, min( 365, (int) $in['keep_days'] ) ) : 60;
		$out['allow_ips']    = self::ip_lines( isset( $in['allow_ips'] ) ? $in['allow_ips'] : '' );
		$out['block_ips']    = self::ip_lines( isset( $in['block_ips'] ) ? $in['block_ips'] : '' );
		$out['proxy_header'] = isset( $in['proxy_header'] ) && isset( self::proxy_headers()[ $in['proxy_header'] ] ) ? $in['proxy_header'] : '';
		$roles               = isset( $in['tfa_roles'] ) ? array_map( 'sanitize_key', (array) $in['tfa_roles'] ) : array();
		$out['tfa_roles']    = array_values( array_unique( $roles ) );
		return array_merge( self::defaults(), $out );
	}
}
