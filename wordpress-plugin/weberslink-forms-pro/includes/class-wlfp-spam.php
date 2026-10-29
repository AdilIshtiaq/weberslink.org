<?php
defined( 'ABSPATH' ) || exit;

class WLFP_Spam {

	public static function token( $form_id ) {
		$t = time();
		return $t . '.' . substr( hash_hmac( 'sha256', $form_id . '|' . $t, wp_salt( 'nonce' ) ), 0, 20 );
	}

	public static function token_age( $form_id, $token ) {
		$p = explode( '.', (string) $token );
		if ( 2 !== count( $p ) || ! ctype_digit( $p[0] ) ) {
			return false;
		}
		$ok = hash_equals( substr( hash_hmac( 'sha256', $form_id . '|' . $p[0], wp_salt( 'nonce' ) ), 0, 20 ), $p[1] );
		return $ok ? time() - (int) $p[0] : false;
	}

	public static function hp_name( $form_id ) {
		return 'wlfp_website_' . $form_id;
	}

	/**
	 * Returns array( 'spam' => bool, 'reason' => string, 'error' => string ).
	 * 'error' is a user-visible failure (captcha, rate limit) that should block rather than quarantine.
	 */
	public static function check( $form, $post, $data ) {
		$s   = $form['settings']['spam'];
		$res = array( 'spam' => false, 'reason' => '', 'error' => '' );

		if ( ! empty( $s['honeypot'] ) && ! empty( $post[ self::hp_name( $form['id'] ) ] ) ) {
			return array( 'spam' => true, 'reason' => 'honeypot', 'error' => '' );
		}
		$age = self::token_age( $form['id'], isset( $post['wlfp_ts'] ) ? $post['wlfp_ts'] : '' );
		if ( false === $age ) {
			return array( 'spam' => true, 'reason' => 'bad_token', 'error' => '' );
		}
		if ( ! empty( $s['min_seconds'] ) && $age < (int) $s['min_seconds'] ) {
			return array( 'spam' => true, 'reason' => 'too_fast', 'error' => '' );
		}

		$flat = strtolower( self::flatten( $data ) );
		if ( ! empty( $s['keywords'] ) ) {
			foreach ( preg_split( '/[\r\n,]+/', strtolower( $s['keywords'] ) ) as $kw ) {
				$kw = trim( $kw );
				if ( '' !== $kw && false !== strpos( $flat, $kw ) ) {
					return array( 'spam' => true, 'reason' => 'keyword:' . $kw, 'error' => '' );
				}
			}
		}
		if ( ! empty( $s['max_links'] ) && preg_match_all( '#https?://#i', $flat ) > (int) $s['max_links'] ) {
			return array( 'spam' => true, 'reason' => 'links', 'error' => '' );
		}

		if ( ! empty( $s['rate_limit'] ) ) {
			$ip  = WLFP_Helpers::ip() ? WLFP_Helpers::ip() : ( isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : 'x' );
			$key = 'wlfp_rl_' . md5( $form['id'] . '|' . $ip );
			$n   = (int) get_transient( $key );
			if ( $n >= (int) $s['rate_limit'] ) {
				$res['error'] = __( 'Too many submissions. Please wait a few minutes and try again.', 'weberslink-forms-pro' );
				return $res;
			}
			set_transient( $key, $n + 1, 10 * MINUTE_IN_SECONDS );
		}

		$provider = isset( $s['captcha'] ) ? $s['captcha'] : 'none';
		if ( 'none' !== $provider ) {
			$err = self::verify_captcha( $provider, $post );
			if ( $err ) {
				$res['error'] = $err;
				return $res;
			}
		}

		if ( ! empty( $s['akismet'] ) && class_exists( 'Akismet' ) && method_exists( 'Akismet', 'http_post' ) && get_option( 'wordpress_api_key' ) ) {
			$email = '';
			$name  = '';
			foreach ( $form['fields'] as $f ) {
				if ( 'email' === $f['type'] && ! $email && ! empty( $data[ $f['name'] ] ) ) {
					$email = $data[ $f['name'] ];
				}
				if ( 'name' === $f['type'] && ! $name && ! empty( $data[ $f['name'] ] ) ) {
					$name = WLFP_Fields::format_value( $f, $data[ $f['name'] ] );
				}
			}
			$body = array( 'blog' => home_url(), 'user_ip' => isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : '', 'user_agent' => isset( $_SERVER['HTTP_USER_AGENT'] ) ? sanitize_text_field( wp_unslash( $_SERVER['HTTP_USER_AGENT'] ) ) : '', 'comment_type' => 'contact-form', 'comment_author' => $name, 'comment_author_email' => $email, 'comment_content' => $flat );
			$r    = Akismet::http_post( http_build_query( $body ), 'comment-check' );
			if ( is_array( $r ) && isset( $r[1] ) && 'true' === trim( $r[1] ) ) {
				return array( 'spam' => true, 'reason' => 'akismet', 'error' => '' );
			}
		}
		return apply_filters( 'wlfp_spam_check', $res, $form, $post, $data );
	}

	private static function flatten( $data ) {
		$o = array();
		array_walk_recursive( $data, function ( $v ) use ( &$o ) {
			if ( is_scalar( $v ) && strlen( (string) $v ) < 5000 ) {
				$o[] = (string) $v;
			}
		} );
		return implode( ' ', $o );
	}

	public static function captcha_config() {
		$s = WLFP_Helpers::settings();
		return array(
			'recaptcha' => array( 'site' => $s['recaptcha_site'], 'secret' => $s['recaptcha_secret'], 'verify' => 'https://www.google.com/recaptcha/api/siteverify', 'field' => 'g-recaptcha-response' ),
			'hcaptcha'  => array( 'site' => $s['hcaptcha_site'], 'secret' => $s['hcaptcha_secret'], 'verify' => 'https://hcaptcha.com/siteverify', 'field' => 'h-captcha-response' ),
			'turnstile' => array( 'site' => $s['turnstile_site'], 'secret' => $s['turnstile_secret'], 'verify' => 'https://challenges.cloudflare.com/turnstile/v0/siteverify', 'field' => 'cf-turnstile-response' ),
		);
	}

	public static function verify_captcha( $provider, $post ) {
		$cfg = self::captcha_config();
		if ( ! isset( $cfg[ $provider ] ) ) {
			return '';
		}
		$c = $cfg[ $provider ];
		if ( ! $c['secret'] ) {
			return __( 'CAPTCHA is not configured. Add your keys under Weberslink Forms → Settings.', 'weberslink-forms-pro' );
		}
		$resp = isset( $post[ $c['field'] ] ) ? sanitize_text_field( wp_unslash( $post[ $c['field'] ] ) ) : '';
		if ( ! $resp ) {
			return __( 'Please complete the CAPTCHA.', 'weberslink-forms-pro' );
		}
		$r = wp_remote_post( $c['verify'], array( 'timeout' => 10, 'body' => array( 'secret' => $c['secret'], 'response' => $resp, 'remoteip' => isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : '' ) ) );
		if ( is_wp_error( $r ) ) {
			return __( 'Could not verify the CAPTCHA. Please try again.', 'weberslink-forms-pro' );
		}
		$j = json_decode( wp_remote_retrieve_body( $r ), true );
		if ( empty( $j['success'] ) ) {
			return __( 'CAPTCHA verification failed. Please try again.', 'weberslink-forms-pro' );
		}
		if ( 'recaptcha' === $provider && isset( $j['score'] ) && (float) $j['score'] < 0.4 ) {
			return __( 'CAPTCHA verification failed. Please try again.', 'weberslink-forms-pro' );
		}
		return '';
	}
}
