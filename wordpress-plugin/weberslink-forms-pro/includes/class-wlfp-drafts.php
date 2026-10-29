<?php
defined( 'ABSPATH' ) || exit;

/** Save & resume later: partial answers stored under an unguessable token and e-mailed as a link. */
class WLFP_Drafts {

	public static function init() {
		add_action( 'wp_ajax_wlfp_save_draft', array( __CLASS__, 'ajax_save' ) );
		add_action( 'wp_ajax_nopriv_wlfp_save_draft', array( __CLASS__, 'ajax_save' ) );
	}

	public static function table() {
		global $wpdb;
		return $wpdb->prefix . 'wlfp_drafts';
	}

	public static function clean_token( $t ) {
		return preg_match( '/^[A-Za-z0-9]{32}$/', (string) $t ) ? (string) $t : '';
	}

	public static function get( $token ) {
		global $wpdb;
		$token = self::clean_token( $token );
		if ( ! $token ) {
			return null;
		}
		$r = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . self::table() . ' WHERE token=%s AND expires_at > %s', $token, current_time( 'mysql', true ) ), ARRAY_A ); // phpcs:ignore
		if ( ! $r ) {
			return null;
		}
		$d         = json_decode( (string) $r['data'], true );
		$r['data'] = is_array( $d ) ? $d : array();
		return $r;
	}

	public static function delete( $token ) {
		global $wpdb;
		$token = self::clean_token( $token );
		if ( $token ) {
			$wpdb->delete( self::table(), array( 'token' => $token ) );
		}
	}

	public static function cleanup() {
		global $wpdb;
		$wpdb->query( $wpdb->prepare( 'DELETE FROM ' . self::table() . ' WHERE expires_at < %s', current_time( 'mysql', true ) ) ); // phpcs:ignore
	}

	private static function fail( $msg, $extra = array() ) {
		wp_send_json( array( 'success' => false, 'data' => array_merge( array( 'message' => $msg ), $extra ) ) );
	}

	public static function ajax_save() {
		$form_id = isset( $_POST['wlfp_form_id'] ) ? (int) $_POST['wlfp_form_id'] : 0; // phpcs:ignore
		$form    = $form_id ? WLFP_Forms::get( $form_id ) : null;
		if ( ! $form || 'published' !== $form['status'] || empty( $form['settings']['resume']['enabled'] ) ) {
			self::fail( __( 'Saving is not available for this form.', 'weberslink-forms-pro' ) );
		}
		$nonce = isset( $_POST['wlfp_nonce'] ) ? sanitize_text_field( wp_unslash( $_POST['wlfp_nonce'] ) ) : ''; // phpcs:ignore
		if ( ! wp_verify_nonce( $nonce, 'wlfp_submit_' . $form['id'] ) ) {
			self::fail( __( 'Your session expired. Retrying…', 'weberslink-forms-pro' ), array( 'code' => 'nonce', 'nonce' => wp_create_nonce( 'wlfp_submit_' . $form['id'] ) ) );
		}
		$email = isset( $_POST['wlfp_resume_email'] ) ? sanitize_email( wp_unslash( $_POST['wlfp_resume_email'] ) ) : ''; // phpcs:ignore
		if ( ! is_email( $email ) ) {
			self::fail( __( 'Please enter a valid email address.', 'weberslink-forms-pro' ) );
		}
		// Throttle: 5 saves / 10 min per IP, 3 / hour per address.
		$ip   = isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : 'x';
		$k1   = 'wlfp_dr_ip_' . md5( $form['id'] . $ip );
		$k2   = 'wlfp_dr_em_' . md5( $form['id'] . strtolower( $email ) );
		if ( (int) get_transient( $k1 ) >= 5 || (int) get_transient( $k2 ) >= 3 ) {
			self::fail( __( 'Too many requests. Please try again later.', 'weberslink-forms-pro' ) );
		}
		set_transient( $k1, (int) get_transient( $k1 ) + 1, 10 * MINUTE_IN_SECONDS );
		set_transient( $k2, (int) get_transient( $k2 ) + 1, HOUR_IN_SECONDS );

		$slashed = $_POST; // phpcs:ignore
		$values  = array();
		foreach ( $form['fields'] as $f ) {
			if ( ! WLFP_Fields::stores_value( $f['type'] ) || empty( $f['name'] ) || in_array( $f['type'], array( 'file', 'image', 'password', 'signature', 'calculation', 'hidden', 'coupon' ), true ) ) {
				continue;
			}
			$v = WLFP_Fields::collect( $f, $slashed );
			if ( ! WLFP_Fields::is_empty( $v ) ) {
				$values[ $f['name'] ] = $v;
			}
		}
		$days  = max( 1, min( 365, (int) $form['settings']['resume']['expire_days'] ) );
		$token = wp_generate_password( 32, false, false );
		global $wpdb;
		$wpdb->insert( self::table(), array(
			'token'      => $token,
			'form_id'    => $form['id'],
			'email'      => $email,
			'data'       => wp_json_encode( array( 'values' => $values ) ),
			'step'       => isset( $_POST['wlfp_resume_step'] ) ? max( 0, (int) $_POST['wlfp_resume_step'] ) : 0, // phpcs:ignore
			'created_at' => current_time( 'mysql', true ),
			'expires_at' => gmdate( 'Y-m-d H:i:s', time() + $days * DAY_IN_SECONDS ),
		) );

		$src  = isset( $_POST['wlfp_source'] ) ? esc_url_raw( wp_unslash( $_POST['wlfp_source'] ) ) : ''; // phpcs:ignore
		$src  = wp_validate_redirect( $src, home_url( '/' ) );
		$link = add_query_arg( 'wlfp_resume', $token, remove_query_arg( 'wlfp_resume', $src ) );
		$r    = $form['settings']['resume'];
		$subj = str_replace( array( "\r", "\n" ), ' ', WLFP_Merge::parse( $r['subject'], $form, array(), null, false ) );
		$body = str_replace( '{resume_link}', esc_url( $link ), WLFP_Merge::parse( $r['message'], $form, array(), null, true ) );
		$ok   = wp_mail( $email, $subj, wp_kses( $body, WLFP_Helpers::allowed_html() ), array( 'Content-Type: text/html; charset=UTF-8' ) );
		WLFP_Install::log( $form['id'], 0, 'resume', $ok ? 'success' : 'failed', 'Save & resume link ' . ( $ok ? 'sent' : 'failed' ), $email );
		if ( ! $ok ) {
			self::fail( __( 'We could not send the email. Please try again later.', 'weberslink-forms-pro' ) );
		}
		wp_send_json( array( 'success' => true, 'data' => array( 'message' => __( 'Check your inbox: we emailed you a link to continue.', 'weberslink-forms-pro' ) ) ) );
	}
}
