<?php
defined( 'ABSPATH' ) || exit;

/** Suggest the published page a broken URL was probably meant to reach. */
class WLR_Suggest {

	/** Last path segment without extension, lower-case. */
	public static function slug_of( $path ) {
		$seg = basename( rtrim( rawurldecode( (string) $path ), '/' ) );
		$seg = preg_replace( '/\.(html?|php|aspx?)$/i', '', $seg );
		return strtolower( preg_replace( '/[^a-z0-9\-_]+/i', '-', $seg ) );
	}

	/**
	 * @param string $path   the 404 path
	 * @param array  $slugs  slug => url
	 * @return array|null    array( url, slug, score 0-100 )
	 */
	public static function best( $path, $slugs ) {
		$want = self::slug_of( $path );
		if ( strlen( $want ) < 3 ) {
			return null;
		}
		$best = null;
		foreach ( $slugs as $slug => $url ) {
			$slug = (string) $slug;
			if ( $slug === $want ) {
				return array( 'url' => $url, 'slug' => $slug, 'score' => 100 );
			}
			similar_text( $want, $slug, $pct );
			$lev   = levenshtein( substr( $want, 0, 60 ), substr( $slug, 0, 60 ) );
			$score = max( $pct, 100 - ( 100 * $lev / max( strlen( $want ), strlen( $slug ), 1 ) ) );
			if ( false !== strpos( $slug, $want ) || false !== strpos( $want, $slug ) ) {
				$score = max( $score, 72 );
			}
			if ( ! $best || $score > $best['score'] ) {
				$best = array( 'url' => $url, 'slug' => $slug, 'score' => (int) round( $score ) );
			}
		}
		return $best && $best['score'] >= 65 ? $best : null;
	}
}
