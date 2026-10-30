<?php
defined( 'ABSPATH' ) || exit;

/** Hooks into wp_mail(): SMTP transport, logging, retries and alerts. */
class WLSMTP_Mailer {

	/** Log row of the email currently being sent. */
	private static $current = 0;
	/** Set by WLSMTP_Log::retry() so the retried send reuses its row. */
	public static $retry_id = 0;
	/** When true the SMTP conversation is captured (Tools → test email). */
	public static $debug = false;
	public static $transcript = '';

	public static function init() {
		add_action( 'phpmailer_init', array( __CLASS__, 'configure' ), 99999 );
		add_filter( 'wp_mail', array( __CLASS__, 'log_start' ), 99999 );
		add_action( 'wp_mail_succeeded', array( __CLASS__, 'log_success' ) );
		add_action( 'wp_mail_failed', array( __CLASS__, 'log_failure' ) );
	}

	/* ---------- transport ---------- */

	public static function configure( $mailer ) {
		$s = WLSMTP_Settings::effective();
		if ( empty( $s['enabled'] ) || '' === (string) $s['host'] ) {
			return;
		}
		$mailer->isSMTP();
		$mailer->Host       = $s['host'];
		$mailer->Port       = (int) $s['port'];
		$mailer->Timeout    = (int) $s['timeout'];
		$mailer->SMTPSecure = 'none' === $s['encryption'] ? '' : $s['encryption'];
		$mailer->SMTPAutoTLS = 'none' === $s['encryption'];
		$mailer->SMTPAuth   = ! empty( $s['auth'] );
		if ( $mailer->SMTPAuth ) {
			$mailer->Username = (string) $s['user'];
			$mailer->Password = WLSMTP_Settings::password();
		}
		if ( empty( $s['verify_cert'] ) ) {
			$mailer->SMTPOptions = array( 'ssl' => array( 'verify_peer' => false, 'verify_peer_name' => false, 'allow_self_signed' => true ) );
		}
		if ( ! empty( $s['from_email'] ) && is_email( $s['from_email'] ) ) {
			$from_name = ! empty( $s['force_from_name'] ) && '' !== (string) $s['from_name'] ? $s['from_name'] : $mailer->FromName;
			if ( ! empty( $s['force_from_email'] ) || '' === (string) $mailer->From ) {
				$mailer->setFrom( $s['from_email'], $from_name, false );
			} elseif ( ! empty( $s['force_from_name'] ) ) {
				$mailer->FromName = $from_name;
			}
			if ( ! empty( $s['return_path'] ) ) {
				$mailer->Sender = $s['from_email'];
			}
		}
		if ( self::$debug ) {
			self::$transcript = '';
			$mailer->SMTPDebug   = 2;
			$mailer->Debugoutput = function ( $str ) {
				self::$transcript .= $str;
			};
		}
	}

	/* ---------- logging ---------- */

	/** Where did this email come from? (plugin folder, theme, or WordPress core) */
	public static function detect_source() {
		$frames = debug_backtrace( DEBUG_BACKTRACE_IGNORE_ARGS, 25 ); // phpcs:ignore
		$plug   = wp_normalize_path( WP_PLUGIN_DIR ) . '/';
		$theme  = wp_normalize_path( get_theme_root() ) . '/';
		foreach ( $frames as $f ) {
			if ( empty( $f['file'] ) ) {
				continue;
			}
			$file = wp_normalize_path( $f['file'] );
			if ( 0 === strpos( $file, wp_normalize_path( WLSMTP_DIR ) ) ) {
				continue;
			}
			if ( 0 === strpos( $file, $plug ) ) {
				$rest = substr( $file, strlen( $plug ) );
				return 'plugin: ' . strtok( $rest, '/' );
			}
			if ( 0 === strpos( $file, $theme ) ) {
				return 'theme: ' . strtok( substr( $file, strlen( $theme ) ), '/' );
			}
		}
		return 'WordPress';
	}

	/** Hide one-time login / reset tokens before an email body is stored. */
	public static function redact( $body ) {
		return preg_replace( '/([?&;](?:key|token|reset_key|login_key|code|nonce|_wpnonce|password)=)[^&"\'\s<>]+/i', '$1[redacted]', (string) $body );
	}

	public static function log_start( $args ) {
		self::$current = 0;
		$s             = WLSMTP_Settings::all();
		if ( 'off' === $s['log_mode'] ) {
			return $args;
		}
		$to      = isset( $args['to'] ) ? ( is_array( $args['to'] ) ? implode( ', ', $args['to'] ) : (string) $args['to'] ) : '';
		$headers = isset( $args['headers'] ) ? ( is_array( $args['headers'] ) ? implode( "\n", $args['headers'] ) : (string) $args['headers'] ) : '';
		$message = isset( $args['message'] ) ? (string) $args['message'] : '';
		$atts    = array();
		foreach ( (array) ( isset( $args['attachments'] ) ? $args['attachments'] : array() ) as $a ) {
			$atts[] = wp_basename( (string) $a );
		}
		$html = (bool) preg_match( '/content-type:\s*text\/html/i', $headers ) || ( $message !== wp_strip_all_tags( $message ) && preg_match( '/<(html|body|table|p|div|br|a)\b/i', $message ) );
		$keep = 'full' === $s['log_mode'];
		if ( $keep && ! empty( $s['redact'] ) ) {
			$message = self::redact( $message );
		}
		$row = array(
			'to_addr'      => mb_substr( $to, 0, 2000 ),
			'subject'      => mb_substr( (string) ( isset( $args['subject'] ) ? $args['subject'] : '' ), 0, 998 ),
			'headers'      => $keep ? mb_substr( $headers, 0, 4000 ) : '',
			'message'      => $keep ? substr( $message, 0, 200000 ) : '',
			'content_type' => $html ? 'html' : 'plain',
			'attachments'  => $atts ? wp_json_encode( $atts ) : '',
			'source'       => mb_substr( self::detect_source(), 0, 120 ),
			'transport'    => ( ! empty( $s['enabled'] ) && '' !== (string) WLSMTP_Settings::effective()['host'] ) ? 'smtp' : 'default',
		);
		if ( self::$retry_id ) {
			$old = WLSMTP_Log::get( self::$retry_id );
			WLSMTP_Log::update( self::$retry_id, array( 'status' => 'pending', 'attempts' => (int) ( $old ? $old['attempts'] : 1 ) + 1, 'error' => '' ) );
			self::$current  = self::$retry_id;
			self::$retry_id = 0;
		} else {
			self::$current = WLSMTP_Log::insert( $row );
		}
		return $args;
	}

	public static function log_success( $data = array() ) {
		if ( self::$current ) {
			WLSMTP_Log::update( self::$current, array( 'status' => 'sent', 'error' => '' ) );
			self::$current = 0;
		}
	}

	public static function log_failure( $error ) {
		$msg = is_wp_error( $error ) ? $error->get_error_message() : (string) $error;
		if ( self::$current ) {
			$id  = self::$current;
			$row = WLSMTP_Log::get( $id );
			$cols = array( 'status' => 'failed', 'error' => mb_substr( $msg, 0, 2000 ) );
			if ( self::$debug && self::$transcript ) {
				$cols['debug_log'] = mb_substr( self::mask_transcript( self::$transcript ), 0, 8000 );
			}
			WLSMTP_Log::update( $id, $cols );
			self::$current = 0;
			self::maybe_retry( $id, $row );
		}
		self::alert( $msg, is_wp_error( $error ) && $error->get_error_data() ? $error->get_error_data() : array() );
	}

	private static function maybe_retry( $id, $row ) {
		$s = WLSMTP_Settings::all();
		if ( empty( $s['retry_failed'] ) || ! $row || '' === (string) $row['message'] || '' !== (string) $row['attachments'] ) {
			return; // Needs the stored body; attachments are not stored, so those cannot be retried.
		}
		$attempts = (int) $row['attempts'];
		$wait     = array( 1 => 5 * MINUTE_IN_SECONDS, 2 => 30 * MINUTE_IN_SECONDS, 3 => 2 * HOUR_IN_SECONDS );
		if ( $attempts <= (int) $s['retry_max'] && isset( $wait[ $attempts ] ) ) {
			wp_schedule_single_event( time() + $wait[ $attempts ], 'wlsmtp_retry', array( (int) $id ) );
		}
	}

	/** Hide the base64 credentials PHPMailer prints during AUTH. */
	public static function mask_transcript( $t ) {
		return preg_replace_callback( '/^(.*?(?:CLIENT -> SERVER:)\s*)([A-Za-z0-9+\/=]{8,})\s*$/m', function ( $m ) {
			return $m[1] . '[hidden]';
		}, (string) $t );
	}

	/* ---------- alerts ---------- */

	public static function alert( $message, $data = array() ) {
		$url = (string) WLSMTP_Settings::get( 'alert_webhook' );
		if ( '' === $url ) {
			return;
		}
		if ( get_transient( 'wlsmtp_alert_sent' ) ) {
			set_transient( 'wlsmtp_alert_pending', (int) get_transient( 'wlsmtp_alert_pending' ) + 1, HOUR_IN_SECONDS );
			return;
		}
		set_transient( 'wlsmtp_alert_sent', 1, 10 * MINUTE_IN_SECONDS );
		$more = (int) get_transient( 'wlsmtp_alert_pending' );
		delete_transient( 'wlsmtp_alert_pending' );
		$to   = is_array( $data ) && ! empty( $data['to'] ) ? ' → ' . implode( ', ', (array) $data['to'] ) : '';
		$text = sprintf( /* translators: 1: site 2: error */ __( '⚠️ Email failed on %1$s%2$s: %3$s', 'weberslink-smtp' ), wp_specialchars_decode( get_bloginfo( 'name' ), ENT_QUOTES ), $to, mb_substr( $message, 0, 500 ) ) . ( $more ? ' ' . sprintf( /* translators: %d: count */ __( '(+%d more since the last alert)', 'weberslink-smtp' ), $more ) : '' );
		$body = false !== strpos( $url, 'discord.com/api/webhooks' ) ? array( 'content' => $text ) : array( 'text' => $text );
		wp_remote_post( $url, array( 'timeout' => 8, 'blocking' => false, 'headers' => array( 'Content-Type' => 'application/json' ), 'body' => wp_json_encode( $body ) ) );
	}
}
