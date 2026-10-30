<?php
defined( 'ABSPATH' ) || exit;

/**
 * Optional open / click tracking. Off by default: it adds a 1x1 image and rewrites links, which has
 * privacy implications (tell your recipients). Every tracking URL is HMAC-signed, so the click
 * redirect cannot be abused as an open redirect.
 */
class WLSMTP_Tracking {

	public static function init() {
		add_action( 'init', array( __CLASS__, 'handle' ), 1 );
	}

	private static function sign( $kind, $id, $extra = '' ) {
		return substr( hash_hmac( 'sha256', $kind . '|' . (int) $id . '|' . $extra, wp_salt( 'auth' ) . 'wlsmtp-track' ), 0, 20 );
	}

	public static function b64( $s ) {
		return rtrim( strtr( base64_encode( $s ), '+/', '-_' ), '=' );
	}

	public static function unb64( $s ) {
		return (string) base64_decode( strtr( $s, '-_', '+/' ) ); // phpcs:ignore
	}

	public static function open_url( $id ) {
		return add_query_arg( 'wlsmtp_o', (int) $id . '.' . self::sign( 'o', $id ), home_url( '/' ) );
	}

	public static function click_url( $id, $target ) {
		return add_query_arg( array( 'wlsmtp_c' => (int) $id . '.' . self::sign( 'c', $id, $target ), 'u' => self::b64( $target ) ), home_url( '/' ) );
	}

	/** Mails that carry one-time links (login, reset, confirm) are never rewritten. */
	public static function is_sensitive( $html ) {
		return (bool) preg_match( '/(action=rp|action=resetpass|action=confirm|wp-login\.php\?[^"\'\s]*(key|login)=|[?&](key|token|reset_key|login_key)=)/i', (string) $html );
	}

	public static function rewrite( $html, $id, $opens, $clicks ) {
		if ( self::is_sensitive( $html ) ) {
			return $html;
		}
		if ( $clicks ) {
			$html = preg_replace_callback( '/<a\b([^>]*?)\shref=(["\'])(https?:\/\/[^"\']+)\2/i', function ( $m ) use ( $id ) {
				$url = html_entity_decode( $m[3], ENT_QUOTES, 'UTF-8' );
				if ( false !== strpos( $url, 'wlsmtp_c=' ) || false !== strpos( $url, 'wlsmtp_o=' ) ) {
					return $m[0];
				}
				return '<a' . $m[1] . ' href=' . $m[2] . esc_url( self::click_url( $id, $url ) ) . $m[2];
			}, $html );
		}
		if ( $opens ) {
			$img = '<img src="' . esc_url( self::open_url( $id ) ) . '" width="1" height="1" alt="" style="display:none;border:0" />';
			$html = false !== stripos( $html, '</body>' ) ? preg_replace( '/<\/body>/i', $img . '</body>', $html, 1 ) : $html . $img;
		}
		return $html;
	}

	/** Log id when an open-pixel parameter ("ID.signature") is genuine, else 0. */
	public static function verify_open( $param ) {
		list( $id, $sig ) = array_pad( explode( '.', (string) $param, 2 ), 2, '' );
		return ( (int) $id > 0 && hash_equals( self::sign( 'o', $id ), (string) $sig ) ) ? (int) $id : 0;
	}

	/** array( id, url ) when a click parameter is genuine and the target is http(s), else null. */
	public static function verify_click( $param, $encoded ) {
		list( $id, $sig ) = array_pad( explode( '.', (string) $param, 2 ), 2, '' );
		$target           = self::unb64( (string) $encoded );
		if ( (int) $id > 0 && preg_match( '#^https?://#i', $target ) && hash_equals( self::sign( 'c', $id, $target ), (string) $sig ) ) {
			return array( (int) $id, $target );
		}
		return null;
	}

	public static function handle() {
		if ( isset( $_GET['wlsmtp_o'] ) ) { // phpcs:ignore
			$id = self::verify_open( sanitize_text_field( wp_unslash( $_GET['wlsmtp_o'] ) ) ); // phpcs:ignore
			if ( $id ) {
				WLSMTP_Log::bump( $id, 'opens' );
			}
			nocache_headers();
			header( 'Content-Type: image/gif' );
			echo base64_decode( 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7' ); // phpcs:ignore
			exit;
		}
		if ( isset( $_GET['wlsmtp_c'], $_GET['u'] ) ) { // phpcs:ignore
			$hit = self::verify_click( sanitize_text_field( wp_unslash( $_GET['wlsmtp_c'] ) ), sanitize_text_field( wp_unslash( $_GET['u'] ) ) ); // phpcs:ignore
			if ( $hit ) {
				WLSMTP_Log::bump( $hit[0], 'clicks' );
				nocache_headers();
				wp_redirect( $hit[1], 302, 'Weberslink SMTP' ); // phpcs:ignore
				exit;
			}
			wp_die( esc_html__( 'This link is not valid.', 'weberslink-smtp' ), '', array( 'response' => 400 ) );
		}
	}
}
