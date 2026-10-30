<?php
defined( 'ABSPATH' ) || exit;

class WLFP_Renderer {

	private static $rendered = array();

	public static function init() {
		add_shortcode( 'weberslink_form', array( __CLASS__, 'shortcode' ) );
		add_shortcode( 'weberslink-forms', array( __CLASS__, 'shortcode' ) );
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'register_assets' ), 5 );
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'maybe_enqueue' ), 20 );
		add_action( 'template_redirect', array( __CLASS__, 'preview' ) );
		add_action( 'wp_ajax_wlfp_view', array( __CLASS__, 'ajax_view' ) );
		add_action( 'wp_ajax_nopriv_wlfp_view', array( __CLASS__, 'ajax_view' ) );
		add_action( 'wp_ajax_wlfp_fresh', array( __CLASS__, 'ajax_fresh' ) );
		add_action( 'wp_ajax_nopriv_wlfp_fresh', array( __CLASS__, 'ajax_fresh' ) );
		add_filter( 'body_class', function ( $c ) {
			if ( self::$rendered ) {
				$c[] = 'wlfp-has-form';
			}
			return $c;
		} );
	}

	public static function register_assets() {
		wp_register_style( 'wlfp-form', WLFP_URL . 'assets/css/form.css', array(), WLFP_VERSION );
		wp_register_script( 'wlfp-form', WLFP_URL . 'assets/js/form.js', array(), WLFP_VERSION, true );
		wp_localize_script( 'wlfp-form', 'WLFP', array(
			'ajax'  => admin_url( 'admin-ajax.php' ),
			'i18n'  => array(
				'required'  => __( 'This field is required.', 'weberslink-forms-pro' ),
				'sending'   => __( 'Sending…', 'weberslink-forms-pro' ),
				'error'     => __( 'Something went wrong. Please try again.', 'weberslink-forms-pro' ),
				'fixErrors' => __( 'Please correct the highlighted fields.', 'weberslink-forms-pro' ),
				'step'      => __( 'Step %1$s of %2$s', 'weberslink-forms-pro' ),
				'tooBig'    => __( '"%1$s" is larger than %2$s MB.', 'weberslink-forms-pro' ),
				'tooMany'   => __( 'You can attach at most %s file(s).', 'weberslink-forms-pro' ),
				'remaining' => __( '%s characters left', 'weberslink-forms-pro' ),
				'total'     => __( 'Total', 'weberslink-forms-pro' ),
				'discount'  => __( 'Discount', 'weberslink-forms-pro' ),
				'tax'       => __( 'Tax', 'weberslink-forms-pro' ),
				'subtotal'  => __( 'Subtotal', 'weberslink-forms-pro' ),
				'couponOk'  => __( 'Coupon applied.', 'weberslink-forms-pro' ),
				'couponBad' => __( 'Invalid or expired coupon.', 'weberslink-forms-pro' ),
				'draft'     => __( 'We restored your saved progress.', 'weberslink-forms-pro' ),
				'mismatch'  => __( 'The two values do not match.', 'weberslink-forms-pro' ),
				'convOf'    => __( '%1$s of %2$s', 'weberslink-forms-pro' ),
				'slotHint'   => __( 'Choose a date to see the available times.', 'weberslink-forms-pro' ),
				'slotNone'   => __( 'No times are available on that date.', 'weberslink-forms-pro' ),
				'slotPick'   => __( 'Please choose a time.', 'weberslink-forms-pro' ),
				'slotFull'   => __( 'full', 'weberslink-forms-pro' ),
				'slotLeft'   => __( '%s left', 'weberslink-forms-pro' ),
				'resumeEmail' => __( 'Your email address', 'weberslink-forms-pro' ),
				'resumeSend'  => __( 'Email me the link', 'weberslink-forms-pro' ),
				'resumeHelp'  => __( 'We will email you a private link to finish this form later.', 'weberslink-forms-pro' ),
				'resumeFail'  => __( 'Could not save. Please try again.', 'weberslink-forms-pro' ),
				'convHint'  => __( 'press Enter ↵', 'weberslink-forms-pro' ),
				'convBack'  => __( 'Previous question', 'weberslink-forms-pro' ),
				'rangeBad'  => __( 'The end date must be on or after the start date.', 'weberslink-forms-pro' ),
			),
		) );
	}

	/** Enqueue early if the current post contains our shortcode/block. */
	public static function maybe_enqueue() {
		$post = get_post();
		if ( $post && ( has_shortcode( $post->post_content, 'weberslink_form' ) || has_shortcode( $post->post_content, 'weberslink-forms' ) || has_block( 'weberslink-forms-pro/form', $post ) ) ) {
			self::enqueue();
		}
	}

	public static function enqueue( $form = null ) {
		if ( WLFP_Helpers::setting( 'load_css', 1 ) ) {
			wp_enqueue_style( 'wlfp-form' );
		}
		wp_enqueue_script( 'wlfp-form' );
		if ( $form ) {
			$prov = isset( $form['settings']['spam']['captcha'] ) ? $form['settings']['spam']['captcha'] : 'none';
			$cfg  = WLFP_Spam::captcha_config();
			if ( 'recaptcha' === $prov && $cfg['recaptcha']['site'] ) {
				$v3 = 'v3' === WLFP_Helpers::setting( 'recaptcha_version' );
				wp_enqueue_script( 'wlfp-recaptcha', 'https://www.google.com/recaptcha/api.js' . ( $v3 ? '?render=' . rawurlencode( $cfg['recaptcha']['site'] ) : '?render=explicit' ), array(), null, true ); // phpcs:ignore
			} elseif ( 'hcaptcha' === $prov && $cfg['hcaptcha']['site'] ) {
				wp_enqueue_script( 'wlfp-hcaptcha', 'https://js.hcaptcha.com/1/api.js?render=explicit', array(), null, true ); // phpcs:ignore
			} elseif ( 'turnstile' === $prov && $cfg['turnstile']['site'] ) {
				wp_enqueue_script( 'wlfp-turnstile', 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit', array(), null, true ); // phpcs:ignore
			}
		}
	}

	public static function shortcode( $atts ) {
		$a = shortcode_atts( array( 'id' => 0, 'title' => '', 'class' => '', 'prefill' => '' ), $atts, 'weberslink_form' );
		return self::render( (int) $a['id'], $a );
	}

	/** Restriction checks. Returns message string if the form must not be shown. */
	public static function closed_message( $form ) {
		$r = $form['settings']['restrictions'];
		if ( ! empty( $r['login_required'] ) && ! is_user_logged_in() ) {
			return $r['login_msg'];
		}
		if ( ! empty( $r['schedule'] ) ) {
			$now = time();
			if ( ! empty( $r['start'] ) && $now < self::local_ts( $r['start'] ) ) {
				return $r['schedule_msg'];
			}
			if ( ! empty( $r['end'] ) && $now > self::local_ts( $r['end'] ) ) {
				return $r['schedule_msg'];
			}
		}
		if ( ! empty( $r['limit_entries'] ) && (int) $r['max_entries'] > 0 && WLFP_Forms::entry_count( $form['id'] ) >= (int) $r['max_entries'] ) {
			return $r['limit_msg'];
		}
		if ( ! empty( $r['daily_limit'] ) && (int) $r['daily_limit'] > 0 ) {
			global $wpdb;
			$n = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$wpdb->prefix}wlfp_entries WHERE form_id=%d AND created_at >= %s", $form['id'], gmdate( 'Y-m-d 00:00:00' ) ) ); // phpcs:ignore
			if ( $n >= (int) $r['daily_limit'] ) {
				return $r['daily_limit_msg'];
			}
		}
		if ( is_user_logged_in() && ! empty( $r['one_per_user'] ) ) {
			global $wpdb;
			if ( (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$wpdb->prefix}wlfp_entries WHERE form_id=%d AND user_id=%d AND status<>'spam'", $form['id'], get_current_user_id() ) ) > 0 ) { // phpcs:ignore
				return $r['dup_msg'];
			}
		}
		return '';
	}

	/** Site-local 'Y-m-dTH:i' (datetime-local) -> UTC timestamp. */
	public static function local_ts( $value ) {
		$value = str_replace( 'T', ' ', (string) $value );
		if ( preg_match( '/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/', $value ) ) {
			$value .= ':00';
		}
		$gmt = get_gmt_from_date( $value );
		return $gmt ? (int) strtotime( $gmt . ' UTC' ) : 0;
	}

	public static function render( $form_id, $args = array() ) {
		$form = WLFP_Forms::get( $form_id );
		if ( ! $form ) {
			return current_user_can( 'edit_posts' ) ? '<p class="wlfp-notice">' . esc_html__( 'Weberslink Forms: form not found.', 'weberslink-forms-pro' ) . '</p>' : '';
		}
		$is_preview = ! empty( $args['preview'] );
		if ( 'published' !== $form['status'] && ! $is_preview ) {
			return current_user_can( 'edit_posts' ) ? '<p class="wlfp-notice">' . esc_html__( 'This form is not published.', 'weberslink-forms-pro' ) . '</p>' : '';
		}
		$closed = $is_preview ? '' : self::closed_message( $form );
		if ( $closed ) {
			return '<div class="wlfp-wrap"><div class="wlfp-closed">' . wp_kses_post( $closed ) . '</div></div>';
		}
		self::enqueue( $form );

		$instance      = count( self::$rendered ) + 1;
		self::$rendered[] = $form_id;
		$st            = $form['settings'];
		$style         = $st['style'];
		$uid           = $form['id'] . '-' . $instance;

		$css_vars = array();
		foreach ( array( 'primary' => '--wlfp-primary', 'text' => '--wlfp-text', 'bg' => '--wlfp-bg', 'border' => '--wlfp-border' ) as $k => $var ) {
			if ( ! empty( $style[ $k ] ) && preg_match( '/^#[0-9a-fA-F]{3,8}$|^rgba?\([\d\s,.%]+\)$/', $style[ $k ] ) ) {
				$css_vars[] = $var . ':' . $style[ $k ];
			}
		}
		if ( '' !== $style['radius'] && is_numeric( $style['radius'] ) ) {
			$css_vars[] = '--wlfp-radius:' . (int) $style['radius'] . 'px';
		}

		// Prefill values (from a saved draft first, then URL parameters).
		$prefill      = array();
		$draft_token  = '';
		$resume_step  = 0;
		if ( ! empty( $st['resume']['enabled'] ) && isset( $_GET['wlfp_resume'] ) ) { // phpcs:ignore
			$draft = WLFP_Drafts::get( sanitize_text_field( wp_unslash( $_GET['wlfp_resume'] ) ) ); // phpcs:ignore
			if ( $draft && (int) $draft['form_id'] === (int) $form['id'] ) {
				$prefill     = isset( $draft['data']['values'] ) && is_array( $draft['data']['values'] ) ? $draft['data']['values'] : array();
				$draft_token = $draft['token'];
				$resume_step = (int) $draft['step'];
			}
		}
		if ( ! empty( $st['misc']['prefill_get'] ) ) {
			foreach ( $form['fields'] as $f ) {
				if ( ! empty( $f['name'] ) && isset( $_GET[ $f['name'] ] ) ) { // phpcs:ignore
					$v                     = wp_unslash( $_GET[ $f['name'] ] ); // phpcs:ignore
					$prefill[ $f['name'] ] = is_array( $v ) ? array_map( 'sanitize_text_field', $v ) : sanitize_text_field( $v );
				}
			}
		}
		if ( ! empty( $args['prefill'] ) ) {
			foreach ( explode( ';', $args['prefill'] ) as $pair ) {
				$kv = explode( '=', $pair, 2 );
				if ( 2 === count( $kv ) ) {
					$prefill[ sanitize_key( $kv[0] ) ] = sanitize_text_field( $kv[1] );
				}
			}
		}

		// Initial values -> used for initial conditional visibility.
		$initial = array();
		foreach ( $form['fields'] as &$f ) {
			if ( empty( $f['name'] ) ) {
				continue;
			}
			if ( isset( $f['default'] ) && is_string( $f['default'] ) && false !== strpos( $f['default'], '{' ) ) {
				$f['default'] = WLFP_Merge::parse( $f['default'], $form, array(), null, false );
			}
			$initial[ $f['name'] ] = isset( $prefill[ $f['name'] ] ) ? $prefill[ $f['name'] ] : ( $f['default'] ?? '' );
		}
		unset( $f );
		$visible = WLFP_Logic::visible_fields( $form['fields'], $initial );

		// Split into steps.
		$steps = array( array( 'title' => '', 'fields' => array() ) );
		foreach ( $form['fields'] as $f ) {
			if ( 'page_break' === $f['type'] ) {
				$steps[] = array( 'title' => ! empty( $f['step_title'] ) ? $f['step_title'] : ( $f['label'] ?? '' ), 'fields' => array() );
				continue;
			}
			$steps[ count( $steps ) - 1 ]['fields'][] = $f;
		}
		if ( count( $steps ) > 1 && '' === $steps[0]['title'] ) {
			$steps[0]['title'] = ! empty( $form['settings']['steps']['first_title'] ) ? $form['settings']['steps']['first_title'] : __( 'Start', 'weberslink-forms-pro' );
		}

		$cv   = $st['conversation'];
		$conv = ! empty( $cv['enabled'] );
		$conv_cfg = null;
		if ( $conv ) {
			$conv_cfg = array(
				'auto'    => ! empty( $cv['auto_advance'] ),
				'next'    => '' !== trim( (string) $cv['next_text'] ) ? $cv['next_text'] : 'OK',
				'submit'  => apply_filters( 'wlfp_pay_button_text', $st['button']['text'], $form ),
				'welcome' => ! empty( $cv['welcome'] ) ? array( 'title' => $cv['welcome_title'], 'text' => wp_kses( WLFP_Merge::parse( $cv['welcome_text'], $form, array(), null, true ), WLFP_Helpers::allowed_html() ), 'start' => '' !== trim( (string) $cv['start_text'] ) ? $cv['start_text'] : 'Start' ) : null,
			);
		}
		$config = array(
			'conv'     => $conv_cfg,
			'resume'   => ! empty( $st['resume']['enabled'] ) ? array( 'button' => $st['resume']['button_text'], 'step' => $resume_step ) : null,
			'formId'   => $form['id'],
			'steps'    => array_map( function ( $s ) {
				return $s['title'];
			}, $steps ),
			'progress' => $st['steps']['progress'],
			'confirm'  => array( 'type' => $st['confirmation']['type'], 'scroll' => ! empty( $st['confirmation']['scroll'] ), 'hide' => ! empty( $st['confirmation']['hide_form'] ) ),
			'autosave' => ! empty( $st['misc']['autosave'] ),
			'btnLoad'  => $st['button']['loading_text'],
			'payment'  => WLFP_Payments::client_config( $form ),
			'captcha'  => self::captcha_client( $form ),
		);

		$classes = array( 'wlfp-wrap', 'wlfp-preset-' . sanitize_html_class( $style['preset'] ), 'wlfp-label-' . sanitize_html_class( $style['label_position'] ), 'wlfp-size-' . sanitize_html_class( $style['input_size'] ) );
		if ( ! empty( $args['class'] ) ) {
			$classes[] = sanitize_html_class( $args['class'] );
		}
		if ( $conv ) {
			$classes[] = 'wlfp-conv';
		}
		if ( is_rtl() ) {
			$classes[] = 'wlfp-rtl';
		}

		ob_start();
		echo '<div class="' . esc_attr( implode( ' ', $classes ) ) . '" id="wlfp-wrap-' . esc_attr( $uid ) . '"' . ( $css_vars ? ' style="' . esc_attr( implode( ';', $css_vars ) ) . '"' : '' ) . ' data-form-id="' . (int) $form['id'] . '">';
		if ( ! empty( $style['custom_css'] ) ) {
			echo '<style>' . str_replace( '.wlfp-this', '#wlfp-wrap-' . esc_attr( $uid ), wp_strip_all_tags( $style['custom_css'] ) ) . '</style>'; // phpcs:ignore
		}
		echo '<noscript><style>.wlfp-wrap .wlfp-cond[hidden]{display:block!important}</style></noscript>';
		if ( ( ! empty( $style['show_title'] ) || 'true' === ( $args['title'] ?? '' ) ) ) {
			echo '<h3 class="wlfp-title">' . esc_html( $form['title'] ) . '</h3>';
		}
		echo '<form class="wlfp-form" method="post" action="' . esc_url( admin_url( 'admin-ajax.php' ) ) . '" enctype="multipart/form-data" novalidate data-config="' . esc_attr( wp_json_encode( $config ) ) . '" aria-label="' . esc_attr( $form['title'] ) . '">';
		echo '<input type="hidden" name="action" value="wlfp_submit" />';
		echo '<input type="hidden" name="wlfp_form_id" value="' . (int) $form['id'] . '" />';
		echo '<input type="hidden" name="wlfp_nonce" value="' . esc_attr( wp_create_nonce( 'wlfp_submit_' . $form['id'] ) ) . '" />';
		echo '<input type="hidden" name="wlfp_ts" value="' . esc_attr( WLFP_Spam::token( $form['id'] ) ) . '" />';
		echo '<input type="hidden" name="wlfp_source" value="' . esc_url( ( is_ssl() ? 'https://' : 'http://' ) . ( isset( $_SERVER['HTTP_HOST'] ) ? sanitize_text_field( wp_unslash( $_SERVER['HTTP_HOST'] ) ) : '' ) . ( isset( $_SERVER['REQUEST_URI'] ) ? esc_url_raw( wp_unslash( $_SERVER['REQUEST_URI'] ) ) : '' ) ) . '" />';
		if ( $is_preview ) {
			echo '<input type="hidden" name="wlfp_preview" value="1" />';
		}
		if ( $draft_token ) {
			echo '<input type="hidden" name="wlfp_draft" value="' . esc_attr( $draft_token ) . '" />';
		}
		if ( ! empty( $st['spam']['honeypot'] ) ) {
			echo '<div class="wlfp-hp" aria-hidden="true"><label>' . esc_html__( 'Leave this field empty', 'weberslink-forms-pro' ) . '<input type="text" name="' . esc_attr( WLFP_Spam::hp_name( $form['id'] ) ) . '" value="" tabindex="-1" autocomplete="off" /></label></div>';
		}
		echo '<div class="wlfp-messages" role="alert" aria-live="assertive"></div>';

		$total_steps = count( $steps );
		$has_captcha = false;
		foreach ( $steps as $si => $step ) {
			echo '<fieldset class="wlfp-step' . ( 0 === $si ? ' wlfp-step-active' : '' ) . '" data-step="' . (int) $si . '"' . ( $si > 0 ? ' hidden' : '' ) . '><legend class="wlfp-sr">' . esc_html( $step['title'] ? $step['title'] : $form['title'] ) . '</legend><div class="wlfp-grid">';
			foreach ( $step['fields'] as $f ) {
				if ( 'captcha' === $f['type'] ) {
					$has_captcha = true;
				}
				echo self::render_field( $f, $form, $uid, ! isset( $visible[ $f['id'] ] ) || $visible[ $f['id'] ], isset( $prefill[ $f['name'] ?? '' ] ) ? $prefill[ $f['name'] ] : null ); // phpcs:ignore
			}
			if ( $si === $total_steps - 1 && ! $has_captcha && 'none' !== $st['spam']['captcha'] ) {
				echo self::render_field( array_merge( WLFP_Fields::defaults( 'captcha' ), array( 'id' => 'captcha_auto' ) ), $form, $uid, true, null ); // phpcs:ignore
			}
			echo '</div>';
			echo '<div class="wlfp-actions wlfp-align-' . esc_attr( $st['button']['align'] ) . '">';
			if ( $si > 0 && ! empty( $st['steps']['show_prev'] ) ) {
				echo '<button type="button" class="wlfp-btn wlfp-btn-prev">' . esc_html( $st['steps']['prev_text'] ) . '</button>';
			}
			if ( $si < $total_steps - 1 ) {
				echo '<button type="button" class="wlfp-btn wlfp-btn-next">' . esc_html( $st['steps']['next_text'] ) . '</button>';
			} else {
				$label = $st['button']['text'];
				if ( 'none' !== $st['payment']['provider'] && WLFP_Payments::has_items( $form ) ) {
					$label = apply_filters( 'wlfp_pay_button_text', $label, $form );
				}
				echo '<button type="submit" class="wlfp-btn wlfp-btn-submit wlfp-btn-' . esc_attr( $st['button']['style'] ) . '">' . esc_html( $label ) . '</button>';
			}
			echo '</div></fieldset>';
		}
		echo '</form><div class="wlfp-confirmation" role="status" aria-live="polite" tabindex="-1" hidden></div></div>';
		return ob_get_clean();
	}

	public static function captcha_client( $form ) {
		$p = $form['settings']['spam']['captcha'];
		if ( 'none' === $p ) {
			return null;
		}
		$cfg = WLFP_Spam::captcha_config();
		if ( ! isset( $cfg[ $p ] ) ) {
			return null;
		}
		return array( 'provider' => $p, 'site' => $cfg[ $p ]['site'], 'v3' => 'recaptcha' === $p && 'v3' === WLFP_Helpers::setting( 'recaptcha_version' ) );
	}

	public static function render_field( $f, $form, $uid, $visible = true, $prefill = null ) {
		$type = $f['type'];
		$fid  = WLFP_Fields::dom_id( $form['id'], $f );
		$cond = isset( $f['conditional'] ) ? $f['conditional'] : array();
		$has  = ! empty( $cond['enabled'] ) && ! empty( $cond['rules'] );

		$width = in_array( $f['width'] ?? 'full', array( 'full', 'half', 'third', 'two_third', 'quarter' ), true ) ? $f['width'] : 'full';
		$cls   = array( 'wlfp-field', 'wlfp-type-' . $type, 'wlfp-w-' . $width );
		if ( ! empty( $f['css_class'] ) ) {
			$cls[] = implode( ' ', array_map( 'sanitize_html_class', explode( ' ', $f['css_class'] ) ) );
		}
		if ( $has ) {
			$cls[] = 'wlfp-cond';
		}
		if ( ! empty( $f['required'] ) ) {
			$cls[] = 'wlfp-required';
		}
		$attrs = ' class="' . esc_attr( implode( ' ', $cls ) ) . '" id="' . esc_attr( $fid ) . '-wrap" data-type="' . esc_attr( $type ) . '"';
		if ( ! empty( $f['name'] ) ) {
			$attrs .= ' data-name="' . esc_attr( $f['name'] ) . '"';
		}
		if ( ! empty( $f['required'] ) ) {
			$attrs .= ' data-required="1"' . ( ! empty( $f['req_msg'] ) ? ' data-req-msg="' . esc_attr( $f['req_msg'] ) . '"' : '' );
		}
		if ( $has ) {
			$attrs .= ' data-cond="' . esc_attr( wp_json_encode( $cond ) ) . '"' . ( $visible ? '' : ' hidden' );
		}

		// Layout-only elements.
		switch ( $type ) {
			case 'section':
				return '<div' . $attrs . '><h4 class="wlfp-section-title">' . esc_html( $f['label'] ) . '</h4>' . ( ! empty( $f['help'] ) ? '<p class="wlfp-section-desc">' . wp_kses( $f['help'], WLFP_Helpers::allowed_html() ) . '</p>' : '' ) . '</div>';
			case 'html':
				return '<div' . $attrs . '><div class="wlfp-html">' . wp_kses( $f['html'] ?? '', WLFP_Helpers::allowed_html() ) . '</div></div>';
			case 'divider':
				return '<div' . $attrs . '><hr class="wlfp-divider" /></div>';
			case 'shortcode':
				return '<div' . $attrs . '>' . do_shortcode( wp_kses_post( $f['shortcode'] ?? '' ) ) . '</div>';
			case 'captcha':
				$c = self::captcha_client( $form );
				if ( ! $c ) {
					return current_user_can( 'edit_posts' ) ? '<div' . $attrs . '><em>' . esc_html__( 'Choose a CAPTCHA provider under Form Settings → Spam protection.', 'weberslink-forms-pro' ) . '</em></div>' : '';
				}
				if ( $c['v3'] ) {
					return '<div' . $attrs . '><div class="wlfp-captcha wlfp-captcha-v3" data-provider="recaptcha" data-site="' . esc_attr( $c['site'] ) . '" data-v3="1"></div></div>';
				}
				return '<div' . $attrs . '><div class="wlfp-captcha" data-provider="' . esc_attr( $c['provider'] ) . '" data-site="' . esc_attr( $c['site'] ) . '"></div><div class="wlfp-error" role="alert"></div></div>';
			case 'image_block':
				$u = ! empty( $f['url'] ) ? esc_url( $f['url'] ) : '';
				if ( ! $u ) {
					return '';
				}
				$mw  = max( 1, min( 100, (int) ( $f['max_width'] ?? 100 ) ) );
				$img = '<img src="' . $u . '" alt="' . esc_attr( $f['alt'] ?? '' ) . '" loading="lazy" style="max-width:' . $mw . '%;height:auto" />';
				if ( ! empty( $f['link'] ) ) {
					$img = '<a href="' . esc_url( $f['link'] ) . '" rel="noopener">' . $img . '</a>';
				}
				return '<div' . $attrs . '><div class="wlfp-image-block wlfp-ta-' . esc_attr( in_array( $f['align'] ?? 'left', array( 'left', 'center', 'right' ), true ) ? $f['align'] : 'left' ) . '">' . $img . '</div></div>';
			case 'embed':
				$u    = ! empty( $f['url'] ) ? esc_url_raw( $f['url'] ) : '';
				$html = $u ? wp_oembed_get( $u ) : false;
				if ( ! $html ) {
					$html = $u ? '<a href="' . esc_url( $u ) . '" target="_blank" rel="noopener">' . esc_html( $u ) . '</a>' : '';
				}
				return $html ? '<div' . $attrs . '><div class="wlfp-embed">' . $html . '</div></div>' : '';
			case 'payment_summary':
				return '<div' . $attrs . '><div class="wlfp-summary" data-currency="' . esc_attr( WLFP_Payments::currency( $form ) ) . '"></div></div>';
		}

		if ( 'hidden' === $type ) {
			return '<div class="wlfp-field wlfp-type-hidden' . ( $has ? ' wlfp-cond' : '' ) . '" data-type="hidden" data-name="' . esc_attr( $f['name'] ) . '"' . ( $has ? ' data-cond="' . esc_attr( wp_json_encode( $cond ) ) . '"' . ( $visible ? '' : ' hidden' ) : '' ) . '>' . WLFP_Fields::render_input( $f, $form, $prefill ) . '</div>';
		}

		$input   = WLFP_Fields::render_input( $f, $form, $prefill );
		$label   = isset( $f['label'] ) ? $f['label'] : '';
		$grouped = in_array( $type, array( 'radio', 'checkbox', 'rating', 'nps', 'name', 'address', 'likert', 'consent', 'signature', 'repeater', 'image_choice', 'ranking', 'emoji_rating', 'date_range', 'toggle', 'terms' ), true ) || ( 'payment_item' === $type && 'select' !== ( $f['kind'] ?? '' ) && 'custom' !== ( $f['kind'] ?? '' ) );
		$star    = '';
		$ast     = isset( $form['settings']['style']['asterisk'] ) ? $form['settings']['style']['asterisk'] : 'end';
		if ( ! empty( $f['required'] ) && 'none' !== $ast ) {
			$star = '<span class="wlfp-req" aria-hidden="true"> *</span>';
		}
		$out = '<div' . $attrs . '>';
		if ( '' !== $label && 'consent' !== $type ) {
			if ( $grouped ) {
				$out .= '<div class="wlfp-label" id="' . esc_attr( $fid ) . '-label">' . esc_html( $label ) . $star . '</div>';
			} else {
				$out .= '<label class="wlfp-label" id="' . esc_attr( $fid ) . '-label" for="' . esc_attr( $fid ) . '">' . esc_html( $label ) . $star . '</label>';
			}
		}
		$out .= '<div class="wlfp-control">' . $input . '</div>';
		if ( ! empty( $f['help'] ) ) {
			$out .= '<div class="wlfp-help" id="' . esc_attr( $fid ) . '-help">' . wp_kses( $f['help'], WLFP_Helpers::allowed_html() ) . '</div>';
		}
		$out .= '<div class="wlfp-error" role="alert"></div></div>';
		return $out;
	}

	/* ---------------- Preview ---------------- */

	public static function preview() {
		if ( empty( $_GET['wlfp_preview'] ) || ! WLFP_Helpers::can_manage() ) { // phpcs:ignore
			return;
		}
		$id = (int) $_GET['wlfp_preview']; // phpcs:ignore
		status_header( 200 );
		nocache_headers();
		$GLOBALS['wlfp_preview_id'] = $id;
		add_filter( 'template_include', function () {
			return WLFP_DIR . 'templates/preview.php';
		}, 99 );
	}

	/* ---------------- Analytics beacon / nonce refresh ---------------- */

	public static function ajax_view() {
		if ( ! WLFP_Helpers::setting( 'track_views', 1 ) ) {
			wp_send_json_success();
		}
		$id = isset( $_POST['form_id'] ) ? (int) $_POST['form_id'] : 0; // phpcs:ignore
		if ( $id && WLFP_Forms::get( $id ) ) {
			global $wpdb;
			$wpdb->query( $wpdb->prepare( "INSERT INTO {$wpdb->prefix}wlfp_views (form_id, day, views) VALUES (%d, %s, 1) ON DUPLICATE KEY UPDATE views = views + 1", $id, gmdate( 'Y-m-d' ) ) ); // phpcs:ignore
		}
		wp_send_json_success();
	}

	/** Fresh nonce + timestamp token for cached pages. */
	public static function ajax_fresh() {
		$id = isset( $_POST['form_id'] ) ? (int) $_POST['form_id'] : 0; // phpcs:ignore
		if ( ! $id ) {
			wp_send_json_error();
		}
		wp_send_json_success( array( 'nonce' => wp_create_nonce( 'wlfp_submit_' . $id ), 'ts' => WLFP_Spam::token( $id ) ) );
	}
}
