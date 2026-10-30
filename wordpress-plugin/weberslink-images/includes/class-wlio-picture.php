<?php
defined( 'ABSPATH' ) || exit;

/** Serve WebP safely: wrap <img> in <picture> so the browser picks it, with no server rules and no cache problems. */
class WLIO_Picture {

	public static function init() {
		if ( WLIO_Settings::get( 'serve_webp' ) && WLIO_Settings::get( 'webp' ) ) {
			add_filter( 'wp_content_img_tag', array( __CLASS__, 'filter_tag' ), 20 );
			add_filter( 'post_thumbnail_html', array( __CLASS__, 'filter_tag' ), 20 );
			add_filter( 'wp_get_attachment_image', array( __CLASS__, 'filter_tag' ), 20 );
		}
	}

	public static function filter_tag( $html ) {
		if ( is_admin() || is_feed() || ( defined( 'REST_REQUEST' ) && REST_REQUEST ) || ! is_string( $html ) || false === stripos( $html, '<img' ) ) {
			return $html;
		}
		return self::wrap( $html, array( __CLASS__, 'webp_exists' ) );
	}

	/** Does the ".webp" twin of this uploaded file exist on disk? */
	public static function webp_exists( $url ) {
		static $cache = array();
		if ( isset( $cache[ $url ] ) ) {
			return $cache[ $url ];
		}
		$u = wp_get_upload_dir();
		$p = ( 0 === strpos( $url, $u['baseurl'] . '/' ) ) ? $u['basedir'] . '/' . rawurldecode( substr( $url, strlen( $u['baseurl'] ) + 1 ) ) : '';
		return $cache[ $url ] = ( '' !== $p && is_file( $p . '.webp' ) );
	}

	private static function twin( $url ) {
		$clean = preg_replace( '/[?#].*$/', '', $url );
		return preg_match( '/\.(jpe?g|png)$/i', $clean ) ? $clean . '.webp' : '';
	}

	/**
	 * Pure: returns <picture><source type="image/webp" …><img …></picture> when the image (or enough of its
	 * responsive sizes) has a WebP twin; otherwise the original markup. $exists is callable( original url ).
	 */
	public static function wrap( $img, $exists ) {
		if ( false !== stripos( $img, 'data-wlio' ) || false !== stripos( $img, 'wlio-skip' ) || ! preg_match( '/<img\b[^>]*>/i', $img, $m ) || $m[0] !== trim( $img ) ) {
			return $img; // only a single bare <img>; anything bigger (already wrapped, a link around it) is left alone
		}
		$tag = $m[0];
		if ( ! preg_match( '/\ssrc\s*=\s*(["\'])(.*?)\1/is', $tag, $sm ) ) {
			return $img;
		}
		$src      = html_entity_decode( $sm[2], ENT_QUOTES );
		$src_webp = self::twin( $src );
		$have     = array();
		if ( '' !== $src_webp && call_user_func( $exists, preg_replace( '/[?#].*$/', '', $src ) ) ) {
			$have[ $src ] = $src_webp;
		}
		$srcset = '';
		if ( preg_match( '/\ssrcset\s*=\s*(["\'])(.*?)\1/is', $tag, $ss ) ) {
			$parts = array();
			foreach ( explode( ',', html_entity_decode( $ss[2], ENT_QUOTES ) ) as $cand ) {
				$cand = trim( $cand );
				if ( '' === $cand ) {
					continue;
				}
				$bits = preg_split( '/\s+/', $cand, 2 );
				$tw   = self::twin( $bits[0] );
				if ( '' !== $tw && call_user_func( $exists, preg_replace( '/[?#].*$/', '', $bits[0] ) ) ) {
					$parts[] = $tw . ( isset( $bits[1] ) ? ' ' . $bits[1] : '' );
				}
			}
			$srcset = implode( ', ', $parts );
		}
		if ( '' === $srcset && ! $have ) {
			return $img;
		}
		$source = '<source type="image/webp" srcset="' . esc_attr( '' !== $srcset ? $srcset : reset( $have ) ) . '"';
		if ( '' !== $srcset && preg_match( '/\ssizes\s*=\s*(["\'])(.*?)\1/is', $tag, $zm ) ) {
			$source .= ' sizes="' . $zm[2] . '"';
		}
		$source .= '>';
		return '<picture class="wlio-picture">' . $source . preg_replace( '/^<img\b/i', '<img data-wlio="1"', $tag ) . '</picture>';
	}
}
