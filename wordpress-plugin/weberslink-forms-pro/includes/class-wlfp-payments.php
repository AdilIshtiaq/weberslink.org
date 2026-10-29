<?php
defined( 'ABSPATH' ) || exit;

/**
 * Pricing, coupons, Stripe Checkout, PayPal Orders and offline payments.
 * Totals are always computed server-side from the saved form definition.
 */
class WLFP_Payments {

	public static function init() {
		add_action( 'rest_api_init', array( __CLASS__, 'routes' ) );
		add_action( 'template_redirect', array( __CLASS__, 'handle_return' ) );
		add_action( 'wp_ajax_wlfp_coupon', array( __CLASS__, 'ajax_coupon' ) );
		add_action( 'wp_ajax_nopriv_wlfp_coupon', array( __CLASS__, 'ajax_coupon' ) );
	}

	public static function currency( $form ) {
		$c = ! empty( $form['settings']['payment']['currency'] ) ? $form['settings']['payment']['currency'] : WLFP_Helpers::setting( 'currency', 'USD' );
		return strtoupper( $c );
	}

	public static function has_items( $form ) {
		foreach ( $form['fields'] as $f ) {
			if ( 'payment_item' === $f['type'] ) {
				return true;
			}
		}
		return false;
	}

	public static function client_config( $form ) {
		if ( ! self::has_items( $form ) ) {
			return null;
		}
		$items = array();
		foreach ( $form['fields'] as $f ) {
			if ( 'payment_item' === $f['type'] ) {
				$items[] = array( 'name' => $f['name'], 'label' => $f['label'], 'kind' => $f['kind'] ?? 'fixed', 'price' => (float) ( $f['price'] ?? 0 ), 'options' => array_map( function ( $o ) {
					return array( 'value' => (string) $o['value'], 'label' => $o['label'], 'price' => (float) ( $o['price'] ?? 0 ) );
				}, (array) ( $f['options'] ?? array() ) ) );
			}
		}
		$qty = array();
		foreach ( $form['fields'] as $f ) {
			if ( 'quantity' === $f['type'] && ! empty( $f['item'] ) ) {
				$qty[ $f['item'] ] = $f['name'];
			}
		}
		$has_coupon = false;
		foreach ( $form['fields'] as $f ) {
			if ( 'coupon' === $f['type'] ) {
				$has_coupon = true;
			}
		}
		return array( 'items' => $items, 'qty' => $qty, 'tax' => (float) $form['settings']['payment']['tax_percent'], 'currency' => self::currency( $form ), 'symbol' => trim( WLFP_Helpers::currency_symbol( self::currency( $form ) ) ), 'zeroDec' => WLFP_Helpers::zero_decimal( self::currency( $form ) ), 'coupon' => $has_coupon, 'provider' => $form['settings']['payment']['provider'] );
	}

	/** Returns array( lines[], subtotal, discount, tax, total, coupon ). */
	public static function compute( $form, $data, $visible = array() ) {
		$qty = array();
		foreach ( $form['fields'] as $f ) {
			if ( 'quantity' === $f['type'] && ! empty( $f['item'] ) && ( empty( $visible ) || ! empty( $visible[ $f['id'] ] ) ) ) {
				$q = isset( $data[ $f['name'] ] ) ? (int) $data[ $f['name'] ] : 1;
				$qty[ $f['item'] ] = max( 0, min( (int) ( $f['max'] ?? 99 ), $q ) );
			}
		}
		$lines = array();
		foreach ( $form['fields'] as $f ) {
			if ( 'payment_item' !== $f['type'] || ( ! empty( $visible ) && empty( $visible[ $f['id'] ] ) ) ) {
				continue;
			}
			$kind = $f['kind'] ?? 'fixed';
			$q    = isset( $qty[ $f['name'] ] ) ? $qty[ $f['name'] ] : 1;
			$v    = isset( $data[ $f['name'] ] ) ? $data[ $f['name'] ] : '';
			if ( 'fixed' === $kind ) {
				$lines[] = array( 'label' => $f['label'], 'unit' => (float) $f['price'], 'qty' => $q );
			} elseif ( 'custom' === $kind ) {
				$amt = max( (float) ( $f['min'] ?? 0 ), (float) $v );
				if ( $amt > 0 ) {
					$lines[] = array( 'label' => $f['label'], 'unit' => $amt, 'qty' => $q );
				}
			} else {
				foreach ( (array) $v as $sel ) {
					foreach ( (array) ( $f['options'] ?? array() ) as $o ) {
						if ( (string) $o['value'] === (string) $sel && '' !== trim( (string) ( $o['price'] ?? '' ) ) ) {
							$lines[] = array( 'label' => $f['label'] . ' — ' . $o['label'], 'unit' => (float) $o['price'], 'qty' => $q );
						}
					}
				}
			}
		}
		$sub = 0;
		foreach ( $lines as &$l ) {
			$l['amount'] = round( $l['unit'] * $l['qty'], 2 );
			$sub        += $l['amount'];
		}
		unset( $l );
		$discount = 0;
		$coupon   = null;
		foreach ( $form['fields'] as $f ) {
			if ( 'coupon' === $f['type'] && ! empty( $data[ $f['name'] ] ) && ( empty( $visible ) || ! empty( $visible[ $f['id'] ] ) ) ) {
				$coupon = self::find_coupon( $form, $data[ $f['name'] ] );
				if ( $coupon ) {
					$discount = 'percent' === $coupon['type'] ? round( $sub * min( 100, (float) $coupon['amount'] ) / 100, 2 ) : min( $sub, (float) $coupon['amount'] );
				}
			}
		}
		$taxable = max( 0, $sub - $discount );
		$tax     = round( $taxable * (float) $form['settings']['payment']['tax_percent'] / 100, 2 );
		return array( 'lines' => $lines, 'subtotal' => round( $sub, 2 ), 'discount' => round( $discount, 2 ), 'tax' => $tax, 'total' => round( $taxable + $tax, 2 ), 'coupon' => $coupon ? $coupon['code'] : '' );
	}

	public static function find_coupon( $form, $code ) {
		$code = strtolower( trim( (string) $code ) );
		if ( '' === $code ) {
			return null;
		}
		$uses = get_option( 'wlfp_coupon_uses', array() );
		foreach ( (array) $form['settings']['payment']['coupons'] as $c ) {
			if ( empty( $c['code'] ) || strtolower( $c['code'] ) !== $code ) {
				continue;
			}
			if ( ! empty( $c['expires'] ) && strtotime( $c['expires'] . ' 23:59:59' ) < time() ) {
				return null;
			}
			$key = $form['id'] . ':' . strtolower( $c['code'] );
			if ( ! empty( $c['limit'] ) && (int) ( $uses[ $key ] ?? 0 ) >= (int) $c['limit'] ) {
				return null;
			}
			return array( 'code' => $c['code'], 'type' => 'fixed' === ( $c['type'] ?? '' ) ? 'fixed' : 'percent', 'amount' => (float) ( $c['amount'] ?? 0 ) );
		}
		return null;
	}

	public static function use_coupon( $form, $code ) {
		$uses = get_option( 'wlfp_coupon_uses', array() );
		$key  = $form['id'] . ':' . strtolower( $code );
		$uses[ $key ] = (int) ( $uses[ $key ] ?? 0 ) + 1;
		update_option( 'wlfp_coupon_uses', $uses, false );
	}

	public static function ajax_coupon() {
		$id   = isset( $_POST['form_id'] ) ? (int) $_POST['form_id'] : 0; // phpcs:ignore
		$form = $id ? WLFP_Forms::get( $id ) : null;
		$c    = $form && isset( $_POST['code'] ) ? self::find_coupon( $form, sanitize_text_field( wp_unslash( $_POST['code'] ) ) ) : null; // phpcs:ignore
		if ( ! $c ) {
			wp_send_json_error();
		}
		wp_send_json_success( array( 'type' => $c['type'], 'amount' => $c['amount'] ) );
	}

	/* ---------------- Checkout ---------------- */

	public static function return_key( $entry ) {
		return substr( hash_hmac( 'sha256', $entry['id'] . '|' . $entry['created_at'], wp_salt( 'auth' ) ), 0, 24 );
	}

	public static function return_url( $entry, $result ) {
		return add_query_arg( array( 'wlfp_pay' => $result, 'entry' => $entry['id'], 'k' => self::return_key( $entry ) ), home_url( '/' ) );
	}

	/** Returns array( 'redirect' => url ) or array( 'error' => msg ). */
	public static function start( $form, $entry, $data ) {
		$p = $form['settings']['payment']['provider'];
		if ( 'stripe' === $p ) {
			return self::stripe_start( $form, $entry, $data );
		}
		if ( 'paypal' === $p ) {
			return self::paypal_start( $form, $entry, $data );
		}
		return array( 'error' => __( 'No payment method configured.', 'weberslink-forms-pro' ) );
	}

	private static function stripe_start( $form, $entry, $data ) {
		$sk = WLFP_Helpers::setting( 'stripe_sk' );
		if ( ! $sk ) {
			return array( 'error' => __( 'Stripe is not configured.', 'weberslink-forms-pro' ) );
		}
		$calc = self::compute( $form, $data );
		$cur  = strtolower( self::currency( $form ) );
		$zero = WLFP_Helpers::zero_decimal( $cur );
		$mult = $zero ? 1 : 100;
		$sub  = ! empty( $form['settings']['payment']['recurring'] );
		$intv = isset( $form['settings']['payment']['interval'] ) && in_array( $form['settings']['payment']['interval'], array( 'day', 'week', 'month', 'year' ), true ) ? $form['settings']['payment']['interval'] : 'month';
		$body = array(
			'mode'                => $sub ? 'subscription' : 'payment',
			'success_url'         => self::return_url( $entry, 'stripe_ok' ) . '&session_id={CHECKOUT_SESSION_ID}',
			'cancel_url'          => self::return_url( $entry, 'cancel' ),
			'client_reference_id' => (string) $entry['id'],
			'metadata'            => array( 'wlfp_entry' => (string) $entry['id'], 'wlfp_form' => (string) $form['id'] ),
		);
		if ( $sub ) {
			$body['subscription_data'] = array( 'metadata' => array( 'wlfp_entry' => (string) $entry['id'] ) );
		} else {
			$body['payment_intent_data'] = array( 'metadata' => array( 'wlfp_entry' => (string) $entry['id'] ) );
		}
		foreach ( $form['fields'] as $f ) {
			if ( 'email' === $f['type'] && ! empty( $data[ $f['name'] ] ) ) {
				$body['customer_email'] = $data[ $f['name'] ];
				break;
			}
		}
		$i = 0;
		// Send each line with discount and tax folded in proportionally so Stripe's total equals ours.
		$factor = $calc['subtotal'] > 0 ? ( $calc['total'] / $calc['subtotal'] ) : 1;
		$sum    = 0;
		$n      = count( $calc['lines'] );
		foreach ( $calc['lines'] as $idx => $l ) {
			$amount = ( $idx === $n - 1 ) ? round( $calc['total'] - $sum, 2 ) : round( $l['amount'] * $factor, 2 );
			$sum   += $amount;
			$unit   = $l['qty'] > 0 ? $amount / $l['qty'] : $amount;
			$body['line_items'][ $i ] = array( 'quantity' => max( 1, (int) $l['qty'] ), 'price_data' => array( 'currency' => $cur, 'unit_amount' => (int) round( $unit * $mult ), 'product_data' => array( 'name' => mb_substr( $l['label'], 0, 120 ) ) ) + ( $sub ? array( 'recurring' => array( 'interval' => $intv ) ) : array() ) );
			$i++;
		}
		if ( ! $i || $calc['total'] <= 0 ) {
			return array( 'error' => __( 'Nothing to pay for.', 'weberslink-forms-pro' ) );
		}
		$r = wp_remote_post( 'https://api.stripe.com/v1/checkout/sessions', array( 'timeout' => 25, 'headers' => array( 'Authorization' => 'Bearer ' . $sk ), 'body' => $body ) );
		if ( is_wp_error( $r ) ) {
			WLFP_Install::log( $form['id'], $entry['id'], 'stripe', 'failed', 'Request failed', $r->get_error_message() );
			return array( 'error' => __( 'Could not reach Stripe. Please try again.', 'weberslink-forms-pro' ) );
		}
		$j = json_decode( wp_remote_retrieve_body( $r ), true );
		if ( empty( $j['url'] ) ) {
			WLFP_Install::log( $form['id'], $entry['id'], 'stripe', 'failed', 'Stripe error', isset( $j['error']['message'] ) ? $j['error']['message'] : wp_remote_retrieve_body( $r ) );
			return array( 'error' => __( 'Payment could not be started. Please contact the site owner.', 'weberslink-forms-pro' ) );
		}
		WLFP_Entries::update( $entry['id'], array( 'transaction_id' => sanitize_text_field( $j['id'] ) ) );
		WLFP_Install::log( $form['id'], $entry['id'], 'stripe', 'info', 'Checkout session created', $j['id'] );
		return array( 'redirect' => esc_url_raw( $j['url'] ) );
	}

	private static function paypal_base() {
		return 'live' === WLFP_Helpers::setting( 'paypal_mode' ) ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
	}

	private static function paypal_token() {
		$id = WLFP_Helpers::setting( 'paypal_client' );
		$sc = WLFP_Helpers::setting( 'paypal_secret' );
		if ( ! $id || ! $sc ) {
			return '';
		}
		$r = wp_remote_post( self::paypal_base() . '/v1/oauth2/token', array( 'timeout' => 20, 'headers' => array( 'Authorization' => 'Basic ' . base64_encode( $id . ':' . $sc ) ), 'body' => array( 'grant_type' => 'client_credentials' ) ) );
		if ( is_wp_error( $r ) ) {
			return '';
		}
		$j = json_decode( wp_remote_retrieve_body( $r ), true );
		return isset( $j['access_token'] ) ? $j['access_token'] : '';
	}

	private static function paypal_start( $form, $entry, $data ) {
		$tok = self::paypal_token();
		if ( ! $tok ) {
			return array( 'error' => __( 'PayPal is not configured.', 'weberslink-forms-pro' ) );
		}
		$calc = self::compute( $form, $data );
		if ( $calc['total'] <= 0 ) {
			return array( 'error' => __( 'Nothing to pay for.', 'weberslink-forms-pro' ) );
		}
		$cur  = self::currency( $form );
		$body = array(
			'intent'         => 'CAPTURE',
			'purchase_units' => array( array(
				'custom_id'   => (string) $entry['id'],
				'description' => mb_substr( WLFP_Merge::parse( $form['settings']['payment']['description'], $form, $data, $entry ), 0, 120 ),
				'amount'      => array( 'currency_code' => $cur, 'value' => number_format( $calc['total'], WLFP_Helpers::zero_decimal( $cur ) ? 0 : 2, '.', '' ) ),
			) ),
			'application_context' => array( 'return_url' => self::return_url( $entry, 'paypal_ok' ), 'cancel_url' => self::return_url( $entry, 'cancel' ), 'user_action' => 'PAY_NOW', 'shipping_preference' => 'NO_SHIPPING', 'brand_name' => mb_substr( get_bloginfo( 'name' ), 0, 120 ) ),
		);
		$r = wp_remote_post( self::paypal_base() . '/v2/checkout/orders', array( 'timeout' => 25, 'headers' => array( 'Authorization' => 'Bearer ' . $tok, 'Content-Type' => 'application/json' ), 'body' => wp_json_encode( $body ) ) );
		if ( is_wp_error( $r ) ) {
			return array( 'error' => __( 'Could not reach PayPal. Please try again.', 'weberslink-forms-pro' ) );
		}
		$j = json_decode( wp_remote_retrieve_body( $r ), true );
		$u = '';
		foreach ( (array) ( $j['links'] ?? array() ) as $l ) {
			if ( in_array( $l['rel'], array( 'approve', 'payer-action' ), true ) ) {
				$u = $l['href'];
			}
		}
		if ( ! $u ) {
			WLFP_Install::log( $form['id'], $entry['id'], 'paypal', 'failed', 'PayPal error', wp_remote_retrieve_body( $r ) );
			return array( 'error' => __( 'Payment could not be started. Please contact the site owner.', 'weberslink-forms-pro' ) );
		}
		WLFP_Entries::update( $entry['id'], array( 'transaction_id' => sanitize_text_field( $j['id'] ) ) );
		return array( 'redirect' => esc_url_raw( $u ) );
	}

	/* ---------------- Return handlers ---------------- */

	public static function handle_return() {
		if ( empty( $_GET['wlfp_pay'] ) || empty( $_GET['entry'] ) || empty( $_GET['k'] ) ) { // phpcs:ignore
			return;
		}
		$entry = WLFP_Entries::get( (int) $_GET['entry'] ); // phpcs:ignore
		if ( ! $entry || ! hash_equals( self::return_key( $entry ), sanitize_text_field( wp_unslash( $_GET['k'] ) ) ) ) { // phpcs:ignore
			return;
		}
		$form   = WLFP_Forms::get( $entry['form_id'] );
		$result = sanitize_key( wp_unslash( $_GET['wlfp_pay'] ) ); // phpcs:ignore
		$ok     = false;

		if ( 'stripe_ok' === $result && ! empty( $_GET['session_id'] ) ) { // phpcs:ignore
			$ok = self::stripe_verify_session( $entry, sanitize_text_field( wp_unslash( $_GET['session_id'] ) ) ); // phpcs:ignore
		} elseif ( 'paypal_ok' === $result && ! empty( $_GET['token'] ) ) { // phpcs:ignore
			$ok = self::paypal_capture( $entry, sanitize_text_field( wp_unslash( $_GET['token'] ) ) ); // phpcs:ignore
		} elseif ( 'cancel' === $result && 'pending' === $entry['payment_status'] ) {
			WLFP_Entries::update( $entry['id'], array( 'payment_status' => 'cancelled' ) );
			WLFP_Install::log( $entry['form_id'], $entry['id'], 'payment', 'info', 'Customer cancelled payment' );
		}
		if ( ! $form ) {
			return;
		}
		$p = $form['settings']['payment'];
		if ( $ok || 'paid' === $entry['payment_status'] ) {
			$url = $p['success_url'] ? WLFP_Merge::parse( $p['success_url'], $form, $entry['data'], $entry ) : '';
			if ( ! $url ) {
				$url = $entry['source_url'] ? $entry['source_url'] : home_url( '/' );
				$url = add_query_arg( 'wlfp_thanks', $form['id'], remove_query_arg( array( 'wlfp_thanks' ), $url ) );
			}
		} else {
			$url = $p['cancel_url'] ? $p['cancel_url'] : ( $entry['source_url'] ? add_query_arg( 'wlfp_cancelled', 1, $entry['source_url'] ) : home_url( '/' ) );
		}
		wp_safe_redirect( $url );
		exit;
	}

	private static function stripe_verify_session( $entry, $session_id ) {
		if ( 'paid' === $entry['payment_status'] ) {
			return true;
		}
		$sk = WLFP_Helpers::setting( 'stripe_sk' );
		$r  = wp_remote_get( 'https://api.stripe.com/v1/checkout/sessions/' . rawurlencode( $session_id ), array( 'timeout' => 20, 'headers' => array( 'Authorization' => 'Bearer ' . $sk ) ) );
		if ( is_wp_error( $r ) ) {
			return false;
		}
		$j = json_decode( wp_remote_retrieve_body( $r ), true );
		if ( ! empty( $j['payment_status'] ) && 'paid' === $j['payment_status'] && ( $j['client_reference_id'] ?? '' ) === (string) $entry['id'] ) {
			self::mark_paid( $entry['id'], ! empty( $j['payment_intent'] ) ? $j['payment_intent'] : ( ! empty( $j['subscription'] ) ? $j['subscription'] : $session_id ), 'stripe' );
			return true;
		}
		return false;
	}

	private static function paypal_capture( $entry, $order_id ) {
		if ( 'paid' === $entry['payment_status'] ) {
			return true;
		}
		if ( $order_id !== $entry['transaction_id'] ) {
			return false;
		}
		$tok = self::paypal_token();
		if ( ! $tok ) {
			return false;
		}
		$r = wp_remote_post( self::paypal_base() . '/v2/checkout/orders/' . rawurlencode( $order_id ) . '/capture', array( 'timeout' => 25, 'headers' => array( 'Authorization' => 'Bearer ' . $tok, 'Content-Type' => 'application/json' ), 'body' => '{}' ) );
		if ( is_wp_error( $r ) ) {
			return false;
		}
		$j = json_decode( wp_remote_retrieve_body( $r ), true );
		if ( isset( $j['status'] ) && 'COMPLETED' === $j['status'] ) {
			$cap = isset( $j['purchase_units'][0]['payments']['captures'][0]['id'] ) ? $j['purchase_units'][0]['payments']['captures'][0]['id'] : $order_id;
			self::mark_paid( $entry['id'], $cap, 'paypal' );
			return true;
		}
		return false;
	}

	public static function mark_paid( $entry_id, $txn, $method ) {
		$entry = WLFP_Entries::get( $entry_id );
		if ( ! $entry || 'paid' === $entry['payment_status'] ) {
			return;
		}
		WLFP_Entries::update( $entry_id, array( 'payment_status' => 'paid', 'payment_method' => $method, 'transaction_id' => sanitize_text_field( $txn ) ) );
		WLFP_Install::log( $entry['form_id'], $entry_id, 'payment', 'success', 'Payment received', $method . ' ' . $txn );
		$entry = WLFP_Entries::get( $entry_id );
		$form  = WLFP_Forms::get( $entry['form_id'] );
		do_action( 'wlfp_payment_paid', $entry, $form );
		if ( $form && ! empty( $form['settings']['payment']['send_after_payment'] ) ) {
			WLFP_Submit::finalize( $form, $entry );
		}
	}

	/* ---------------- Stripe webhook ---------------- */

	public static function routes() {
		register_rest_route( 'weberslink-forms/v1', '/stripe', array( 'methods' => 'POST', 'callback' => array( __CLASS__, 'stripe_webhook' ), 'permission_callback' => '__return_true' ) );
		register_rest_route( 'weberslink-forms/v1', '/entries/(?P<id>\d+)', array( 'methods' => 'GET', 'callback' => array( __CLASS__, 'rest_entry' ), 'permission_callback' => function () {
			return WLFP_Helpers::can_manage();
		} ) );
	}

	public static function rest_entry( $req ) {
		$e = WLFP_Entries::get( (int) $req['id'] );
		return $e ? rest_ensure_response( $e ) : new WP_Error( 'not_found', 'Not found', array( 'status' => 404 ) );
	}

	public static function stripe_webhook( $req ) {
		$secret = WLFP_Helpers::setting( 'stripe_whsec' );
		$body   = $req->get_body();
		$sig    = $req->get_header( 'stripe-signature' );
		if ( ! $secret || ! $sig ) {
			return new WP_Error( 'wlfp_no_secret', 'Webhook not configured', array( 'status' => 400 ) );
		}
		$t  = '';
		$v1 = array();
		foreach ( explode( ',', $sig ) as $part ) {
			$kv = explode( '=', trim( $part ), 2 );
			if ( 2 === count( $kv ) ) {
				if ( 't' === $kv[0] ) {
					$t = $kv[1];
				} elseif ( 'v1' === $kv[0] ) {
					$v1[] = $kv[1];
				}
			}
		}
		$calc = hash_hmac( 'sha256', $t . '.' . $body, $secret );
		$ok   = false;
		foreach ( $v1 as $s ) {
			if ( hash_equals( $calc, $s ) ) {
				$ok = true;
			}
		}
		if ( ! $ok || abs( time() - (int) $t ) > 600 ) {
			return new WP_Error( 'wlfp_bad_sig', 'Invalid signature', array( 'status' => 400 ) );
		}
		$ev  = json_decode( $body, true );
		$obj = isset( $ev['data']['object'] ) ? $ev['data']['object'] : array();
		$eid = isset( $obj['client_reference_id'] ) ? (int) $obj['client_reference_id'] : ( isset( $obj['metadata']['wlfp_entry'] ) ? (int) $obj['metadata']['wlfp_entry'] : 0 );
		if ( $eid ) {
			$type = isset( $ev['type'] ) ? $ev['type'] : '';
			if ( 'checkout.session.completed' === $type || 'checkout.session.async_payment_succeeded' === $type ) {
				if ( isset( $obj['payment_status'] ) && 'paid' === $obj['payment_status'] ) {
					self::mark_paid( $eid, ! empty( $obj['payment_intent'] ) ? $obj['payment_intent'] : ( ! empty( $obj['subscription'] ) ? $obj['subscription'] : ( $obj['id'] ?? '' ) ), 'stripe' );
				}
			} elseif ( 'checkout.session.expired' === $type || 'checkout.session.async_payment_failed' === $type ) {
				WLFP_Entries::update( $eid, array( 'payment_status' => 'failed' ) );
			} elseif ( 'customer.subscription.deleted' === $type ) {
				WLFP_Entries::update( $eid, array( 'payment_status' => 'cancelled' ) );
				WLFP_Install::log( 0, $eid, 'stripe', 'info', 'Subscription cancelled' );
			} elseif ( 'charge.refunded' === $type ) {
				WLFP_Entries::update( $eid, array( 'payment_status' => 'refunded' ) );
			}
		}
		return rest_ensure_response( array( 'received' => true ) );
	}
}
