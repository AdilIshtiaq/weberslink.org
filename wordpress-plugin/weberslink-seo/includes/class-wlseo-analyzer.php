<?php
defined( 'ABSPATH' ) || exit;

/** Content analysis (pure): input data in, list of checks out. */
class WLSEO_Analyzer {

	public static function words( $text ) {
		preg_match_all( "/[\p{L}\p{N}][\p{L}\p{N}'’\-]*/u", mb_strtolower( (string) $text ), $m );
		return $m[0];
	}

	public static function slugify( $s ) {
		return trim( preg_replace( '/[^a-z0-9]+/', '-', strtolower( wlseo_remove_accents( $s ) ) ), '-' );
	}

	public static function syllables( $word ) {
		$w = strtolower( preg_replace( '/[^a-z]/i', '', $word ) );
		if ( '' === $w ) {
			return 0;
		}
		if ( strlen( $w ) <= 3 ) {
			return 1;
		}
		$w = preg_replace( '/(?:[^laeiouy]es|ed|[^laeiouy]e)$/', '', $w );
		$w = preg_replace( '/^y/', '', $w );
		preg_match_all( '/[aeiouy]{1,2}/', $w, $m );
		return max( 1, count( $m[0] ) );
	}

	/** Flesch reading ease (English). Higher is easier. */
	public static function flesch( $text ) {
		$sent  = preg_split( '/(?<=[.!?])\s+/u', trim( (string) $text ), -1, PREG_SPLIT_NO_EMPTY );
		$words = self::words( $text );
		if ( ! $sent || ! $words ) {
			return 0;
		}
		$syl = 0;
		foreach ( $words as $w ) {
			$syl += self::syllables( $w );
		}
		return round( 206.835 - 1.015 * ( count( $words ) / count( $sent ) ) - 84.6 * ( $syl / count( $words ) ), 1 );
	}

	/** Share of sentences longer than 20 words, 0-100. */
	public static function long_sentence_share( $text ) {
		$sent = preg_split( '/(?<=[.!?])\s+/u', trim( (string) $text ), -1, PREG_SPLIT_NO_EMPTY );
		if ( ! $sent ) {
			return 0;
		}
		$long = 0;
		foreach ( $sent as $s ) {
			if ( count( self::words( $s ) ) > 20 ) {
				$long++;
			}
		}
		return (int) round( 100 * $long / count( $sent ) );
	}

	private static function has( $haystack, $kw ) {
		return '' !== $kw && false !== mb_stripos( (string) $haystack, $kw );
	}

	/**
	 * @param array $d title, description, keyword, slug, html, home_host
	 * @return array of array( status ok|warn|bad|info, group seo|read, label, advice )
	 */
	public static function analyze( $d ) {
		$d    = array_merge( array( 'title' => '', 'description' => '', 'keyword' => '', 'slug' => '', 'html' => '', 'home_host' => '' ), $d );
		$kw   = trim( mb_strtolower( (string) $d['keyword'] ) );
		$text = WLSEO_Templates::plain( $d['html'] );
		$wc   = count( self::words( $text ) );
		$r    = array();
		$add  = function ( $st, $g, $l, $a ) use ( &$r ) {
			$r[] = array( $st, $g, $l, $a );
		};

		$tl = mb_strlen( (string) $d['title'] );
		if ( 0 === $tl ) {
			$add( 'bad', 'seo', 'SEO title', 'Add an SEO title. Without one Google makes its own.' );
		} elseif ( $tl < 30 ) {
			$add( 'warn', 'seo', 'SEO title length', "The title is short ($tl characters). Aim for 30–60 so it uses the space in search results." );
		} elseif ( $tl > 60 ) {
			$add( 'warn', 'seo', 'SEO title length', "The title is long ($tl characters) and Google will probably cut it off. Aim for 60 or less." );
		} else {
			$add( 'ok', 'seo', 'SEO title length', "Good length ($tl characters)." );
		}
		$dl = mb_strlen( (string) $d['description'] );
		if ( 0 === $dl ) {
			$add( 'bad', 'seo', 'Meta description', 'Add a meta description: it is the text people read under your link in search results.' );
		} elseif ( $dl < 70 ) {
			$add( 'warn', 'seo', 'Meta description length', "The description is short ($dl characters). Aim for 70–160." );
		} elseif ( $dl > 160 ) {
			$add( 'warn', 'seo', 'Meta description length', "The description is long ($dl characters) and will be cut off. Aim for 160 or less." );
		} else {
			$add( 'ok', 'seo', 'Meta description length', "Good length ($dl characters)." );
		}
		if ( '' === $kw ) {
			$add( 'info', 'seo', 'Focus keyword', 'Set a focus keyword (the phrase you want this page to rank for) to unlock the keyword checks.' );
		} else {
			$add( self::has( $d['title'], $kw ) ? 'ok' : 'bad', 'seo', 'Keyword in title', self::has( $d['title'], $kw ) ? ( 0 === mb_stripos( (string) $d['title'], $kw ) ? 'The title starts with the keyword: ideal.' : 'The keyword is in the title. Placing it nearer the start helps a little.' ) : 'The focus keyword is not in the SEO title.' );
			$add( self::has( $d['description'], $kw ) ? 'ok' : 'warn', 'seo', 'Keyword in description', self::has( $d['description'], $kw ) ? 'The keyword is in the meta description.' : 'Mention the keyword in the meta description: search engines bold it.' );
			$ks = self::slugify( $kw );
			$add( '' !== $ks && false !== strpos( (string) $d['slug'], $ks ) ? 'ok' : 'warn', 'seo', 'Keyword in URL', '' !== $ks && false !== strpos( (string) $d['slug'], $ks ) ? 'The URL contains the keyword.' : 'The URL does not contain the keyword. Only change it on new pages: changing a live URL needs a redirect.' );
			$first = implode( ' ', array_slice( self::words( $text ), 0, 100 ) );
			$add( self::has( $first, $kw ) ? 'ok' : 'warn', 'seo', 'Keyword in introduction', self::has( $first, $kw ) ? 'The keyword appears in the first 100 words.' : 'Use the keyword in the first paragraph so readers and search engines see the topic at once.' );
			preg_match_all( '#<h[2-4][^>]*>(.*?)</h[2-4]>#is', (string) $d['html'], $hm );
			$in_h = false;
			foreach ( $hm[1] as $h ) {
				$in_h = $in_h || self::has( strip_tags( $h ), $kw );
			}
			$add( $in_h ? 'ok' : 'warn', 'seo', 'Keyword in a subheading', $in_h ? 'A subheading contains the keyword.' : 'Use the keyword in at least one subheading (H2 or H3).' );
			if ( $wc >= 100 ) {
				$count = preg_match_all( '/' . preg_quote( $kw, '/' ) . '/iu', $text );
				$dens  = round( 100 * $count * max( 1, count( self::words( $kw ) ) ) / $wc, 1 );
				$add( $dens >= 0.5 && $dens <= 2.5 ? 'ok' : ( $dens < 0.5 ? 'warn' : 'bad' ), 'seo', 'Keyword density', "The keyword appears $count time(s) ($dens%). " . ( $dens < 0.5 ? 'Use it a little more, naturally.' : ( $dens > 2.5 ? 'That reads like keyword stuffing: use it less.' : 'A natural amount.' ) ) );
			}
		}
		$add( $wc >= 300 ? 'ok' : ( $wc >= 150 ? 'warn' : 'bad' ), 'seo', 'Content length', "$wc words. " . ( $wc >= 300 ? 'Enough to cover the topic.' : 'Pages under 300 words rarely rank for competitive searches.' ) );

		preg_match_all( '#<img\b[^>]*>#i', (string) $d['html'], $im );
		$imgs = count( $im[0] );
		if ( $imgs ) {
			$noalt  = 0;
			$kw_alt = false;
			foreach ( $im[0] as $tag ) {
				if ( preg_match( '/\balt\s*=\s*(["\'])(.*?)\1/is', $tag, $a ) && '' !== trim( $a[2] ) ) {
					$kw_alt = $kw_alt || self::has( $a[2], $kw );
				} else {
					$noalt++;
				}
			}
			$add( 0 === $noalt ? 'ok' : 'warn', 'seo', 'Image alt text', 0 === $noalt ? 'All images have alt text.' : "$noalt of $imgs image(s) have no alt text: add it for accessibility and image search." );
			if ( '' !== $kw ) {
				$add( $kw_alt ? 'ok' : 'info', 'seo', 'Keyword in image alt', $kw_alt ? 'An image alt text contains the keyword.' : 'If it fits, describe an image using the keyword.' );
			}
		} else {
			$add( 'info', 'seo', 'Images', 'No images yet. A relevant image makes the page more engaging.' );
		}
		preg_match_all( '#<a\b[^>]*\bhref\s*=\s*(["\'])(.*?)\1#is', (string) $d['html'], $lm );
		$int = 0;
		$ext = 0;
		foreach ( $lm[2] as $href ) {
			if ( preg_match( '/^(#|mailto:|tel:|javascript:)/i', $href ) ) {
				continue;
			}
			if ( preg_match( '#^https?://([^/]+)#i', $href, $hm2 ) && '' !== $d['home_host'] && strtolower( $hm2[1] ) !== strtolower( $d['home_host'] ) && 'www.' . strtolower( $hm2[1] ) !== strtolower( $d['home_host'] ) && strtolower( $hm2[1] ) !== 'www.' . strtolower( $d['home_host'] ) ) {
				$ext++;
			} else {
				$int++;
			}
		}
		$add( $int ? 'ok' : 'warn', 'seo', 'Internal links', $int ? "$int internal link(s)." : 'Link to at least one other page on your site so visitors and crawlers can keep exploring.' );
		$add( $ext ? 'ok' : 'info', 'seo', 'Outbound links', $ext ? "$ext link(s) to other sites." : 'Linking to a trustworthy source can add credibility.' );

		if ( $wc >= 50 ) {
			$fl = self::flesch( $text );
			$add( $fl >= 60 ? 'ok' : ( $fl >= 50 ? 'warn' : 'bad' ), 'read', 'Reading ease', "Flesch score $fl. " . ( $fl >= 60 ? 'Easy to read.' : ( $fl >= 50 ? 'Fairly difficult: use shorter sentences and simpler words.' : 'Difficult to read: shorten sentences and simplify words.' ) ) );
			$ls = self::long_sentence_share( $text );
			$add( $ls <= 25 ? 'ok' : ( $ls <= 35 ? 'warn' : 'bad' ), 'read', 'Sentence length', "$ls% of sentences are longer than 20 words. " . ( $ls <= 25 ? 'Good.' : 'Try to keep that under 25%.' ) );
			$paras = preg_split( '#</p>|\n\s*\n#i', (string) $d['html'], -1, PREG_SPLIT_NO_EMPTY );
			$long  = 0;
			foreach ( $paras as $p ) {
				if ( count( self::words( WLSEO_Templates::plain( $p ) ) ) > 150 ) {
					$long++;
				}
			}
			$add( 0 === $long ? 'ok' : 'warn', 'read', 'Paragraph length', 0 === $long ? 'Paragraphs are a comfortable length.' : "$long paragraph(s) run over 150 words: break them up." );
			if ( $wc > 300 ) {
				$add( $hm && count( $hm[1] ) >= 1 ? 'ok' : 'warn', 'read', 'Subheadings', $hm && count( $hm[1] ) >= 1 ? 'The text is broken up with subheadings.' : 'Add subheadings to break up long text.' );
			}
		}
		return $r;
	}

	/** 0-100 over seo checks (info ignored): ok = 1, warn = 0.5. */
	public static function score( $checks, $group = null ) {
		$n = 0;
		$p = 0;
		foreach ( $checks as $c ) {
			if ( 'info' === $c[0] || ( $group && $c[1] !== $group ) ) {
				continue;
			}
			$n++;
			$p += 'ok' === $c[0] ? 1 : ( 'warn' === $c[0] ? 0.5 : 0 );
		}
		return $n ? (int) round( 100 * $p / $n ) : 0;
	}
}

/** Tiny accent folding without WordPress (remove_accents lives in core). */
if ( ! function_exists( 'remove_accents_stub' ) ) {
	function wlseo_remove_accents( $s ) {
		if ( function_exists( 'remove_accents' ) ) {
			return remove_accents( $s );
		}
		$map = array();
		$from = preg_split( '//u', 'àáâãäåçèéêëìíîïñòóôõöùúûüýÿÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝ', -1, PREG_SPLIT_NO_EMPTY );
		$to   = str_split( 'aaaaaaceeeeiiiinooooouuuuyyAAAAAACEEEEIIIINOOOOOUUUUY' );
		foreach ( $from as $i => $ch ) {
			$map[ $ch ] = $to[ $i ];
		}
		return strtr( (string) $s, $map );
	}
}
