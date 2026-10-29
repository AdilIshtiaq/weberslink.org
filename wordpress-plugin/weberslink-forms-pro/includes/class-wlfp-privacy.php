<?php
defined( 'ABSPATH' ) || exit;

/** GDPR: WordPress personal data exporter / eraser hooks. */
class WLFP_Privacy {

	public static function init() {
		add_filter( 'wp_privacy_personal_data_exporters', function ( $x ) {
			$x['weberslink-forms-pro'] = array( 'exporter_friendly_name' => __( 'Weberslink Forms entries', 'weberslink-forms-pro' ), 'callback' => array( __CLASS__, 'export' ) );
			return $x;
		} );
		add_filter( 'wp_privacy_personal_data_erasers', function ( $x ) {
			$x['weberslink-forms-pro'] = array( 'eraser_friendly_name' => __( 'Weberslink Forms entries', 'weberslink-forms-pro' ), 'callback' => array( __CLASS__, 'erase' ) );
			return $x;
		} );
		add_action( 'admin_init', function () {
			if ( function_exists( 'wp_add_privacy_policy_content' ) ) {
				wp_add_privacy_policy_content( 'Weberslink Forms Pro', wp_kses_post( '<p>' . __( 'Forms collect the information visitors type in, plus (unless disabled in settings) their IP address, browser and the page URL. Entries are stored in your database and e-mailed to the recipients you configure. Uploaded files are stored in /wp-content/uploads/wlfp-uploads/. If you enable CAPTCHA, Stripe, PayPal, Mailchimp or webhooks, the relevant data is sent to those services.', 'weberslink-forms-pro' ) . '</p>' ) );
			}
		} );
	}

	private static function ids_for_email( $email, $page ) {
		global $wpdb;
		$like = '%' . $wpdb->esc_like( $email ) . '%';
		return $wpdb->get_col( $wpdb->prepare( "SELECT id FROM {$wpdb->prefix}wlfp_entries WHERE data LIKE %s ORDER BY id ASC LIMIT 50 OFFSET %d", $like, ( max( 1, $page ) - 1 ) * 50 ) ); // phpcs:ignore
	}

	public static function export( $email, $page = 1 ) {
		$items = array();
		foreach ( self::ids_for_email( $email, $page ) as $id ) {
			$e    = WLFP_Entries::get( (int) $id );
			$form = $e ? WLFP_Forms::get( $e['form_id'] ) : null;
			if ( ! $e || ! $form ) {
				continue;
			}
			$d = array();
			foreach ( WLFP_Forms::value_fields( $form ) as $f ) {
				if ( isset( $e['data'][ $f['name'] ] ) ) {
					$d[] = array( 'name' => $f['label'] ? $f['label'] : $f['name'], 'value' => WLFP_Fields::format_value( $f, $e['data'][ $f['name'] ], false ) );
				}
			}
			$d[]     = array( 'name' => 'IP', 'value' => $e['ip'] );
			$items[] = array( 'group_id' => 'wlfp-entries', 'group_label' => __( 'Form entries', 'weberslink-forms-pro' ), 'item_id' => 'wlfp-entry-' . $id, 'data' => $d );
		}
		return array( 'data' => $items, 'done' => count( $items ) < 50 );
	}

	public static function erase( $email, $page = 1 ) {
		$n = 0;
		foreach ( self::ids_for_email( $email, 1 ) as $id ) {
			WLFP_Entries::delete( (int) $id );
			$n++;
		}
		return array( 'items_removed' => $n, 'items_retained' => 0, 'messages' => array(), 'done' => true );
	}
}
