<?php
defined( 'ABSPATH' ) || exit;

/** Failed-login limiting, address allow/block lists and generic login errors. */
class WLSS_Login {

	public static function init() {
		add_filter( 'authenticate', array( __CLASS__, 'final_check' ), 99, 3 );
		add_action( 'wp_login_failed', array( __CLASS__, 'on_fail' ), 10, 2 );
		add_action( 'wp_login', array( __CLASS__, 'on_success' ), 10, 2 );
	}

	public static function ip() {
		return WLSS_Ip::client( $_SERVER, (string) WLSS_Settings::get( 'proxy_header' ) ); // phpcs:ignore
	}

	private static function key( $ip ) {
		return 'wlss_s_' . md5( $ip );
	}

	public static function state( $ip ) {
		$s = get_transient( self::key( $ip ) );
		return is_array( $s ) ? array_merge( WLSS_Limiter::fresh(), $s ) : WLSS_Limiter::fresh();
	}

	private static function save( $ip, $state, $cfg ) {
		set_transient( self::key( $ip ), $state, max( (int) $cfg['window_min'] * 60, 86400 ) + 3600 );
	}

	/**
	 * Runs last on the "authenticate" filter. WordPress core only stops at a WP_User result, so the block has to
	 * come after the password check: a locked or blocked address is refused even with the right password.
	 */
	public static function final_check( $user, $username = '', $password = '' ) {
		if ( '' === (string) $username && '' === (string) $password ) {
			return $user;
		}
		$cfg = WLSS_Settings::all();
		$ip  = self::ip();
		if ( WLSS_Ip::in_list( $ip, $cfg['allow_ips'] ) ) {
			return $user;
		}
		if ( WLSS_Ip::in_list( $ip, $cfg['block_ips'] ) ) {
			if ( ! get_transient( 'wlss_b_' . md5( $ip ) ) ) {
				set_transient( 'wlss_b_' . md5( $ip ), 1, HOUR_IN_SECONDS );
				WLSS_Log::event( 'blocked', (string) $username, 'login attempt from a blocked address', $ip );
			}
			return new WP_Error( 'wlss_blocked', __( 'Access from your address is blocked.', 'weberslink-security' ) );
		}
		if ( ! empty( $cfg['limit_enabled'] ) ) {
			$st = self::state( $ip );
			if ( WLSS_Limiter::is_locked( $st, time() ) ) {
				return new WP_Error( 'wlss_locked', sprintf( /* translators: %d: minutes */ __( 'Too many failed attempts. Try again in %d minute(s).', 'weberslink-security' ), max( 1, (int) ceil( WLSS_Limiter::seconds_left( $st, time() ) / 60 ) ) ) );
			}
		}
		if ( ! empty( $cfg['generic_errors'] ) && is_wp_error( $user ) && array_intersect( array( 'invalid_username', 'incorrect_password', 'invalid_email' ), $user->get_error_codes() ) ) {
			return new WP_Error( 'incorrect_password', __( '<strong>Error:</strong> Invalid login details.', 'weberslink-security' ) );
		}
		return $user;
	}

	public static function on_fail( $username, $error = null ) {
		$cfg = WLSS_Settings::all();
		$ip  = self::ip();
		if ( WLSS_Ip::in_list( $ip, $cfg['allow_ips'] ) || WLSS_Ip::in_list( $ip, $cfg['block_ips'] ) ) {
			return;
		}
		$code = is_wp_error( $error ) ? $error->get_error_code() : '';
		if ( 'wlss_locked' === $code ) {
			return; // already locked: do not extend or re-log
		}
		WLSS_Log::event( 'login_failed', (string) $username, $code, $ip );
		if ( empty( $cfg['limit_enabled'] ) ) {
			return;
		}
		list( $st, $locked ) = WLSS_Limiter::fail( self::state( $ip ), time(), $cfg );
		self::save( $ip, $st, $cfg );
		if ( $locked ) {
			$mins = (int) round( WLSS_Limiter::seconds_left( $st, time() ) / 60 );
			WLSS_Log::event( 'lockout', (string) $username, sprintf( 'locked for %d min after %d failed attempts', $mins, (int) $cfg['max_attempts'] ), $ip );
			self::alert( $ip, (string) $username, $mins );
		}
	}

	public static function on_success( $login, $user ) {
		$ip  = self::ip();
		$cfg = WLSS_Settings::all();
		self::save( $ip, WLSS_Limiter::success( self::state( $ip ) ), $cfg );
		WLSS_Log::event( 'login_ok', (string) $login, '', $ip );
	}

	/** Email the site admin about a lockout (at most one email every 15 minutes). */
	private static function alert( $ip, $user, $mins ) {
		if ( ! WLSS_Settings::get( 'lock_alert' ) || get_transient( 'wlss_alert' ) ) {
			return;
		}
		set_transient( 'wlss_alert', 1, 15 * MINUTE_IN_SECONDS );
		$site = wp_specialchars_decode( get_bloginfo( 'name' ), ENT_QUOTES );
		wp_mail( get_option( 'admin_email' ), sprintf( /* translators: %s: site */ __( '[%s] Login lockout', 'weberslink-security' ), $site ), sprintf( /* translators: 1: ip 2: user 3: minutes */ __( "The address %1\$s was locked out for %3\$d minute(s) after repeated failed logins (last username tried: %2\$s).\n\nSee Security Shield → Activity log for details. Further lockouts in the next 15 minutes will not send another email.", 'weberslink-security' ), $ip, $user, $mins ) );
	}

	/** Remove every lock and counter. */
	public static function clear_all() {
		global $wpdb;
		$wpdb->query( "DELETE FROM {$wpdb->options} WHERE option_name LIKE '\\_transient\\_wlss\\_s\\_%' OR option_name LIKE '\\_transient\\_timeout\\_wlss\\_s\\_%'" ); // phpcs:ignore
	}
}
