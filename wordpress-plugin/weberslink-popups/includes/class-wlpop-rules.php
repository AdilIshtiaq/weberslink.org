<?php
defined( 'ABSPATH' ) || exit;

/** Which popups may be shown on this request (pure). The browser adds trigger, device and frequency checks. */
class WLPOP_Rules {

	/** Path glob: "/blog/*" matches /blog/ and anything below; "/pricing" matches exactly (trailing slash ignored). */
	public static function path_match( $pattern, $path ) {
		$path    = '/' . ltrim( strtolower( rawurldecode( strtok( (string) $path, '?#' ) ) ), '/' );
		$pattern = strtolower( $pattern );
		$trim    = function ( $s ) {
			return strlen( $s ) > 1 ? rtrim( $s, '/' ) : $s;
		};
		if ( false === strpos( $pattern, '*' ) ) {
			return $trim( $pattern ) === $trim( $path );
		}
		$re = '#^' . str_replace( '\*', '.*', preg_quote( $pattern, '#' ) ) . '$#';
		return (bool) preg_match( $re, $path ) || ( '/*' !== substr( $pattern, -2 ) ? false : (bool) preg_match( '#^' . preg_quote( substr( $pattern, 0, -2 ), '#' ) . '$#', $trim( $path ) ) );
	}

	/** $ctx: path, is_home (bool), logged_in (bool), today (Y-m-d, site time). */
	public static function matches( $p, $ctx ) {
		if ( empty( $p['enabled'] ) ) {
			return false;
		}
		if ( ! empty( $p['start'] ) && $ctx['today'] < $p['start'] ) {
			return false;
		}
		if ( ! empty( $p['end'] ) && $ctx['today'] > $p['end'] ) {
			return false;
		}
		if ( 'out' === $p['logged_in'] && ! empty( $ctx['logged_in'] ) ) {
			return false;
		}
		foreach ( array_filter( preg_split( '/\r\n|\r|\n/', (string) $p['exclude'] ) ) as $pat ) {
			if ( self::path_match( $pat, $ctx['path'] ) ) {
				return false;
			}
		}
		if ( 'home' === $p['pages'] ) {
			return ! empty( $ctx['is_home'] );
		}
		if ( 'include' === $p['pages'] ) {
			foreach ( array_filter( preg_split( '/\r\n|\r|\n/', (string) $p['include'] ) ) as $pat ) {
				if ( self::path_match( $pat, $ctx['path'] ) ) {
					return true;
				}
			}
			return false;
		}
		return true;
	}

	/** Only what the browser needs: no names, no internal settings. */
	public static function public_view( $p ) {
		return array(
			'id' => $p['id'], 'type' => $p['type'], 'title' => $p['title'], 'content' => $p['content'],
			'form' => (bool) $p['show_form'], 'askName' => (bool) $p['ask_name'], 'button' => $p['button_text'], 'consent' => $p['consent_text'], 'success' => $p['success_message'], 'redirect' => $p['redirect_url'],
			'cta' => array( 'text' => $p['cta_text'], 'url' => $p['cta_url'] ),
			'trigger' => $p['trigger'], 'delay' => (int) $p['delay_s'], 'scroll' => (int) $p['scroll_pct'], 'selector' => $p['click_selector'],
			'freq' => $p['frequency'], 'days' => (int) $p['days'], 'device' => $p['device'], 'overlay' => (bool) $p['close_overlay'], 'position' => $p['position'], 'hideDays' => (int) $p['hide_after_signup_days'],
			'colors' => array( 'primary' => $p['color_primary'], 'bg' => $p['color_bg'], 'text' => $p['color_text'] ),
		);
	}
}
