<?php
defined( 'ABSPATH' ) || exit;

class WLFP_Notifications {

	public static function init() {
		// Show confirmation after a payment redirect.
		add_filter( 'the_content', array( __CLASS__, 'thanks_banner' ), 5 );
		add_action( 'wlfp_delayed_email', array( __CLASS__, 'run_delayed' ), 10, 2 );
	}

	public static function delay_seconds( $n ) {
		$d = isset( $n['delay'] ) ? (float) $n['delay'] : 0;
		if ( $d <= 0 ) {
			return 0;
		}
		$unit = isset( $n['delay_unit'] ) ? $n['delay_unit'] : 'hours';
		$mult = 'minutes' === $unit ? MINUTE_IN_SECONDS : ( 'days' === $unit ? DAY_IN_SECONDS : HOUR_IN_SECONDS );
		return (int) min( 90 * DAY_IN_SECONDS, $d * $mult );
	}

	/** WP-Cron callback for delayed / follow-up emails. */
	public static function run_delayed( $entry_id, $index ) {
		$entry = WLFP_Entries::get( (int) $entry_id );
		if ( ! $entry || in_array( $entry['status'], array( 'spam', 'trashed' ), true ) ) {
			return;
		}
		$form = WLFP_Forms::get( $entry['form_id'] );
		if ( ! $form || empty( $form['settings']['notifications'][ (int) $index ] ) ) {
			return;
		}
		$n = $form['settings']['notifications'][ (int) $index ];
		if ( empty( $n['enabled'] ) || ! WLFP_Logic::passes( isset( $n['conditional'] ) ? $n['conditional'] : array(), $entry['data'] ) ) {
			return;
		}
		self::send( $form, $entry, $n );
	}

	/** Prepends the confirmation after returning from a payment or a non-AJAX submit. */
	public static function thanks_banner( $content ) {
		if ( empty( $_GET['wlfp_thanks'] ) || ! in_the_loop() || ! is_main_query() ) { // phpcs:ignore
			return $content;
		}
		$form = WLFP_Forms::get( (int) $_GET['wlfp_thanks'] ); // phpcs:ignore
		if ( ! $form ) {
			return $content;
		}
		WLFP_Renderer::enqueue();
		$msg = wp_kses( WLFP_Merge::parse( $form['settings']['confirmation']['message'], $form, array(), null, true ), WLFP_Helpers::allowed_html() );
		return '<div class="wlfp-wrap"><div class="wlfp-confirmation wlfp-confirmation-static" role="status">' . $msg . '</div></div>' . $content;
	}

	public static function send_all( $form, $entry ) {
		foreach ( (array) $form['settings']['notifications'] as $i => $n ) {
			if ( empty( $n['enabled'] ) ) {
				continue;
			}
			if ( ! WLFP_Logic::passes( isset( $n['conditional'] ) ? $n['conditional'] : array(), $entry['data'] ) ) {
				continue;
			}
			$delay = self::delay_seconds( $n );
			if ( $delay > 0 && ! empty( $entry['id'] ) ) {
				wp_schedule_single_event( time() + $delay, 'wlfp_delayed_email', array( (int) $entry['id'], (int) $i ) );
				WLFP_Install::log( $form['id'], $entry['id'], 'email', 'info', ( isset( $n['name'] ) ? $n['name'] : 'Notification' ) . ' scheduled', sprintf( /* translators: %s: time */ __( 'Will send around %s (requires WP-Cron)', 'weberslink-forms-pro' ), get_date_from_gmt( gmdate( 'Y-m-d H:i:s', time() + $delay ), 'Y-m-d H:i' ) ) );
				continue;
			}
			self::send( $form, $entry, $n );
		}
	}

	public static function addresses( $str, $form, $entry ) {
		$str = WLFP_Merge::parse( (string) $str, $form, $entry['data'], $entry, false );
		$out = array();
		foreach ( preg_split( '/[,;\s]+/', $str ) as $a ) {
			$a = sanitize_email( $a );
			if ( $a && is_email( $a ) ) {
				$out[] = $a;
			}
		}
		return array_values( array_unique( $out ) );
	}

	public static function send( $form, $entry, $n ) {
		$to = self::addresses( $n['to'] ?? '', $form, $entry );
		if ( ! $to ) {
			WLFP_Install::log( $form['id'], $entry['id'], 'email', 'failed', ( $n['name'] ?? 'Notification' ) . ': no valid recipient' );
			return false;
		}
		$s         = WLFP_Helpers::settings();
		$from_name = ! empty( $n['from_name'] ) ? WLFP_Merge::parse( $n['from_name'], $form, $entry['data'], $entry, false ) : ( $s['from_name'] ? $s['from_name'] : wp_specialchars_decode( get_bloginfo( 'name' ), ENT_QUOTES ) );
		$from_mail = ! empty( $n['from_email'] ) ? sanitize_email( WLFP_Merge::parse( $n['from_email'], $form, $entry['data'], $entry, false ) ) : ( $s['from_email'] ? $s['from_email'] : '' );
		$headers   = array();
		$html      = ( $n['format'] ?? 'html' ) !== 'plain';
		$headers[] = 'Content-Type: ' . ( $html ? 'text/html' : 'text/plain' ) . '; charset=UTF-8';
		if ( $from_mail && is_email( $from_mail ) ) {
			$headers[] = 'From: ' . wp_strip_all_tags( str_replace( array( "\r", "\n", '<', '>' ), '', $from_name ) ) . ' <' . $from_mail . '>';
		}
		$reply = self::addresses( $n['reply_to'] ?? '', $form, $entry );
		if ( $reply ) {
			$headers[] = 'Reply-To: ' . $reply[0];
		}
		foreach ( self::addresses( $n['cc'] ?? '', $form, $entry ) as $a ) {
			$headers[] = 'Cc: ' . $a;
		}
		foreach ( self::addresses( $n['bcc'] ?? '', $form, $entry ) as $a ) {
			$headers[] = 'Bcc: ' . $a;
		}
		$subject = str_replace( array( "\r", "\n" ), ' ', WLFP_Merge::parse( $n['subject'] ?? '', $form, $entry['data'], $entry, false ) );
		$body    = WLFP_Merge::parse( $n['message'] ?? '{all_data}', $form, $entry['data'], $entry, $html );
		if ( $html ) {
			if ( false === strpos( $body, '<' ) ) {
				$body = nl2br( esc_html( $body ) );
			}
			$body = wpautop_if_needed( $body );
			$body = '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#222">' . $body . '</div>';
		} else {
			$body = wp_strip_all_tags( $body );
		}
		$attach = array();
		if ( ! empty( $n['attach'] ) ) {
			foreach ( $form['fields'] as $f ) {
				if ( in_array( $f['type'], array( 'file', 'image' ), true ) && ! empty( $entry['data'][ $f['name'] ] ) ) {
					foreach ( (array) $entry['data'][ $f['name'] ] as $file ) {
						if ( ! empty( $file['path'] ) && is_file( $file['path'] ) ) {
							$attach[] = $file['path'];
						}
					}
				}
			}
		}
		$tmp_files = array();
		if ( ! empty( $n['attach_pdf'] ) ) {
			list( $pdf_name, $pdf_bytes ) = WLFP_Pdf::entry( $form, $entry );
			$dir = trailingslashit( get_temp_dir() );
			$tmp = $dir . wp_unique_filename( $dir, $pdf_name );
			if ( false !== file_put_contents( $tmp, $pdf_bytes ) ) { // phpcs:ignore
				$attach[]    = $tmp;
				$tmp_files[] = $tmp;
			}
		}
		$ok = wp_mail( $to, $subject, $body, $headers, $attach );
		foreach ( $tmp_files as $tf ) {
			@unlink( $tf ); // phpcs:ignore
		}
		WLFP_Install::log( $form['id'], $entry['id'], 'email', $ok ? 'success' : 'failed', ( $n['name'] ?? 'Notification' ) . ( $ok ? ' sent' : ' failed' ), implode( ', ', $to ) );
		return $ok;
	}

	public static function weekly_digest( $to ) {
		global $wpdb;
		$since = gmdate( 'Y-m-d H:i:s', time() - WEEK_IN_SECONDS );
		$rows  = $wpdb->get_results( $wpdb->prepare( "SELECT f.title, COUNT(e.id) c, COALESCE(SUM(CASE WHEN e.payment_status='paid' THEN e.payment_total END),0) revenue FROM {$wpdb->prefix}wlfp_entries e JOIN {$wpdb->prefix}wlfp_forms f ON f.id=e.form_id WHERE e.created_at >= %s AND e.status NOT IN ('spam','trashed') GROUP BY e.form_id ORDER BY c DESC", $since ), ARRAY_A ); // phpcs:ignore
		if ( ! $rows ) {
			return;
		}
		$h = '<h2>' . esc_html__( 'Your weekly form summary', 'weberslink-forms-pro' ) . '</h2><table cellpadding="6" style="border-collapse:collapse"><tr><th align="left">' . esc_html__( 'Form', 'weberslink-forms-pro' ) . '</th><th>' . esc_html__( 'Entries', 'weberslink-forms-pro' ) . '</th><th>' . esc_html__( 'Paid', 'weberslink-forms-pro' ) . '</th></tr>';
		foreach ( $rows as $r ) {
			$h .= '<tr><td>' . esc_html( $r['title'] ) . '</td><td align="center">' . (int) $r['c'] . '</td><td align="right">' . esc_html( WLFP_Helpers::money( $r['revenue'] ) ) . '</td></tr>';
		}
		$h .= '</table>';
		wp_mail( $to, sprintf( /* translators: %s: site */ __( '[%s] Weekly form summary', 'weberslink-forms-pro' ), get_bloginfo( 'name' ) ), $h, array( 'Content-Type: text/html; charset=UTF-8' ) );
	}
}

/** Adds paragraphs to plain-text bodies that contain no block tags. */
function wpautop_if_needed( $html ) {
	return preg_match( '/<(p|div|table|br|ul|ol|h[1-6])\b/i', $html ) ? $html : wpautop( $html );
}
