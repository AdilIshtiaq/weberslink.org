<?php
defined( 'ABSPATH' ) || exit;

class WLR_Settings {

	const OPTION = 'wlr_settings';

	public static function defaults() {
		return array(
			'log_404'          => 1,
			'ignore_bots'      => 1,
			'keep_days'        => 30,
			'max_404'          => 5000,
			'track_hits'       => 1,
			'case_insensitive' => 1,
			'ignore_slash'     => 1,
			'auto_slug'        => 1,
			'default_code'     => 301,
			'ignore_ext'       => 'png,jpg,jpeg,gif,webp,svg,ico,css,js,map,woff,woff2,ttf,eot',
			'ignore_paths'     => '',
		);
	}

	public static function all() {
		$s = get_option( self::OPTION, array() );
		return array_merge( self::defaults(), is_array( $s ) ? $s : array() );
	}

	public static function get( $key ) {
		$s = self::all();
		return isset( $s[ $key ] ) ? $s[ $key ] : null;
	}

	public static function codes() {
		return array(
			301 => __( '301 Moved permanently', 'weberslink-redirects' ),
			302 => __( '302 Found (temporary)', 'weberslink-redirects' ),
			303 => __( '303 See other', 'weberslink-redirects' ),
			307 => __( '307 Temporary (keeps method)', 'weberslink-redirects' ),
			308 => __( '308 Permanent (keeps method)', 'weberslink-redirects' ),
			410 => __( '410 Gone (no target)', 'weberslink-redirects' ),
			451 => __( '451 Unavailable for legal reasons (no target)', 'weberslink-redirects' ),
		);
	}

	public static function sanitize( $in ) {
		$in  = is_array( $in ) ? $in : array();
		$out = array();
		foreach ( array( 'log_404', 'ignore_bots', 'track_hits', 'case_insensitive', 'ignore_slash', 'auto_slug' ) as $b ) {
			$out[ $b ] = isset( $in[ $b ] ) ? 1 : 0;
		}
		$out['keep_days']    = isset( $in['keep_days'] ) ? max( 1, min( 365, (int) $in['keep_days'] ) ) : 30;
		$out['max_404']      = isset( $in['max_404'] ) ? max( 100, min( 50000, (int) $in['max_404'] ) ) : 5000;
		$out['default_code'] = isset( $in['default_code'], self::codes()[ (int) $in['default_code'] ] ) && (int) $in['default_code'] < 400 ? (int) $in['default_code'] : 301;
		$ext                 = array_filter( array_map( function ( $e ) {
			return strtolower( preg_replace( '/[^a-z0-9]/i', '', $e ) );
		}, explode( ',', isset( $in['ignore_ext'] ) ? (string) $in['ignore_ext'] : '' ) ) );
		$out['ignore_ext']   = implode( ',', array_unique( $ext ) );
		$lines               = array_filter( array_map( 'trim', preg_split( '/\r\n|\r|\n/', isset( $in['ignore_paths'] ) ? (string) $in['ignore_paths'] : '' ) ) );
		$out['ignore_paths'] = implode( "\n", array_slice( array_map( function ( $l ) {
			return mb_substr( sanitize_text_field( $l ), 0, 200 );
		}, $lines ), 0, 50 ) );
		return array_merge( self::defaults(), $out );
	}
}
