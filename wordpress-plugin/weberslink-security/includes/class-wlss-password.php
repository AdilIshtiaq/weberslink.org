<?php
defined( 'ABSPATH' ) || exit;

/** Password strength policy (pure). */
class WLSS_Password {

	const COMMON = array( 'password', 'password1', 'password123', '123456789', '1234567890', 'qwertyuiop', 'iloveyou', 'admin123', 'welcome123', 'letmein', 'abc123456', 'changeme', 'passw0rd' );

	/** Returns '' when acceptable, otherwise a message. */
	public static function check( $pw, $username = '', $email = '' ) {
		$pw = (string) $pw;
		if ( strlen( $pw ) < 12 ) {
			return 'Use at least 12 characters.';
		}
		$low = strtolower( $pw );
		foreach ( self::COMMON as $c ) {
			if ( false !== strpos( $low, $c ) ) {
				return 'That password is too common.';
			}
		}
		$user = strtolower( (string) $username );
		if ( strlen( $user ) >= 3 && false !== strpos( $low, $user ) ) {
			return 'The password must not contain your username.';
		}
		$local = strtolower( strtok( (string) $email, '@' ) );
		if ( strlen( $local ) >= 4 && false !== strpos( $low, $local ) ) {
			return 'The password must not contain your email name.';
		}
		$classes = (int) preg_match( '/[a-z]/', $pw ) + (int) preg_match( '/[A-Z]/', $pw ) + (int) preg_match( '/\d/', $pw ) + (int) preg_match( '/[^a-zA-Z\d]/', $pw );
		if ( $classes < 3 ) {
			return 'Mix at least three of: lower-case, upper-case, numbers and symbols.';
		}
		if ( preg_match( '/^(.)\1+$/', $pw ) || count( array_unique( str_split( $low ) ) ) < 6 ) {
			return 'That password is too repetitive.';
		}
		return '';
	}
}
