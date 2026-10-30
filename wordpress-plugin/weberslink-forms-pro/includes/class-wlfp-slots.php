<?php
defined( 'ABSPATH' ) || exit;

/**
 * Appointment slot picker: date + time slot with per-slot capacity, closed weekdays, blocked dates,
 * minimum notice and booking window. Availability is enforced on the server.
 */
class WLFP_Slots {

	public static function init() {
		add_action( 'wp_ajax_wlfp_slots', array( __CLASS__, 'ajax' ) );
		add_action( 'wp_ajax_nopriv_wlfp_slots', array( __CLASS__, 'ajax' ) );
	}

	/** 'HH:MM' list generated from start / end / interval. */
	public static function generate( $f ) {
		$to_min = function ( $t, $def ) {
			return preg_match( '/^(\d{1,2}):(\d{2})/', (string) $t, $m ) ? min( 1439, (int) $m[1] * 60 + (int) $m[2] ) : $def;
		};
		$start = $to_min( isset( $f['start_time'] ) ? $f['start_time'] : '09:00', 540 );
		$end   = $to_min( isset( $f['end_time'] ) ? $f['end_time'] : '17:00', 1020 );
		$step  = max( 5, min( 480, (int) ( isset( $f['interval'] ) ? $f['interval'] : 30 ) ) );
		$out   = array();
		for ( $m = $start; $m + $step <= max( $end, $start + $step ) && count( $out ) < 96; $m += $step ) {
			$out[] = sprintf( '%02d:%02d', intdiv( $m, 60 ), $m % 60 );
		}
		return $out;
	}

	public static function blocked_dates( $f ) {
		$out = array();
		foreach ( preg_split( '/[\s,;]+/', isset( $f['blocked_dates'] ) ? (string) $f['blocked_dates'] : '' ) as $d ) {
			if ( preg_match( '/^\d{4}-\d{2}-\d{2}$/', $d ) ) {
				$out[] = $d;
			}
		}
		return $out;
	}

	public static function closed_days( $f ) {
		$d = isset( $f['closed_days'] ) ? $f['closed_days'] : array( '0', '6' );
		return array_map( 'strval', array_values( array_filter( (array) $d, function ( $x ) {
			return '' !== (string) $x && is_numeric( $x );
		} ) ) );
	}

	/** Earliest / latest bookable date (Y-m-d) for "today" given as Y-m-d. */
	public static function window( $f, $today ) {
		$min = max( 0, (int) ( isset( $f['min_notice'] ) ? $f['min_notice'] : 1 ) );
		$max = max( 1, min( 730, (int) ( isset( $f['max_ahead'] ) ? $f['max_ahead'] : 60 ) ) );
		$t   = strtotime( $today . ' 12:00:00 UTC' );
		return array( gmdate( 'Y-m-d', $t + $min * DAY_IN_SECONDS ), gmdate( 'Y-m-d', $t + $max * DAY_IN_SECONDS ) );
	}

	public static function today() {
		return function_exists( 'wp_date' ) ? wp_date( 'Y-m-d' ) : gmdate( 'Y-m-d' );
	}

	/** Returns an error string (or '') for the date alone. Pure: pass $today for testing. */
	public static function date_error( $f, $date, $today = null ) {
		if ( ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', (string) $date ) || ! strtotime( $date . ' 12:00:00 UTC' ) ) {
			return __( 'Please choose a valid date.', 'weberslink-forms-pro' );
		}
		list( $min, $max ) = self::window( $f, null === $today ? self::today() : $today );
		if ( $date < $min || $date > $max ) {
			return __( 'That date is not available for booking.', 'weberslink-forms-pro' );
		}
		$dow = gmdate( 'w', strtotime( $date . ' 12:00:00 UTC' ) );
		if ( in_array( (string) $dow, self::closed_days( $f ), true ) || in_array( $date, self::blocked_dates( $f ), true ) ) {
			return __( 'We are closed on that date. Please choose another day.', 'weberslink-forms-pro' );
		}
		return '';
	}

	/** slot => number of bookings already taken on a date. */
	public static function taken( $form_id, $name, $date ) {
		global $wpdb;
		$like = '%' . $wpdb->esc_like( '"' . $name . '":{"date":' . wp_json_encode( $date ) . ',' ) . '%';
		$rows = $wpdb->get_col( $wpdb->prepare( 'SELECT data FROM ' . WLFP_Entries::table() . " WHERE form_id=%d AND status NOT IN ('spam','trashed') AND payment_status NOT IN ('failed','cancelled','abandoned') AND data LIKE %s LIMIT 5000", (int) $form_id, $like ) ); // phpcs:ignore
		$out  = array();
		foreach ( (array) $rows as $json ) {
			$d = json_decode( (string) $json, true );
			if ( is_array( $d ) && isset( $d[ $name ]['date'], $d[ $name ]['slot'] ) && $d[ $name ]['date'] === $date ) {
				$k         = (string) $d[ $name ]['slot'];
				$out[ $k ] = ( isset( $out[ $k ] ) ? $out[ $k ] : 0 ) + 1;
			}
		}
		return $out;
	}

	public static function label( $slot ) {
		$ts = strtotime( '1970-01-01 ' . $slot . ':00 UTC' );
		return function_exists( 'wp_date' ) ? wp_date( get_option( 'time_format' ), $ts, new DateTimeZone( 'UTC' ) ) : gmdate( 'g:i A', $ts );
	}

	/** Validation used by WLFP_Fields::validate(). $taken is a slot=>count map (injectable for tests). */
	public static function validate( $f, $v, $form_id, $today = null, $taken = null ) {
		$date = isset( $v['date'] ) ? (string) $v['date'] : '';
		$slot = isset( $v['slot'] ) ? (string) $v['slot'] : '';
		if ( '' === $date && '' === $slot ) {
			return ! empty( $f['required'] ) ? __( 'Please pick a date and time.', 'weberslink-forms-pro' ) : '';
		}
		if ( '' === $date || '' === $slot ) {
			return __( 'Please pick both a date and a time.', 'weberslink-forms-pro' );
		}
		$err = self::date_error( $f, $date, $today );
		if ( $err ) {
			return $err;
		}
		if ( ! in_array( $slot, self::generate( $f ), true ) ) {
			return __( 'Please choose one of the available times.', 'weberslink-forms-pro' );
		}
		$cap = max( 1, (int) ( isset( $f['capacity'] ) ? $f['capacity'] : 1 ) );
		$tk  = null === $taken ? self::taken( $form_id, $f['name'], $date ) : $taken;
		if ( ( isset( $tk[ $slot ] ) ? (int) $tk[ $slot ] : 0 ) >= $cap ) {
			return __( 'Sorry, that time has just been booked. Please choose another.', 'weberslink-forms-pro' );
		}
		return '';
	}

	public static function ajax() {
		$form_id = isset( $_POST['form_id'] ) ? (int) $_POST['form_id'] : 0; // phpcs:ignore
		$name    = isset( $_POST['field'] ) ? sanitize_key( wp_unslash( $_POST['field'] ) ) : ''; // phpcs:ignore
		$date    = isset( $_POST['date'] ) ? sanitize_text_field( wp_unslash( $_POST['date'] ) ) : ''; // phpcs:ignore
		$form    = $form_id ? WLFP_Forms::get( $form_id ) : null;
		$field   = null;
		if ( $form ) {
			foreach ( $form['fields'] as $f ) {
				if ( 'slot_picker' === $f['type'] && $f['name'] === $name ) {
					$field = $f;
				}
			}
		}
		if ( ! $field || 'published' !== $form['status'] ) {
			wp_send_json_error();
		}
		$err = self::date_error( $field, $date );
		if ( $err ) {
			wp_send_json_success( array( 'closed' => true, 'message' => $err, 'slots' => array() ) );
		}
		$taken = self::taken( $form_id, $name, $date );
		$cap   = max( 1, (int) ( isset( $field['capacity'] ) ? $field['capacity'] : 1 ) );
		$out   = array();
		foreach ( self::generate( $field ) as $slot ) {
			$left  = $cap - ( isset( $taken[ $slot ] ) ? (int) $taken[ $slot ] : 0 );
			$out[] = array( 'value' => $slot, 'label' => self::label( $slot ), 'left' => max( 0, $left ), 'full' => $left <= 0 );
		}
		wp_send_json_success( array( 'closed' => false, 'slots' => $out, 'capacity' => $cap ) );
	}

	public static function format_value( $f, $v ) {
		if ( empty( $v['date'] ) ) {
			return '';
		}
		$ts   = strtotime( $v['date'] . ' 12:00:00 UTC' );
		$date = $ts && function_exists( 'wp_date' ) ? wp_date( get_option( 'date_format' ), $ts, new DateTimeZone( 'UTC' ) ) : $v['date'];
		return $date . ( ! empty( $v['slot'] ) ? ' ' . __( 'at', 'weberslink-forms-pro' ) . ' ' . self::label( $v['slot'] ) : '' );
	}

	/** iCalendar (.ics) for the first slot field in the entry. Returns array( filename, content ) or array( '', '' ). */
	public static function ics( $form, $entry ) {
		foreach ( $form['fields'] as $f ) {
			if ( 'slot_picker' !== $f['type'] || empty( $entry['data'][ $f['name'] ]['date'] ) || empty( $entry['data'][ $f['name'] ]['slot'] ) ) {
				continue;
			}
			$d   = $entry['data'][ $f['name'] ];
			$tz  = function_exists( 'wp_timezone' ) ? wp_timezone() : new DateTimeZone( 'UTC' );
			$s   = date_create( $d['date'] . ' ' . $d['slot'] . ':00', $tz );
			if ( ! $s ) {
				continue;
			}
			$dur = max( 5, (int) ( ! empty( $f['duration'] ) ? $f['duration'] : ( isset( $f['interval'] ) ? $f['interval'] : 30 ) ) );
			$e   = clone $s;
			$e->modify( '+' . $dur . ' minutes' );
			$utc = new DateTimeZone( 'UTC' );
			$esc = function ( $t ) {
				return str_replace( array( '\\', ';', ',', "\r\n", "\n", "\r" ), array( '\\\\', '\;', '\\,', '\\n', '\\n', '' ), (string) $t );
			};
			$host = function_exists( 'wp_parse_url' ) ? wp_parse_url( home_url(), PHP_URL_HOST ) : 'localhost';
			$lines = array(
				'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Weberslink Forms Pro//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
				'UID:wlfp-' . (int) $entry['id'] . '-' . md5( $d['date'] . $d['slot'] . $form['id'] ) . '@' . $host,
				'DTSTAMP:' . gmdate( 'Ymd\THis\Z' ),
				'DTSTART:' . $s->setTimezone( $utc )->format( 'Ymd\THis\Z' ),
				'DTEND:' . $e->setTimezone( $utc )->format( 'Ymd\THis\Z' ),
				'SUMMARY:' . $esc( ! empty( $f['event_title'] ) ? $f['event_title'] : $form['title'] ),
				'DESCRIPTION:' . $esc( ! empty( $f['event_description'] ) ? $f['event_description'] : $form['title'] ),
				'END:VEVENT', 'END:VCALENDAR',
			);
			return array( 'appointment.ics', implode( "\r\n", $lines ) . "\r\n" );
		}
		return array( '', '' );
	}
}
