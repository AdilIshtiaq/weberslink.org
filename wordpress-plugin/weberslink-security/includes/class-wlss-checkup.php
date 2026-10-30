<?php
defined( 'ABSPATH' ) || exit;

/** Plain-English security check-up. evaluate() is pure: facts + settings in, findings out. */
class WLSS_Checkup {

	/** @return array of array( status ok|warn|bad, title, advice ) */
	public static function evaluate( $f, $s ) {
		$r   = array();
		$add = function ( $status, $title, $advice ) use ( &$r ) {
			$r[] = array( $status, $title, $advice );
		};
		$f   = array_merge( array( 'ssl' => true, 'php' => PHP_VERSION, 'debug_display' => false, 'admin_user' => false, 'admins_total' => 1, 'admins_2fa' => 0, 'file_edit_off' => false, 'updates' => 0, 'users_enum' => false ), $f );

		$add( $f['ssl'] ? 'ok' : 'bad', 'HTTPS', $f['ssl'] ? 'Your site is served over HTTPS.' : 'The site is not using HTTPS. Logins and cookies can be read on the network. Ask your host for a free certificate and switch the site URL to https://.' );
		$add( version_compare( $f['php'], '8.1', '>=' ) ? 'ok' : ( version_compare( $f['php'], '7.4', '>=' ) ? 'warn' : 'bad' ), 'PHP version', 'You run PHP ' . $f['php'] . '. ' . ( version_compare( $f['php'], '8.1', '>=' ) ? 'Supported.' : 'Older versions no longer receive security fixes: upgrade in your hosting panel.' ) );
		$add( $f['debug_display'] ? 'bad' : 'ok', 'Error display', $f['debug_display'] ? 'PHP errors are shown to visitors, which can leak file paths. Set WP_DEBUG_DISPLAY to false.' : 'PHP errors are not shown to visitors.' );
		$add( $f['admin_user'] ? 'bad' : 'ok', 'Administrator username', $f['admin_user'] ? 'A user named "admin" exists: it is the first name attackers try. Create a new administrator with another name and delete this one.' : 'No administrator is called "admin".' );
		$add( ! empty( $s['limit_enabled'] ) ? 'ok' : 'bad', 'Login attempt limiting', ! empty( $s['limit_enabled'] ) ? 'Repeated failed logins lock the address out.' : 'Anyone can try unlimited passwords. Turn on login limiting.' );
		if ( empty( $s['tfa_enabled'] ) ) {
			$add( 'bad', 'Two-factor authentication', 'Two-factor login is switched off in settings.' );
		} elseif ( $f['admins_total'] > 0 && $f['admins_2fa'] >= $f['admins_total'] ) {
			$add( 'ok', 'Two-factor authentication', 'Every administrator uses two-factor login.' );
		} else {
			$add( $f['admins_2fa'] > 0 ? 'warn' : 'bad', 'Two-factor authentication', $f['admins_2fa'] . ' of ' . $f['admins_total'] . ' administrators have turned on two-factor login. A stolen password alone then cannot get in: set it up from each profile page.' );
		}
		$add( ! empty( $s['strong_passwords'] ) ? 'ok' : 'warn', 'Strong passwords', ! empty( $s['strong_passwords'] ) ? 'New passwords must be long and varied.' : 'Weak passwords are allowed. Turn on the password policy.' );
		$add( ! empty( $s['disable_xmlrpc'] ) ? 'ok' : 'warn', 'XML-RPC', ! empty( $s['disable_xmlrpc'] ) ? 'XML-RPC is off, closing a popular brute-force door.' : 'XML-RPC is on. Unless you use the mobile app or Jetpack, switch it off.' );
		$add( ! empty( $s['block_enum'] ) ? 'ok' : 'warn', 'Username discovery', ! empty( $s['block_enum'] ) ? 'Visitors cannot list your usernames.' : 'Usernames can be read from ?author=1 and the REST API. Turn on username protection.' );
		$add( ! empty( $s['generic_errors'] ) ? 'ok' : 'warn', 'Login error messages', ! empty( $s['generic_errors'] ) ? 'The login form never reveals whether a username exists.' : 'Login errors tell attackers which usernames are real. Turn on generic errors.' );
		$add( ( $f['file_edit_off'] || ! empty( $s['disable_editors'] ) ) ? 'ok' : 'warn', 'Theme and plugin editors', ( $f['file_edit_off'] || ! empty( $s['disable_editors'] ) ) ? 'The built-in code editors are disabled.' : 'A stolen admin login can edit PHP files from the dashboard. Disable the editors.' );
		$add( ! empty( $s['send_headers'] ) ? 'ok' : 'warn', 'Security headers', ! empty( $s['send_headers'] ) ? 'Protective browser headers are sent.' : 'Browser protections such as clickjacking prevention are not sent.' );
		$add( 0 === (int) $f['updates'] ? 'ok' : ( $f['updates'] > 5 ? 'bad' : 'warn' ), 'Updates', 0 === (int) $f['updates'] ? 'Everything is up to date.' : $f['updates'] . ' update(s) waiting. Outdated plugins are the most common way sites get hacked.' );
		return $r;
	}

	/** 0-100: ok counts fully, warn half. */
	public static function score( $findings ) {
		if ( ! $findings ) {
			return 0;
		}
		$p = 0;
		foreach ( $findings as $x ) {
			$p += 'ok' === $x[0] ? 1 : ( 'warn' === $x[0] ? 0.5 : 0 );
		}
		return (int) round( 100 * $p / count( $findings ) );
	}
}
