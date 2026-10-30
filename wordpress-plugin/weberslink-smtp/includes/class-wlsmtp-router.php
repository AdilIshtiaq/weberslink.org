<?php
defined( 'ABSPATH' ) || exit;

/** Chooses which connection an email uses: primary, backup, or WordPress's default mailer. */
class WLSMTP_Router {

	/** @param array $mail array( to => list of addresses, subject, from ) */
	public static function decide( $mail, $source, $routes, $backup_ready, $force = '' ) {
		if ( in_array( $force, array( 'primary', 'backup', 'default' ), true ) ) {
			return ( 'backup' === $force && ! $backup_ready ) ? 'primary' : $force;
		}
		foreach ( (array) $routes as $r ) {
			if ( empty( $r['value'] ) || empty( $r['match'] ) ) {
				continue;
			}
			$needle = strtolower( (string) $r['value'] );
			$hit    = false;
			switch ( $r['match'] ) {
				case 'source':
					$hit = false !== strpos( strtolower( (string) $source ), $needle );
					break;
				case 'subject':
					$hit = false !== strpos( strtolower( (string) ( isset( $mail['subject'] ) ? $mail['subject'] : '' ) ), $needle );
					break;
				case 'from':
					$hit = false !== strpos( strtolower( (string) ( isset( $mail['from'] ) ? $mail['from'] : '' ) ), $needle );
					break;
				case 'to_domain':
					foreach ( (array) ( isset( $mail['to'] ) ? $mail['to'] : array() ) as $addr ) {
						$d = strtolower( substr( strrchr( (string) $addr, '@' ), 1 ) );
						if ( '' !== $d && ( $d === ltrim( $needle, '@' ) || '.' . ltrim( $needle, '@' ) === substr( $d, -strlen( ltrim( $needle, '@' ) ) - 1 ) ) ) {
							$hit = true;
						}
					}
					break;
			}
			if ( $hit ) {
				$via = isset( $r['via'] ) ? $r['via'] : 'backup';
				return ( 'backup' === $via && ! $backup_ready ) ? 'primary' : $via;
			}
		}
		return 'primary';
	}
}
