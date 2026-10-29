<?php
defined( 'ABSPATH' ) || exit;

class WLFP_Helpers {

	public static function defaults() {
		return array(
			'capability'          => 'manage_options',
			'currency'            => 'USD',
			'recaptcha_site'      => '',
			'recaptcha_secret'    => '',
			'recaptcha_version'   => 'v2',
			'hcaptcha_site'       => '',
			'hcaptcha_secret'     => '',
			'turnstile_site'      => '',
			'turnstile_secret'    => '',
			'stripe_mode'         => 'test',
			'stripe_pk'           => '',
			'stripe_sk'           => '',
			'stripe_whsec'        => '',
			'paypal_mode'         => 'sandbox',
			'paypal_client'       => '',
			'paypal_secret'       => '',
			'mailchimp_key'       => '',
			'anonymize_ip'        => 0,
			'disable_ip'          => 0,
			'keep_entries_days'   => 0,
			'keep_logs_days'      => 30,
			'delete_on_uninstall' => 0,
			'load_css'            => 1,
			'track_views'         => 1,
			'digest_email'        => '',
			'from_name'           => '',
			'from_email'          => '',
		);
	}

	public static function settings() {
		return wp_parse_args( get_option( 'wlfp_settings', array() ), self::defaults() );
	}

	public static function setting( $key, $default = '' ) {
		$s = self::settings();
		return isset( $s[ $key ] ) ? $s[ $key ] : $default;
	}

	public static function cap() {
		return apply_filters( 'wlfp_capability', self::setting( 'capability', 'manage_options' ) );
	}

	public static function can_manage() {
		return current_user_can( self::cap() );
	}

	public static function ip() {
		if ( self::setting( 'disable_ip' ) ) {
			return '';
		}
		$ip = isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : '';
		$ip = apply_filters( 'wlfp_client_ip', $ip );
		if ( self::setting( 'anonymize_ip' ) && $ip ) {
			if ( false !== strpos( $ip, ':' ) ) {
				$parts = explode( ':', $ip );
				$ip    = implode( ':', array_slice( $parts, 0, 3 ) ) . '::';
			} else {
				$parts    = explode( '.', $ip );
				$parts[3] = '0';
				$ip       = implode( '.', $parts );
			}
		}
		return $ip;
	}

	public static function uid( $prefix = 'f' ) {
		return $prefix . '_' . substr( wp_generate_password( 12, false, false ), 0, 8 );
	}

	/** Recursively sanitize a mixed structure (used for settings JSON). Strings keep safe HTML where key hints at it. */
	public static function clean( $data, $key = '' ) {
		if ( is_array( $data ) ) {
			$out = array();
			foreach ( $data as $k => $v ) {
				$out[ $k ] = self::clean( $v, is_string( $k ) ? $k : $key );
			}
			return $out;
		}
		if ( is_bool( $data ) || is_int( $data ) || is_float( $data ) || null === $data ) {
			return $data;
		}
		$data = (string) $data;
		$html = array( 'message', 'html', 'content', 'body', 'terms', 'description', 'help', 'label_html', 'confirmation_message', 'success_message', 'error_message' );
		if ( in_array( $key, $html, true ) ) {
			return wp_kses( $data, self::allowed_html() );
		}
		if ( in_array( $key, array( 'css', 'custom_css' ), true ) ) {
			return wp_strip_all_tags( $data );
		}
		return sanitize_textarea_field( $data ) === $data ? sanitize_text_field( $data ) : sanitize_textarea_field( $data );
	}

	public static function allowed_html() {
		$tags = wp_kses_allowed_html( 'post' );
		unset( $tags['script'], $tags['iframe'], $tags['object'], $tags['embed'], $tags['form'] );
		return apply_filters( 'wlfp_allowed_html', $tags );
	}

	public static function currency_symbol( $code ) {
		$map = array( 'USD' => '$', 'EUR' => '€', 'GBP' => '£', 'JPY' => '¥', 'INR' => '₹', 'PKR' => '₨', 'AUD' => 'A$', 'CAD' => 'C$', 'CHF' => 'CHF ', 'AED' => 'AED ', 'SAR' => 'SAR ', 'BRL' => 'R$', 'MXN' => 'MX$', 'ZAR' => 'R', 'SEK' => 'kr ', 'NOK' => 'kr ', 'DKK' => 'kr ', 'NZD' => 'NZ$', 'SGD' => 'S$', 'TRY' => '₺' );
		return isset( $map[ $code ] ) ? $map[ $code ] : $code . ' ';
	}

	public static function currencies() {
		return array( 'USD', 'EUR', 'GBP', 'AUD', 'CAD', 'CHF', 'JPY', 'INR', 'PKR', 'AED', 'SAR', 'BRL', 'MXN', 'ZAR', 'SEK', 'NOK', 'DKK', 'NZD', 'SGD', 'TRY' );
	}

	public static function zero_decimal( $code ) {
		return in_array( strtoupper( $code ), array( 'JPY', 'KRW', 'VND', 'CLP' ), true );
	}

	public static function money( $amount, $currency = '' ) {
		$currency = $currency ? $currency : self::setting( 'currency', 'USD' );
		$dec      = self::zero_decimal( $currency ) ? 0 : 2;
		return self::currency_symbol( $currency ) . number_format_i18n( (float) $amount, $dec );
	}

	public static function countries() {
		static $list = null;
		if ( null === $list ) {
			$list = array( 'AF' => 'Afghanistan', 'AL' => 'Albania', 'DZ' => 'Algeria', 'AD' => 'Andorra', 'AO' => 'Angola', 'AR' => 'Argentina', 'AM' => 'Armenia', 'AU' => 'Australia', 'AT' => 'Austria', 'AZ' => 'Azerbaijan', 'BH' => 'Bahrain', 'BD' => 'Bangladesh', 'BY' => 'Belarus', 'BE' => 'Belgium', 'BZ' => 'Belize', 'BJ' => 'Benin', 'BT' => 'Bhutan', 'BO' => 'Bolivia', 'BA' => 'Bosnia and Herzegovina', 'BW' => 'Botswana', 'BR' => 'Brazil', 'BN' => 'Brunei', 'BG' => 'Bulgaria', 'KH' => 'Cambodia', 'CM' => 'Cameroon', 'CA' => 'Canada', 'CL' => 'Chile', 'CN' => 'China', 'CO' => 'Colombia', 'CR' => 'Costa Rica', 'HR' => 'Croatia', 'CU' => 'Cuba', 'CY' => 'Cyprus', 'CZ' => 'Czechia', 'DK' => 'Denmark', 'DO' => 'Dominican Republic', 'EC' => 'Ecuador', 'EG' => 'Egypt', 'SV' => 'El Salvador', 'EE' => 'Estonia', 'ET' => 'Ethiopia', 'FI' => 'Finland', 'FR' => 'France', 'GE' => 'Georgia', 'DE' => 'Germany', 'GH' => 'Ghana', 'GR' => 'Greece', 'GT' => 'Guatemala', 'HN' => 'Honduras', 'HK' => 'Hong Kong', 'HU' => 'Hungary', 'IS' => 'Iceland', 'IN' => 'India', 'ID' => 'Indonesia', 'IR' => 'Iran', 'IQ' => 'Iraq', 'IE' => 'Ireland', 'IL' => 'Israel', 'IT' => 'Italy', 'JM' => 'Jamaica', 'JP' => 'Japan', 'JO' => 'Jordan', 'KZ' => 'Kazakhstan', 'KE' => 'Kenya', 'KW' => 'Kuwait', 'KG' => 'Kyrgyzstan', 'LA' => 'Laos', 'LV' => 'Latvia', 'LB' => 'Lebanon', 'LY' => 'Libya', 'LT' => 'Lithuania', 'LU' => 'Luxembourg', 'MY' => 'Malaysia', 'MV' => 'Maldives', 'MT' => 'Malta', 'MX' => 'Mexico', 'MD' => 'Moldova', 'MC' => 'Monaco', 'MN' => 'Mongolia', 'ME' => 'Montenegro', 'MA' => 'Morocco', 'MM' => 'Myanmar', 'NP' => 'Nepal', 'NL' => 'Netherlands', 'NZ' => 'New Zealand', 'NI' => 'Nicaragua', 'NG' => 'Nigeria', 'MK' => 'North Macedonia', 'NO' => 'Norway', 'OM' => 'Oman', 'PK' => 'Pakistan', 'PS' => 'Palestine', 'PA' => 'Panama', 'PY' => 'Paraguay', 'PE' => 'Peru', 'PH' => 'Philippines', 'PL' => 'Poland', 'PT' => 'Portugal', 'QA' => 'Qatar', 'RO' => 'Romania', 'RU' => 'Russia', 'SA' => 'Saudi Arabia', 'RS' => 'Serbia', 'SG' => 'Singapore', 'SK' => 'Slovakia', 'SI' => 'Slovenia', 'ZA' => 'South Africa', 'KR' => 'South Korea', 'ES' => 'Spain', 'LK' => 'Sri Lanka', 'SD' => 'Sudan', 'SE' => 'Sweden', 'CH' => 'Switzerland', 'SY' => 'Syria', 'TW' => 'Taiwan', 'TJ' => 'Tajikistan', 'TZ' => 'Tanzania', 'TH' => 'Thailand', 'TN' => 'Tunisia', 'TR' => 'Türkiye', 'UG' => 'Uganda', 'UA' => 'Ukraine', 'AE' => 'United Arab Emirates', 'GB' => 'United Kingdom', 'US' => 'United States', 'UY' => 'Uruguay', 'UZ' => 'Uzbekistan', 'VE' => 'Venezuela', 'VN' => 'Vietnam', 'YE' => 'Yemen', 'ZM' => 'Zambia', 'ZW' => 'Zimbabwe' );
		}
		return apply_filters( 'wlfp_countries', $list );
	}

	public static function json_out( $data, $status = 200 ) {
		wp_send_json( $data, $status );
	}

	public static function esc_attrs( array $attrs ) {
		$out = '';
		foreach ( $attrs as $k => $v ) {
			if ( null === $v || false === $v ) {
				continue;
			}
			if ( true === $v ) {
				$out .= ' ' . esc_attr( $k );
			} else {
				$out .= ' ' . esc_attr( $k ) . '="' . esc_attr( $v ) . '"';
			}
		}
		return $out;
	}
}
