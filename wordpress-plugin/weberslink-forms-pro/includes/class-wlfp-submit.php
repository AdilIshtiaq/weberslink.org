<?php
defined( 'ABSPATH' ) || exit;

class WLFP_Submit {

	public static function init() {
		add_action( 'wp_ajax_wlfp_submit', array( __CLASS__, 'handle' ) );
		add_action( 'wp_ajax_nopriv_wlfp_submit', array( __CLASS__, 'handle' ) );
	}

	private static function fail( $message, $errors = array(), $extra = array(), $ajax = true ) {
		if ( $ajax ) {
			wp_send_json( array( 'success' => false, 'data' => array_merge( array( 'message' => $message, 'errors' => (object) $errors ), $extra ) ) );
		}
		wp_die( esc_html( $message ) . '<br><br><a href="javascript:history.back()">' . esc_html__( '← Go back', 'weberslink-forms-pro' ) . '</a>', esc_html__( 'Form error', 'weberslink-forms-pro' ), array( 'response' => 400 ) ); // phpcs:ignore
	}

	public static function handle() {
		$ajax    = ! empty( $_SERVER['HTTP_X_REQUESTED_WITH'] ) || ! empty( $_POST['wlfp_ajax'] ); // phpcs:ignore
		$form_id = isset( $_POST['wlfp_form_id'] ) ? (int) $_POST['wlfp_form_id'] : 0; // phpcs:ignore
		$form    = $form_id ? WLFP_Forms::get( $form_id ) : null;
		if ( ! $form ) {
			self::fail( __( 'This form no longer exists.', 'weberslink-forms-pro' ), array(), array(), $ajax );
		}
		$preview = ! empty( $_POST['wlfp_preview'] ) && WLFP_Helpers::can_manage(); // phpcs:ignore
		if ( 'published' !== $form['status'] && ! $preview ) {
			self::fail( __( 'This form is not accepting submissions.', 'weberslink-forms-pro' ), array(), array(), $ajax );
		}
		$nonce = isset( $_POST['wlfp_nonce'] ) ? sanitize_text_field( wp_unslash( $_POST['wlfp_nonce'] ) ) : '';
		if ( ! wp_verify_nonce( $nonce, 'wlfp_submit_' . $form['id'] ) ) {
			self::fail( __( 'Your session expired. Retrying…', 'weberslink-forms-pro' ), array(), array( 'code' => 'nonce', 'nonce' => wp_create_nonce( 'wlfp_submit_' . $form['id'] ), 'ts' => WLFP_Spam::token( $form['id'] ) ), $ajax );
		}
		if ( ! $preview ) {
			$closed = WLFP_Renderer::closed_message( $form );
			if ( $closed ) {
				self::fail( wp_strip_all_tags( $closed ), array(), array(), $ajax );
			}
		}
		// WordPress slashes $_POST; each collect() call unslashes and sanitises per field type.
		$slashed = $_POST; // phpcs:ignore

		/* 1. Collect values. */
		$values = array();
		foreach ( $form['fields'] as $f ) {
			if ( ! WLFP_Fields::stores_value( $f['type'] ) || empty( $f['name'] ) || in_array( $f['type'], array( 'file', 'image' ), true ) ) {
				continue;
			}
			$values[ $f['name'] ] = WLFP_Fields::collect( $f, $slashed );
		}
		$visible = WLFP_Logic::visible_fields( $form['fields'], $values );

		/* 2. Validate visible fields. */
		$errors = array();
		$data   = array();
		foreach ( $form['fields'] as $f ) {
			if ( ! WLFP_Fields::stores_value( $f['type'] ) || empty( $f['name'] ) || empty( $visible[ $f['id'] ] ) ) {
				continue;
			}
			if ( in_array( $f['type'], array( 'file', 'image' ), true ) ) {
				continue;
			}
			$v = $values[ $f['name'] ];
			if ( 'calculation' === $f['type'] ) {
				continue; // Recomputed below.
			}
			$err = WLFP_Fields::validate( $f, $v, $form );
			if ( ! $err && in_array( $f['type'], array( 'email', 'password' ), true ) && ! empty( $f['confirm'] ) && ! WLFP_Fields::is_empty( $v ) ) {
				$cv = isset( $slashed[ $f['name'] . '__confirm' ] ) && is_scalar( $slashed[ $f['name'] . '__confirm' ] ) ? wp_unslash( (string) $slashed[ $f['name'] . '__confirm' ] ) : '';
				if ( 'email' === $f['type'] ? 0 !== strcasecmp( $v, sanitize_email( $cv ) ) : $v !== $cv ) {
					$err = __( 'The two values do not match.', 'weberslink-forms-pro' );
				}
			}
			if ( ! $err && ! $preview && ! empty( $f['unique'] ) && ! WLFP_Fields::is_empty( $v ) && WLFP_Entries::value_exists( $form['id'], $f['name'], $v ) ) {
				$err = __( 'This value has already been submitted.', 'weberslink-forms-pro' );
			}
			if ( $err ) {
				$errors[ $f['name'] ] = $err;
			}
			$data[ $f['name'] ] = $v;
		}
		// Calculations (server-side truth).
		foreach ( $form['fields'] as $f ) {
			if ( 'calculation' === $f['type'] && ! empty( $visible[ $f['id'] ] ) && ! empty( $f['name'] ) ) {
				$data[ $f['name'] ] = round( WLFP_Calc::evaluate( $f['formula'] ?? '', $data ), (int) ( $f['decimals'] ?? 2 ) );
			}
		}
		// Quantity fields must have an integer value.
		// Uploads.
		$uploaded = array();
		foreach ( $form['fields'] as $f ) {
			if ( ! in_array( $f['type'], array( 'file', 'image' ), true ) || empty( $visible[ $f['id'] ] ) || empty( $f['name'] ) ) {
				continue;
			}
			$has = WLFP_Uploads::normalize( $f['name'] );
			if ( ! $has ) {
				if ( ! empty( $f['required'] ) ) {
					$errors[ $f['name'] ] = ! empty( $f['req_msg'] ) ? $f['req_msg'] : sprintf( /* translators: %s: label */ __( '%s is required.', 'weberslink-forms-pro' ), $f['label'] );
				}
				continue;
			}
			if ( $errors ) {
				continue; // Don't store files when the form is invalid.
			}
			list( $files, $ferr ) = WLFP_Uploads::handle( $f, $form );
			if ( $ferr ) {
				$errors[ $f['name'] ] = $ferr;
			} else {
				$data[ $f['name'] ] = $files;
				$uploaded[]         = $files;
			}
		}
		// Duplicate by IP.
		$r = $form['settings']['restrictions'];
		if ( ! empty( $r['one_per_ip'] ) && ! $preview && WLFP_Helpers::ip() ) {
			global $wpdb;
			if ( (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$wpdb->prefix}wlfp_entries WHERE form_id=%d AND ip=%s AND status<>'spam'", $form['id'], WLFP_Helpers::ip() ) ) > 0 ) { // phpcs:ignore
				$errors['_form'] = $r['dup_msg'];
			}
		}
		$errors = apply_filters( 'wlfp_validation_errors', $errors, $form, $data );
		if ( $errors ) {
			foreach ( $uploaded as $fl ) {
				WLFP_Uploads::delete_files( $fl );
			}
			$msg = isset( $errors['_form'] ) ? $errors['_form'] : __( 'Please correct the highlighted fields.', 'weberslink-forms-pro' );
			self::fail( $msg, $errors, array(), $ajax );
		}

		/* 3. Spam. */
		$spam = $preview ? array( 'spam' => false, 'reason' => '', 'error' => '' ) : WLFP_Spam::check( $form, $slashed, $data );
		if ( $spam['error'] ) {
			foreach ( $uploaded as $fl ) {
				WLFP_Uploads::delete_files( $fl );
			}
			self::fail( $spam['error'], array(), array(), $ajax );
		}
		$source = isset( $slashed['wlfp_source'] ) ? esc_url_raw( wp_unslash( $slashed['wlfp_source'] ) ) : '';
		if ( $spam['spam'] ) {
			if ( 0 === strpos( $spam['reason'], 'honeypot' ) || 'bad_token' === $spam['reason'] ) {
				foreach ( $uploaded as $fl ) {
					WLFP_Uploads::delete_files( $fl );
				}
			} else {
				$sid = WLFP_Entries::insert( $form, self::storable( $form, $data ), array( 'status' => 'spam', 'source_url' => $source ) );
				WLFP_Install::log( $form['id'], $sid, 'spam', 'info', 'Marked as spam', $spam['reason'] );
			}
			// Pretend success so bots learn nothing.
			self::respond_ok( $form, $data, array( 'id' => 0, 'serial' => 0, 'ip' => '', 'source_url' => $source, 'payment_total' => 0, 'currency' => '', 'payment_status' => '', 'transaction_id' => '', 'user_id' => 0 ), $ajax, true );
		}

		/* 3b. Quiz scoring. */
		if ( ! empty( $form['settings']['quiz']['enabled'] ) ) {
			$data['_quiz'] = self::quiz( $form, $data, $visible );
		}

		/* 4. Payment. */
		$provider = $form['settings']['payment']['provider'];
		$calc     = WLFP_Payments::has_items( $form ) ? WLFP_Payments::compute( $form, $data, $visible ) : null;
		$pay      = $calc && $calc['total'] > 0;
		$extra    = array( 'source_url' => $source );
		if ( $calc ) {
			$data['_payment'] = $calc;
			$extra['payment_total'] = $calc['total'];
			$extra['currency']      = WLFP_Payments::currency( $form );
			if ( $pay && 'none' !== $provider ) {
				$extra['payment_status'] = 'pending';
				$extra['payment_method'] = $provider;
			}
		}

		/* 5. Store. */
		$data  = apply_filters( 'wlfp_before_insert', $data, $form );
		$store = ! empty( $form['settings']['entries']['store'] ) || ( $pay && in_array( $provider, array( 'stripe', 'paypal' ), true ) );
		if ( $store ) {
			$eid   = WLFP_Entries::insert( $form, self::storable( $form, $data ), $extra );
			$entry = WLFP_Entries::get( $eid );
		} else {
			$entry = array_merge( array( 'id' => 0, 'form_id' => $form['id'], 'serial' => 0, 'user_id' => get_current_user_id(), 'status' => 'unread', 'ip' => WLFP_Helpers::ip(), 'user_agent' => '', 'payment_status' => '', 'payment_method' => '', 'payment_total' => 0, 'currency' => '', 'transaction_id' => '', 'created_at' => current_time( 'mysql', true ), 'data' => array() ), $extra );
		}
		$entry['data'] = $data; // Keeps secrets (e.g. password) available to feeds in-memory.
		if ( $calc && $calc['coupon'] ) {
			WLFP_Payments::use_coupon( $form, $calc['coupon'] );
		}
		WLFP_Install::log( $form['id'], $entry['id'], 'form', 'success', 'Form submitted' );
		if ( ! empty( $slashed['wlfp_draft'] ) && is_scalar( $slashed['wlfp_draft'] ) ) {
			WLFP_Drafts::delete( wp_unslash( (string) $slashed['wlfp_draft'] ) );
		}

		if ( $pay && in_array( $provider, array( 'stripe', 'paypal' ), true ) ) {
			$res = WLFP_Payments::start( $form, $entry, $data );
			if ( ! empty( $res['redirect'] ) ) {
				if ( empty( $form['settings']['payment']['send_after_payment'] ) ) {
					self::finalize( $form, $entry );
				}
				self::send( array( 'success' => true, 'data' => array( 'type' => 'redirect', 'redirect' => $res['redirect'], 'entry_id' => $entry['id'] ) ), $ajax, $res['redirect'] );
			}
			WLFP_Entries::update( $entry['id'], array( 'payment_status' => 'failed' ) );
			self::fail( $res['error'], array(), array(), $ajax );
		}

		self::finalize( $form, $entry );
		self::respond_ok( $form, $data, $entry, $ajax );
	}

	/** Totals option scores of choice fields. */
	public static function quiz( $form, $data, $visible ) {
		$score = 0.0;
		$max   = 0.0;
		foreach ( $form['fields'] as $f ) {
			if ( empty( $visible[ $f['id'] ] ) || empty( $f['name'] ) || empty( $f['options'] ) || ! in_array( $f['type'], array( 'radio', 'select', 'checkbox', 'multiselect', 'image_choice' ), true ) ) {
				continue;
			}
			$multi  = in_array( $f['type'], array( 'checkbox', 'multiselect' ), true ) || ( 'image_choice' === $f['type'] && ! empty( $f['multiple'] ) );
			$scores = array();
			foreach ( $f['options'] as $o ) {
				$scores[ (string) $o['value'] ] = (float) ( $o['score'] ?? 0 );
			}
			if ( ! array_filter( $scores ) ) {
				continue;
			}
			foreach ( (array) ( isset( $data[ $f['name'] ] ) ? $data[ $f['name'] ] : array() ) as $v ) {
				if ( isset( $scores[ (string) $v ] ) ) {
					$score += $scores[ (string) $v ];
				}
			}
			$max += $multi ? array_sum( array_filter( $scores, function ( $x ) {
				return $x > 0;
			} ) ) : max( $scores );
		}
		$pct = $max > 0 ? round( $score / $max * 100, 1 ) : 0;
		return array( 'score' => $score, 'max' => $max, 'percent' => $pct, 'passed' => $pct >= (float) $form['settings']['quiz']['pass_percent'] );
	}

	/** Data as stored in DB: no raw passwords or internal-only values. */
	public static function storable( $form, $data ) {
		foreach ( $form['fields'] as $f ) {
			if ( 'password' === $f['type'] && isset( $data[ $f['name'] ] ) ) {
				$data[ $f['name'] ] = '';
			}
		}
		return $data;
	}

	/** Notifications + integrations. */
	public static function finalize( $form, $entry ) {
		do_action( 'wlfp_before_finalize', $entry, $form );
		WLFP_Notifications::send_all( $form, $entry );
		WLFP_Integrations::run( $form, $entry );
		do_action( 'wlfp_after_submit', $entry, $form );
	}

	private static function send( $payload, $ajax, $redirect = '' ) {
		if ( $ajax ) {
			wp_send_json( $payload );
		}
		wp_safe_redirect( $redirect ? $redirect : wp_get_referer() ); // phpcs:ignore
		exit;
	}

	public static function respond_ok( $form, $data, $entry, $ajax, $quiet = false ) {
		$c = $form['settings']['confirmation'];
		foreach ( (array) ( isset( $c['rules'] ) ? $c['rules'] : array() ) as $rule ) {
			if ( is_array( $rule ) && WLFP_Logic::passes( isset( $rule['conditional'] ) ? $rule['conditional'] : array(), $data ) ) {
				$c = array_merge( $c, array_intersect_key( $rule, array_flip( array( 'type', 'message', 'url', 'page_id' ) ) ) );
				break;
			}
		}
		$out = array( 'type' => 'message', 'message' => '', 'entry_id' => $entry['id'] );
		if ( 'redirect' === $c['type'] && ! empty( $c['url'] ) ) {
			$out['type']     = 'redirect';
			$out['redirect'] = esc_url_raw( WLFP_Merge::parse( rawurldecode( $c['url'] ), $form, $data, $entry ) );
		} elseif ( 'page' === $c['type'] && ! empty( $c['page_id'] ) && get_permalink( (int) $c['page_id'] ) ) {
			$out['type']     = 'redirect';
			$out['redirect'] = get_permalink( (int) $c['page_id'] );
		} else {
			$out['message'] = wp_kses( WLFP_Merge::parse( $c['message'], $form, $data, $entry, true ), WLFP_Helpers::allowed_html() );
		}
		if ( ! $ajax ) {
			$dest = 'redirect' === $out['type'] ? $out['redirect'] : add_query_arg( 'wlfp_thanks', $form['id'], remove_query_arg( 'wlfp_thanks', ! empty( $entry['source_url'] ) ? $entry['source_url'] : wp_get_referer() ) ); // phpcs:ignore
			wp_safe_redirect( $dest );
			exit;
		}
		wp_send_json( array( 'success' => true, 'data' => $out ) );
	}
}
