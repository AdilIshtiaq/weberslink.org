<?php
defined( 'ABSPATH' ) || exit;

/** Two-factor login with an authenticator app (TOTP) and one-time recovery codes. */
class WLSS_TwoFactor {

	public static function init() {
		add_action( 'login_form', array( __CLASS__, 'login_field' ) );
		add_filter( 'authenticate', array( __CLASS__, 'authenticate' ), 50, 3 );
		add_action( 'show_user_profile', array( __CLASS__, 'profile' ) );
		add_action( 'edit_user_profile', array( __CLASS__, 'profile' ) );
		foreach ( array( 'start', 'enable', 'disable' ) as $a ) {
			add_action( 'admin_post_wlss_2fa_' . $a, array( __CLASS__, $a ) );
		}
		add_action( 'admin_notices', array( __CLASS__, 'nag' ) );
	}

	/* ---------- secret storage ---------- */

	private static function key() {
		return substr( hash( 'sha256', wp_salt( 'auth' ) . wp_salt( 'secure_auth' ) . 'wlss-2fa', true ), 0, 32 );
	}

	public static function encrypt( $plain ) {
		if ( ! function_exists( 'sodium_crypto_secretbox' ) ) {
			return 'p:' . $plain;
		}
		$n = random_bytes( SODIUM_CRYPTO_SECRETBOX_NONCEBYTES );
		return 'v1:' . base64_encode( $n . sodium_crypto_secretbox( $plain, $n, self::key() ) ); // phpcs:ignore
	}

	public static function decrypt( $stored ) {
		$stored = (string) $stored;
		if ( 0 === strpos( $stored, 'p:' ) ) {
			return substr( $stored, 2 );
		}
		if ( 0 !== strpos( $stored, 'v1:' ) || ! function_exists( 'sodium_crypto_secretbox_open' ) ) {
			return '';
		}
		$raw = base64_decode( substr( $stored, 3 ), true ); // phpcs:ignore
		if ( false === $raw || strlen( $raw ) <= SODIUM_CRYPTO_SECRETBOX_NONCEBYTES ) {
			return '';
		}
		$p = sodium_crypto_secretbox_open( substr( $raw, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES ), substr( $raw, 0, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES ), self::key() );
		return false === $p ? '' : $p;
	}

	public static function secret( $uid ) {
		return self::decrypt( get_user_meta( $uid, 'wlss_totp', true ) );
	}

	public static function is_on( $uid ) {
		return '' !== self::secret( $uid );
	}

	/* ---------- recovery codes ---------- */

	public static function new_codes( $n = 8 ) {
		$out = array();
		for ( $i = 0; $i < $n; $i++ ) {
			$raw   = strtolower( substr( WLSS_Totp::b32_encode( random_bytes( 7 ) ), 0, 10 ) );
			$out[] = substr( $raw, 0, 5 ) . '-' . substr( $raw, 5, 5 );
		}
		return $out;
	}

	public static function hash_code( $code ) {
		return hash_hmac( 'sha256', strtolower( str_replace( array( ' ', '-' ), '', $code ) ), wp_salt( 'auth' ) );
	}

	/** True (and the code is used up) when $input is an unused recovery code. */
	private static function use_recovery( $uid, $input ) {
		$hashes = (array) get_user_meta( $uid, 'wlss_recovery', true );
		$h      = self::hash_code( $input );
		foreach ( $hashes as $i => $x ) {
			if ( hash_equals( (string) $x, $h ) ) {
				unset( $hashes[ $i ] );
				update_user_meta( $uid, 'wlss_recovery', array_values( $hashes ) );
				return true;
			}
		}
		return false;
	}

	/* ---------- login ---------- */

	public static function login_field() {
		if ( ! WLSS_Settings::get( 'tfa_enabled' ) ) {
			return;
		}
		echo '<p><label for="wlss_code">' . esc_html__( 'Authentication code', 'weberslink-security' ) . ' <span style="color:#646970;font-weight:400">' . esc_html__( '(only if you turned on two-factor)', 'weberslink-security' ) . '</span><br><input type="text" name="wlss_code" id="wlss_code" class="input" value="" size="20" inputmode="numeric" autocomplete="one-time-code" /></label></p>';
	}

	public static function authenticate( $user, $username = '', $password = '' ) {
		if ( ! ( $user instanceof WP_User ) || ! WLSS_Settings::get( 'tfa_enabled' ) || ( defined( 'XMLRPC_REQUEST' ) && XMLRPC_REQUEST ) || ( defined( 'REST_REQUEST' ) && REST_REQUEST ) ) {
			return $user; // application passwords are separate credentials and skip the code
		}
		$secret = self::secret( $user->ID );
		if ( '' === $secret ) {
			return $user;
		}
		$code = isset( $_POST['wlss_code'] ) ? trim( sanitize_text_field( wp_unslash( $_POST['wlss_code'] ) ) ) : ''; // phpcs:ignore
		if ( '' === $code ) {
			return new WP_Error( 'wlss_2fa', __( '<strong>Error:</strong> Enter the code from your authenticator app, or a recovery code.', 'weberslink-security' ) );
		}
		if ( preg_match( '/^\d{6}$/', preg_replace( '/\s+/', '', $code ) ) ) {
			$ctr = WLSS_Totp::verify( $secret, $code, time(), (int) get_user_meta( $user->ID, 'wlss_totp_last', true ) );
			if ( false !== $ctr ) {
				update_user_meta( $user->ID, 'wlss_totp_last', $ctr ); // a code works once
				return $user;
			}
		} elseif ( self::use_recovery( $user->ID, $code ) ) {
			WLSS_Log::event( 'tfa_recovery', $user->user_login, count( (array) get_user_meta( $user->ID, 'wlss_recovery', true ) ) . ' left' );
			return $user;
		}
		WLSS_Log::event( 'tfa_failed', $user->user_login );
		return new WP_Error( 'wlss_2fa', __( '<strong>Error:</strong> That authentication code is not valid.', 'weberslink-security' ) );
	}

	/* ---------- profile UI ---------- */

	private static function back( $uid, $msg, $type = 'success' ) {
		$url = get_current_user_id() === (int) $uid ? admin_url( 'profile.php' ) : admin_url( 'user-edit.php?user_id=' . (int) $uid );
		wp_safe_redirect( add_query_arg( array( 'wlss_msg' => rawurlencode( $msg ), 'wlss_t' => $type ), $url ) . '#wlss-2fa' );
		exit;
	}

	private static function guard( $uid, $own_only = false ) {
		check_admin_referer( 'wlss_2fa_' . $uid );
		if ( ! current_user_can( 'edit_user', $uid ) || ( $own_only && get_current_user_id() !== (int) $uid ) ) {
			wp_die( esc_html__( 'You do not have permission to do this.', 'weberslink-security' ), '', array( 'response' => 403 ) );
		}
	}

	public static function profile( $user ) {
		if ( ! WLSS_Settings::get( 'tfa_enabled' ) ) {
			return;
		}
		$uid  = (int) $user->ID;
		$own  = get_current_user_id() === $uid;
		$non  = wp_nonce_field( 'wlss_2fa_' . $uid, '_wpnonce', true, false );
		$post = esc_url( admin_url( 'admin-post.php' ) );
		echo '<h2 id="wlss-2fa">' . esc_html__( 'Two-factor authentication', 'weberslink-security' ) . '</h2>';
		if ( isset( $_GET['wlss_msg'] ) ) { // phpcs:ignore
			echo '<div class="notice notice-' . ( isset( $_GET['wlss_t'] ) && 'error' === $_GET['wlss_t'] ? 'error' : 'success' ) . ' inline"><p>' . esc_html( sanitize_text_field( wp_unslash( $_GET['wlss_msg'] ) ) ) . '</p></div>'; // phpcs:ignore
		}
		echo '<table class="form-table"><tbody><tr><th>' . esc_html__( 'Status', 'weberslink-security' ) . '</th><td>';
		$codes = $own ? get_transient( 'wlss_codes_' . $uid ) : false;
		if ( $codes ) {
			delete_transient( 'wlss_codes_' . $uid );
			echo '<p><strong>' . esc_html__( 'Two-factor login is on.', 'weberslink-security' ) . '</strong></p><div class="notice notice-warning inline"><p><strong>' . esc_html__( 'Save these recovery codes now. Each works once if you lose your phone. They will not be shown again.', 'weberslink-security' ) . '</strong></p><pre style="font-size:15px;line-height:1.8">' . esc_html( implode( "\n", $codes ) ) . '</pre></div>';
		} elseif ( self::is_on( $uid ) ) {
			echo '<p><strong style="color:#1a7f45">✓ ' . esc_html__( 'On', 'weberslink-security' ) . '</strong> · ' . esc_html( sprintf( /* translators: %d: count */ _n( '%d recovery code left', '%d recovery codes left', count( (array) get_user_meta( $uid, 'wlss_recovery', true ) ), 'weberslink-security' ), count( (array) get_user_meta( $uid, 'wlss_recovery', true ) ) ) ) . '</p>';
			echo '<form method="post" action="' . $post . '">' . $non . '<input type="hidden" name="action" value="wlss_2fa_disable" /><input type="hidden" name="user_id" value="' . $uid . '" />'; // phpcs:ignore
			if ( $own ) {
				echo '<input type="text" name="wlss_code" placeholder="' . esc_attr__( 'Current code or recovery code', 'weberslink-security' ) . '" autocomplete="off" required /> ';
			}
			echo '<button class="button">' . esc_html( $own ? __( 'Turn off two-factor', 'weberslink-security' ) : __( 'Reset this user\'s two-factor', 'weberslink-security' ) ) . '</button></form>';
		} elseif ( $own ) {
			$pend = get_transient( 'wlss_pend_' . $uid );
			if ( $pend ) {
				$uri = WLSS_Totp::uri( $user->user_email, wp_specialchars_decode( get_bloginfo( 'name' ), ENT_QUOTES ), $pend );
				echo '<ol><li>' . esc_html__( 'Open an authenticator app (Google Authenticator, Authy, 1Password, Microsoft Authenticator…) and add an account with this key:', 'weberslink-security' ) . '<br><code style="font-size:16px;letter-spacing:1px;user-select:all">' . esc_html( WLSS_Totp::pretty( $pend ) ) . '</code><br><a href="' . esc_url( $uri, array( 'otpauth' ) ) . '">' . esc_html__( 'On your phone? Tap here to add it automatically.', 'weberslink-security' ) . '</a></li><li>' . esc_html__( 'Type the 6-digit code the app shows to finish:', 'weberslink-security' ) . '</li></ol>';
				echo '<form method="post" action="' . $post . '">' . $non . '<input type="hidden" name="action" value="wlss_2fa_enable" /><input type="hidden" name="user_id" value="' . $uid . '" /><input type="text" name="wlss_code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder="123456" required /> <button class="button button-primary">' . esc_html__( 'Turn on', 'weberslink-security' ) . '</button></form>'; // phpcs:ignore
			} else {
				echo '<p>' . esc_html__( 'Off. Add a second step to your login: a code from your phone.', 'weberslink-security' ) . '</p><form method="post" action="' . $post . '">' . $non . '<input type="hidden" name="action" value="wlss_2fa_start" /><input type="hidden" name="user_id" value="' . $uid . '" /><button class="button button-primary">' . esc_html__( 'Set up two-factor', 'weberslink-security' ) . '</button></form>'; // phpcs:ignore
			}
		} else {
			echo '<p>' . esc_html__( 'Off. Only the user can turn it on from their own profile.', 'weberslink-security' ) . '</p>';
		}
		echo '</td></tr></tbody></table>';
	}

	public static function start() {
		$uid = isset( $_POST['user_id'] ) ? (int) $_POST['user_id'] : 0; // phpcs:ignore
		self::guard( $uid, true );
		set_transient( 'wlss_pend_' . $uid, WLSS_Totp::generate_secret(), 15 * MINUTE_IN_SECONDS );
		self::back( $uid, __( 'Scan or type the key, then enter a code to confirm.', 'weberslink-security' ) );
	}

	public static function enable() {
		$uid = isset( $_POST['user_id'] ) ? (int) $_POST['user_id'] : 0; // phpcs:ignore
		self::guard( $uid, true );
		$pend = get_transient( 'wlss_pend_' . $uid );
		$code = isset( $_POST['wlss_code'] ) ? sanitize_text_field( wp_unslash( $_POST['wlss_code'] ) ) : ''; // phpcs:ignore
		$ctr  = $pend ? WLSS_Totp::verify( $pend, $code, time() ) : false;
		if ( false === $ctr ) {
			self::back( $uid, __( 'That code did not match. Check the key and your phone\'s clock, then try again.', 'weberslink-security' ), 'error' );
		}
		$codes = self::new_codes();
		update_user_meta( $uid, 'wlss_totp', self::encrypt( $pend ) );
		update_user_meta( $uid, 'wlss_totp_last', $ctr );
		update_user_meta( $uid, 'wlss_recovery', array_map( array( __CLASS__, 'hash_code' ), $codes ) );
		delete_transient( 'wlss_pend_' . $uid );
		set_transient( 'wlss_codes_' . $uid, $codes, 5 * MINUTE_IN_SECONDS );
		$u = get_userdata( $uid );
		WLSS_Log::event( 'tfa_on', $u ? $u->user_login : '' );
		self::back( $uid, __( 'Two-factor login is now on.', 'weberslink-security' ) );
	}

	public static function disable() {
		$uid = isset( $_POST['user_id'] ) ? (int) $_POST['user_id'] : 0; // phpcs:ignore
		self::guard( $uid );
		$own = get_current_user_id() === $uid;
		if ( $own ) {
			$code = isset( $_POST['wlss_code'] ) ? sanitize_text_field( wp_unslash( $_POST['wlss_code'] ) ) : ''; // phpcs:ignore
			$ok   = false !== WLSS_Totp::verify( self::secret( $uid ), $code, time() ) || self::use_recovery( $uid, $code );
			if ( ! $ok ) {
				self::back( $uid, __( 'Enter a valid current code or recovery code to turn two-factor off.', 'weberslink-security' ), 'error' );
			}
		} elseif ( ! current_user_can( 'edit_users' ) ) {
			wp_die( esc_html__( 'You do not have permission to do this.', 'weberslink-security' ), '', array( 'response' => 403 ) );
		}
		foreach ( array( 'wlss_totp', 'wlss_totp_last', 'wlss_recovery' ) as $k ) {
			delete_user_meta( $uid, $k );
		}
		$u = get_userdata( $uid );
		WLSS_Log::event( 'tfa_off', $u ? $u->user_login : '', $own ? 'by the user' : 'reset by ' . wp_get_current_user()->user_login );
		self::back( $uid, __( 'Two-factor login is now off.', 'weberslink-security' ) );
	}

	/** Gentle reminder for users whose role should use two-factor. */
	public static function nag() {
		if ( ! WLSS_Settings::get( 'tfa_enabled' ) || ! is_user_logged_in() ) {
			return;
		}
		$u = wp_get_current_user();
		if ( ! array_intersect( (array) $u->roles, (array) WLSS_Settings::get( 'tfa_roles' ) ) || self::is_on( $u->ID ) ) {
			return;
		}
		echo '<div class="notice notice-warning"><p>' . wp_kses_post( sprintf( /* translators: %s: link */ __( '<strong>Security Shield:</strong> protect your account with two-factor login. %s', 'weberslink-security' ), '<a href="' . esc_url( admin_url( 'profile.php#wlss-2fa' ) ) . '">' . esc_html__( 'Set it up in 1 minute →', 'weberslink-security' ) . '</a>' ) ) . '</p></div>';
	}
}
