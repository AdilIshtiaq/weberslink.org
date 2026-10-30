<?php
defined( 'ABSPATH' ) || exit;

/**
 * HTTP-API mailers (SendGrid, Brevo, Mailgun, Postmark): handy when your host blocks SMTP ports.
 * build_request() is pure so every payload can be unit-tested without a network.
 */
class WLSMTP_Transport {

	/** "Jane <jane@x.co>" or "jane@x.co" -> array( email, name ) or null. */
	public static function parse_address( $str ) {
		$str = trim( (string) $str );
		if ( '' === $str ) {
			return null;
		}
		if ( preg_match( '/^(.*)<\s*([^>]+?)\s*>$/', $str, $m ) ) {
			$email = trim( $m[2] );
			$name  = trim( trim( $m[1] ), " \t\"'" );
		} else {
			$email = $str;
			$name  = '';
		}
		return is_email( $email ) ? array( $email, $name ) : null;
	}

	/** Split on commas that are not inside double quotes. */
	private static function split_list( $str ) {
		return preg_split( '/,(?=(?:[^"]*"[^"]*")*[^"]*$)/', $str );
	}

	public static function parse_list( $v ) {
		$out   = array();
		$items = is_array( $v ) ? $v : array( (string) $v );
		foreach ( (array) $items as $item ) {
			// Each array element may itself hold a comma-separated list (e.g. "Cc: a@x.co, b@x.co").
			foreach ( is_array( $item ) ? $item : self::split_list( (string) $item ) as $one ) {
				$a = self::parse_address( $one );
				if ( $a ) {
					$out[ strtolower( $a[0] ) ] = $a;
				}
			}
		}
		return array_values( $out );
	}

	/** Normalise wp_mail() arguments into one structure the API builders understand. */
	public static function parse( $args, $conn, $settings ) {
		$headers = isset( $args['headers'] ) ? $args['headers'] : array();
		$headers = is_array( $headers ) ? $headers : preg_split( '/\r\n|\r|\n/', (string) $headers );
		$h       = array( 'from' => '', 'cc' => array(), 'bcc' => array(), 'reply-to' => array(), 'content-type' => '' );
		foreach ( (array) $headers as $line ) {
			if ( false === strpos( (string) $line, ':' ) ) {
				continue;
			}
			list( $k, $v ) = array_map( 'trim', explode( ':', (string) $line, 2 ) );
			$k             = strtolower( $k );
			if ( 'from' === $k ) {
				$h['from'] = $v;
			} elseif ( in_array( $k, array( 'cc', 'bcc', 'reply-to' ), true ) ) {
				$h[ $k ][] = $v;
			} elseif ( 'content-type' === $k ) {
				$h['content-type'] = $v;
			}
		}
		$hf   = self::parse_address( $h['from'] );
		$host = function_exists( 'wp_parse_url' ) ? wp_parse_url( home_url(), PHP_URL_HOST ) : 'localhost';
		$def  = 'wordpress@' . preg_replace( '/^www\./', '', (string) $host );
		$def  = apply_filters( 'wp_mail_from', $def );
		$dn   = apply_filters( 'wp_mail_from_name', 'WordPress' );

		$force_mail = ! empty( $settings['force_from_email'] );
		$force_name = ! empty( $settings['force_from_name'] ) && '' !== (string) $settings['from_name'];
		if ( $force_mail && '' !== (string) $conn['from_email'] ) {
			$from_email = $conn['from_email'];
		} else {
			$from_email = $hf ? $hf[0] : ( '' !== (string) $conn['from_email'] ? $conn['from_email'] : $def );
		}
		if ( $force_name ) {
			$from_name = $settings['from_name'];
		} else {
			$from_name = $hf && '' !== $hf[1] ? $hf[1] : ( '' !== (string) $settings['from_name'] ? $settings['from_name'] : $dn );
		}

		$to  = self::parse_list( isset( $args['to'] ) ? $args['to'] : array() );
		$cc  = self::parse_list( $h['cc'] );
		$bcc = self::parse_list( $h['bcc'] );
		$have = array();
		foreach ( $to as $a ) {
			$have[ strtolower( $a[0] ) ] = 1;
		}
		$cc = array_values( array_filter( $cc, function ( $a ) use ( &$have ) {
			$k = strtolower( $a[0] );
			if ( isset( $have[ $k ] ) ) {
				return false;
			}
			$have[ $k ] = 1;
			return true;
		} ) );
		$bcc = array_values( array_filter( $bcc, function ( $a ) use ( &$have ) {
			$k = strtolower( $a[0] );
			if ( isset( $have[ $k ] ) ) {
				return false;
			}
			$have[ $k ] = 1;
			return true;
		} ) );

		$html = (bool) preg_match( '/text\/html/i', $h['content-type'] );
		$body = isset( $args['message'] ) ? (string) $args['message'] : '';
		$atts = array();
		$size = 0;
		foreach ( (array) ( isset( $args['attachments'] ) ? $args['attachments'] : array() ) as $path ) {
			$path = (string) $path;
			if ( ! is_readable( $path ) || ! is_file( $path ) ) {
				continue;
			}
			$size += (int) filesize( $path );
			if ( $size > 20 * 1024 * 1024 ) {
				break; // Providers cap messages around 20-30 MB.
			}
			$atts[] = array( 'name' => basename( $path ), 'mime' => function_exists( 'mime_content_type' ) ? ( @mime_content_type( $path ) ?: 'application/octet-stream' ) : 'application/octet-stream', 'content' => (string) file_get_contents( $path ) ); // phpcs:ignore
		}
		return array(
			'from'        => array( $from_email, $from_name ),
			'to'          => $to,
			'cc'          => $cc,
			'bcc'         => $bcc,
			'reply_to'    => self::parse_list( $h['reply-to'] ),
			'subject'     => isset( $args['subject'] ) ? (string) $args['subject'] : '',
			'html'        => $html ? $body : '',
			'text'        => $html ? trim( html_entity_decode( wp_strip_all_tags( preg_replace( '/<(br|\/p|\/div|\/tr|\/h[1-6])\s*\/?>/i', "\n", $body ) ), ENT_QUOTES, 'UTF-8' ) ) : $body,
			'attachments' => $atts,
		);
	}

	private static function addr_obj( $a, $key = 'email' ) {
		$o = array( $key => $a[0] );
		if ( '' !== $a[1] ) {
			$o['name'] = $a[1];
		}
		return $o;
	}

	private static function addr_str( $a ) {
		return '' !== $a[1] ? '"' . str_replace( array( '"', "\r", "\n" ), '', $a[1] ) . '" <' . $a[0] . '>' : $a[0];
	}

	private static function multipart( $fields, $files, $boundary ) {
		$b = '';
		foreach ( $fields as $k => $vals ) {
			foreach ( (array) $vals as $v ) {
				$b .= '--' . $boundary . "\r\nContent-Disposition: form-data; name=\"" . $k . "\"\r\n\r\n" . $v . "\r\n";
			}
		}
		foreach ( $files as $f ) {
			$b .= '--' . $boundary . "\r\nContent-Disposition: form-data; name=\"attachment\"; filename=\"" . str_replace( array( '"', "\r", "\n" ), '', $f['name'] ) . "\"\r\nContent-Type: " . $f['mime'] . "\r\n\r\n" . $f['content'] . "\r\n";
		}
		return $b . '--' . $boundary . "--\r\n";
	}

	public static function endpoint( $mailer, $conn ) {
		switch ( $mailer ) {
			case 'sendgrid':
				$u = 'https://api.sendgrid.com/v3/mail/send';
				break;
			case 'brevo':
				$u = 'https://api.brevo.com/v3/smtp/email';
				break;
			case 'mailgun':
				$u = ( 'eu' === $conn['region'] ? 'https://api.eu.mailgun.net' : 'https://api.mailgun.net' ) . '/v3/' . rawurlencode( $conn['domain'] ) . '/messages';
				break;
			default:
				$u = 'https://api.postmarkapp.com/email';
		}
		return apply_filters( 'wlsmtp_api_endpoint', $u, $mailer );
	}

	/** Returns array( url, headers, body ). */
	public static function build_request( $mailer, $conn, $m ) {
		$url = self::endpoint( $mailer, $conn );
		$json = array( 'Content-Type' => 'application/json', 'Accept' => 'application/json' );
		switch ( $mailer ) {
			case 'sendgrid':
				$p = array(
					'personalizations' => array( array_filter( array(
						'to'  => array_map( array( __CLASS__, 'addr_obj' ), $m['to'] ),
						'cc'  => array_map( array( __CLASS__, 'addr_obj' ), $m['cc'] ),
						'bcc' => array_map( array( __CLASS__, 'addr_obj' ), $m['bcc'] ),
					) ) ),
					'from'    => self::addr_obj( $m['from'] ),
					'subject' => $m['subject'],
					'content' => array_values( array_filter( array(
						'' !== $m['text'] || '' === $m['html'] ? array( 'type' => 'text/plain', 'value' => '' !== $m['text'] ? $m['text'] : ' ' ) : null,
						'' !== $m['html'] ? array( 'type' => 'text/html', 'value' => $m['html'] ) : null,
					) ) ),
				);
				if ( $m['reply_to'] ) {
					$p['reply_to'] = self::addr_obj( $m['reply_to'][0] );
				}
				if ( $m['attachments'] ) {
					$p['attachments'] = array_map( function ( $f ) {
						return array( 'content' => base64_encode( $f['content'] ), 'filename' => $f['name'], 'type' => $f['mime'] );
					}, $m['attachments'] );
				}
				return array( $url, $json + array( 'Authorization' => 'Bearer ' . $conn['api_key'] ), wp_json_encode( $p ) );
			case 'brevo':
				$p = array( 'sender' => self::addr_obj( $m['from'] ), 'to' => array_map( array( __CLASS__, 'addr_obj' ), $m['to'] ), 'subject' => $m['subject'] );
				if ( $m['cc'] ) {
					$p['cc'] = array_map( array( __CLASS__, 'addr_obj' ), $m['cc'] );
				}
				if ( $m['bcc'] ) {
					$p['bcc'] = array_map( array( __CLASS__, 'addr_obj' ), $m['bcc'] );
				}
				if ( $m['reply_to'] ) {
					$p['replyTo'] = self::addr_obj( $m['reply_to'][0] );
				}
				if ( '' !== $m['html'] ) {
					$p['htmlContent'] = $m['html'];
					$p['textContent'] = $m['text'];
				} else {
					$p['textContent'] = '' !== $m['text'] ? $m['text'] : ' ';
				}
				if ( $m['attachments'] ) {
					$p['attachment'] = array_map( function ( $f ) {
						return array( 'name' => $f['name'], 'content' => base64_encode( $f['content'] ) );
					}, $m['attachments'] );
				}
				return array( $url, $json + array( 'api-key' => $conn['api_key'] ), wp_json_encode( $p ) );
			case 'mailgun':
				$fields = array( 'from' => self::addr_str( $m['from'] ), 'to' => implode( ', ', array_map( array( __CLASS__, 'addr_str' ), $m['to'] ) ), 'subject' => $m['subject'], 'text' => '' !== $m['text'] ? $m['text'] : ' ' );
				if ( $m['cc'] ) {
					$fields['cc'] = implode( ', ', array_map( array( __CLASS__, 'addr_str' ), $m['cc'] ) );
				}
				if ( $m['bcc'] ) {
					$fields['bcc'] = implode( ', ', array_map( array( __CLASS__, 'addr_str' ), $m['bcc'] ) );
				}
				if ( '' !== $m['html'] ) {
					$fields['html'] = $m['html'];
				}
				if ( $m['reply_to'] ) {
					$fields['h:Reply-To'] = self::addr_str( $m['reply_to'][0] );
				}
				$boundary = 'wlsmtp' . md5( $m['subject'] . count( $m['to'] ) . strlen( $m['text'] ) );
				return array( $url, array( 'Authorization' => 'Basic ' . base64_encode( 'api:' . $conn['api_key'] ), 'Content-Type' => 'multipart/form-data; boundary=' . $boundary ), self::multipart( $fields, $m['attachments'], $boundary ) );
			default: // postmark
				$p = array( 'From' => self::addr_str( $m['from'] ), 'To' => implode( ',', array_map( array( __CLASS__, 'addr_str' ), $m['to'] ) ), 'Subject' => $m['subject'], 'MessageStream' => 'outbound' );
				if ( $m['cc'] ) {
					$p['Cc'] = implode( ',', array_map( array( __CLASS__, 'addr_str' ), $m['cc'] ) );
				}
				if ( $m['bcc'] ) {
					$p['Bcc'] = implode( ',', array_map( array( __CLASS__, 'addr_str' ), $m['bcc'] ) );
				}
				if ( $m['reply_to'] ) {
					$p['ReplyTo'] = self::addr_str( $m['reply_to'][0] );
				}
				if ( '' !== $m['html'] ) {
					$p['HtmlBody'] = $m['html'];
					$p['TextBody'] = $m['text'];
				} else {
					$p['TextBody'] = '' !== $m['text'] ? $m['text'] : ' ';
				}
				if ( $m['attachments'] ) {
					$p['Attachments'] = array_map( function ( $f ) {
						return array( 'Name' => $f['name'], 'Content' => base64_encode( $f['content'] ), 'ContentType' => $f['mime'] );
					}, $m['attachments'] );
				}
				return array( $url, $json + array( 'X-Postmark-Server-Token' => $conn['api_key'] ), wp_json_encode( $p ) );
		}
	}

	/** Interprets an API reply. Returns true or a readable error string. */
	public static function interpret( $mailer, $code, $body ) {
		$j     = json_decode( (string) $body, true );
		$label = self::mailers_label( $mailer );
		$ok    = array( 'sendgrid' => array( 202 ), 'brevo' => array( 201, 200 ), 'mailgun' => array( 200 ), 'postmark' => array( 200 ) );
		if ( in_array( (int) $code, $ok[ $mailer ], true ) && ( 'postmark' !== $mailer || ! isset( $j['ErrorCode'] ) || 0 === (int) $j['ErrorCode'] ) ) {
			return true;
		}
		$msg = '';
		if ( is_array( $j ) ) {
			if ( ! empty( $j['errors'][0]['message'] ) ) {
				$msg = $j['errors'][0]['message'];
			} elseif ( ! empty( $j['message'] ) ) {
				$msg = is_scalar( $j['message'] ) ? (string) $j['message'] : wp_json_encode( $j['message'] );
			} elseif ( ! empty( $j['Message'] ) ) {
				$msg = (string) $j['Message'];
			}
		}
		if ( '' === $msg ) {
			$msg = mb_substr( trim( wp_strip_all_tags( (string) $body ) ), 0, 200 );
		}
		return sprintf( '%s: HTTP %d%s', $label, (int) $code, '' !== $msg ? ' - ' . $msg : '' );
	}

	private static function mailers_label( $m ) {
		$l = WLSMTP_Settings::mailers();
		return isset( $l[ $m ] ) ? $l[ $m ] : $m;
	}

	/** Sends through the API. Returns true or WP_Error. */
	public static function send( $conn, $args, $settings ) {
		$mailer = $conn['mailer'];
		$m      = self::parse( $args, $conn, $settings );
		if ( ! $m['to'] ) {
			return new WP_Error( 'wlsmtp_no_recipient', __( 'No valid recipient address.', 'weberslink-smtp' ) );
		}
		list( $url, $headers, $body ) = self::build_request( $mailer, $conn, $m );
		$r = wp_remote_post( $url, array( 'timeout' => 20, 'redirection' => 0, 'headers' => $headers, 'body' => $body ) );
		if ( is_wp_error( $r ) ) {
			return new WP_Error( 'wlsmtp_http', self::mailers_label( $mailer ) . ': ' . $r->get_error_message() );
		}
		$res = self::interpret( $mailer, wp_remote_retrieve_response_code( $r ), wp_remote_retrieve_body( $r ) );
		return true === $res ? true : new WP_Error( 'wlsmtp_api', $res );
	}
}
