<?php
defined( 'ABSPATH' ) || exit;

/** Image engine on PHP's GD library. Never makes a file bigger and never touches formats it cannot handle safely. */
class WLIO_Engine {

	public static function available() {
		return extension_loaded( 'gd' ) && function_exists( 'imagecreatetruecolor' );
	}

	public static function can_webp() {
		return self::available() && function_exists( 'imagewebp' );
	}

	/** "256M" / "1G" / "512" -> bytes (-1 = unlimited). */
	public static function bytes( $v ) {
		$v = trim( (string) $v );
		if ( '' === $v || '-1' === $v ) {
			return -1;
		}
		$n = (float) $v;
		switch ( strtolower( substr( $v, -1 ) ) ) {
			case 'g':
				$n *= 1024;
				// no break
			case 'm':
				$n *= 1024;
				// no break
			case 'k':
				$n *= 1024;
		}
		return (int) $n;
	}

	/** Is there enough memory to decode a w x h image (about 5 bytes per pixel while resizing)? */
	public static function memory_ok( $w, $h, $limit = null, $used = null ) {
		$limit = null === $limit ? self::bytes( ini_get( 'memory_limit' ) ) : $limit;
		$used  = null === $used ? memory_get_usage( true ) : $used;
		return -1 === $limit || ( $w * $h * 5 + $used ) < $limit * 0.9;
	}

	/** Image types we optimise (animated GIFs and SVGs are left alone). */
	public static function supported( $path ) {
		$ext = strtolower( pathinfo( $path, PATHINFO_EXTENSION ) );
		return in_array( $ext, array( 'jpg', 'jpeg', 'png', 'webp' ), true );
	}

	private static function load( $path, $ext ) {
		$img = false;
		if ( in_array( $ext, array( 'jpg', 'jpeg' ), true ) ) {
			$img = @imagecreatefromjpeg( $path ); // phpcs:ignore
		} elseif ( 'png' === $ext ) {
			$img = @imagecreatefrompng( $path ); // phpcs:ignore
		} elseif ( 'webp' === $ext && function_exists( 'imagecreatefromwebp' ) ) {
			$img = @imagecreatefromwebp( $path ); // phpcs:ignore
		}
		return $img;
	}

	/** Apply an EXIF orientation (1-8) so the pixels are upright and the tag can be dropped. */
	private static function orient( $img, $o ) {
		switch ( $o ) {
			case 2:
				imageflip( $img, IMG_FLIP_HORIZONTAL );
				return $img;
			case 3:
				return imagerotate( $img, 180, 0 );
			case 4:
				imageflip( $img, IMG_FLIP_VERTICAL );
				return $img;
			case 5:
				$img = imagerotate( $img, -90, 0 );
				imageflip( $img, IMG_FLIP_HORIZONTAL );
				return $img;
			case 6:
				return imagerotate( $img, -90, 0 );
			case 7:
				$img = imagerotate( $img, 90, 0 );
				imageflip( $img, IMG_FLIP_HORIZONTAL );
				return $img;
			case 8:
				return imagerotate( $img, 90, 0 );
		}
		return $img;
	}

	private static function encode( $img, $ext, $o, &$bytes ) {
		ob_start();
		$ok = false;
		if ( in_array( $ext, array( 'jpg', 'jpeg' ), true ) ) {
			imageinterlace( $img, true );
			$ok = imagejpeg( $img, null, (int) $o['jpeg_quality'] );
		} elseif ( 'png' === $ext ) {
			imagesavealpha( $img, true );
			$ok = imagepng( $img, null, 9 );
		} elseif ( 'webp' === $ext ) {
			$ok = imagewebp( $img, null, (int) $o['webp_quality'] );
		}
		$bytes = ob_get_clean();
		return $ok && '' !== $bytes;
	}

	/**
	 * Optimise one file in place.
	 * @return array status (optimized|skipped|error), reason, before, after, resized(bool)
	 */
	public static function optimize( $path, $o ) {
		$res = array( 'status' => 'skipped', 'reason' => '', 'before' => 0, 'after' => 0, 'resized' => false );
		if ( ! self::available() ) {
			$res['reason'] = 'GD library missing';
			return $res;
		}
		if ( ! is_file( $path ) || ! is_readable( $path ) || ! self::supported( $path ) ) {
			$res['reason'] = 'unsupported or unreadable';
			return $res;
		}
		$ext    = strtolower( pathinfo( $path, PATHINFO_EXTENSION ) );
		$before = (int) filesize( $path );
		$res['before'] = $res['after'] = $before;
		if ( 'png' === $ext && empty( $o['png'] ) ) {
			$res['reason'] = 'PNG recompression is off';
			return $res;
		}
		$info = @getimagesize( $path ); // phpcs:ignore
		if ( ! $info || $info[0] < 1 || $info[1] < 1 || $info[0] * $info[1] > 80000000 ) {
			$res['reason'] = 'unreadable or too large to process safely';
			return $res;
		}
		if ( ! self::memory_ok( $info[0], $info[1] ) ) {
			$res['reason'] = 'not enough PHP memory for an image this large';
			return $res;
		}
		if ( 'png' === $ext && self::is_animated_png( $path ) ) {
			$res['reason'] = 'animated PNG';
			return $res;
		}
		$orient = 1;
		if ( in_array( $ext, array( 'jpg', 'jpeg' ), true ) ) {
			$head   = (string) file_get_contents( $path, false, null, 0, 65536 ); // phpcs:ignore
			$orient = WLIO_Exif::orientation( $head );
			// Already saved at or below the target quality: re-compressing would only lose detail.
			$q = WLIO_Exif::jpeg_quality( $head );
			if ( $q > 0 && $q <= (int) $o['jpeg_quality'] + 1 && $orient <= 1 && ( ( (int) $o['max_width'] <= 0 || $info[0] <= (int) $o['max_width'] ) && ( (int) $o['max_height'] <= 0 || $info[1] <= (int) $o['max_height'] ) ) ) {
				$res['reason'] = 'already optimal';
				return $res;
			}
		}
		$img = self::load( $path, $ext );
		if ( ! $img ) {
			$res['reason'] = 'could not be decoded';
			return $res;
		}
		if ( $orient > 1 ) {
			$r = self::orient( $img, $orient );
			if ( $r && $r !== $img ) {
				imagedestroy( $img );
				$img = $r;
			}
		}
		$w  = imagesx( $img );
		$h  = imagesy( $img );
		$mw = (int) $o['max_width'];
		$mh = (int) $o['max_height'];
		$sc = 1.0;
		if ( $mw > 0 && $w > $mw ) {
			$sc = min( $sc, $mw / $w );
		}
		if ( $mh > 0 && $h > $mh ) {
			$sc = min( $sc, $mh / $h );
		}
		if ( $sc < 1.0 ) {
			$nw = max( 1, (int) round( $w * $sc ) );
			$nh = max( 1, (int) round( $h * $sc ) );
			$n  = imagecreatetruecolor( $nw, $nh );
			imagealphablending( $n, false );
			imagesavealpha( $n, true );
			imagefill( $n, 0, 0, imagecolorallocatealpha( $n, 0, 0, 0, 127 ) );
			imagecopyresampled( $n, $img, 0, 0, 0, 0, $nw, $nh, $w, $h );
			imagedestroy( $img );
			$img            = $n;
			$res['resized'] = true;
		}
		$bytes = '';
		if ( ! self::encode( $img, $ext, $o, $bytes ) ) {
			imagedestroy( $img );
			$res['reason'] = 'could not be re-encoded';
			return $res;
		}
		imagedestroy( $img );
		// Only keep the result when it is smaller, or when it fixed something (resize / rotation).
		if ( strlen( $bytes ) >= $before && ! $res['resized'] && $orient <= 1 ) {
			$res['reason'] = 'already optimal';
			return $res;
		}
		$tmp = $path . '.wlio-tmp';
		if ( false === file_put_contents( $tmp, $bytes ) ) { // phpcs:ignore
			$res['status'] = 'error';
			$res['reason'] = 'could not write the file';
			return $res;
		}
		if ( ! @rename( $tmp, $path ) ) { // phpcs:ignore
			@unlink( $tmp ); // phpcs:ignore
			$res['status'] = 'error';
			$res['reason'] = 'could not replace the file';
			return $res;
		}
		clearstatcache( true, $path );
		$res['status'] = 'optimized';
		$res['after']  = strlen( $bytes );
		return $res;
	}

	/** Create "<file>.webp" next to the image. Kept only when smaller than the file. Returns bytes or 0. */
	public static function make_webp( $path, $o ) {
		$webp = $path . '.webp';
		if ( file_exists( $webp ) ) {
			@unlink( $webp ); // phpcs:ignore
		}
		if ( ! self::can_webp() || ! is_file( $path ) || ! in_array( strtolower( pathinfo( $path, PATHINFO_EXTENSION ) ), array( 'jpg', 'jpeg', 'png' ), true ) ) {
			return 0;
		}
		$ext = strtolower( pathinfo( $path, PATHINFO_EXTENSION ) );
		$img = self::load( $path, $ext );
		if ( ! $img ) {
			return 0;
		}
		if ( ! imageistruecolor( $img ) ) {
			imagepalettetotruecolor( $img );
		}
		imagealphablending( $img, false );
		imagesavealpha( $img, true );
		$bytes = '';
		self::encode( $img, 'webp', $o, $bytes );
		imagedestroy( $img );
		if ( '' === $bytes || strlen( $bytes ) >= filesize( $path ) ) {
			return 0;
		}
		file_put_contents( $webp, $bytes ); // phpcs:ignore
		return strlen( $bytes );
	}

	private static function is_animated_png( $path ) {
		$h = (string) file_get_contents( $path, false, null, 0, 4096 ); // phpcs:ignore
		return false !== strpos( $h, 'acTL' );
	}

	public static function human( $bytes ) {
		$bytes = (float) $bytes;
		if ( $bytes < 1024 ) {
			return (int) $bytes . ' B';
		}
		if ( $bytes < 1048576 ) {
			return round( $bytes / 1024, 1 ) . ' KB';
		}
		return round( $bytes / 1048576, 2 ) . ' MB';
	}
}
