<?php
defined( 'ABSPATH' ) || exit;

class WLCC_Front {

	public static function init() {
		add_action( 'wp_head', array( __CLASS__, 'head' ), 0 );
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'assets' ) );
		add_action( 'wp_footer', array( __CLASS__, 'footer' ), 99 );
		add_shortcode( 'wlcc_settings', array( __CLASS__, 'sc_settings' ) );
		add_shortcode( 'wlcc_cookies', array( __CLASS__, 'sc_cookies' ) );
	}

	/** Consent Mode defaults must run before any Google tag. */
	public static function head() {
		$s = WLCC_Settings::all();
		if ( $s['enabled'] && $s['gcm'] ) {
			echo '<script>' . WLCC_Scripts::gcm_default() . '</script>' . "\n"; // phpcs:ignore
		}
		if ( $s['enabled'] && '' !== trim( $s['scripts_preferences'] . $s['scripts_analytics'] . $s['scripts_marketing'] ) ) {
			foreach ( array( 'preferences', 'analytics', 'marketing' ) as $c ) {
				if ( $s[ 'use_' . $c ] && '' !== trim( $s[ 'scripts_' . $c ] ) ) {
					echo WLCC_Scripts::block( $s[ 'scripts_' . $c ], $c ); // phpcs:ignore
				}
			}
		}
	}

	/** Settings handed to the banner script (never contains the raw third-party code). */
	public static function config( $s = null ) {
		$s    = $s ? $s : WLCC_Settings::all();
		$cats = array();
		foreach ( WLCC_Settings::active_categories( $s ) as $id => $label ) {
			$cats[] = array( 'id' => $id, 'label' => $label );
		}
		return array(
			'version'  => (int) $s['policy_version'],
			'expire'   => (int) $s['expire_days'],
			'position' => $s['position'],
			'cats'     => $cats,
			'gcm'      => (bool) $s['gcm'],
			'float'    => (bool) $s['float'],
			'log'      => (bool) $s['log'] ? esc_url_raw( rest_url( 'wlcc/v1/log' ) ) : '',
			'policy'   => array( 'url' => $s['policy_url'], 'label' => $s['policy_label'] ),
			'text'     => array( 'title' => $s['title'], 'message' => $s['message'], 'accept' => $s['btn_accept'], 'reject' => $s['btn_reject'], 'custom' => $s['btn_custom'], 'save' => $s['btn_save'], 'float' => $s['btn_float'], 'necessary' => __( 'Necessary', 'weberslink-cookies' ), 'necessaryText' => __( 'Always on. These keep the site secure and working.', 'weberslink-cookies' ), 'catText' => array(
				'preferences' => __( 'Remember your settings such as language or layout.', 'weberslink-cookies' ),
				'analytics'   => __( 'Help us understand how the site is used so we can improve it.', 'weberslink-cookies' ),
				'marketing'   => __( 'Used to show you relevant content and measure campaigns.', 'weberslink-cookies' ),
			), 'close' => __( 'Close', 'weberslink-cookies' ) ),
		);
	}

	public static function assets() {
		$s = WLCC_Settings::all();
		if ( ! $s['enabled'] ) {
			return;
		}
		wp_enqueue_style( 'wlcc', WLCC_URL . 'assets/banner.css', array(), WLCC_VERSION );
		wp_add_inline_style( 'wlcc', ':root{--wlcc-primary:' . $s['color_primary'] . ';--wlcc-bg:' . $s['color_bg'] . ';--wlcc-text:' . $s['color_text'] . '}' );
		wp_enqueue_script( 'wlcc', WLCC_URL . 'assets/banner.js', array(), WLCC_VERSION, true );
		wp_localize_script( 'wlcc', 'WLCC', self::config( $s ) );
	}

	public static function footer() {
		if ( WLCC_Settings::get( 'enabled' ) ) {
			echo '<div id="wlcc-root"></div>';
		}
	}

	public static function sc_settings( $atts ) {
		$a = shortcode_atts( array( 'label' => '' ), $atts );
		return '<a href="#" class="wlcc-open" data-wlcc-open>' . esc_html( '' !== $a['label'] ? $a['label'] : WLCC_Settings::get( 'btn_float' ) ) . '</a>';
	}

	public static function sc_cookies() {
		$rows = WLCC_Settings::parse_cookies( WLCC_Settings::get( 'cookies' ) );
		if ( ! $rows ) {
			return '';
		}
		$cats = array_merge( array( 'necessary' => __( 'Necessary', 'weberslink-cookies' ) ), WLCC_Settings::categories() );
		$o    = '<table class="wlcc-table"><thead><tr><th>' . esc_html__( 'Cookie', 'weberslink-cookies' ) . '</th><th>' . esc_html__( 'Category', 'weberslink-cookies' ) . '</th><th>' . esc_html__( 'Purpose', 'weberslink-cookies' ) . '</th><th>' . esc_html__( 'Duration', 'weberslink-cookies' ) . '</th></tr></thead><tbody>';
		foreach ( $rows as $r ) {
			$o .= '<tr><td><code>' . esc_html( $r['name'] ) . '</code></td><td>' . esc_html( $cats[ $r['cat'] ] ) . '</td><td>' . esc_html( $r['purpose'] ) . '</td><td>' . esc_html( $r['duration'] ) . '</td></tr>';
		}
		return $o . '</tbody></table>';
	}
}
