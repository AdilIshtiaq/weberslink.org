<?php
defined( 'ABSPATH' ) || exit;

/** One-click hardening switches. */
class WLSS_Hardening {

	public static function init() {
		$s = WLSS_Settings::all();
		if ( $s['disable_xmlrpc'] ) {
			add_filter( 'xmlrpc_enabled', '__return_false' );
			add_filter( 'wp_headers', function ( $h ) {
				unset( $h['X-Pingback'] );
				return $h;
			} );
		}
		if ( $s['hide_version'] ) {
			remove_action( 'wp_head', 'wp_generator' );
			add_filter( 'the_generator', '__return_empty_string' );
		}
		if ( $s['block_enum'] ) {
			add_action( 'init', array( __CLASS__, 'block_author_scan' ), 0 );
			add_filter( 'rest_endpoints', array( __CLASS__, 'hide_rest_users' ) );
			add_filter( 'wp_sitemaps_add_provider', function ( $p, $name ) {
				return 'users' === $name ? false : $p;
			}, 10, 2 );
		}
		if ( $s['disable_editors'] ) {
			add_filter( 'map_meta_cap', array( __CLASS__, 'no_editors' ), 10, 2 );
		}
		if ( $s['send_headers'] ) {
			add_action( 'send_headers', array( __CLASS__, 'headers' ) );
		}
		if ( $s['no_app_passwords'] ) {
			add_filter( 'wp_is_application_passwords_available', '__return_false' );
		}
		if ( $s['strong_passwords'] ) {
			add_action( 'user_profile_update_errors', array( __CLASS__, 'profile_password' ), 10, 3 );
			add_action( 'validate_password_reset', array( __CLASS__, 'reset_password' ), 10, 2 );
		}
	}

	public static function block_author_scan() {
		if ( ! is_admin() && ! is_user_logged_in() && isset( $_GET['author'] ) && preg_match( '/^\d+$/', (string) $_GET['author'] ) ) { // phpcs:ignore
			wp_safe_redirect( home_url( '/' ), 301 );
			exit;
		}
	}

	public static function hide_rest_users( $endpoints ) {
		if ( ! current_user_can( 'list_users' ) ) {
			foreach ( array_keys( $endpoints ) as $route ) {
				if ( preg_match( '#^/wp/v2/users(/|$)#', $route ) && ! preg_match( '#/me$#', $route ) ) {
					unset( $endpoints[ $route ] );
				}
			}
		}
		return $endpoints;
	}

	public static function no_editors( $caps, $cap ) {
		return in_array( $cap, array( 'edit_themes', 'edit_plugins', 'edit_files' ), true ) ? array( 'do_not_allow' ) : $caps;
	}

	public static function headers() {
		if ( headers_sent() ) {
			return;
		}
		header( 'X-Content-Type-Options: nosniff' );
		header( 'X-Frame-Options: SAMEORIGIN' );
		header( 'Referrer-Policy: strict-origin-when-cross-origin' );
		header( 'Permissions-Policy: geolocation=(), camera=(), microphone=()' );
		if ( WLSS_Settings::get( 'hsts' ) && is_ssl() ) {
			header( 'Strict-Transport-Security: max-age=31536000' );
		}
	}

	public static function profile_password( $errors, $update, $user ) {
		if ( ! empty( $user->user_pass ) ) {
			$msg = WLSS_Password::check( $user->user_pass, isset( $user->user_login ) ? $user->user_login : '', isset( $user->user_email ) ? $user->user_email : '' );
			if ( '' !== $msg ) {
				$errors->add( 'wlss_weak', '<strong>' . esc_html__( 'Password too weak:', 'weberslink-security' ) . '</strong> ' . esc_html( $msg ) );
			}
		}
	}

	public static function reset_password( $errors, $user ) {
		$pw = isset( $_POST['pass1'] ) ? wp_unslash( $_POST['pass1'] ) : ''; // phpcs:ignore
		if ( '' !== $pw ) {
			$msg = WLSS_Password::check( $pw, $user ? $user->user_login : '', $user ? $user->user_email : '' );
			if ( '' !== $msg ) {
				$errors->add( 'wlss_weak', '<strong>' . esc_html__( 'Password too weak:', 'weberslink-security' ) . '</strong> ' . esc_html( $msg ) );
			}
		}
	}
}
