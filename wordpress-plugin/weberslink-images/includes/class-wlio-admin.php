<?php
defined( 'ABSPATH' ) || exit;

class WLIO_Admin {

	public static function init() {
		add_action( 'admin_menu', array( __CLASS__, 'menu' ) );
		add_action( 'admin_init', array( __CLASS__, 'register' ) );
		add_action( 'admin_enqueue_scripts', array( __CLASS__, 'assets' ) );
		add_action( 'wp_ajax_wlio_bulk', array( __CLASS__, 'ajax_bulk' ) );
		add_action( 'admin_post_wlio_one', array( __CLASS__, 'one' ) );
		add_filter( 'manage_media_columns', function ( $c ) {
			$c['wlio'] = __( 'Optimization', 'weberslink-images' );
			return $c;
		} );
		add_action( 'manage_media_custom_column', array( __CLASS__, 'column' ), 10, 2 );
		add_filter( 'plugin_action_links_' . plugin_basename( WLIO_FILE ), function ( $l ) {
			array_unshift( $l, '<a href="' . esc_url( admin_url( 'upload.php?page=wlio' ) ) . '">' . esc_html__( 'Optimize', 'weberslink-images' ) . '</a>' );
			return $l;
		} );
	}

	public static function menu() {
		add_media_page( __( 'Image Optimizer', 'weberslink-images' ), __( 'Image Optimizer', 'weberslink-images' ), 'manage_options', 'wlio', array( __CLASS__, 'page' ) );
	}

	public static function register() {
		register_setting( 'wlio_group', WLIO_Settings::OPTION, array( 'sanitize_callback' => function ( $in ) {
			return WLIO_Settings::sanitize( is_array( $in ) ? wp_unslash( $in ) : array() );
		} ) );
	}

	public static function assets( $hook ) {
		if ( 'media_page_wlio' === $hook ) {
			wp_enqueue_style( 'wlio-admin', WLIO_URL . 'assets/admin.css', array(), WLIO_VERSION );
			wp_enqueue_script( 'wlio-admin', WLIO_URL . 'assets/admin.js', array(), WLIO_VERSION, true );
			wp_localize_script( 'wlio-admin', 'WLIO', array( 'ajax' => admin_url( 'admin-ajax.php' ), 'nonce' => wp_create_nonce( 'wlio_bulk' ), 'todo' => WLIO_Media::totals()['todo'] ) );
		}
		if ( 'upload.php' === $hook ) {
			wp_enqueue_style( 'wlio-admin', WLIO_URL . 'assets/admin.css', array(), WLIO_VERSION );
		}
	}

	public static function column( $col, $id ) {
		if ( 'wlio' !== $col ) {
			return;
		}
		if ( ! in_array( get_post_mime_type( $id ), WLIO_Media::MIMES, true ) ) {
			echo '—';
			return;
		}
		$m = get_post_meta( $id, WLIO_Media::META, true );
		if ( is_array( $m ) ) {
			$saved = max( 0, (int) $m['before'] - (int) $m['after'] );
			$pct   = $m['before'] ? round( 100 * $saved / $m['before'] ) : 0;
			echo '<span class="wlio-ok">' . esc_html( sprintf( /* translators: 1: percent 2: size */ __( '−%1$d%% (%2$s saved)', 'weberslink-images' ), $pct, WLIO_Engine::human( $saved ) ) ) . '</span>' . ( ! empty( $m['webp_files'] ) ? '<br><span class="wlio-webp">WebP ✓</span>' : '' );
			$restore = wp_nonce_url( admin_url( 'admin-post.php?action=wlio_one&do=restore&id=' . (int) $id ), 'wlio_one_' . (int) $id );
			echo '<br><a href="' . esc_url( $restore ) . '">' . esc_html__( 'Restore original', 'weberslink-images' ) . '</a>';
		} else {
			echo '<span class="wlio-no">' . esc_html__( 'Not optimized', 'weberslink-images' ) . '</span><br><a href="' . esc_url( wp_nonce_url( admin_url( 'admin-post.php?action=wlio_one&do=optimize&id=' . (int) $id ), 'wlio_one_' . (int) $id ) ) . '">' . esc_html__( 'Optimize now', 'weberslink-images' ) . '</a>';
		}
	}

	public static function one() {
		$id = isset( $_GET['id'] ) ? (int) $_GET['id'] : 0; // phpcs:ignore
		if ( ! current_user_can( 'upload_files' ) || ! $id || ! current_user_can( 'edit_post', $id ) ) {
			wp_die( esc_html__( 'You do not have permission to do this.', 'weberslink-images' ), '', array( 'response' => 403 ) );
		}
		check_admin_referer( 'wlio_one_' . $id );
		$do = isset( $_GET['do'] ) ? sanitize_key( $_GET['do'] ) : ''; // phpcs:ignore
		if ( 'restore' === $do ) {
			WLIO_Media::restore( $id );
		} elseif ( 'optimize' === $do ) {
			$meta = wp_get_attachment_metadata( $id );
			wp_update_attachment_metadata( $id, WLIO_Media::process( $id, is_array( $meta ) ? $meta : array(), true ) );
		}
		wp_safe_redirect( wp_get_referer() ? wp_get_referer() : admin_url( 'upload.php' ) );
		exit;
	}

	/** One small batch per request so even slow hosts never time out. */
	public static function ajax_bulk() {
		check_ajax_referer( 'wlio_bulk', 'nonce' );
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( null, 403 );
		}
		$done = 0;
		foreach ( WLIO_Media::next_ids( 3 ) as $id ) {
			$meta = wp_get_attachment_metadata( $id );
			wp_update_attachment_metadata( $id, WLIO_Media::process( $id, is_array( $meta ) ? $meta : array(), true ) );
			if ( ! get_post_meta( $id, WLIO_Media::META, true ) ) {
				update_post_meta( $id, WLIO_Media::META, array( 'before' => 0, 'after' => 0, 'webp' => 0, 'webp_files' => 0, 'resized' => false, 'time' => time() ) ); // file missing or unsupported: do not retry forever
				update_post_meta( $id, WLIO_Media::SAVED, 0 );
			}
			$done++;
		}
		$t = WLIO_Media::totals();
		wp_send_json_success( array( 'processed' => $done, 'todo' => $t['todo'], 'done' => $t['done'], 'all' => $t['all'], 'saved' => WLIO_Engine::human( $t['saved'] ) ) );
	}

	public static function page() {
		$s    = WLIO_Settings::all();
		$name = WLIO_Settings::OPTION;
		$t    = WLIO_Media::totals();
		$chk  = function ( $k, $label, $help = '' ) use ( $s, $name ) {
			echo '<tr><th scope="row">' . esc_html( $label ) . '</th><td><label><input type="checkbox" name="' . esc_attr( $name . '[' . $k . ']' ) . '" value="1"' . checked( ! empty( $s[ $k ] ), true, false ) . ' /> ' . esc_html( $help ) . '</label></td></tr>';
		};
		$num  = function ( $k, $label, $suffix = '', $min = 0, $max = 10000 ) use ( $s, $name ) {
			echo '<tr><th scope="row"><label for="wlio_' . esc_attr( $k ) . '">' . esc_html( $label ) . '</label></th><td><input type="number" class="small-text" min="' . (int) $min . '" max="' . (int) $max . '" id="wlio_' . esc_attr( $k ) . '" name="' . esc_attr( $name . '[' . $k . ']' ) . '" value="' . esc_attr( $s[ $k ] ) . '" /> ' . esc_html( $suffix ) . '</td></tr>';
		};
		echo '<div class="wrap wlio"><h1>' . esc_html__( 'Image Optimizer', 'weberslink-images' ) . '</h1>';
		if ( isset( $_GET['settings-updated'] ) ) { // phpcs:ignore
			echo '<div class="notice notice-success is-dismissible"><p>' . esc_html__( 'Settings saved.', 'weberslink-images' ) . '</p></div>';
		}
		if ( ! WLIO_Engine::available() ) {
			echo '<div class="notice notice-error"><p>' . esc_html__( 'The PHP GD library is not installed on this server, so images cannot be optimised. Ask your host to enable it.', 'weberslink-images' ) . '</p></div>';
		} elseif ( ! WLIO_Engine::can_webp() ) {
			echo '<div class="notice notice-warning"><p>' . esc_html__( 'This server\'s GD library cannot write WebP. Images are still compressed, but no WebP versions are made.', 'weberslink-images' ) . '</p></div>';
		}
		echo '<div class="wlio-stats"><div class="wlio-stat"><strong>' . esc_html( WLIO_Engine::human( $t['saved'] ) ) . '</strong><span>' . esc_html__( 'Saved so far', 'weberslink-images' ) . '</span></div><div class="wlio-stat"><strong>' . (int) $t['done'] . ' / ' . (int) $t['all'] . '</strong><span>' . esc_html__( 'Images optimised', 'weberslink-images' ) . '</span></div></div>';
		echo '<div class="wlio-card"><h2>' . esc_html__( 'Optimise your existing media library', 'weberslink-images' ) . '</h2><p>' . esc_html( sprintf( /* translators: %d: count */ _n( '%d image is waiting.', '%d images are waiting.', $t['todo'], 'weberslink-images' ), $t['todo'] ) ) . ' ' . esc_html__( 'It works in small steps, so you can leave this page open and keep your site responsive.', 'weberslink-images' ) . '</p><p><button type="button" class="button button-primary" id="wlio-start"' . ( $t['todo'] && WLIO_Engine::available() ? '' : ' disabled' ) . '>' . esc_html__( 'Optimise all images', 'weberslink-images' ) . '</button> <button type="button" class="button" id="wlio-stop" hidden>' . esc_html__( 'Pause', 'weberslink-images' ) . '</button></p><div class="wlio-bar" hidden><span></span></div><p class="wlio-msg" aria-live="polite"></p></div>';
		echo '<form method="post" action="options.php">';
		settings_fields( 'wlio_group' );
		echo '<h2>' . esc_html__( 'Settings', 'weberslink-images' ) . '</h2><table class="form-table"><tbody>';
		$chk( 'auto', __( 'Optimise on upload', 'weberslink-images' ), __( 'Compress every new image automatically', 'weberslink-images' ) );
		$num( 'jpeg_quality', __( 'JPEG quality', 'weberslink-images' ), __( '40–100. 80–85 is visually the same as the original for most photos.', 'weberslink-images' ), 40, 100 );
		$chk( 'png', __( 'Recompress PNG', 'weberslink-images' ), __( 'Lossless: same pixels, smaller file', 'weberslink-images' ) );
		$num( 'max_width', __( 'Maximum width', 'weberslink-images' ), __( 'pixels (0 = never resize). Huge camera photos are scaled down; thumbnails are not touched.', 'weberslink-images' ) );
		$num( 'max_height', __( 'Maximum height', 'weberslink-images' ), __( 'pixels (0 = never resize)', 'weberslink-images' ) );
		$chk( 'webp', __( 'Create WebP versions', 'weberslink-images' ), __( 'About 25–35% smaller than JPEG for the same look', 'weberslink-images' ) );
		$num( 'webp_quality', __( 'WebP quality', 'weberslink-images' ), '', 40, 100 );
		$chk( 'serve_webp', __( 'Serve WebP automatically', 'weberslink-images' ), __( 'Wrap images in a <picture> tag so each browser takes the best format. No server rules, safe with caching.', 'weberslink-images' ) );
		$chk( 'backup', __( 'Keep originals', 'weberslink-images' ), __( 'Store the original upload so you can restore it from the media library (uses extra disk space)', 'weberslink-images' ) );
		echo '</tbody></table><p class="description">' . esc_html__( 'Photos are always turned upright and stripped of camera metadata (such as GPS location) when they are optimised.', 'weberslink-images' ) . '</p>';
		submit_button();
		echo '</form><p class="description">' . esc_html__( 'Tip: optimising the same image again never makes it worse: files already at your quality are skipped.', 'weberslink-images' ) . '</p></div>';
	}
}
