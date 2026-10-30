<?php
defined( 'ABSPATH' ) || exit;

/** Turn third-party tags into inert ones that the banner activates after consent (pure). */
class WLCC_Scripts {

	/**
	 * <script> becomes type="text/plain" with data-wlcc-cat; <iframe> and <img> keep their address in data-wlcc-src.
	 * Anything else is dropped, so a pasted snippet cannot run before consent.
	 */
	public static function block( $html, $cat ) {
		$cat = preg_replace( '/[^a-z]/', '', strtolower( $cat ) );
		$out = '';
		if ( preg_match_all( '#<script\b([^>]*)>(.*?)</script\s*>#is', (string) $html, $m, PREG_SET_ORDER ) ) {
			foreach ( $m as $s ) {
				$attrs = preg_replace( '/\s(type|language)\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>]+)/i', '', ' ' . $s[1] );
				$attrs = preg_replace( '/\sdata-wlcc-cat\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>]+)/i', '', $attrs );
				$out  .= '<script type="text/plain" data-wlcc-cat="' . $cat . '"' . rtrim( $attrs ) . '>' . str_ireplace( '</script', '<\/script', $s[2] ) . "</script>\n";
			}
		}
		if ( preg_match_all( '#<(iframe|img)\b([^>]*?)/?>(?:\s*</iframe\s*>)?#is', (string) $html, $m, PREG_SET_ORDER ) ) {
			foreach ( $m as $t ) {
				$attrs = preg_replace( '/\ssrc(set)?\s*=/i', ' data-wlcc-src$1=', ' ' . $t[2] );
				$attrs = preg_replace( '/\sdata-wlcc-cat\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>]+)/i', '', $attrs );
				$out  .= '<' . strtolower( $t[1] ) . ' data-wlcc-cat="' . $cat . '"' . rtrim( $attrs ) . ( 'img' === strtolower( $t[1] ) ? ' />' : '></iframe>' ) . "\n";
			}
		}
		return $out;
	}

	/** Google Consent Mode v2: everything denied until the visitor chooses. */
	public static function gcm_default() {
		return "window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied',functionality_storage:'denied',personalization_storage:'denied',security_storage:'granted',wait_for_update:500});gtag('set','ads_data_redaction',true);gtag('set','url_passthrough',true);";
	}
}
