<?php
defined( 'ABSPATH' ) || exit;

/** Weekly summary email, sent on Mondays by the daily cron job. */
class WLSMTP_Report {

	public static function maybe_send() {
		$s = WLSMTP_Settings::all();
		if ( empty( $s['report_enabled'] ) || 1 !== (int) gmdate( 'N' ) ) {
			return;
		}
		$today = gmdate( 'Y-m-d' );
		if ( get_option( 'wlsmtp_report_last' ) === $today ) {
			return;
		}
		update_option( 'wlsmtp_report_last', $today, false );
		self::send();
	}

	public static function send( $to = '' ) {
		$to = $to ? $to : ( WLSMTP_Settings::get( 'report_email' ) ?: get_option( 'admin_email' ) );
		if ( ! is_email( $to ) ) {
			return false;
		}
		$site = wp_specialchars_decode( get_bloginfo( 'name' ), ENT_QUOTES );
		$m    = self::build( WLSMTP_Log::report_data( 7 ), $site, admin_url( 'admin.php?page=wlsmtp' ) );
		return wp_mail( $to, $m['subject'], $m['html'], array( 'Content-Type: text/html; charset=UTF-8' ) );
	}

	/** Pure: report data in, array( subject, html ) out. */
	public static function build( $d, $site, $log_url ) {
		$c     = $d['counts'];
		$total = (int) $c['sent'] + (int) $c['failed'] + (int) $c['pending'];
		$rate  = $total ? round( 100 * $c['sent'] / $total, 1 ) : 100;
		$h     = function ( $v ) {
			return htmlspecialchars( (string) $v, ENT_QUOTES, 'UTF-8' );
		};
		$rows  = '';
		foreach ( array( 'Emails sent' => $c['sent'], 'Failed' => $c['failed'], 'Delivery rate' => $rate . '%', 'Opened' => $d['opens'], 'Clicked' => $d['clicks'] ) as $k => $v ) {
			$rows .= '<tr><td style="padding:6px 14px 6px 0;color:#555">' . $h( $k ) . '</td><td style="padding:6px 0;font-weight:700">' . $h( $v ) . '</td></tr>';
		}
		$fail = '';
		if ( ! empty( $d['failed_sources'] ) ) {
			$fail .= '<h3 style="margin:22px 0 6px;font-size:15px">Where the failures came from</h3><ul style="margin:0;padding-left:18px">';
			foreach ( $d['failed_sources'] as $r ) {
				$fail .= '<li>' . $h( $r['source'] ? $r['source'] : 'unknown' ) . ' &mdash; ' . (int) $r['c'] . '</li>';
			}
			$fail .= '</ul>';
		}
		if ( ! empty( $d['recent_failures'] ) ) {
			$fail .= '<h3 style="margin:22px 0 6px;font-size:15px">Latest failures</h3><ul style="margin:0;padding-left:18px">';
			foreach ( $d['recent_failures'] as $r ) {
				$fail .= '<li>' . $h( mb_substr( (string) $r['subject'], 0, 70 ) ) . ' &rarr; ' . $h( mb_substr( (string) $r['to_addr'], 0, 60 ) ) . '<br><span style="color:#b32d2e">' . $h( mb_substr( (string) $r['error'], 0, 160 ) ) . '</span></li>';
			}
			$fail .= '</ul>';
		}
		$subject = sprintf( '[%s] Email report: %d sent, %d failed this week', $site, (int) $c['sent'], (int) $c['failed'] );
		$html    = '<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:20px;color:#1d2327"><h2 style="margin:0 0 4px">Weekly email report</h2><p style="margin:0 0 16px;color:#666">' . $h( $site ) . ' &middot; last 7 days</p><table cellspacing="0" cellpadding="0">' . $rows . '</table>' . $fail . '<p style="margin-top:24px"><a href="' . $h( $log_url ) . '">Open the email log</a></p></div>';
		return array( 'subject' => $subject, 'html' => $html );
	}
}
