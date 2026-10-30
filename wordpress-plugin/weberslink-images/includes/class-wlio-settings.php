<?php
defined( 'ABSPATH' ) || exit;

class WLIO_Settings {

	const OPTION = 'wlio_settings';

	public static function defaults() {
		return array(
			'auto'         => 1,   // optimise on upload
			'jpeg_quality' => 82,
			'webp_quality' => 80,
			'webp'         => 1,   // create WebP versions
			'serve_webp'   => 1,   // wrap images in <picture> when a WebP exists
			'max_width'    => 2560,
			'max_height'   => 2560,
			'backup'       => 1,   // keep the original so it can be restored
			'png'          => 1,   // recompress PNG
		);
	}

	public static function all() {
		$s = get_option( self::OPTION, array() );
		return array_merge( self::defaults(), is_array( $s ) ? $s : array() );
	}

	public static function get( $k ) {
		$s = self::all();
		return isset( $s[ $k ] ) ? $s[ $k ] : null;
	}

	public static function sanitize( $in ) {
		$in = is_array( $in ) ? $in : array();
		$o  = array();
		foreach ( array( 'auto', 'webp', 'serve_webp', 'backup', 'png' ) as $b ) {
			$o[ $b ] = isset( $in[ $b ] ) ? 1 : 0;
		}
		$o['jpeg_quality'] = isset( $in['jpeg_quality'] ) ? max( 40, min( 100, (int) $in['jpeg_quality'] ) ) : 82;
		$o['webp_quality'] = isset( $in['webp_quality'] ) ? max( 40, min( 100, (int) $in['webp_quality'] ) ) : 80;
		$o['max_width']    = isset( $in['max_width'] ) ? max( 0, min( 10000, (int) $in['max_width'] ) ) : 2560;
		$o['max_height']   = isset( $in['max_height'] ) ? max( 0, min( 10000, (int) $in['max_height'] ) ) : 2560;
		return array_merge( self::defaults(), $o );
	}
}
