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
	/** Message of the most recent failure (used by the test email). */
	public static $last_error = '';
	/** Force 'primary' | 'backup' for the next email (Tools → test email). */
	public static $force_route = '';
	/** Route chosen for the email being sent: primary | backup | default. */
	public static $route = 'primary';
	/** Log row being re-sent through the backup connection. */
	private static $failover_id = 0;
	/** Original wp_mail arguments per log row, kept for failover. */
	private static $originals = array();
	private static $failover_queue = array();

	public static function init() {
		add_action( 'phpmailer_init', array( __CLASS__, 'configure' ), 99999 );
		add_filter( 'wp_mail', array( __CLASS__, 'log_start' ), 99999 );
		add_filter( 'pre_wp_mail', array( __CLASS__, 'send_via_api' ), 10, 2 );
		add_action( 'shutdown', array( __CLASS__, 'run_failover' ), 1 );
		add_action( 'wp_mail_succeeded', array( __CLASS__, 'log_success' ) );
		add_action( 'wp_mail_failed', array( __CLASS__, 'log_failure' ) );
	}

	/* ---------- transport ---------- */

	public static function configure( $mailer ) {
		if ( 'default' === self::$route ) {
			return;
		}
		$s    = WLSMTP_Settings::effective();
		$conn = WLSMTP_Settings::connection( 'backup' === self::$route ? 'backup' : 'primary' );
		if ( empty( $s['enabled'] ) || 'smtp' !== $conn['mailer'] || '' === $conn['host'] ) {
			return;
		}
		$mailer->isSMTP();
		$mailer->Host       = $conn['host'];
		$mailer->Port       = $conn['port'];
		$mailer->Timeout    = (int) $s['timeout'];
		$mailer->SMTPSecure = 'none' === $conn['encryption'] ? '' : $conn['encryption'];
		$mailer->SMTPAutoTLS = 'none' === $conn['encryption'];
		$mailer->SMTPAuth   = $conn['auth'];
		if ( $mailer->SMTPAuth ) {
			$mailer->Username = $conn['user'];
			$mailer->Password = $conn['pass'];
		}
		if ( empty( $s['verify_cert'] ) ) {
			$mailer->SMTPOptions = array( 'ssl' => array( 'verify_peer' => false, 'verify_peer_name' => false, 'allow_self_signed' => true ) );
		}
		if ( '' !== $conn['from_email'] && is_email( $conn['from_email'] ) ) {
			$from_name = ! empty( $s['force_from_name'] ) && '' !== (string) $s['from_name'] ? $s['from_name'] : $mailer->FromName;
			if ( ! empty( $s['force_from_email'] ) || '' === (string) $mailer->From ) {
				$mailer->setFrom( $conn['from_email'], $from_name, false );
			} elseif ( ! empty( $s['force_from_name'] ) ) {
				$mailer->FromName = $from_name;
			}
			if ( ! empty( $s['return_path'] ) ) {
				$mailer->Sender = $conn['from_email'];
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

	/** Choose primary / backup / default for this email. */
	public static function decide_route( $args, $source ) {
		$s = WLSMTP_Settings::effective();
		if ( empty( $s['enabled'] ) ) {
			return 'default';
		}
		$headers = isset( $args['headers'] ) ? ( is_array( $args['headers'] ) ? implode( "\n", $args['headers'] ) : (string) $args['headers'] ) : '';
		$from    = preg_match( '/^from:\s*(.+)$/im', $headers, $m ) ? trim( $m[1] ) : '';
		$to      = array();
		foreach ( WLSMTP_Transport::parse_list( isset( $args['to'] ) ? $args['to'] : array() ) as $a ) {
			$to[] = $a[0];
		}
		$mail         = array( 'to' => $to, 'subject' => isset( $args['subject'] ) ? (string) $args['subject'] : '', 'from' => $from );
		$backup_ready = ! empty( $s['bk_enabled'] ) && WLSMTP_Settings::connection_ready( WLSMTP_Settings::connection( 'backup' ) );
		$route        = WLSMTP_Router::decide( $mail, $source, $s['routes'], $backup_ready, self::$failover_id ? 'backup' : self::$force_route );
		if ( 'default' !== $route && ! WLSMTP_Settings::connection_ready( WLSMTP_Settings::connection( $route ) ) ) {
			return 'default';
		}
		return $route;
	}

	/** pre_wp_mail: send through an HTTP API when the chosen connection is an API mailer. */
	public static function send_via_api( $return, $atts ) {
		if ( null !== $return || 'default' === self::$route ) {
			return $return;
		}
		$conn = WLSMTP_Settings::connection( 'backup' === self::$route ? 'backup' : 'primary' );
		if ( 'smtp' === $conn['mailer'] ) {
			return $return;
		}
		$res = WLSMTP_Transport::send( $conn, $atts, WLSMTP_Settings::effective() );
		if ( true === $res ) {
			do_action( 'wp_mail_succeeded', $atts );
			return true;
		}
		$res->add_data( $atts );
		do_action( 'wp_mail_failed', $res );
		return false;
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
		$source        = $s['log_mode'] === 'off' && ! $s['routes'] ? '' : self::detect_source();
		self::$route   = self::decide_route( $args, $source );
		$conn          = 'default' === self::$route ? null : WLSMTP_Settings::connection( self::$route );
		$label         = null === $conn ? 'default' : ( 'backup' === self::$route ? 'backup:' : '' ) . $conn['mailer'];
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
		$orig = $message;
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
			'source'       => mb_substr( $source, 0, 120 ),
			'transport'    => $label,
		);
		if ( self::$failover_id ) {
			self::$current = self::$failover_id;
			WLSMTP_Log::update( self::$current, array( 'status' => 'pending', 'transport' => $label ) );
		} elseif ( self::$retry_id ) {
			$old = WLSMTP_Log::get( self::$retry_id );
			WLSMTP_Log::update( self::$retry_id, array( 'status' => 'pending', 'attempts' => (int) ( $old ? $old['attempts'] : 1 ) + 1, 'error' => '', 'transport' => $label ) );
			self::$current  = self::$retry_id;
			self::$retry_id = 0;
		} else {
			self::$current = WLSMTP_Log::insert( $row );
		}
		if ( self::$current && ! self::$failover_id ) {
			self::$originals[ self::$current ] = $args; // untouched copy, for failover
		}
		if ( self::$current && $html && 'default' !== self::$route && ( ! empty( $s['track_opens'] ) || ! empty( $s['track_clicks'] ) ) ) {
			$args['message'] = WLSMTP_Tracking::rewrite( $orig, self::$current, ! empty( $s['track_opens'] ), ! empty( $s['track_clicks'] ) );
		}
		return $args;
	}

	public static function log_success( $data = array() ) {
		if ( self::$current ) {
			WLSMTP_Log::update( self::$current, array( 'status' => 'sent', 'error' => '' ) );
			unset( self::$originals[ self::$current ] );
			self::$current = 0;
		}
	}

	public static function log_failure( $error ) {
		$msg              = is_wp_error( $error ) ? $error->get_error_message() : (string) $error;
		self::$last_error = $msg;
		if ( self::$current ) {
			$id   = self::$current;
			$row  = WLSMTP_Log::get( $id );
			$cols = array( 'status' => 'failed', 'error' => mb_substr( $msg, 0, 2000 ) );
			if ( self::$debug && self::$transcript ) {
				$cols['debug_log'] = mb_substr( self::mask_transcript( self::$transcript ), 0, 8000 );
			}
			WLSMTP_Log::update( $id, $cols );
			self::$current = 0;
			if ( self::can_failover( $id ) ) {
				self::$failover_queue[ $id ] = $msg;
				return; // The backup connection gets a go at shutdown; retries and alerts happen only if it fails too.
			}
			unset( self::$originals[ $id ] );
			self::maybe_retry( $id, $row );
		}
		self::alert( $msg, is_wp_error( $error ) && $error->get_error_data() ? $error->get_error_data() : array() );
	}

	private static function can_failover( $id ) {
		if ( 'primary' !== self::$route || self::$failover_id || ! isset( self::$originals[ $id ] ) || self::$force_route ) {
			return false;
		}
		$s = WLSMTP_Settings::all();
		return ! empty( $s['enabled'] ) && ! empty( $s['bk_enabled'] ) && WLSMTP_Settings::connection_ready( WLSMTP_Settings::connection( 'backup' ) );
	}

	/** Shutdown: re-send every email whose primary connection failed through the backup connection. */
	public static function run_failover() {
		$queue                = self::$failover_queue;
		self::$failover_queue = array();
		foreach ( $queue as $id => $primary_error ) {
			$a = isset( self::$originals[ $id ] ) ? self::$originals[ $id ] : null;
			if ( ! $a ) {
				continue;
			}
			WLSMTP_Log::update( $id, array( 'debug_log' => mb_substr( 'Primary connection failed: ' . $primary_error, 0, 1000 ) ) );
			self::$failover_id = (int) $id;
			wp_mail( isset( $a['to'] ) ? $a['to'] : array(), isset( $a['subject'] ) ? $a['subject'] : '', isset( $a['message'] ) ? $a['message'] : '', isset( $a['headers'] ) ? $a['headers'] : '', isset( $a['attachments'] ) ? $a['attachments'] : array() );
			self::$failover_id = 0;
			unset( self::$originals[ $id ] );
		}
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
