<?php
defined( 'ABSPATH' ) || exit;

/** Front-end behaviour: run redirects, log 404s, create redirects when a post URL changes. */
class WLR_Runtime {

	public static function init() {
		add_action( 'init', array( __CLASS__, 'maybe_redirect' ), 1 );
		add_action( 'template_redirect', array( __CLASS__, 'maybe_log_404' ), 999 );
		add_action( 'post_updated', array( __CLASS__, 'slug_changed' ), 10, 3 );
	}

	private static function base() {
		$p = function_exists( 'wp_parse_url' ) ? wp_parse_url( home_url(), PHP_URL_PATH ) : '';
		return $p ? rtrim( $p, '/' ) : '';
	}

	/** Resolve a stored target to an absolute URL. */
	public static function absolute( $target ) {
		return preg_match( '#^https?://#i', $target ) ? $target : home_url( $target );
	}

	public static function maybe_redirect() {
		if ( is_admin() || ( defined( 'DOING_CRON' ) && DOING_CRON ) || ( defined( 'REST_REQUEST' ) && REST_REQUEST ) || ( defined( 'WP_CLI' ) && WP_CLI ) ) {
			return;
		}
		$method = isset( $_SERVER['REQUEST_METHOD'] ) ? strtoupper( $_SERVER['REQUEST_METHOD'] ) : 'GET'; // phpcs:ignore
		if ( ! in_array( $method, array( 'GET', 'HEAD' ), true ) || empty( $_SERVER['REQUEST_URI'] ) ) {
			return;
		}
		$uri = wp_unslash( $_SERVER['REQUEST_URI'] ); // phpcs:ignore
		if ( preg_match( '#^/wp-(admin|login\.php|json|cron\.php)|xmlrpc\.php#', self::strip_base( $uri ) ) ) {
			return;
		}
		$hit = self::resolve( $uri, WLR_Store::cache(), self::base() );
		if ( ! $hit ) {
			return;
		}
		list( $rule, $target, $code ) = $hit;
		if ( WLR_Settings::get( 'track_hits' ) ) {
			WLR_Store::hit( $rule['id'] );
		}
		nocache_headers();
		if ( null === $target ) {
			status_header( $code );
			header( 'Content-Type: text/html; charset=utf-8' );
			header( 'X-Robots-Tag: noindex' );
			echo '<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>' . ( 451 === $code ? 'Unavailable for legal reasons' : 'Gone' ) . '</title><body style="font-family:sans-serif;max-width:560px;margin:15vh auto;padding:0 20px"><h1>' . ( 451 === $code ? 'Unavailable for legal reasons' : 'This page is gone' ) . '</h1><p>' . ( 451 === $code ? 'This content is not available.' : 'It was removed on purpose and will not come back.' ) . '</p></body>'; // phpcs:ignore
			self::finish();
		}
		wp_redirect( self::absolute( $target ), $code, 'Weberslink Redirects' ); // phpcs:ignore
		self::finish();
	}

	/** Ends the request (unit tests define WLR_NO_EXIT to catch this instead). */
	private static function finish() {
		if ( defined( 'WLR_NO_EXIT' ) ) {
			throw new Exception( 'wlr-exit' );
		}
		exit;
	}

	private static function strip_base( $uri ) {
		$b = self::base();
		return ( '' !== $b && 0 === strpos( $uri, $b . '/' ) ) ? substr( $uri, strlen( $b ) ) : $uri;
	}

	/**
	 * Pure lookup against the compiled cache. Returns array( rule, target|null, code ) or null.
	 * Skips a redirect that would send the visitor to the page they are already on.
	 */
	public static function resolve( $uri, $cache, $base = '' ) {
		$opts = $cache['opts'];
		list( $path ) = WLR_Matcher::split( $uri, $base );
		$key  = WLR_Matcher::norm( $path, $opts );
		$hit  = null;
		if ( isset( $cache['exact'][ $key ] ) ) {
			$hit = WLR_Matcher::find( $uri, $cache['exact'][ $key ], $opts, $base );
		}
		if ( ! $hit && ! empty( $cache['other'] ) ) {
			$hit = WLR_Matcher::find( $uri, $cache['other'], $opts, $base );
		}
		if ( ! $hit ) {
			return null;
		}
		if ( null !== $hit[1] && ! preg_match( '#^https?://#i', $hit[1] ) ) {
			list( $tp, $tq ) = WLR_Matcher::split( $hit[1], '' );
			list( $up, $uq ) = WLR_Matcher::split( $uri, $base );
			if ( WLR_Matcher::norm( $tp, $opts ) === WLR_Matcher::norm( $up, $opts ) && $tq === $uq ) {
				return null;
			}
		}
		return $hit;
	}

	/* ---------- 404 monitor ---------- */

	/** Pure: should this 404 be recorded? */
	public static function should_log( $path, $ua, $settings ) {
		if ( empty( $settings['log_404'] ) ) {
			return false;
		}
		$ext = strtolower( pathinfo( $path, PATHINFO_EXTENSION ) );
		if ( '' !== $ext && in_array( $ext, array_filter( explode( ',', (string) $settings['ignore_ext'] ) ), true ) ) {
			return false;
		}
		foreach ( array_filter( explode( "\n", (string) $settings['ignore_paths'] ) ) as $needle ) {
			if ( false !== stripos( $path, trim( $needle ) ) ) {
				return false;
			}
		}
		if ( ! empty( $settings['ignore_bots'] ) && preg_match( '/bot|crawl|spider|slurp|bingpreview|facebookexternalhit|headless|monitor|curl|wget|python-requests/i', (string) $ua ) ) {
			return false;
		}
		return true;
	}

	public static function maybe_log_404() {
		if ( ! is_404() || is_admin() || empty( $_SERVER['REQUEST_URI'] ) ) {
			return;
		}
		$settings = WLR_Settings::all();
		list( $path ) = WLR_Matcher::split( wp_unslash( $_SERVER['REQUEST_URI'] ), self::base() ); // phpcs:ignore
		$ua  = isset( $_SERVER['HTTP_USER_AGENT'] ) ? wp_unslash( $_SERVER['HTTP_USER_AGENT'] ) : ''; // phpcs:ignore
		if ( self::should_log( $path, $ua, $settings ) ) {
			$ref = isset( $_SERVER['HTTP_REFERER'] ) ? esc_url_raw( wp_unslash( $_SERVER['HTTP_REFERER'] ) ) : ''; // phpcs:ignore
			WLR_Store::log_404( $path, $ref );
		}
	}

	/* ---------- automatic redirect when a post's address changes ---------- */

	public static function slug_changed( $post_id, $after, $before ) {
		if ( ! WLR_Settings::get( 'auto_slug' ) || ! $before || ! $after ) {
			return;
		}
		if ( 'publish' !== $before->post_status || 'publish' !== $after->post_status || $before->post_name === $after->post_name || 'revision' === $after->post_type ) {
			return;
		}
		$pt = get_post_type_object( $after->post_type );
		if ( ! $pt || empty( $pt->public ) ) {
			return;
		}
		$old = get_permalink( $before );
		$new = get_permalink( $after );
		if ( ! $old || ! $new || $old === $new ) {
			return;
		}
		list( $op ) = WLR_Matcher::split( $old, self::base() );
		list( $clean ) = WLR_Matcher::validate( array( 'source' => $op, 'target' => $new, 'code' => 301, 'note' => 'Auto: URL changed for "' . $after->post_title . '"' ) );
		if ( $clean && ! WLR_Store::exists( $clean['source'] ) ) {
			WLR_Store::add( $clean );
			WLR_Store::delete_404_path( $op );
		}
	}
}
