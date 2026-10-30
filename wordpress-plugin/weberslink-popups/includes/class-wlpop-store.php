<?php
defined( 'ABSPATH' ) || exit;

/** Popup definitions (an option holding up to 50) and global settings. */
class WLPOP_Store {

	const ITEMS    = 'wlpop_items';
	const SETTINGS = 'wlpop_settings';
	const MAX      = 50;

	public static function types() {
		return array( 'modal' => __( 'Popup (centred)', 'weberslink-popups' ), 'slide' => __( 'Slide-in (corner)', 'weberslink-popups' ), 'bar' => __( 'Announcement bar', 'weberslink-popups' ) );
	}

	public static function triggers() {
		return array( 'delay' => __( 'After a delay', 'weberslink-popups' ), 'scroll' => __( 'After scrolling', 'weberslink-popups' ), 'exit' => __( 'Exit intent (desktop)', 'weberslink-popups' ), 'click' => __( 'When something is clicked', 'weberslink-popups' ), 'immediate' => __( 'Straight away', 'weberslink-popups' ) );
	}

	public static function defaults() {
		return array(
			'id' => '', 'name' => 'New popup', 'enabled' => 1, 'type' => 'modal',
			'title' => 'Get 10% off your first order', 'content' => '<p>Join our list for tips, news and a welcome discount.</p>',
			'show_form' => 1, 'ask_name' => 0, 'button_text' => 'Subscribe', 'consent_text' => '', 'success_message' => 'Thanks! Please check your inbox.', 'redirect_url' => '',
			'cta_text' => 'Learn more', 'cta_url' => '',
			'trigger' => 'delay', 'delay_s' => 8, 'scroll_pct' => 50, 'click_selector' => '',
			'frequency' => 'days', 'days' => 7,
			'pages' => 'all', 'include' => '', 'exclude' => '',
			'logged_in' => 'any', 'device' => 'all',
			'start' => '', 'end' => '',
			'color_primary' => '#1a56db', 'color_bg' => '#ffffff', 'color_text' => '#1f2933',
			'position' => 'bottom-right', 'close_overlay' => 1, 'hide_after_signup_days' => 365,
		);
	}

	private static function color( $v, $def ) {
		return preg_match( '/^#[0-9a-f]{6}$/i', (string) $v ) ? strtolower( $v ) : $def;
	}

	private static function lines( $text, $max = 30 ) {
		$out = array();
		foreach ( preg_split( '/\r\n|\r|\n/', (string) $text ) as $l ) {
			$l = trim( $l );
			if ( '' !== $l && preg_match( '#^/[A-Za-z0-9/_\-.*%~]*$#', $l ) ) {
				$out[ $l ] = $l;
			}
		}
		return implode( "\n", array_slice( array_values( $out ), 0, $max ) );
	}

	private static function date( $v ) {
		$v = trim( (string) $v );
		return preg_match( '/^\d{4}-\d{2}-\d{2}$/', $v ) && checkdate( (int) substr( $v, 5, 2 ), (int) substr( $v, 8, 2 ), (int) substr( $v, 0, 4 ) ) ? $v : '';
	}

	/** Clean one popup from untrusted input. */
	public static function sanitize( $in, $can_html = true, $old = null ) {
		$in = is_array( $in ) ? $in : array();
		$d  = self::defaults();
		$o  = array();
		$o['id']   = isset( $in['id'] ) && preg_match( '/^p[a-f0-9]{8}$/', $in['id'] ) ? $in['id'] : '';
		$o['name'] = mb_substr( sanitize_text_field( isset( $in['name'] ) ? $in['name'] : '' ), 0, 80 );
		$o['name'] = '' === $o['name'] ? $d['name'] : $o['name'];
		foreach ( array( 'enabled', 'show_form', 'ask_name', 'close_overlay' ) as $b ) {
			$o[ $b ] = isset( $in[ $b ] ) ? 1 : 0;
		}
		$o['type']    = isset( $in['type'], self::types()[ $in['type'] ] ) ? $in['type'] : 'modal';
		$o['trigger'] = isset( $in['trigger'], self::triggers()[ $in['trigger'] ] ) ? $in['trigger'] : 'delay';
		$o['title']   = mb_substr( sanitize_text_field( isset( $in['title'] ) ? $in['title'] : '' ), 0, 150 );
		// Formatting HTML is only accepted from people allowed to post it; everyone else keeps the previous text.
		$o['content'] = $can_html ? mb_substr( wp_kses_post( isset( $in['content'] ) ? $in['content'] : '' ), 0, 5000 ) : ( $old ? $old['content'] : mb_substr( wp_kses( isset( $in['content'] ) ? $in['content'] : '', array( 'p' => array(), 'br' => array(), 'strong' => array(), 'em' => array() ) ), 0, 5000 ) );
		foreach ( array( 'button_text' => 40, 'consent_text' => 300, 'success_message' => 200, 'cta_text' => 40 ) as $k => $max ) {
			$o[ $k ] = mb_substr( sanitize_text_field( isset( $in[ $k ] ) ? $in[ $k ] : '' ), 0, $max );
		}
		$o['button_text'] = '' === $o['button_text'] ? $d['button_text'] : $o['button_text'];
		foreach ( array( 'redirect_url', 'cta_url' ) as $k ) {
			$u        = isset( $in[ $k ] ) ? esc_url_raw( trim( $in[ $k ] ) ) : '';
			$o[ $k ]  = ( $u && preg_match( '#^(https?://|/)#i', $u ) ) ? $u : '';
		}
		$o['delay_s']    = isset( $in['delay_s'] ) ? max( 0, min( 600, (int) $in['delay_s'] ) ) : 8;
		$o['scroll_pct'] = isset( $in['scroll_pct'] ) ? max( 5, min( 100, (int) $in['scroll_pct'] ) ) : 50;
		$sel             = isset( $in['click_selector'] ) ? trim( (string) $in['click_selector'] ) : '';
		$o['click_selector'] = preg_match( '/^[#.][A-Za-z0-9_-]+(\s*,\s*[#.][A-Za-z0-9_-]+)*$/', $sel ) ? $sel : '';
		$o['frequency']  = isset( $in['frequency'] ) && in_array( $in['frequency'], array( 'always', 'session', 'days' ), true ) ? $in['frequency'] : 'days';
		$o['days']       = isset( $in['days'] ) ? max( 1, min( 365, (int) $in['days'] ) ) : 7;
		$o['pages']      = isset( $in['pages'] ) && in_array( $in['pages'], array( 'all', 'home', 'include' ), true ) ? $in['pages'] : 'all';
		$o['include']    = self::lines( isset( $in['include'] ) ? $in['include'] : '' );
		$o['exclude']    = self::lines( isset( $in['exclude'] ) ? $in['exclude'] : '' );
		$o['logged_in']  = isset( $in['logged_in'] ) && 'out' === $in['logged_in'] ? 'out' : 'any';
		$o['device']     = isset( $in['device'] ) && in_array( $in['device'], array( 'desktop', 'mobile' ), true ) ? $in['device'] : 'all';
		$o['start']      = self::date( isset( $in['start'] ) ? $in['start'] : '' );
		$o['end']        = self::date( isset( $in['end'] ) ? $in['end'] : '' );
		$o['color_primary'] = self::color( isset( $in['color_primary'] ) ? $in['color_primary'] : '', $d['color_primary'] );
		$o['color_bg']      = self::color( isset( $in['color_bg'] ) ? $in['color_bg'] : '', $d['color_bg'] );
		$o['color_text']    = self::color( isset( $in['color_text'] ) ? $in['color_text'] : '', $d['color_text'] );
		$o['position']   = isset( $in['position'] ) && in_array( $in['position'], array( 'bottom-right', 'bottom-left', 'top', 'bottom' ), true ) ? $in['position'] : 'bottom-right';
		$o['hide_after_signup_days'] = isset( $in['hide_after_signup_days'] ) ? max( 1, min( 3650, (int) $in['hide_after_signup_days'] ) ) : 365;
		return array_merge( $d, $o );
	}

	public static function all() {
		$i = get_option( self::ITEMS, array() );
		return is_array( $i ) ? array_values( array_filter( $i, 'is_array' ) ) : array();
	}

	public static function get( $id ) {
		foreach ( self::all() as $p ) {
			if ( isset( $p['id'] ) && $p['id'] === $id ) {
				return array_merge( self::defaults(), $p );
			}
		}
		return null;
	}

	public static function save_all( $items ) {
		update_option( self::ITEMS, array_values( array_slice( $items, 0, self::MAX ) ), false );
	}

	public static function new_id() {
		return 'p' . substr( bin2hex( random_bytes( 4 ) ), 0, 8 );
	}

	public static function settings() {
		$s = get_option( self::SETTINGS, array() );
		return array_merge( array( 'notify' => 1, 'notify_email' => '', 'webhook' => '', 'webhook_secret' => '' ), is_array( $s ) ? $s : array() );
	}

	public static function sanitize_settings( $in ) {
		$in  = is_array( $in ) ? $in : array();
		$url = isset( $in['webhook'] ) ? esc_url_raw( trim( $in['webhook'] ) ) : '';
		return array(
			'notify'         => isset( $in['notify'] ) ? 1 : 0,
			'notify_email'   => isset( $in['notify_email'] ) ? sanitize_email( $in['notify_email'] ) : '',
			'webhook'        => ( $url && 0 === strpos( $url, 'https://' ) ) ? $url : '',
			'webhook_secret' => isset( $in['webhook_secret'] ) ? mb_substr( preg_replace( '/[^\x21-\x7E]/', '', (string) $in['webhook_secret'] ), 0, 100 ) : '',
		);
	}
}
