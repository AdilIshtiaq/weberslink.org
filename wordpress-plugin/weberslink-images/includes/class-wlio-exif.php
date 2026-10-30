<?php
defined( 'ABSPATH' ) || exit;

/** Minimal JPEG EXIF reader: only the orientation tag, so no PHP exif extension is needed (pure). */
class WLIO_Exif {

	/** Orientation 1-8 (1 = upright). */
	public static function orientation( $bytes ) {
		if ( strlen( $bytes ) < 12 || "\xFF\xD8" !== substr( $bytes, 0, 2 ) ) {
			return 1;
		}
		$pos = 2;
		$len = strlen( $bytes );
		while ( $pos + 4 <= $len ) {
			if ( "\xFF" !== $bytes[ $pos ] ) {
				break;
			}
			$marker = ord( $bytes[ $pos + 1 ] );
			if ( 0xDA === $marker || 0xD9 === $marker ) {
				break; // start of scan / end of image: no more headers
			}
			$size = unpack( 'n', substr( $bytes, $pos + 2, 2 ) )[1];
			if ( 0xE1 === $marker && 'Exif' === substr( $bytes, $pos + 4, 4 ) ) {
				return self::from_tiff( substr( $bytes, $pos + 10, max( 0, $size - 8 ) ) );
			}
			$pos += 2 + $size;
		}
		return 1;
	}


	/**
	 * Estimate the quality (1-100) a JPEG was saved at from its first quantisation table, the same way
	 * ImageMagick does. Returns 0 when it cannot be read. Used to avoid re-compressing a file that is already
	 * at (or below) the target quality, which would only add generation loss.
	 */
	public static function jpeg_quality( $bytes ) {
		static $std = array( 16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99 );
		static $zz  = array( 0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28, 35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63 );
		$pos = 2;
		$len = strlen( $bytes );
		while ( $pos + 4 <= $len && "\xFF" === $bytes[ $pos ] ) {
			$marker = ord( $bytes[ $pos + 1 ] );
			if ( 0xDA === $marker || 0xD9 === $marker ) {
				break;
			}
			$size = unpack( 'n', substr( $bytes, $pos + 2, 2 ) )[1];
			if ( 0xDB === $marker ) {
				$seg = substr( $bytes, $pos + 4, $size - 2 );
				if ( strlen( $seg ) >= 65 && 0 === ( ord( $seg[0] ) >> 4 ) ) { // 8-bit table
					$sum = 0.0;
					for ( $i = 0; $i < 64; $i++ ) {
						$sum += ord( $seg[ 1 + $i ] ) * 100 / $std[ $zz[ $i ] ];
					}
					$scale = $sum / 64;
					$q     = $scale <= 100 ? ( 200 - $scale ) / 2 : 5000 / $scale;
					return (int) max( 1, min( 100, round( $q ) ) );
				}
			}
			$pos += 2 + $size;
		}
		return 0;
	}

	private static function from_tiff( $t ) {
		if ( strlen( $t ) < 12 ) {
			return 1;
		}
		$order = substr( $t, 0, 2 );
		if ( 'II' !== $order && 'MM' !== $order ) {
			return 1;
		}
		$le  = 'II' === $order;
		$u16 = function ( $o ) use ( $t, $le ) {
			return strlen( $t ) >= $o + 2 ? unpack( $le ? 'v' : 'n', substr( $t, $o, 2 ) )[1] : 0;
		};
		$u32 = function ( $o ) use ( $t, $le ) {
			return strlen( $t ) >= $o + 4 ? unpack( $le ? 'V' : 'N', substr( $t, $o, 4 ) )[1] : 0;
		};
		if ( 42 !== $u16( 2 ) ) {
			return 1;
		}
		$ifd = $u32( 4 );
		$n   = min( $u16( $ifd ), 200 );
		for ( $i = 0; $i < $n; $i++ ) {
			$e = $ifd + 2 + $i * 12;
			if ( 0x0112 === $u16( $e ) ) {
				$v = $u16( $e + 8 );
				return ( $v >= 1 && $v <= 8 ) ? $v : 1;
			}
		}
		return 1;
	}

	/** Build a minimal EXIF segment with an orientation tag (used by tests and by nothing else). */
	public static function make_segment( $orientation, $little = true ) {
		$u16 = function ( $v ) use ( $little ) {
			return pack( $little ? 'v' : 'n', $v );
		};
		$u32 = function ( $v ) use ( $little ) {
			return pack( $little ? 'V' : 'N', $v );
		};
		$tiff = ( $little ? 'II' : 'MM' ) . $u16( 42 ) . $u32( 8 ) . $u16( 1 ) . $u16( 0x0112 ) . $u16( 3 ) . $u32( 1 ) . $u16( $orientation ) . $u16( 0 ) . $u32( 0 );
		$body = "Exif\0\0" . $tiff;
		return "\xFF\xE1" . pack( 'n', strlen( $body ) + 2 ) . $body;
	}
}
