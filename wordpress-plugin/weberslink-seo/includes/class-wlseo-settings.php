<?php
defined( 'ABSPATH' ) || exit;

class WLSEO_Settings {

	const OPTION = 'wlseo_settings';

	public static function separators() {
		return array( '-' => '-', '–' => '–', '|' => '|', '·' => '·', '»' => '»', '•' => '•' );
	}

	public static function defaults() {
		return array(
			'sep'            => '-',
			'title_home'     => '%sitename% %sep% %tagline%',
			'title_post'     => '%title% %sep% %sitename%',
			'title_tax'      => '%term% %sep% %sitename%',
			'title_author'   => '%author% %sep% %sitename%',
			'title_search'   => 'Search results for %searchphrase% %sep% %sitename%',
			'title_404'      => 'Page not found %sep% %sitename%',
			'desc_home'      => '',
			'desc_post'      => '%excerpt%',
			'og'             => 1,
			'og_image'       => '',
			'twitter_card'   => 'summary_large_image',
			'twitter_user'   => '',
			'schema'         => 1,
			'org_type'       => 'Organization', // Organization | Person
			'org_name'       => '',
			'org_logo'       => '',
			'same_as'        => '',
			'verify_google'  => '',
			'verify_bing'    => '',
			'verify_yandex'  => '',
			'verify_pinterest' => '',
			'sitemap_noindex' => 1,
			'robots_sitemap' => 1,
			'robots_extra'   => '',
			'noindex_search' => 1,
			'noindex_author' => 0,
			'noindex_date'   => 1,
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

	private static function tpl( $v, $def ) {
		$v = mb_substr( sanitize_text_field( (string) $v ), 0, 300 );
		return '' === trim( $v ) ? $def : $v;
	}

	public static function sanitize( $in ) {
		$in = is_array( $in ) ? $in : array();
		$d  = self::defaults();
		$o  = array();
		foreach ( array( 'og', 'schema', 'sitemap_noindex', 'robots_sitemap', 'noindex_search', 'noindex_author', 'noindex_date' ) as $b ) {
			$o[ $b ] = isset( $in[ $b ] ) ? 1 : 0;
		}
		$o['sep'] = isset( $in['sep'] ) && isset( self::separators()[ $in['sep'] ] ) ? $in['sep'] : '-';
		foreach ( array( 'title_home', 'title_post', 'title_tax', 'title_author', 'title_search', 'title_404' ) as $k ) {
			$o[ $k ] = self::tpl( isset( $in[ $k ] ) ? $in[ $k ] : '', $d[ $k ] );
		}
		foreach ( array( 'desc_home', 'desc_post' ) as $k ) {
			$o[ $k ] = mb_substr( sanitize_text_field( isset( $in[ $k ] ) ? $in[ $k ] : '' ), 0, 400 );
		}
		$o['og_image']     = isset( $in['og_image'] ) ? esc_url_raw( trim( $in['og_image'] ) ) : '';
		$o['org_logo']     = isset( $in['org_logo'] ) ? esc_url_raw( trim( $in['org_logo'] ) ) : '';
		$o['twitter_card'] = isset( $in['twitter_card'] ) && in_array( $in['twitter_card'], array( 'summary', 'summary_large_image' ), true ) ? $in['twitter_card'] : 'summary_large_image';
		$o['twitter_user'] = isset( $in['twitter_user'] ) ? preg_replace( '/[^A-Za-z0-9_]/', '', ltrim( trim( $in['twitter_user'] ), '@' ) ) : '';
		$o['org_type']     = isset( $in['org_type'] ) && 'Person' === $in['org_type'] ? 'Person' : 'Organization';
		$o['org_name']     = mb_substr( sanitize_text_field( isset( $in['org_name'] ) ? $in['org_name'] : '' ), 0, 120 );
		$links             = array();
		foreach ( preg_split( '/\r\n|\r|\n/', isset( $in['same_as'] ) ? (string) $in['same_as'] : '' ) as $l ) {
			$u = esc_url_raw( trim( $l ) );
			if ( $u && preg_match( '#^https?://#i', $u ) ) {
				$links[ $u ] = $u;
			}
		}
		$o['same_as'] = implode( "\n", array_slice( array_values( $links ), 0, 20 ) );
		foreach ( array( 'verify_google', 'verify_bing', 'verify_yandex', 'verify_pinterest' ) as $k ) {
			// The tag content is a token; accept only token characters, so nothing can break out of the attribute.
			$o[ $k ] = isset( $in[ $k ] ) ? mb_substr( preg_replace( '/[^A-Za-z0-9_\-]/', '', trim( $in[ $k ] ) ), 0, 100 ) : '';
		}
		$extra = array();
		foreach ( preg_split( '/\r\n|\r|\n/', isset( $in['robots_extra'] ) ? (string) $in['robots_extra'] : '' ) as $l ) {
			$l = trim( $l );
			if ( preg_match( '/^(User-agent|Disallow|Allow|Crawl-delay|Sitemap):\s*[\S ]{0,200}$/i', $l ) ) {
				$extra[] = $l;
			}
		}
		$o['robots_extra'] = implode( "\n", array_slice( $extra, 0, 50 ) );
		return array_merge( $d, $o );
	}
}
