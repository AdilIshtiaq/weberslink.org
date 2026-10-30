<?php
defined( 'ABSPATH' ) || exit;

/** IP helpers (pure). */
class WLSS_Ip {

	public static function valid( $ip ) {
		return (bool) filter_var( $ip, FILTER_VALIDATE_IP );
	}

	/** A single address or a CIDR range such as 203.0.113.0/24 or 2001:db8::/32. */
	public static function valid_entry( $e ) {
		if ( false === strpos( $e, '/' ) ) {
			return self::valid( $e );
		}
		list( $ip, $bits ) = explode( '/', $e, 2 );
		if ( ! self::valid( $ip ) || ! ctype_digit( $bits ) ) {
			return false;
		}
		return (int) $bits <= ( false !== strpos( $ip, ':' ) ? 128 : 32 );
	}

	public static function in_entry( $ip, $entry ) {
		if ( false === strpos( $entry, '/' ) ) {
			$a = @inet_pton( $ip );
			$b = @inet_pton( $entry );
			return false !== $a && $a === $b;
		}
		list( $net, $bits ) = explode( '/', $entry, 2 );
		$a                  = @inet_pton( $ip );
		$n                  = @inet_pton( $net );
		if ( false === $a || false === $n || strlen( $a ) !== strlen( $n ) ) {
			return false;
		}
		$bits  = (int) $bits;
		$bytes = intdiv( $bits, 8 );
		if ( substr( $a, 0, $bytes ) !== substr( $n, 0, $bytes ) ) {
			return false;
		}
		$rem = $bits % 8;
		if ( 0 === $rem ) {
			return true;
		}
		$mask = ( 0xFF << ( 8 - $rem ) ) & 0xFF;
		return ( ord( $a[ $bytes ] ) & $mask ) === ( ord( $n[ $bytes ] ) & $mask );
	}

	public static function in_list( $ip, $text ) {
		foreach ( preg_split( '/\r\n|\r|\n|,/', (string) $text ) as $e ) {
			$e = trim( $e );
			if ( '' !== $e && self::in_entry( $ip, $e ) ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Client address. A proxy header is used only when the site owner chose one in settings (turn it on only if
	 * the site really sits behind that proxy, otherwise visitors could forge it).
	 */
	public static function client( $server, $header = '' ) {
		$remote = isset( $server['REMOTE_ADDR'] ) ? trim( (string) $server['REMOTE_ADDR'] ) : '';
		$ip     = self::valid( $remote ) ? $remote : '0.0.0.0';
		if ( '' === $header ) {
			return $ip;
		}
		$key = 'HTTP_' . strtoupper( str_replace( '-', '_', $header ) );
		if ( empty( $server[ $key ] ) ) {
			return $ip;
		}
		$parts = array_values( array_filter( array_map( 'trim', explode( ',', (string) $server[ $key ] ) ) ) );
		// X-Forwarded-For: the right-most entry is the one added by the proxy nearest to us; earlier ones can be forged by the visitor.
		$cand = $parts ? ( 'X-Forwarded-For' === $header ? end( $parts ) : reset( $parts ) ) : '';
		return self::valid( $cand ) ? $cand : $ip;
	}
}
