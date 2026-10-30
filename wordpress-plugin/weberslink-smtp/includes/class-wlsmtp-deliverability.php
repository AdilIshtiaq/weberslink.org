<?php
defined( 'ABSPATH' ) || exit;

/** SPF / DKIM / DMARC checks. The analysers are pure functions (testable without DNS). */
class WLSMTP_Deliverability {

	/** Include domains each provider asks you to add to SPF. */
	public static function provider_spf() {
		return array(
			'gmail'     => array( '_spf.google.com' ),
			'microsoft' => array( 'spf.protection.outlook.com' ),
			'sendgrid'  => array( 'sendgrid.net' ),
			'mailgun'   => array( 'mailgun.org' ),
			'ses'       => array( 'amazonses.com' ),
			'brevo'     => array( 'spf.brevo.com', 'sendinblue.com' ),
			'postmark'  => array( 'spf.mtasv.net' ),
			'zoho'      => array( 'zoho.com', 'zoho.eu' ),
		);
	}

	public static function txt( $host ) {
		if ( ! function_exists( 'dns_get_record' ) ) {
			return null;
		}
		$r = @dns_get_record( $host, DNS_TXT ); // phpcs:ignore
		if ( ! is_array( $r ) ) {
			return array();
		}
		$out = array();
		foreach ( $r as $rec ) {
			if ( isset( $rec['txt'] ) ) {
				$out[] = $rec['txt'];
			} elseif ( isset( $rec['entries'] ) ) {
				$out[] = implode( '', (array) $rec['entries'] );
			}
		}
		return $out;
	}

	/** Each result: array( status ok|warn|bad|info, title, detail ). */
	public static function analyze_spf( $records, $provider = 'custom' ) {
		$spf = array_values( array_filter( (array) $records, function ( $r ) {
			return 0 === stripos( ltrim( $r ), 'v=spf1' );
		} ) );
		if ( ! $spf ) {
			return array( array( 'bad', 'SPF', __( 'No SPF record found. Mail from your domain is more likely to land in spam. Add a TXT record starting with v=spf1 that lists your sending services.', 'weberslink-smtp' ) ) );
		}
		$out = array();
		if ( count( $spf ) > 1 ) {
			$out[] = array( 'bad', 'SPF', __( 'More than one SPF record exists. Receivers will reject the whole thing: merge them into a single record.', 'weberslink-smtp' ) );
		}
		$r        = strtolower( trim( $spf[0] ) );
		$lookups  = preg_match_all( '/(?:^|\s)[+?~-]?(include:|a(?::|\/|\s|$)|mx(?::|\/|\s|$)|ptr|exists:|redirect=)/', $r );
		if ( $lookups > 10 ) {
			$out[] = array( 'bad', 'SPF', sprintf( /* translators: %d: count */ __( 'About %d DNS lookups: SPF allows at most 10, so it can fail with "permerror". Remove unused includes.', 'weberslink-smtp' ), $lookups ) );
		}
		if ( preg_match( '/\s-all\b/', $r ) ) {
			$out[] = array( 'ok', 'SPF', __( 'SPF record found and ends with -all (strict).', 'weberslink-smtp' ) );
		} elseif ( preg_match( '/\s~all\b/', $r ) ) {
			$out[] = array( 'ok', 'SPF', __( 'SPF record found and ends with ~all (soft fail), which is fine for most sites.', 'weberslink-smtp' ) );
		} else {
			$out[] = array( 'warn', 'SPF', __( 'SPF record does not end with ~all or -all, so it does not tell receivers what to do with other senders. Use ~all (or -all once you are sure).', 'weberslink-smtp' ) );
		}
		$map = self::provider_spf();
		if ( isset( $map[ $provider ] ) ) {
			$found = false;
			foreach ( $map[ $provider ] as $inc ) {
				if ( false !== strpos( $r, 'include:' . $inc ) ) {
					$found = true;
				}
			}
			$out[] = $found
				? array( 'ok', 'SPF', sprintf( /* translators: %s: include */ __( 'Your SPF includes %s for your SMTP provider.', 'weberslink-smtp' ), $map[ $provider ][0] ) )
				: array( 'warn', 'SPF', sprintf( /* translators: %s: include */ __( 'Your SPF does not include %s, which your SMTP provider asks for. Add include:%s to the record.', 'weberslink-smtp' ), $map[ $provider ][0], $map[ $provider ][0] ) );
		}
		return $out;
	}

	public static function analyze_dmarc( $records ) {
		$d = array_values( array_filter( (array) $records, function ( $r ) {
			return 0 === stripos( ltrim( $r ), 'v=dmarc1' );
		} ) );
		if ( ! $d ) {
			return array( array( 'warn', 'DMARC', __( 'No DMARC record at _dmarc.yourdomain. Gmail and Yahoo expect one from bulk senders. Start with: v=DMARC1; p=none; rua=mailto:you@yourdomain', 'weberslink-smtp' ) ) );
		}
		$r   = strtolower( $d[0] );
		$out = array();
		if ( preg_match( '/\bp=(reject|quarantine)\b/', $r ) ) {
			$out[] = array( 'ok', 'DMARC', sprintf( /* translators: %s: policy */ __( 'DMARC found with policy %s.', 'weberslink-smtp' ), preg_match( '/\bp=reject\b/', $r ) ? 'reject' : 'quarantine' ) );
		} else {
			$out[] = array( 'warn', 'DMARC', __( 'DMARC is in monitoring mode (p=none). That is a good start; move to p=quarantine once your reports look clean.', 'weberslink-smtp' ) );
		}
		if ( false === strpos( $r, 'rua=' ) ) {
			$out[] = array( 'info', 'DMARC', __( 'No rua= address, so you will not receive aggregate reports.', 'weberslink-smtp' ) );
		}
		return $out;
	}

	/** $found: selector => true for every selector that has a DKIM key. */
	public static function analyze_dkim( $found ) {
		if ( $found ) {
			return array( array( 'ok', 'DKIM', sprintf( /* translators: %s: selectors */ __( 'DKIM key found for selector: %s.', 'weberslink-smtp' ), implode( ', ', array_keys( $found ) ) ) ) );
		}
		return array( array( 'warn', 'DKIM', __( 'No DKIM key found for the common selectors we tried. If your provider uses a custom selector, enter it above. Otherwise enable DKIM in your provider dashboard and publish the TXT/CNAME it gives you.', 'weberslink-smtp' ) ) );
	}

	public static function check( $domain, $provider, $selector = '' ) {
		$domain = strtolower( trim( $domain ) );
		if ( ! preg_match( '/^[a-z0-9.-]+\.[a-z]{2,}$/', $domain ) ) {
			return array( array( 'bad', 'Domain', __( 'Please enter a valid domain such as example.com.', 'weberslink-smtp' ) ) );
		}
		$root = self::txt( $domain );
		if ( null === $root ) {
			return array( array( 'warn', 'DNS', __( 'Your server blocks DNS lookups (dns_get_record is disabled), so the checks cannot run here.', 'weberslink-smtp' ) ) );
		}
		$res    = self::analyze_spf( $root, $provider );
		$res    = array_merge( $res, self::analyze_dmarc( self::txt( '_dmarc.' . $domain ) ) );
		$sels   = array_filter( array_unique( array_merge( $selector ? array( sanitize_key( $selector ) ) : array(), array( 'default', 'google', 'selector1', 'selector2', 'k1', 'k2', 'mail', 's1', 's2', 'dkim', 'smtp', 'mandrill', 'sendgrid', 'brevo', 'mxvault' ) ) ) );
		$found  = array();
		foreach ( array_slice( $sels, 0, 16 ) as $sel ) {
			foreach ( (array) self::txt( $sel . '._domainkey.' . $domain ) as $t ) {
				if ( false !== stripos( $t, 'v=dkim1' ) || false !== stripos( $t, 'p=' ) ) {
					$found[ $sel ] = true;
				}
			}
		}
		return array_merge( $res, self::analyze_dkim( $found ) );
	}
}
