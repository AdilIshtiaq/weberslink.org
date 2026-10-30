<?php
defined( 'ABSPATH' ) || exit;

class WLPOP_Front {

	public static function init() {
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'assets' ) );
	}

	/** Popups allowed on this request. */
	public static function eligible() {
		$path = isset( $_SERVER['REQUEST_URI'] ) ? wp_unslash( $_SERVER['REQUEST_URI'] ) : '/'; // phpcs:ignore
		$ctx  = array( 'path' => (string) wp_parse_url( $path, PHP_URL_PATH ), 'is_home' => is_front_page() || is_home(), 'logged_in' => is_user_logged_in(), 'today' => current_time( 'Y-m-d' ) );
		$out  = array();
		foreach ( WLPOP_Store::all() as $p ) {
			$p = array_merge( WLPOP_Store::defaults(), $p );
			if ( '' !== $p['id'] && WLPOP_Rules::matches( $p, $ctx ) ) {
				$out[] = WLPOP_Rules::public_view( $p );
			}
		}
		// Admins can preview any popup straight away: ?wlpop_preview=ID
		if ( isset( $_GET['wlpop_preview'] ) && current_user_can( 'manage_options' ) ) { // phpcs:ignore
			$p = WLPOP_Store::get( sanitize_key( wp_unslash( $_GET['wlpop_preview'] ) ) ); // phpcs:ignore
			if ( $p ) {
				$v            = WLPOP_Rules::public_view( $p );
				$v['preview'] = true;
				$out          = array( $v );
			}
		}
		return $out;
	}

	public static function assets() {
		if ( is_admin() || is_feed() ) {
			return;
		}
		$list = self::eligible();
		if ( ! $list ) {
			return;
		}
		wp_enqueue_style( 'wlpop', WLPOP_URL . 'assets/popup.css', array(), WLPOP_VERSION );
		wp_enqueue_script( 'wlpop', WLPOP_URL . 'assets/popup.js', array(), WLPOP_VERSION, true );
		wp_localize_script( 'wlpop', 'WLPOP', array( 'lead' => esc_url_raw( rest_url( 'wlpop/v1/lead' ) ), 'event' => esc_url_raw( rest_url( 'wlpop/v1/event' ) ), 'popups' => $list, 'i18n' => array( 'close' => __( 'Close', 'weberslink-popups' ), 'name' => __( 'Your name', 'weberslink-popups' ), 'email' => __( 'Your email', 'weberslink-popups' ), 'error' => __( 'Something went wrong. Please try again.', 'weberslink-popups' ), 'sending' => __( 'Sending…', 'weberslink-popups' ) ) ) );
	}
}
