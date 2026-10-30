<?php
defined( 'ABSPATH' ) || exit;

/** Title / description templates and text helpers (pure). */
class WLSEO_Templates {

	/** Replace %variables%, then tidy repeated or dangling separators and spaces. */
	public static function render( $tpl, $vars, $sep = '-' ) {
		$vars['sep'] = $sep;
		$out         = preg_replace_callback( '/%([a-z_]+)%/', function ( $m ) use ( $vars ) {
			return isset( $vars[ $m[1] ] ) ? (string) $vars[ $m[1] ] : '';
		}, (string) $tpl );
		$q   = preg_quote( $sep, '/' );
		$out = preg_replace( '/\s+/', ' ', $out );
		$out = preg_replace( '/(?:\s*' . $q . '\s*){2,}/u', ' ' . $sep . ' ', $out ); // "a - - b" → "a - b"
		$out = preg_replace( '/^\s*' . $q . '\s*|\s*' . $q . '\s*$/u', '', $out );
		return trim( $out );
	}

	/** Plain text from HTML or content with shortcodes. */
	public static function plain( $html ) {
		$t = preg_replace( '#<(script|style)\b[^>]*>.*?</\1>#is', ' ', (string) $html );
		$t = preg_replace( '/\[\/?[a-z_][^\]]*\]/i', ' ', $t ); // [shortcodes]
		$t = html_entity_decode( strip_tags( preg_replace( '#</(p|div|h[1-6]|li|br|tr)>#i', ' ', $t ) ), ENT_QUOTES, 'UTF-8' );
		return trim( preg_replace( '/\s+/u', ' ', $t ) );
	}

	/** Cut at a word boundary and add an ellipsis. */
	public static function truncate( $text, $max = 160 ) {
		$text = trim( (string) $text );
		if ( mb_strlen( $text ) <= $max ) {
			return $text;
		}
		$cut = mb_substr( $text, 0, $max - 1 );
		$sp  = mb_strrpos( $cut, ' ' );
		if ( false !== $sp && $sp > $max * 0.6 ) {
			$cut = mb_substr( $cut, 0, $sp );
		}
		return rtrim( $cut, " ,.;:-–" ) . '…';
	}

	/** First sentence-ish chunk of content for a description fallback. */
	public static function excerpt( $html, $max = 160 ) {
		return self::truncate( self::plain( $html ), $max );
	}
}
