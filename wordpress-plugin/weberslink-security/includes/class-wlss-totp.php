<?php
defined( 'ABSPATH' ) || exit;

/** RFC 6238 time-based one-time passwords (pure; works with Google Authenticator, Authy, 1Password, Microsoft Authenticator…). */
class WLSS_Totp {

	const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

	public static function generate_secret() {
		return self::b32_encode( random_bytes( 20 ) );
	}

	public static function b32_encode( $bin ) {
		$bits = '';
		foreach ( str_split( $bin ) as $c ) {
			$bits .= str_pad( decbin( ord( $c ) ), 8, '0', STR_PAD_LEFT );
		}
		$out = '';
		foreach ( str_split( $bits, 5 ) as $chunk ) {
			$out .= self::ALPHA[ bindec( str_pad( $chunk, 5, '0' ) ) ];
		}
		return $out;
	}

	public static function b32_decode( $s ) {
		$s    = strtoupper( preg_replace( '/[\s=\-]/', '', (string) $s ) );
		$bits = '';
		foreach ( str_split( $s ) as $c ) {
			$p = strpos( self::ALPHA, $c );
			if ( false === $p ) {
				return '';
			}
			$bits .= str_pad( decbin( $p ), 5, '0', STR_PAD_LEFT );
		}
		$out = '';
		foreach ( str_split( $bits, 8 ) as $byte ) {
			if ( 8 === strlen( $byte ) ) {
				$out .= chr( bindec( $byte ) );
			}
		}
		return $out;
	}

	public static function code( $secret_bin, $counter, $digits = 6 ) {
		$msg  = pack( 'N2', ( $counter >> 32 ) & 0xFFFFFFFF, $counter & 0xFFFFFFFF );
		$hash = hash_hmac( 'sha1', $msg, $secret_bin, true );
		$off  = ord( $hash[19] ) & 0x0F;
		$bin  = ( ( ord( $hash[ $off ] ) & 0x7F ) << 24 ) | ( ord( $hash[ $off + 1 ] ) << 16 ) | ( ord( $hash[ $off + 2 ] ) << 8 ) | ord( $hash[ $off + 3 ] );
		return str_pad( (string) ( $bin % ( 10 ** $digits ) ), $digits, '0', STR_PAD_LEFT );
	}

	/**
	 * Check a code, allowing one 30-second step either side for clock drift.
	 * Returns the matching counter (use it to reject replays) or false.
	 */
	public static function verify( $secret_b32, $input, $now, $last_counter = 0, $window = 1 ) {
		$input = preg_replace( '/\s+/', '', (string) $input );
		if ( ! preg_match( '/^\d{6}$/', $input ) ) {
			return false;
		}
		$bin = self::b32_decode( $secret_b32 );
		if ( '' === $bin ) {
			return false;
		}
		$t = (int) floor( $now / 30 );
		for ( $i = -$window; $i <= $window; $i++ ) {
			$c = $t + $i;
			if ( $c > (int) $last_counter && hash_equals( self::code( $bin, $c ), $input ) ) {
				return $c;
			}
		}
		return false;
	}

	public static function uri( $account, $issuer, $secret ) {
		return 'otpauth://totp/' . rawurlencode( $issuer . ':' . $account ) . '?secret=' . $secret . '&issuer=' . rawurlencode( $issuer ) . '&algorithm=SHA1&digits=6&period=30';
	}

	public static function pretty( $secret ) {
		return trim( chunk_split( $secret, 4, ' ' ) );
	}
}
