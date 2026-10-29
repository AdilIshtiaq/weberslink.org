<?php
defined( 'ABSPATH' ) || exit;

class WLFP_Uploads {

	/** Extensions never accepted, whatever the form says. */
	public static function blocked() {
		return array( 'php', 'php3', 'php4', 'php5', 'php7', 'php8', 'phtml', 'phar', 'pht', 'phps', 'exe', 'com', 'bat', 'cmd', 'sh', 'cgi', 'pl', 'py', 'js', 'jsp', 'asp', 'aspx', 'htaccess', 'htpasswd', 'ini', 'dll', 'msi', 'vbs', 'svg', 'html', 'htm', 'xhtml' );
	}

	public static function normalize( $name ) {
		if ( ! isset( $_FILES[ $name ] ) || ! is_array( $_FILES[ $name ] ) ) { // phpcs:ignore
			return array();
		}
		$f = $_FILES[ $name ]; // phpcs:ignore
		$o = array();
		if ( is_array( $f['name'] ) ) {
			foreach ( $f['name'] as $i => $n ) {
				if ( '' === $n ) {
					continue;
				}
				$o[] = array( 'name' => $n, 'type' => $f['type'][ $i ], 'tmp_name' => $f['tmp_name'][ $i ], 'error' => $f['error'][ $i ], 'size' => $f['size'][ $i ] );
			}
		} elseif ( '' !== $f['name'] ) {
			$o[] = $f;
		}
		return $o;
	}

	/** Returns array( files[], error ). */
	public static function handle( $field, $form ) {
		$files = self::normalize( $field['name'] );
		if ( ! $files ) {
			return array( array(), '' );
		}
		$max_files = max( 1, (int) ( $field['max_files'] ?? 1 ) );
		if ( count( $files ) > $max_files ) {
			return array( array(), sprintf( /* translators: %d: count */ __( 'You can upload at most %d file(s).', 'weberslink-forms-pro' ), $max_files ) );
		}
		$allowed = array_filter( array_map( 'trim', explode( ',', strtolower( (string) ( $field['allowed'] ?? '' ) ) ) ) );
		$allowed = array_values( array_diff( $allowed, self::blocked() ) );
		if ( 'image' === $field['type'] ) {
			$allowed = array_values( array_intersect( $allowed ? $allowed : array( 'jpg', 'jpeg', 'png', 'gif', 'webp' ), array( 'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif' ) ) );
		}
		$max_bytes = (float) ( $field['max_size'] ?? 5 ) * 1024 * 1024;
		$sys_mimes = get_allowed_mime_types();
		$mimes     = array();
		foreach ( $sys_mimes as $ext_re => $mime ) {
			foreach ( explode( '|', $ext_re ) as $e ) {
				if ( in_array( $e, $allowed, true ) ) {
					$mimes[ $ext_re ] = $mime;
				}
			}
		}
		require_once ABSPATH . 'wp-admin/includes/file.php';
		$out = array();
		foreach ( $files as $file ) {
			if ( UPLOAD_ERR_OK !== (int) $file['error'] ) {
				return array( array(), self::err_msg( (int) $file['error'] ) );
			}
			$ext = strtolower( pathinfo( $file['name'], PATHINFO_EXTENSION ) );
			if ( ! $ext || ! in_array( $ext, $allowed, true ) ) {
				return array( array(), sprintf( /* translators: %s: file name */ __( '"%s" is not an allowed file type.', 'weberslink-forms-pro' ), $file['name'] ) );
			}
			if ( $file['size'] > $max_bytes ) {
				return array( array(), sprintf( /* translators: 1: file name 2: MB */ __( '"%1$s" is too large (max %2$s MB).', 'weberslink-forms-pro' ), $file['name'], (float) ( $field['max_size'] ?? 5 ) ) );
			}
			if ( 'image' === $field['type'] && ! @getimagesize( $file['tmp_name'] ) ) { // phpcs:ignore
				return array( array(), sprintf( /* translators: %s: file name */ __( '"%s" is not a valid image.', 'weberslink-forms-pro' ), $file['name'] ) );
			}
			$cb = function ( $dir ) use ( $form ) {
				$u = WLFP_Install::upload_dir();
				$s = '/form-' . (int) $form['id'] . '/' . gmdate( 'Y-m' );
				return array_merge( $dir, array( 'path' => $u['path'] . $s, 'url' => $u['url'] . $s, 'subdir' => $s, 'basedir' => $u['path'], 'baseurl' => $u['url'] ) );
			};
			add_filter( 'upload_dir', $cb );
			WLFP_Install::protect_upload_dir();
			$r = wp_handle_upload( $file, array( 'test_form' => false, 'mimes' => $mimes, 'unique_filename_callback' => function ( $dir, $name, $ext2 ) {
				$base = sanitize_file_name( pathinfo( $name, PATHINFO_FILENAME ) );
				return $base . '-' . wp_generate_password( 8, false, false ) . $ext2;
			} ) );
			remove_filter( 'upload_dir', $cb );
			if ( isset( $r['error'] ) ) {
				return array( array(), $r['error'] );
			}
			$out[] = array( 'name' => sanitize_file_name( $file['name'] ), 'url' => esc_url_raw( $r['url'] ), 'path' => $r['file'], 'size' => (int) $file['size'], 'type' => $r['type'] );
		}
		return array( $out, '' );
	}

	public static function err_msg( $code ) {
		switch ( $code ) {
			case UPLOAD_ERR_INI_SIZE:
			case UPLOAD_ERR_FORM_SIZE:
				return __( 'The uploaded file is larger than the server allows.', 'weberslink-forms-pro' );
			case UPLOAD_ERR_PARTIAL:
				return __( 'The file was only partially uploaded. Please try again.', 'weberslink-forms-pro' );
			default:
				return __( 'File upload failed. Please try again.', 'weberslink-forms-pro' );
		}
	}

	public static function delete_files( $files ) {
		$base = realpath( WLFP_Install::upload_dir()['path'] );
		foreach ( (array) $files as $f ) {
			if ( is_array( $f ) && ! empty( $f['path'] ) && $base ) {
				$real = realpath( $f['path'] );
				if ( $real && 0 === strpos( $real, $base . DIRECTORY_SEPARATOR ) && is_file( $real ) ) {
					@unlink( $real ); // phpcs:ignore
				}
			}
		}
	}
}
