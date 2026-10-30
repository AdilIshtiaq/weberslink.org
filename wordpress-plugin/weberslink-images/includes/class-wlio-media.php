<?php
defined( 'ABSPATH' ) || exit;

/** WordPress integration: optimise on upload, per-attachment bookkeeping, restore, clean-up. */
class WLIO_Media {

	const META   = '_wlio';
	const SAVED  = '_wlio_saved';
	const MIMES  = array( 'image/jpeg', 'image/png', 'image/webp' );

	public static function init() {
		add_filter( 'wp_generate_attachment_metadata', array( __CLASS__, 'on_generate' ), 20, 2 );
		add_action( 'delete_attachment', array( __CLASS__, 'on_delete' ) );
	}

	public static function on_generate( $meta, $id ) {
		if ( WLIO_Settings::get( 'auto' ) && is_array( $meta ) ) {
			$meta = self::process( $id, $meta, false );
		}
		return $meta;
	}

	public static function backup_dir() {
		$u = wp_get_upload_dir();
		return $u['basedir'] . '/wlio-backup';
	}

	/** Backup path for an upload: same relative path under wlio-backup. */
	private static function backup_path( $file ) {
		$u   = wp_get_upload_dir();
		$rel = ltrim( str_replace( '\\', '/', substr( $file, strlen( $u['basedir'] ) ) ), '/' );
		return self::backup_dir() . '/' . $rel;
	}

	/** Make sure the backup folder cannot be browsed or executed. */
	private static function protect_backup_dir() {
		$d = self::backup_dir();
		if ( ! is_dir( $d ) ) {
			wp_mkdir_p( $d );
		}
		if ( is_dir( $d ) && ! is_file( $d . '/index.php' ) ) {
			file_put_contents( $d . '/index.php', "<?php\n// Silence is golden.\n" ); // phpcs:ignore
			file_put_contents( $d . '/.htaccess', "Options -Indexes\n<IfModule mod_authz_core.c>\nRequire all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\nDeny from all\n</IfModule>\n" ); // phpcs:ignore
		}
	}

	/** Every file of an attachment: the original and each generated size. */
	public static function files( $id, $meta ) {
		$file = get_attached_file( $id );
		$out  = array();
		if ( ! $file ) {
			return $out;
		}
		$out['full'] = $file;
		$dir         = dirname( $file );
		if ( is_array( $meta ) && ! empty( $meta['sizes'] ) ) {
			foreach ( $meta['sizes'] as $name => $sz ) {
				if ( ! empty( $sz['file'] ) ) {
					$out[ $name ] = $dir . '/' . $sz['file'];
				}
			}
		}
		if ( is_array( $meta ) && ! empty( $meta['original_image'] ) ) {
			$out['original_image'] = $dir . '/' . $meta['original_image']; // the unscaled upload WordPress keeps next to "-scaled"
		}
		return array_unique( $out );
	}

	/**
	 * Optimise an attachment. Returns the (possibly updated) metadata array.
	 * Stores the result in post meta so the media library and the bulk tool know what happened.
	 */
	public static function process( $id, $meta, $force = false ) {
		$mime = get_post_mime_type( $id );
		if ( ! in_array( $mime, self::MIMES, true ) || ! WLIO_Engine::available() ) {
			return $meta;
		}
		if ( ! $force && get_post_meta( $id, self::META, true ) ) {
			return $meta;
		}
		$o     = WLIO_Settings::all();
		$files = self::files( $id, $meta );
		if ( ! $files ) {
			return $meta;
		}
		$orig_total = 0;
		$now_total  = 0;
		$webp_total = 0;
		$n_webp     = 0;
		$resized    = false;
		foreach ( $files as $name => $path ) {
			if ( ! is_file( $path ) ) {
				continue;
			}
			if ( 'full' === $name && ! empty( $o['backup'] ) && WLIO_Engine::supported( $path ) && ! is_file( self::backup_path( $path ) ) ) {
				self::protect_backup_dir();
				$bp = self::backup_path( $path );
				wp_mkdir_p( dirname( $bp ) );
				@copy( $path, $bp ); // phpcs:ignore
			}
			$opts = $o;
			if ( 'full' !== $name ) {
				$opts['max_width'] = $opts['max_height'] = 0; // generated sizes keep their dimensions
			}
			$r           = WLIO_Engine::optimize( $path, $opts );
			$orig_total += $r['before'];
			$now_total  += $r['after'];
			$resized     = $resized || ( 'full' === $name && ! empty( $r['resized'] ) );
			if ( ! empty( $o['webp'] ) ) {
				$w = WLIO_Engine::make_webp( $path, $o );
				if ( $w ) {
					$webp_total += $w;
					$n_webp++;
				}
			}
		}
		if ( ! empty( $files['full'] ) && is_file( $files['full'] ) ) {
			$size = @getimagesize( $files['full'] ); // phpcs:ignore
			if ( $size && ( ! isset( $meta['width'] ) || (int) $meta['width'] !== (int) $size[0] || (int) $meta['height'] !== (int) $size[1] ) ) {
				$meta['width']  = (int) $size[0];
				$meta['height'] = (int) $size[1];
			}
			if ( is_array( $meta ) && isset( $meta['filesize'] ) ) {
				$meta['filesize'] = (int) filesize( $files['full'] );
			}
		}
		update_post_meta( $id, self::META, array( 'before' => $orig_total, 'after' => $now_total, 'webp' => $webp_total, 'webp_files' => $n_webp, 'resized' => $resized, 'time' => time() ) );
		update_post_meta( $id, self::SAVED, max( 0, $orig_total - $now_total ) );
		return $meta;
	}

	/** Put the original upload back and drop WebP twins. Thumbnails stay optimised. */
	public static function restore( $id ) {
		$file = get_attached_file( $id );
		if ( ! $file ) {
			return false;
		}
		$bp = self::backup_path( $file );
		if ( ! is_file( $bp ) ) {
			return false;
		}
		if ( ! @copy( $bp, $file ) ) { // phpcs:ignore
			return false;
		}
		$meta  = wp_get_attachment_metadata( $id );
		$files = self::files( $id, $meta );
		foreach ( $files as $p ) {
			if ( is_file( $p . '.webp' ) ) {
				@unlink( $p . '.webp' ); // phpcs:ignore
			}
		}
		$size = @getimagesize( $file ); // phpcs:ignore
		if ( $size && is_array( $meta ) ) {
			$meta['width']  = (int) $size[0];
			$meta['height'] = (int) $size[1];
			wp_update_attachment_metadata( $id, $meta );
		}
		@unlink( $bp ); // phpcs:ignore
		delete_post_meta( $id, self::META );
		delete_post_meta( $id, self::SAVED );
		return true;
	}

	public static function on_delete( $id ) {
		$meta = wp_get_attachment_metadata( $id );
		foreach ( self::files( $id, $meta ) as $p ) {
			if ( is_file( $p . '.webp' ) ) {
				@unlink( $p . '.webp' ); // phpcs:ignore
			}
		}
		$file = get_attached_file( $id );
		if ( $file ) {
			$bp = self::backup_path( $file );
			if ( is_file( $bp ) ) {
				@unlink( $bp ); // phpcs:ignore
			}
		}
	}

	/** Totals for the admin page. */
	public static function totals() {
		global $wpdb;
		$saved = (int) $wpdb->get_var( $wpdb->prepare( "SELECT SUM(meta_value) FROM {$wpdb->postmeta} WHERE meta_key=%s", self::SAVED ) ); // phpcs:ignore
		$done  = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$wpdb->postmeta} WHERE meta_key=%s", self::SAVED ) ); // phpcs:ignore
		$in    = "'" . implode( "','", array_map( 'esc_sql', self::MIMES ) ) . "'";
		$all   = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_type='attachment' AND post_mime_type IN ($in)" ); // phpcs:ignore
		return array( 'saved' => $saved, 'done' => $done, 'all' => $all, 'todo' => max( 0, $all - $done ) );
	}

	/** Next attachment ids not optimised yet. */
	public static function next_ids( $limit = 3 ) {
		global $wpdb;
		$in = "'" . implode( "','", array_map( 'esc_sql', self::MIMES ) ) . "'";
		return array_map( 'intval', (array) $wpdb->get_col( $wpdb->prepare( "SELECT p.ID FROM {$wpdb->posts} p WHERE p.post_type='attachment' AND p.post_mime_type IN ($in) AND NOT EXISTS (SELECT 1 FROM {$wpdb->postmeta} m WHERE m.post_id=p.ID AND m.meta_key=%s) ORDER BY p.ID DESC LIMIT %d", self::META, (int) $limit ) ) ); // phpcs:ignore
	}
}
