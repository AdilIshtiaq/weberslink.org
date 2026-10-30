<?php
defined( 'ABSPATH' ) || exit;

/** Pure matching engine: no WordPress calls, so every rule type can be unit-tested. */
class WLR_Matcher {

	const MAX_SOURCE = 500;

	/** Split a URL or path into array( normalised path, query string ). */
	public static function split( $url, $base = '' ) {
		$url = trim( (string) $url );
		if ( preg_match( '#^https?://#i', $url ) ) {
			$p     = parse_url( $url ); // phpcs:ignore
			$path  = isset( $p['path'] ) ? $p['path'] : '/';
			$query = isset( $p['query'] ) ? $p['query'] : '';
		} else {
			$url   = strtok( $url, '#' );
			$parts = explode( '?', (string) $url, 2 );
			$path  = $parts[0];
			$query = isset( $parts[1] ) ? $parts[1] : '';
		}
		$path = '/' . ltrim( (string) $path, '/' );
		$path = preg_replace( '#/{2,}#', '/', $path );
		if ( '' !== $base && '/' !== $base && 0 === strpos( $path, rtrim( $base, '/' ) . '/' ) ) {
			$path = substr( $path, strlen( rtrim( $base, '/' ) ) );
		}
		return array( $path, $query );
	}

	/** Normalise a path for comparison. */
	public static function norm( $path, $opts ) {
		$path = rawurldecode( $path );
		if ( ! empty( $opts['ignore_slash'] ) && strlen( $path ) > 1 ) {
			$path = rtrim( $path, '/' );
			if ( '' === $path ) {
				$path = '/';
			}
		}
		return ! empty( $opts['case_insensitive'] ) ? strtolower( $path ) : $path;
	}

	private static function same_query( $a, $b ) {
		parse_str( $a, $x );
		parse_str( $b, $y );
		ksort( $x );
		ksort( $y );
		return $x === $y;
	}

	private static function regex( $source, $opts ) {
		return '#' . str_replace( '#', '\#', $source ) . '#' . ( ! empty( $opts['case_insensitive'] ) ? 'i' : '' ) . 'u';
	}

	/**
	 * First enabled rule that matches. Returns array( rule, target|null, code ) or null.
	 * $rules: array of array( id, source, match, target, code, query, enabled ).
	 */
	public static function find( $url, $rules, $opts, $base = '' ) {
		list( $path, $query ) = self::split( $url, $base );
		$npath                = self::norm( $path, $opts );
		foreach ( (array) $rules as $r ) {
			if ( isset( $r['enabled'] ) && ! (int) $r['enabled'] ) {
				continue;
			}
			$hit = self::match_one( $r, $path, $npath, $query, $opts, $base );
			if ( null !== $hit ) {
				$target = in_array( (int) $r['code'], array( 410, 451 ), true ) ? null : $hit;
				if ( null !== $target && isset( $r['query'] ) && 'pass' === $r['query'] && '' !== $query && false === strpos( $target, '?' ) ) {
					$target .= '?' . $query;
				}
				return array( $r, $target, (int) $r['code'] );
			}
		}
		return null;
	}

	/** Returns the resolved target string (may be '') when the rule matches, else null. */
	private static function match_one( $r, $path, $npath, $query, $opts, $base ) {
		$type   = isset( $r['match'] ) ? $r['match'] : 'exact';
		$target = isset( $r['target'] ) ? (string) $r['target'] : '';
		if ( 'regex' === $type ) {
			if ( strlen( $r['source'] ) > self::MAX_SOURCE ) {
				return null;
			}
			$re = self::regex( $r['source'], $opts );
			$ok = @preg_match( $re, $path, $m ); // phpcs:ignore
			if ( 1 !== $ok ) {
				return null;
			}
			return preg_replace_callback( '/\$(\d)/', function ( $x ) use ( $m ) {
				return isset( $m[ (int) $x[1] ] ) ? $m[ (int) $x[1] ] : '';
			}, $target );
		}
		list( $sp, $sq ) = self::split( $r['source'], $base );
		$nsp             = self::norm( $sp, $opts );
		if ( 'prefix' === $type ) {
			$cmp = '/' === $nsp ? '/' : $nsp;
			if ( $npath !== $cmp && 0 !== strpos( $npath . '/', rtrim( $cmp, '/' ) . '/' ) ) {
				return null;
			}
			$rest = '/' === $cmp ? $npath : substr( rawurldecode( $path ), strlen( rtrim( $cmp, '/' ) ) );
			// keep the original casing of the remainder
			$rest = ltrim( (string) $rest, '/' );
			return str_replace( '{rest}', $rest, $target );
		}
		if ( $npath !== $nsp ) {
			return null;
		}
		if ( ! empty( $r['query'] ) && 'exact' === $r['query'] && ! self::same_query( $sq, $query ) ) {
			return null;
		}
		if ( '' !== $sq && ( empty( $r['query'] ) || 'exact' !== $r['query'] ) && ! self::same_query( $sq, $query ) ) {
			return null; // a source written with ?query always requires it
		}
		return $target;
	}

	/** Validate and clean one rule. Returns array( clean|null, error ). */
	public static function validate( $d ) {
		$match = isset( $d['match'] ) && in_array( $d['match'], array( 'exact', 'prefix', 'regex' ), true ) ? $d['match'] : 'exact';
		$code  = isset( $d['code'] ) ? (int) $d['code'] : 301;
		if ( ! in_array( $code, array( 301, 302, 303, 307, 308, 410, 451 ), true ) ) {
			return array( null, 'Unsupported status code.' );
		}
		$source = trim( (string) ( isset( $d['source'] ) ? $d['source'] : '' ) );
		if ( '' === $source ) {
			return array( null, 'The source URL is required.' );
		}
		if ( strlen( $source ) > self::MAX_SOURCE ) {
			return array( null, 'The source is too long.' );
		}
		if ( 'regex' === $match ) {
			if ( false === @preg_match( self::regex( $source, array() ), '' ) ) { // phpcs:ignore
				return array( null, 'The regular expression is not valid.' );
			}
		} elseif ( preg_match( '#^https?://#i', $source ) ) {
			list( $p, $q ) = self::split( $source );
			$source        = $p . ( '' !== $q ? '?' . $q : '' ); // keep only the path: matching is host independent
		} elseif ( '/' !== $source[0] ) {
			$source = '/' . $source;
		}
		$target = trim( (string) ( isset( $d['target'] ) ? $d['target'] : '' ) );
		if ( in_array( $code, array( 410, 451 ), true ) ) {
			$target = '';
		} else {
			if ( '' === $target ) {
				return array( null, 'A target URL is required for this status code.' );
			}
			if ( preg_match( '#^[a-z][a-z0-9+.\-]*:#i', $target ) && ! preg_match( '#^https?://#i', $target ) ) {
				return array( null, 'The target must start with http://, https:// or /.' );
			}
			if ( ! preg_match( '#^https?://#i', $target ) && '/' !== $target[0] ) {
				$target = '/' . $target;
			}
			if ( preg_match( '/[\x00-\x1f\x7f]/', $target ) ) {
				return array( null, 'The target contains invalid characters.' );
			}
			if ( 'regex' !== $match && 0 !== strpos( $target, 'http' ) ) {
				list( $sp ) = self::split( $source );
				list( $tp ) = self::split( $target );
				if ( 'exact' === $match && self::norm( $sp, array( 'ignore_slash' => 1, 'case_insensitive' => 1 ) ) === self::norm( $tp, array( 'ignore_slash' => 1, 'case_insensitive' => 1 ) ) && false === strpos( $source . $target, '?' ) ) {
					return array( null, 'The source and target are the same: that would loop forever.' );
				}
			}
		}
		$query = isset( $d['query'] ) && in_array( $d['query'], array( 'ignore', 'exact', 'pass' ), true ) ? $d['query'] : 'ignore';
		return array( array(
			'source'  => $source,
			'match'   => $match,
			'target'  => $target,
			'code'    => $code,
			'query'   => $query,
			'enabled' => isset( $d['enabled'] ) ? ( (int) $d['enabled'] ? 1 : 0 ) : 1,
			'note'    => mb_substr( sanitize_text_field( isset( $d['note'] ) ? $d['note'] : '' ), 0, 255 ),
		), '' );
	}
}
