<?php
defined( 'ABSPATH' ) || exit;

class WLCC_Settings {

	const OPTION = 'wlcc_settings';

	/** Consent categories. "necessary" is always on and is not stored as a choice. */
	public static function categories() {
		return array(
			'preferences' => __( 'Preferences', 'weberslink-cookies' ),
			'analytics'   => __( 'Analytics', 'weberslink-cookies' ),
			'marketing'   => __( 'Marketing', 'weberslink-cookies' ),
		);
	}

	public static function positions() {
		return array( 'bottom' => __( 'Bar at the bottom', 'weberslink-cookies' ), 'box-left' => __( 'Box, bottom left', 'weberslink-cookies' ), 'box-right' => __( 'Box, bottom right', 'weberslink-cookies' ), 'center' => __( 'Centered dialog', 'weberslink-cookies' ) );
	}

	public static function defaults() {
		return array(
			'enabled'        => 1,
			'position'       => 'bottom',
			'color_primary'  => '#1a56db',
			'color_bg'       => '#ffffff',
			'color_text'     => '#1f2933',
			'title'          => 'We value your privacy',
			'message'        => 'We use cookies to make this site work, and, with your permission, to understand how it is used and to show relevant content. You can change your mind at any time.',
			'btn_accept'     => 'Accept all',
			'btn_reject'     => 'Reject all',
			'btn_custom'     => 'Customise',
			'btn_save'       => 'Save my choices',
			'btn_float'      => 'Cookie settings',
			'policy_url'     => '',
			'policy_label'   => 'Cookie policy',
			'use_preferences' => 1,
			'use_analytics'  => 1,
			'use_marketing'  => 1,
			'expire_days'    => 180,
			'policy_version' => 1,
			'gcm'            => 1,
			'float'          => 1,
			'scripts_preferences' => '',
			'scripts_analytics'   => '',
			'scripts_marketing'   => '',
			'cookies'        => '',
			'log'            => 1,
			'keep_days'      => 365,
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

	/** Categories the site actually uses. */
	public static function active_categories( $s = null ) {
		$s   = $s ? $s : self::all();
		$out = array();
		foreach ( self::categories() as $id => $label ) {
			if ( ! empty( $s[ 'use_' . $id ] ) ) {
				$out[ $id ] = $label;
			}
		}
		return $out;
	}

	private static function color( $v, $def ) {
		return preg_match( '/^#[0-9a-f]{6}$/i', (string) $v ) ? strtolower( $v ) : $def;
	}

	private static function txt( $v, $def, $max = 200 ) {
		$v = mb_substr( sanitize_text_field( (string) $v ), 0, $max );
		return '' === trim( $v ) ? $def : $v;
	}

	/** Cookie declarations: one per line, "name | category | purpose | duration". Returns clean rows. */
	public static function parse_cookies( $text ) {
		$rows = array();
		foreach ( preg_split( '/\r\n|\r|\n/', (string) $text ) as $line ) {
			$p = array_map( 'trim', explode( '|', $line ) );
			if ( count( $p ) < 2 || '' === $p[0] ) {
				continue;
			}
			$cat    = in_array( strtolower( $p[1] ), array( 'necessary', 'preferences', 'analytics', 'marketing' ), true ) ? strtolower( $p[1] ) : 'necessary';
			$rows[] = array( 'name' => mb_substr( sanitize_text_field( $p[0] ), 0, 80 ), 'cat' => $cat, 'purpose' => mb_substr( sanitize_text_field( isset( $p[2] ) ? $p[2] : '' ), 0, 200 ), 'duration' => mb_substr( sanitize_text_field( isset( $p[3] ) ? $p[3] : '' ), 0, 40 ) );
		}
		return array_slice( $rows, 0, 100 );
	}

	/**
	 * Raw third-party code can only be saved by people who may post unfiltered HTML (administrators on a normal site);
	 * for anyone else the previous value is kept.
	 */
	public static function sanitize( $in, $old = array(), $can_html = true ) {
		$in  = is_array( $in ) ? $in : array();
		$d   = self::defaults();
		$old = array_merge( $d, is_array( $old ) ? $old : array() );
		$o   = array();
		foreach ( array( 'enabled', 'use_preferences', 'use_analytics', 'use_marketing', 'gcm', 'float', 'log' ) as $b ) {
			$o[ $b ] = isset( $in[ $b ] ) ? 1 : 0;
		}
		$o['position']      = isset( $in['position'], self::positions()[ $in['position'] ] ) ? $in['position'] : 'bottom';
		$o['color_primary'] = self::color( isset( $in['color_primary'] ) ? $in['color_primary'] : '', $d['color_primary'] );
		$o['color_bg']      = self::color( isset( $in['color_bg'] ) ? $in['color_bg'] : '', $d['color_bg'] );
		$o['color_text']    = self::color( isset( $in['color_text'] ) ? $in['color_text'] : '', $d['color_text'] );
		foreach ( array( 'title' => 100, 'btn_accept' => 40, 'btn_reject' => 40, 'btn_custom' => 40, 'btn_save' => 40, 'btn_float' => 40, 'policy_label' => 60 ) as $k => $max ) {
			$o[ $k ] = self::txt( isset( $in[ $k ] ) ? $in[ $k ] : '', $d[ $k ], $max );
		}
		$o['message']      = self::txt( isset( $in['message'] ) ? $in['message'] : '', $d['message'], 600 );
		$url               = isset( $in['policy_url'] ) ? esc_url_raw( trim( $in['policy_url'] ) ) : '';
		$o['policy_url']   = ( $url && preg_match( '#^(https?://|/)#i', $url ) ) ? $url : '';
		$o['expire_days']  = isset( $in['expire_days'] ) ? max( 1, min( 395, (int) $in['expire_days'] ) ) : 180;
		$o['keep_days']    = isset( $in['keep_days'] ) ? max( 30, min( 3650, (int) $in['keep_days'] ) ) : 365;
		$o['policy_version'] = max( 1, (int) $old['policy_version'] + ( isset( $in['reask'] ) ? 1 : 0 ) );
		foreach ( array( 'scripts_preferences', 'scripts_analytics', 'scripts_marketing' ) as $k ) {
			$o[ $k ] = $can_html ? mb_substr( isset( $in[ $k ] ) ? (string) $in[ $k ] : '', 0, 20000 ) : $old[ $k ];
		}
		$rows = self::parse_cookies( isset( $in['cookies'] ) ? $in['cookies'] : '' );
		$o['cookies'] = implode( "\n", array_map( function ( $r ) {
			return $r['name'] . ' | ' . $r['cat'] . ' | ' . $r['purpose'] . ' | ' . $r['duration'];
		}, $rows ) );
		return array_merge( $d, $o );
	}
}
