<?php
defined( 'ABSPATH' ) || exit;

/** Front end: document title, meta description, robots, canonical, Open Graph, Twitter, JSON-LD, verification, robots.txt, sitemap. */
class WLSEO_Output {

	const META = array( 'title' => '_wlseo_title', 'desc' => '_wlseo_desc', 'kw' => '_wlseo_kw', 'canon' => '_wlseo_canon', 'noindex' => '_wlseo_noindex', 'nofollow' => '_wlseo_nofollow', 'og_image' => '_wlseo_og_image' );

	public static function init() {
		add_filter( 'pre_get_document_title', array( __CLASS__, 'title' ), 20 );
		add_action( 'wp_head', array( __CLASS__, 'head' ), 1 );
		add_filter( 'wp_robots', array( __CLASS__, 'robots' ), 20 );
		add_filter( 'get_canonical_url', array( __CLASS__, 'canonical' ), 20, 2 );
		add_filter( 'robots_txt', array( __CLASS__, 'robots_txt' ), 20, 2 );
		add_filter( 'wp_sitemaps_posts_query_args', array( __CLASS__, 'sitemap_args' ), 20 );
	}

	public static function meta( $post_id, $k ) {
		return (string) get_post_meta( $post_id, self::META[ $k ], true );
	}

	/** Variables for templates in the current view. */
	private static function vars() {
		$v = array( 'sitename' => wp_specialchars_decode( get_bloginfo( 'name' ), ENT_QUOTES ), 'tagline' => wp_specialchars_decode( get_bloginfo( 'description' ), ENT_QUOTES ), 'title' => '', 'excerpt' => '', 'term' => '', 'author' => '', 'searchphrase' => '', 'category' => '', 'date' => '', 'page' => '' );
		$paged = (int) get_query_var( 'paged' );
		if ( $paged > 1 ) {
			$v['page'] = sprintf( /* translators: %d: page number */ __( 'Page %d', 'weberslink-seo' ), $paged );
		}
		if ( is_singular() ) {
			$p = get_queried_object();
			$v['title']    = wp_specialchars_decode( get_the_title( $p ), ENT_QUOTES );
			$v['excerpt']  = '' !== trim( (string) $p->post_excerpt ) ? WLSEO_Templates::truncate( WLSEO_Templates::plain( $p->post_excerpt ), 160 ) : WLSEO_Templates::excerpt( $p->post_content, 160 );
			$v['date']     = get_the_date( '', $p );
			$cats          = get_the_category( $p->ID );
			$v['category'] = $cats ? $cats[0]->name : '';
			$v['author']   = get_the_author_meta( 'display_name', $p->post_author );
		} elseif ( is_category() || is_tag() || is_tax() ) {
			$t         = get_queried_object();
			$v['term'] = $t ? $t->name : '';
			$v['excerpt'] = $t ? WLSEO_Templates::truncate( WLSEO_Templates::plain( term_description( $t->term_id, $t->taxonomy ) ), 160 ) : '';
		} elseif ( is_author() ) {
			$v['author'] = get_the_author_meta( 'display_name', get_queried_object_id() );
		} elseif ( is_search() ) {
			$v['searchphrase'] = get_search_query();
		}
		return $v;
	}

	private static function sep() {
		return (string) WLSEO_Settings::get( 'sep' );
	}

	public static function title( $title ) {
		$s = WLSEO_Settings::all();
		if ( is_singular() ) {
			$custom = self::meta( get_queried_object_id(), 'title' );
			$tpl    = '' !== $custom ? $custom : $s['title_post'];
		} elseif ( is_front_page() || is_home() ) {
			$tpl = $s['title_home'];
		} elseif ( is_category() || is_tag() || is_tax() ) {
			$tpl = $s['title_tax'];
		} elseif ( is_author() ) {
			$tpl = $s['title_author'];
		} elseif ( is_search() ) {
			$tpl = $s['title_search'];
		} elseif ( is_404() ) {
			$tpl = $s['title_404'];
		} else {
			return $title;
		}
		$out = WLSEO_Templates::render( $tpl, self::vars(), self::sep() );
		$v   = self::vars();
		if ( '' !== $v['page'] ) {
			$out .= ' ' . self::sep() . ' ' . $v['page'];
		}
		return '' !== $out ? $out : $title;
	}

	public static function description() {
		$s = WLSEO_Settings::all();
		if ( is_singular() ) {
			$custom = self::meta( get_queried_object_id(), 'desc' );
			$tpl    = '' !== $custom ? $custom : $s['desc_post'];
		} elseif ( is_front_page() || is_home() ) {
			$tpl = '' !== $s['desc_home'] ? $s['desc_home'] : '%tagline%';
		} elseif ( is_category() || is_tag() || is_tax() ) {
			$tpl = '%excerpt%';
		} else {
			return '';
		}
		return WLSEO_Templates::truncate( WLSEO_Templates::render( $tpl, self::vars(), self::sep() ), 200 );
	}

	public static function robots( $r ) {
		$s = WLSEO_Settings::all();
		if ( is_singular() ) {
			$id = get_queried_object_id();
			if ( '1' === self::meta( $id, 'noindex' ) ) {
				$r['noindex'] = true;
				unset( $r['max-image-preview'] );
			}
			if ( '1' === self::meta( $id, 'nofollow' ) ) {
				$r['nofollow'] = true;
			}
		} elseif ( ( is_search() && $s['noindex_search'] ) || ( is_author() && $s['noindex_author'] ) || ( is_date() && $s['noindex_date'] ) || is_404() ) {
			$r['noindex'] = true;
			$r['follow']  = true;
		}
		return $r;
	}

	public static function canonical( $url, $post ) {
		$c = $post ? self::meta( $post->ID, 'canon' ) : '';
		return ( '' !== $c && preg_match( '#^https?://#i', $c ) ) ? $c : $url;
	}

	private static function image() {
		$s = WLSEO_Settings::all();
		if ( is_singular() ) {
			$id  = get_queried_object_id();
			$own = self::meta( $id, 'og_image' );
			if ( '' !== $own ) {
				return is_numeric( $own ) ? (string) wp_get_attachment_image_url( (int) $own, 'full' ) : $own;
			}
			$thumb = get_the_post_thumbnail_url( $id, 'full' );
			if ( $thumb ) {
				return $thumb;
			}
		}
		return (string) $s['og_image'];
	}

	private static function crumbs() {
		$c = array( array( wp_specialchars_decode( get_bloginfo( 'name' ), ENT_QUOTES ), home_url( '/' ) ) );
		if ( is_singular() && ! is_front_page() ) {
			$p = get_queried_object();
			foreach ( array_reverse( get_post_ancestors( $p ) ) as $aid ) {
				$c[] = array( wp_specialchars_decode( get_the_title( $aid ), ENT_QUOTES ), get_permalink( $aid ) );
			}
			$c[] = array( wp_specialchars_decode( get_the_title( $p ), ENT_QUOTES ), get_permalink( $p ) );
		}
		return $c;
	}

	public static function head() {
		$s    = WLSEO_Settings::all();
		$out  = array();
		$desc = self::description();
		if ( '' !== $desc ) {
			$out[] = '<meta name="description" content="' . esc_attr( $desc ) . '" />';
		}
		foreach ( array( 'google' => 'google-site-verification', 'bing' => 'msvalidate.01', 'yandex' => 'yandex-verification', 'pinterest' => 'p:domain_verify' ) as $k => $name ) {
			if ( ! empty( $s[ 'verify_' . $k ] ) && ( is_front_page() || is_home() ) ) {
				$out[] = '<meta name="' . esc_attr( $name ) . '" content="' . esc_attr( $s[ 'verify_' . $k ] ) . '" />';
			}
		}
		$title = wp_get_document_title();
		$url   = is_singular() ? get_permalink( get_queried_object_id() ) : ( is_front_page() ? home_url( '/' ) : '' );
		$img   = self::image();
		if ( $s['og'] ) {
			$og = array( 'og:locale' => get_locale(), 'og:type' => is_singular() && ! is_front_page() ? 'article' : 'website', 'og:title' => $title, 'og:site_name' => wp_specialchars_decode( get_bloginfo( 'name' ), ENT_QUOTES ) );
			if ( '' !== $desc ) {
				$og['og:description'] = $desc;
			}
			if ( '' !== $url ) {
				$og['og:url'] = $url;
			}
			if ( '' !== $img ) {
				$og['og:image'] = $img;
			}
			foreach ( $og as $k => $v ) {
				$out[] = '<meta property="' . esc_attr( $k ) . '" content="' . esc_attr( $v ) . '" />';
			}
			$tw = array( 'twitter:card' => '' !== $img ? $s['twitter_card'] : 'summary', 'twitter:title' => $title );
			if ( '' !== $desc ) {
				$tw['twitter:description'] = $desc;
			}
			if ( '' !== $img ) {
				$tw['twitter:image'] = $img;
			}
			if ( '' !== $s['twitter_user'] ) {
				$tw['twitter:site'] = '@' . $s['twitter_user'];
			}
			foreach ( $tw as $k => $v ) {
				$out[] = '<meta name="' . esc_attr( $k ) . '" content="' . esc_attr( $v ) . '" />';
			}
		}
		if ( $s['schema'] ) {
			$p     = is_singular() ? get_queried_object() : null;
			$graph = WLSEO_Schema::graph( array(
				'site_url'    => home_url( '/' ),
				'site_name'   => wp_specialchars_decode( get_bloginfo( 'name' ), ENT_QUOTES ),
				'search_url'  => home_url( '/?s={search_term_string}' ),
				'org_type'    => $s['org_type'],
				'org_name'    => $s['org_name'],
				'org_logo'    => $s['org_logo'],
				'same_as'     => array_filter( preg_split( '/\r\n|\r|\n/', (string) $s['same_as'] ) ),
				'url'         => $url,
				'title'       => $title,
				'description' => $desc,
				'image'       => $img,
				'type'        => $p ? ( 'post' === $p->post_type ? 'post' : 'page' ) : ( is_front_page() ? 'home' : 'other' ),
				'date'        => $p ? get_the_date( 'c', $p ) : '',
				'modified'    => $p ? get_the_modified_date( 'c', $p ) : '',
				'author'      => $p && 'post' === $p->post_type ? get_the_author_meta( 'display_name', $p->post_author ) : '',
				'crumbs'      => self::crumbs(),
				'lang'        => get_bloginfo( 'language' ),
			) );
			$out[] = '<script type="application/ld+json">' . WLSEO_Schema::encode( $graph ) . '</script>'; // phpcs:ignore
		}
		if ( $out ) {
			echo "\n<!-- Weberslink SEO Toolkit -->\n" . implode( "\n", $out ) . "\n<!-- /Weberslink SEO Toolkit -->\n"; // phpcs:ignore
		}
	}

	public static function robots_txt( $output, $public ) {
		$s = WLSEO_Settings::all();
		if ( ! $public ) {
			return $output;
		}
		if ( $s['robots_sitemap'] && false === stripos( $output, 'sitemap:' ) ) {
			$output = rtrim( $output ) . "\n\nSitemap: " . home_url( '/wp-sitemap.xml' ) . "\n";
		}
		if ( '' !== $s['robots_extra'] ) {
			$output = rtrim( $output ) . "\n\n" . $s['robots_extra'] . "\n";
		}
		return $output;
	}

	public static function sitemap_args( $args ) {
		if ( WLSEO_Settings::get( 'sitemap_noindex' ) ) {
			$args['meta_query'] = isset( $args['meta_query'] ) ? (array) $args['meta_query'] : array(); // phpcs:ignore
			$args['meta_query'][] = array( 'relation' => 'OR', array( 'key' => self::META['noindex'], 'compare' => 'NOT EXISTS' ), array( 'key' => self::META['noindex'], 'value' => '1', 'compare' => '!=' ) );
		}
		return $args;
	}
}
