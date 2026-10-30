<?php
defined( 'ABSPATH' ) || exit;

class WLSMTP_Settings {

	const OPTION = 'wlsmtp_settings';

	public static function defaults() {
		return array(
			'enabled'             => 1,
			'provider'            => 'custom',
			'host'                => '',
			'port'                => 587,
			'encryption'          => 'tls', // none | ssl | tls
			'auth'                => 1,
			'user'                => '',
			'pass_enc'            => '',
			'from_email'          => '',
			'from_name'           => '',
			'force_from_email'    => 1,
			'force_from_name'     => 0,
			'return_path'         => 1,
			'timeout'             => 15,
			'verify_cert'         => 1,
			'log_mode'            => 'full', // full | meta | off
			'redact'              => 1,
			'keep_days'           => 30,
			'retry_failed'        => 1,
			'retry_max'           => 3,
			'alert_webhook'       => '',
			'delete_on_uninstall' => 0,
		);
	}

	public static function presets() {
		return array(
			'custom'    => array( 'label' => __( 'Other SMTP server', 'weberslink-smtp' ), 'host' => '', 'port' => 587, 'encryption' => 'tls', 'note' => '' ),
			'gmail'     => array( 'label' => 'Gmail / Google Workspace', 'host' => 'smtp.gmail.com', 'port' => 587, 'encryption' => 'tls', 'note' => __( 'Use your full address as the username and an App Password (Google Account → Security → 2-Step Verification → App passwords), not your normal password.', 'weberslink-smtp' ) ),
			'microsoft' => array( 'label' => 'Microsoft 365 / Outlook', 'host' => 'smtp.office365.com', 'port' => 587, 'encryption' => 'tls', 'note' => __( 'SMTP AUTH must be enabled for the mailbox in the Microsoft 365 admin centre.', 'weberslink-smtp' ) ),
			'sendgrid'  => array( 'label' => 'SendGrid', 'host' => 'smtp.sendgrid.net', 'port' => 587, 'encryption' => 'tls', 'user' => 'apikey', 'note' => __( 'Username is the word apikey; the password is your SendGrid API key.', 'weberslink-smtp' ) ),
			'mailgun'   => array( 'label' => 'Mailgun', 'host' => 'smtp.mailgun.org', 'port' => 587, 'encryption' => 'tls', 'note' => __( 'Use the SMTP credentials of your sending domain (EU accounts: smtp.eu.mailgun.org).', 'weberslink-smtp' ) ),
			'ses'       => array( 'label' => 'Amazon SES', 'host' => 'email-smtp.us-east-1.amazonaws.com', 'port' => 587, 'encryption' => 'tls', 'note' => __( 'Change the region in the host if needed. Use SES SMTP credentials (not your IAM keys) and a verified sender.', 'weberslink-smtp' ) ),
			'brevo'     => array( 'label' => 'Brevo (Sendinblue)', 'host' => 'smtp-relay.brevo.com', 'port' => 587, 'encryption' => 'tls', 'note' => __( 'Use your Brevo SMTP login and an SMTP key as the password.', 'weberslink-smtp' ) ),
			'postmark'  => array( 'label' => 'Postmark', 'host' => 'smtp.postmarkapp.com', 'port' => 587, 'encryption' => 'tls', 'note' => __( 'Username and password are both your Server API token.', 'weberslink-smtp' ) ),
			'zoho'      => array( 'label' => 'Zoho Mail', 'host' => 'smtp.zoho.com', 'port' => 465, 'encryption' => 'ssl', 'note' => __( 'Use an app-specific password if two-factor authentication is on.', 'weberslink-smtp' ) ),
			'mailtrap'  => array( 'label' => 'Mailtrap (testing inbox)', 'host' => 'sandbox.smtp.mailtrap.io', 'port' => 2525, 'encryption' => 'tls', 'note' => __( 'Catches emails in a fake inbox: perfect for staging sites.', 'weberslink-smtp' ) ),
		);
	}

	public static function all() {
		$s = get_option( self::OPTION, array() );
		return array_merge( self::defaults(), is_array( $s ) ? $s : array() );
	}

	public static function get( $key ) {
		$s = self::all();
		return isset( $s[ $key ] ) ? $s[ $key ] : null;
	}

	/* ---------- password storage ---------- */

	/** Authenticated encryption keyed from the site's secret salts (libsodium, bundled with PHP 7.2+). */
	private static function key() {
		$salt = ( defined( 'AUTH_KEY' ) ? AUTH_KEY : '' ) . ( defined( 'SECURE_AUTH_KEY' ) ? SECURE_AUTH_KEY : '' ) . ( defined( 'LOGGED_IN_KEY' ) ? LOGGED_IN_KEY : '' );
		return sodium_crypto_generichash( 'wlsmtp|' . $salt, '', SODIUM_CRYPTO_SECRETBOX_KEYBYTES );
	}

	public static function encrypt( $plain ) {
		if ( '' === (string) $plain ) {
			return '';
		}
		$nonce = random_bytes( SODIUM_CRYPTO_SECRETBOX_NONCEBYTES );
		return 'v1:' . base64_encode( $nonce . sodium_crypto_secretbox( (string) $plain, $nonce, self::key() ) );
	}

	public static function decrypt( $stored ) {
		if ( ! is_string( $stored ) || 0 !== strpos( $stored, 'v1:' ) ) {
			return '';
		}
		$raw = base64_decode( substr( $stored, 3 ), true );
		if ( false === $raw || strlen( $raw ) <= SODIUM_CRYPTO_SECRETBOX_NONCEBYTES ) {
			return '';
		}
		$plain = sodium_crypto_secretbox_open( substr( $raw, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES ), substr( $raw, 0, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES ), self::key() );
		return false === $plain ? '' : $plain;
	}

	/** Password: WLSMTP_PASS constant (wp-config.php) wins over the stored one. */
	public static function password() {
		if ( defined( 'WLSMTP_PASS' ) && '' !== WLSMTP_PASS ) {
			return (string) WLSMTP_PASS;
		}
		return self::decrypt( (string) self::get( 'pass_enc' ) );
	}

	/** Values locked by constants in wp-config.php (host, user, pass, from). */
	public static function constant_overrides() {
		$map = array( 'WLSMTP_HOST' => 'host', 'WLSMTP_PORT' => 'port', 'WLSMTP_USER' => 'user', 'WLSMTP_FROM_EMAIL' => 'from_email', 'WLSMTP_FROM_NAME' => 'from_name' );
		$out = array();
		foreach ( $map as $const => $key ) {
			if ( defined( $const ) && '' !== constant( $const ) ) {
				$out[ $key ] = constant( $const );
			}
		}
		return $out;
	}

	/** Effective settings after constants are applied. */
	public static function effective() {
		return array_merge( self::all(), self::constant_overrides() );
	}

	public static function sanitize( $in, $old ) {
		$d = self::defaults();
		// WordPress sanitises a brand-new option twice (update_option → add_option); make that idempotent.
		if ( isset( $in['pass_enc'] ) && ! isset( $in['pass'] ) ) {
			return array_merge( $d, $in );
		}
		$out = array();
		foreach ( array( 'enabled', 'auth', 'force_from_email', 'force_from_name', 'return_path', 'verify_cert', 'redact', 'retry_failed', 'delete_on_uninstall' ) as $b ) {
			$out[ $b ] = isset( $in[ $b ] ) ? 1 : 0;
		}
		$out['provider']   = isset( $in['provider'], self::presets()[ $in['provider'] ] ) ? $in['provider'] : 'custom';
		$out['host']       = isset( $in['host'] ) ? preg_replace( '/[^A-Za-z0-9.\-:\[\]]/', '', trim( $in['host'] ) ) : '';
		$out['port']       = isset( $in['port'] ) ? max( 1, min( 65535, (int) $in['port'] ) ) : 587;
		$out['encryption'] = isset( $in['encryption'] ) && in_array( $in['encryption'], array( 'none', 'ssl', 'tls' ), true ) ? $in['encryption'] : 'tls';
		$out['user']       = isset( $in['user'] ) ? sanitize_text_field( $in['user'] ) : '';
		$out['from_email'] = isset( $in['from_email'] ) ? sanitize_email( $in['from_email'] ) : '';
		$out['from_name']  = isset( $in['from_name'] ) ? sanitize_text_field( $in['from_name'] ) : '';
		$out['timeout']    = isset( $in['timeout'] ) ? max( 5, min( 60, (int) $in['timeout'] ) ) : 15;
		$out['log_mode']   = isset( $in['log_mode'] ) && in_array( $in['log_mode'], array( 'full', 'meta', 'off' ), true ) ? $in['log_mode'] : 'full';
		$out['keep_days']  = isset( $in['keep_days'] ) ? max( 0, min( 3650, (int) $in['keep_days'] ) ) : 30;
		$out['retry_max']  = isset( $in['retry_max'] ) ? max( 1, min( 3, (int) $in['retry_max'] ) ) : 3;
		$url               = isset( $in['alert_webhook'] ) ? esc_url_raw( trim( $in['alert_webhook'] ) ) : '';
		$out['alert_webhook'] = ( $url && 0 === strpos( $url, 'https://' ) ) ? $url : '';
		// Empty password field = keep the saved one. A single dash clears it.
		$pw = isset( $in['pass'] ) ? (string) $in['pass'] : '';
		if ( '' === $pw ) {
			$out['pass_enc'] = isset( $old['pass_enc'] ) ? $old['pass_enc'] : '';
		} elseif ( '-' === $pw ) {
			$out['pass_enc'] = '';
		} else {
			$out['pass_enc'] = self::encrypt( $pw );
		}
		return array_merge( $d, $out );
	}
}
