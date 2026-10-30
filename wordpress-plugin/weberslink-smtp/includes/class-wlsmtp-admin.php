<?php
defined( 'ABSPATH' ) || exit;

class WLSMTP_Admin {

	public static function init() {
		add_action( 'admin_menu', array( __CLASS__, 'menu' ) );
		add_action( 'admin_init', array( __CLASS__, 'register' ) );
		add_action( 'admin_enqueue_scripts', array( __CLASS__, 'assets' ) );
		add_action( 'admin_post_wlsmtp_bulk', array( __CLASS__, 'bulk' ) );
		add_action( 'admin_post_wlsmtp_export', array( __CLASS__, 'export' ) );
		add_action( 'admin_post_wlsmtp_test', array( __CLASS__, 'test_email' ) );
		add_action( 'admin_post_wlsmtp_purge', array( __CLASS__, 'purge' ) );
		add_action( 'admin_post_wlsmtp_report', array( __CLASS__, 'send_report' ) );
		add_action( 'wp_dashboard_setup', array( __CLASS__, 'dashboard_widget' ) );
		add_action( 'admin_notices', array( __CLASS__, 'failure_notice' ) );
		add_filter( 'plugin_action_links_' . plugin_basename( WLSMTP_FILE ), function ( $l ) {
			array_unshift( $l, '<a href="' . esc_url( admin_url( 'admin.php?page=wlsmtp-settings' ) ) . '">' . esc_html__( 'Settings', 'weberslink-smtp' ) . '</a>' );
			return $l;
		} );
	}

	private static function guard( $action ) {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to do this.', 'weberslink-smtp' ), '', array( 'response' => 403 ) );
		}
		check_admin_referer( $action );
	}

	private static function url( $page, $args = array() ) {
		return add_query_arg( $args, admin_url( 'admin.php?page=' . $page ) );
	}

	public static function menu() {
		add_menu_page( 'Weberslink Mail', 'Weberslink Mail', 'manage_options', 'wlsmtp', array( __CLASS__, 'page_log' ), 'dashicons-email-alt', 76 );
		add_submenu_page( 'wlsmtp', __( 'Email log', 'weberslink-smtp' ), __( 'Email log', 'weberslink-smtp' ), 'manage_options', 'wlsmtp', array( __CLASS__, 'page_log' ) );
		add_submenu_page( 'wlsmtp', __( 'SMTP settings', 'weberslink-smtp' ), __( 'SMTP settings', 'weberslink-smtp' ), 'manage_options', 'wlsmtp-settings', array( __CLASS__, 'page_settings' ) );
		add_submenu_page( 'wlsmtp', __( 'Tools', 'weberslink-smtp' ), __( 'Tools', 'weberslink-smtp' ), 'manage_options', 'wlsmtp-tools', array( __CLASS__, 'page_tools' ) );
	}

	public static function register() {
		register_setting( 'wlsmtp_group', WLSMTP_Settings::OPTION, array( 'sanitize_callback' => function ( $in ) {
			return WLSMTP_Settings::sanitize( is_array( $in ) ? wp_unslash( $in ) : array(), WLSMTP_Settings::all() );
		} ) );
	}

	public static function assets( $hook ) {
		$page = isset( $_GET['page'] ) ? sanitize_key( $_GET['page'] ) : ''; // phpcs:ignore
		if ( 0 !== strpos( $page, 'wlsmtp' ) ) {
			return;
		}
		wp_enqueue_style( 'wlsmtp-admin', WLSMTP_URL . 'assets/admin.css', array(), WLSMTP_VERSION );
		if ( 'wlsmtp-settings' === $page ) {
			wp_enqueue_script( 'wlsmtp-admin', WLSMTP_URL . 'assets/admin.js', array(), WLSMTP_VERSION, true );
			wp_localize_script( 'wlsmtp-admin', 'WLSMTP', array( 'presets' => WLSMTP_Settings::presets() ) );
		}
	}

	public static function failure_notice() {
		$page = isset( $_GET['page'] ) ? sanitize_key( $_GET['page'] ) : ''; // phpcs:ignore
		if ( 0 !== strpos( $page, 'wlsmtp' ) || ! current_user_can( 'manage_options' ) ) {
			return;
		}
		$c = WLSMTP_Log::counts( 1 );
		if ( $c['failed'] > 0 ) {
			echo '<div class="notice notice-warning"><p>' . esc_html( sprintf( /* translators: %d: count */ _n( '%d email failed in the last 24 hours.', '%d emails failed in the last 24 hours.', $c['failed'], 'weberslink-smtp' ), $c['failed'] ) ) . ' <a href="' . esc_url( self::url( 'wlsmtp', array( 'status' => 'failed' ) ) ) . '">' . esc_html__( 'View failures', 'weberslink-smtp' ) . '</a></p></div>';
		}
	}

	public static function dashboard_widget() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		wp_add_dashboard_widget( 'wlsmtp_dash', 'Weberslink Mail', function () {
			$c = WLSMTP_Log::counts( 7 );
			echo '<p><strong>' . (int) $c['sent'] . '</strong> ' . esc_html__( 'sent', 'weberslink-smtp' ) . ' · <strong style="color:' . ( $c['failed'] ? '#b32d2e' : 'inherit' ) . '">' . (int) $c['failed'] . '</strong> ' . esc_html__( 'failed', 'weberslink-smtp' ) . ' <span class="description">(' . esc_html__( 'last 7 days', 'weberslink-smtp' ) . ')</span></p>';
			$q = WLSMTP_Log::query( array( 'status' => 'failed', 'per_page' => 3 ) );
			if ( $q['rows'] ) {
				echo '<ul>';
				foreach ( $q['rows'] as $r ) {
					echo '<li><a href="' . esc_url( self::url( 'wlsmtp', array( 'view' => $r['id'] ) ) ) . '">' . esc_html( mb_strimwidth( $r['subject'], 0, 50, '…' ) ) . '</a> <span class="description">' . esc_html( mb_strimwidth( (string) $r['error'], 0, 60, '…' ) ) . '</span></li>';
				}
				echo '</ul>';
			}
			echo '<p><a href="' . esc_url( self::url( 'wlsmtp' ) ) . '">' . esc_html__( 'Open the email log', 'weberslink-smtp' ) . '</a></p>';
		} );
	}

	private static function pill( $status ) {
		return '<span class="wlsmtp-pill wlsmtp-' . esc_attr( $status ) . '">' . esc_html( ucfirst( $status ) ) . '</span>';
	}

	public static function transport_label( $t ) {
		$t      = (string) $t;
		$backup = 0 === strpos( $t, 'backup:' );
		$m      = $backup ? substr( $t, 7 ) : $t;
		$names  = WLSMTP_Settings::mailers();
		$label  = isset( $names[ $m ] ) ? $names[ $m ] : __( 'PHP mail() / default', 'weberslink-smtp' );
		return $backup ? sprintf( /* translators: %s: mailer */ __( 'Backup: %s', 'weberslink-smtp' ), $label ) : $label;
	}

	/** 14-day sent/failed bars as inline SVG (no JS, no library). */
	public static function chart( $series ) {
		$max = 1;
		foreach ( $series as $v ) {
			$max = max( $max, $v['sent'] + $v['failed'] );
		}
		$w = 22;
		$h = 70;
		$n = count( $series );
		$o = '<div class="wlsmtp-chart"><svg role="img" aria-label="' . esc_attr__( 'Emails per day, last 14 days', 'weberslink-smtp' ) . '" viewBox="0 0 ' . ( $n * $w ) . ' ' . ( $h + 14 ) . '" width="100%" height="' . ( $h + 14 ) . '" preserveAspectRatio="none">';
		$i = 0;
		foreach ( $series as $day => $v ) {
			$hs = round( $v['sent'] / $max * $h );
			$hf = round( $v['failed'] / $max * $h );
			$x  = $i * $w + 3;
			$o .= '<g><title>' . esc_html( $day . ': ' . $v['sent'] . ' sent, ' . $v['failed'] . ' failed' ) . '</title>';
			if ( $hs ) {
				$o .= '<rect x="' . $x . '" y="' . ( $h - $hs - $hf ) . '" width="' . ( $w - 6 ) . '" height="' . $hs . '" fill="#2271b1"/>';
			}
			if ( $hf ) {
				$o .= '<rect x="' . $x . '" y="' . ( $h - $hf ) . '" width="' . ( $w - 6 ) . '" height="' . $hf . '" fill="#d63638"/>';
			}
			if ( ! $hs && ! $hf ) {
				$o .= '<rect x="' . $x . '" y="' . ( $h - 1 ) . '" width="' . ( $w - 6 ) . '" height="1" fill="#c3c4c7"/>';
			}
			$o .= '</g>';
			$i++;
		}
		$days = array_keys( $series );
		return $o . '</svg><span class="wlsmtp-axis"><span>' . esc_html( substr( reset( $days ), 5 ) ) . '</span><span>' . esc_html( substr( end( $days ), 5 ) ) . '</span></span><span class="wlsmtp-legend"><i style="background:#2271b1"></i>' . esc_html__( 'Sent', 'weberslink-smtp' ) . ' <i style="background:#d63638"></i>' . esc_html__( 'Failed', 'weberslink-smtp' ) . ' · ' . esc_html__( 'last 14 days', 'weberslink-smtp' ) . '</span></div>';
	}

	/* ---------------- Email log ---------------- */

	public static function page_log() {
		if ( ! empty( $_GET['view'] ) ) { // phpcs:ignore
			self::page_view( (int) $_GET['view'] ); // phpcs:ignore
			return;
		}
		$status = isset( $_GET['status'] ) ? sanitize_key( $_GET['status'] ) : ''; // phpcs:ignore
		$search = isset( $_GET['s'] ) ? sanitize_text_field( wp_unslash( $_GET['s'] ) ) : ''; // phpcs:ignore
		$from   = isset( $_GET['from'] ) ? sanitize_text_field( wp_unslash( $_GET['from'] ) ) : ''; // phpcs:ignore
		$to     = isset( $_GET['to'] ) ? sanitize_text_field( wp_unslash( $_GET['to'] ) ) : ''; // phpcs:ignore
		$paged  = max( 1, isset( $_GET['paged'] ) ? (int) $_GET['paged'] : 1 ); // phpcs:ignore
		$q      = WLSMTP_Log::query( array( 'status' => $status, 'search' => $search, 'from' => $from, 'to' => $to, 'page' => $paged, 'per_page' => 25 ) );
		$c      = WLSMTP_Log::counts( 30 );
		$base   = array( 's' => $search, 'from' => $from, 'to' => $to );
		$track  = ! empty( WLSMTP_Settings::get( 'track_opens' ) ) || ! empty( WLSMTP_Settings::get( 'track_clicks' ) );
		echo '<div class="wrap wlsmtp"><h1 class="wp-heading-inline">' . esc_html__( 'Email log', 'weberslink-smtp' ) . '</h1> ';
		echo '<a class="page-title-action" href="' . esc_url( wp_nonce_url( add_query_arg( array_merge( $base, array( 'action' => 'wlsmtp_export', 'status' => $status ) ), admin_url( 'admin-post.php' ) ), 'wlsmtp_export' ) ) . '">' . esc_html__( 'Export CSV', 'weberslink-smtp' ) . '</a><hr class="wp-header-end">';
		echo self::chart( WLSMTP_Log::daily_series( 14 ) );
		if ( isset( $_GET['msg'] ) ) { // phpcs:ignore
			echo '<div class="notice notice-success is-dismissible"><p>' . esc_html( sanitize_text_field( wp_unslash( $_GET['msg'] ) ) ) . '</p></div>'; // phpcs:ignore
		}
		if ( 'off' === WLSMTP_Settings::get( 'log_mode' ) ) {
			echo '<div class="notice notice-info"><p>' . esc_html__( 'Logging is switched off in SMTP settings, so new emails are not recorded.', 'weberslink-smtp' ) . '</p></div>';
		}
		$tabs = array( '' => __( 'All', 'weberslink-smtp' ), 'sent' => __( 'Sent', 'weberslink-smtp' ) . ' (' . $c['sent'] . ')', 'failed' => __( 'Failed', 'weberslink-smtp' ) . ' (' . $c['failed'] . ')', 'pending' => __( 'Pending', 'weberslink-smtp' ) );
		echo '<ul class="subsubsub">';
		$i = 0;
		foreach ( $tabs as $k => $l ) {
			echo '<li><a href="' . esc_url( self::url( 'wlsmtp', array_merge( $base, array( 'status' => $k ) ) ) ) . '"' . ( $status === $k ? ' class="current"' : '' ) . '>' . esc_html( $l ) . '</a>' . ( ++$i < count( $tabs ) ? ' | ' : '' ) . '</li>';
		}
		echo '</ul><form method="get" class="wlsmtp-filters"><input type="hidden" name="page" value="wlsmtp" /><input type="hidden" name="status" value="' . esc_attr( $status ) . '" /><input type="date" name="from" value="' . esc_attr( $from ) . '" /> – <input type="date" name="to" value="' . esc_attr( $to ) . '" /> <input type="search" name="s" value="' . esc_attr( $search ) . '" placeholder="' . esc_attr__( 'Search recipient, subject or source', 'weberslink-smtp' ) . '" /> <button class="button">' . esc_html__( 'Filter', 'weberslink-smtp' ) . '</button></form>';
		echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '">';
		wp_nonce_field( 'wlsmtp_bulk' );
		echo '<input type="hidden" name="action" value="wlsmtp_bulk" /><input type="hidden" name="return" value="' . esc_attr( add_query_arg( array_merge( $base, array( 'status' => $status, 'paged' => $paged ) ), admin_url( 'admin.php?page=wlsmtp' ) ) ) . '" />';
		echo '<div class="tablenav top"><select name="do"><option value="">' . esc_html__( 'Bulk actions', 'weberslink-smtp' ) . '</option><option value="resend">' . esc_html__( 'Resend', 'weberslink-smtp' ) . '</option><option value="delete">' . esc_html__( 'Delete', 'weberslink-smtp' ) . '</option></select> <button class="button">' . esc_html__( 'Apply', 'weberslink-smtp' ) . '</button></div>';
		echo '<table class="wp-list-table widefat fixed striped"><thead><tr><td class="check-column"><input type="checkbox" onclick="document.querySelectorAll(\'.wlsmtp-cb\').forEach(function(c){c.checked=this.checked}.bind(this))" /></td><th style="width:90px">' . esc_html__( 'Status', 'weberslink-smtp' ) . '</th><th>' . esc_html__( 'To', 'weberslink-smtp' ) . '</th><th>' . esc_html__( 'Subject', 'weberslink-smtp' ) . '</th><th style="width:170px">' . esc_html__( 'Source', 'weberslink-smtp' ) . '</th>' . ( $track ? '<th style="width:80px">' . esc_html__( 'Opens / clicks', 'weberslink-smtp' ) . '</th>' : '' ) . '<th style="width:150px">' . esc_html__( 'Date', 'weberslink-smtp' ) . '</th></tr></thead><tbody>';
		if ( ! $q['rows'] ) {
			echo '<tr><td colspan="' . ( $track ? 7 : 6 ) . '">' . esc_html__( 'No emails logged yet. Send a test email from the Tools page.', 'weberslink-smtp' ) . '</td></tr>';
		}
		foreach ( $q['rows'] as $r ) {
			$link = self::url( 'wlsmtp', array( 'view' => $r['id'] ) );
			echo '<tr><th class="check-column"><input class="wlsmtp-cb" type="checkbox" name="ids[]" value="' . (int) $r['id'] . '" /></th><td>' . self::pill( $r['status'] ) . ( (int) $r['attempts'] > 1 ? '<br><span class="description">' . esc_html( sprintf( /* translators: %d: attempts */ __( '%d attempts', 'weberslink-smtp' ), $r['attempts'] ) ) . '</span>' : '' ) . '</td><td>' . esc_html( mb_strimwidth( $r['to_addr'], 0, 60, '…' ) ) . '</td><td><a href="' . esc_url( $link ) . '"><strong>' . esc_html( $r['subject'] ? mb_strimwidth( $r['subject'], 0, 80, '…' ) : '(no subject)' ) . '</strong></a>' . ( $r['attachments'] ? ' 📎' : '' ) . ( 'failed' === $r['status'] && $r['error'] ? '<br><span class="wlsmtp-err">' . esc_html( mb_strimwidth( $r['error'], 0, 110, '…' ) ) . '</span>' : '' ) . '</td><td>' . esc_html( $r['source'] ) . ( $r['transport'] && 'smtp' !== $r['transport'] ? '<br><span class="description">' . esc_html( self::transport_label( $r['transport'] ) ) . '</span>' : '' ) . '</td>' . ( $track ? '<td>' . (int) $r['opens'] . ' / ' . (int) $r['clicks'] . '</td>' : '' ) . '<td>' . esc_html( get_date_from_gmt( $r['created_at'], 'Y-m-d H:i' ) ) . '</td></tr>';
		}
		echo '</tbody></table></form>';
		$pages = (int) ceil( $q['total'] / 25 );
		if ( $pages > 1 ) {
			echo '<div class="tablenav bottom"><div class="tablenav-pages">' . wp_kses_post( paginate_links( array( 'base' => add_query_arg( 'paged', '%#%' ), 'format' => '', 'current' => $paged, 'total' => $pages ) ) ) . '</div></div>';
		}
		echo '</div>';
	}

	private static function page_view( $id ) {
		$r = WLSMTP_Log::get( $id );
		echo '<div class="wrap wlsmtp"><h1 class="wp-heading-inline">' . esc_html__( 'Email', 'weberslink-smtp' ) . '</h1> <a class="page-title-action" href="' . esc_url( self::url( 'wlsmtp' ) ) . '">← ' . esc_html__( 'Back to log', 'weberslink-smtp' ) . '</a><hr class="wp-header-end">';
		if ( ! $r ) {
			echo '<p>' . esc_html__( 'Email not found.', 'weberslink-smtp' ) . '</p></div>';
			return;
		}
		$mode = isset( $_GET['mode'] ) && 'text' === $_GET['mode'] ? 'text' : 'html'; // phpcs:ignore
		echo '<table class="widefat striped wlsmtp-meta" style="max-width:900px"><tbody>';
		$rows = array(
			__( 'Status', 'weberslink-smtp' )  => self::pill( $r['status'] ) . ( (int) $r['attempts'] > 1 ? ' <span class="description">' . esc_html( sprintf( /* translators: %d: attempts */ __( 'after %d attempts', 'weberslink-smtp' ), $r['attempts'] ) ) . '</span>' : '' ),
			__( 'Date', 'weberslink-smtp' )    => esc_html( get_date_from_gmt( $r['created_at'], get_option( 'date_format' ) . ' H:i:s' ) ),
			__( 'To', 'weberslink-smtp' )      => esc_html( $r['to_addr'] ),
			__( 'Subject', 'weberslink-smtp' ) => esc_html( $r['subject'] ),
			__( 'Source', 'weberslink-smtp' )  => esc_html( $r['source'] ),
			__( 'Sent via', 'weberslink-smtp' ) => esc_html( self::transport_label( $r['transport'] ) ),
		);
		if ( $r['headers'] ) {
			$rows[ __( 'Headers', 'weberslink-smtp' ) ] = '<pre class="wlsmtp-pre">' . esc_html( $r['headers'] ) . '</pre>';
		}
		if ( $r['attachments'] ) {
			$names                                         = json_decode( $r['attachments'], true );
			$rows[ __( 'Attachments', 'weberslink-smtp' ) ] = esc_html( implode( ', ', (array) $names ) ) . ' <span class="description">(' . esc_html__( 'names only; files are not stored', 'weberslink-smtp' ) . ')</span>';
		}
		if ( $r['error'] ) {
			$rows[ __( 'Error', 'weberslink-smtp' ) ] = '<span class="wlsmtp-err">' . esc_html( $r['error'] ) . '</span>';
		}
		foreach ( $rows as $k => $v ) {
			echo '<tr><th style="width:140px">' . esc_html( $k ) . '</th><td>' . $v . '</td></tr>'; // phpcs:ignore
		}
		echo '</tbody></table>';
		if ( $r['debug_log'] ) {
			echo '<h2>' . esc_html__( 'SMTP conversation', 'weberslink-smtp' ) . '</h2><pre class="wlsmtp-pre">' . esc_html( $r['debug_log'] ) . '</pre>';
		}
		echo '<p style="margin-top:16px">';
		if ( '' !== (string) $r['message'] ) {
			echo '<a class="button" href="' . esc_url( wp_nonce_url( admin_url( 'admin-post.php?action=wlsmtp_bulk&do=resend&ids[]=' . $id . '&return=' . rawurlencode( self::url( 'wlsmtp', array( 'view' => $id ) ) ) ), 'wlsmtp_bulk' ) ) . '">' . esc_html__( 'Resend', 'weberslink-smtp' ) . '</a> ';
		}
		echo '<a class="button" href="' . esc_url( wp_nonce_url( admin_url( 'admin-post.php?action=wlsmtp_bulk&do=delete&ids[]=' . $id . '&return=' . rawurlencode( self::url( 'wlsmtp' ) ) ), 'wlsmtp_bulk' ) ) . '" onclick="return confirm(\'' . esc_js( __( 'Delete this log entry?', 'weberslink-smtp' ) ) . '\')">' . esc_html__( 'Delete', 'weberslink-smtp' ) . '</a></p>';
		if ( '' === (string) $r['message'] ) {
			echo '<p class="description">' . esc_html__( 'The message body was not stored (logging is set to "recipients and subject only").', 'weberslink-smtp' ) . '</p></div>';
			return;
		}
		echo '<h2>' . esc_html__( 'Message', 'weberslink-smtp' ) . '</h2><p><a class="button' . ( 'html' === $mode ? ' button-primary' : '' ) . '" href="' . esc_url( self::url( 'wlsmtp', array( 'view' => $id ) ) ) . '">' . esc_html__( 'Rendered', 'weberslink-smtp' ) . '</a> <a class="button' . ( 'text' === $mode ? ' button-primary' : '' ) . '" href="' . esc_url( self::url( 'wlsmtp', array( 'view' => $id, 'mode' => 'text' ) ) ) . '">' . esc_html__( 'Plain text', 'weberslink-smtp' ) . '</a></p>';
		if ( 'text' === $mode || 'plain' === $r['content_type'] ) {
			$txt = 'html' === $r['content_type'] ? html_entity_decode( wp_strip_all_tags( preg_replace( '/<(br|\/p|\/div|\/tr|\/h[1-6])\s*\/?>/i', "\n", $r['message'] ) ), ENT_QUOTES, 'UTF-8' ) : $r['message'];
			echo '<pre class="wlsmtp-pre wlsmtp-body">' . esc_html( trim( $txt ) ) . '</pre>';
		} else {
			// Sandboxed, script-free preview. Remote images are blocked (tracking pixels).
			$doc = '<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'"><base target="_blank">' . $r['message'];
			echo '<iframe class="wlsmtp-frame" sandbox="" referrerpolicy="no-referrer" srcdoc="' . esc_attr( $doc ) . '" title="' . esc_attr__( 'Email preview', 'weberslink-smtp' ) . '"></iframe><p class="description">' . esc_html__( 'Preview runs in a sandbox: scripts and remote images are blocked.', 'weberslink-smtp' ) . '</p>';
		}
		echo '</div>';
	}

	public static function bulk() {
		self::guard( 'wlsmtp_bulk' );
		$ids = array_filter( array_map( 'intval', isset( $_REQUEST['ids'] ) ? (array) $_REQUEST['ids'] : array() ) ); // phpcs:ignore
		$do  = isset( $_REQUEST['do'] ) ? sanitize_key( $_REQUEST['do'] ) : ''; // phpcs:ignore
		$ret = isset( $_REQUEST['return'] ) ? esc_url_raw( wp_unslash( $_REQUEST['return'] ) ) : self::url( 'wlsmtp' ); // phpcs:ignore
		$ret = wp_validate_redirect( $ret, self::url( 'wlsmtp' ) );
		$msg = __( 'Nothing selected.', 'weberslink-smtp' );
		if ( $ids && 'delete' === $do ) {
			WLSMTP_Log::delete( $ids );
			$msg = sprintf( /* translators: %d: count */ __( '%d deleted.', 'weberslink-smtp' ), count( $ids ) );
		} elseif ( $ids && 'resend' === $do ) {
			$ok = 0;
			$no = 0;
			foreach ( $ids as $id ) {
				$r = WLSMTP_Log::get( $id );
				if ( ! $r || '' === (string) $r['message'] || '' !== (string) $r['attachments'] ) {
					$no++;
					continue;
				}
				$headers = array_values( array_filter( preg_split( '/\r\n|\r|\n/', (string) $r['headers'] ) ) );
				wp_mail( array_map( 'trim', explode( ',', (string) $r['to_addr'] ) ), (string) $r['subject'], (string) $r['message'], $headers ) ? $ok++ : $no++;
			}
			$msg = sprintf( /* translators: 1: sent 2: skipped/failed */ __( 'Resent %1$d. Skipped or failed: %2$d (emails without a stored body or with attachments cannot be resent).', 'weberslink-smtp' ), $ok, $no );
		}
		wp_safe_redirect( add_query_arg( 'msg', rawurlencode( $msg ), $ret ) );
		exit;
	}

	public static function export() {
		self::guard( 'wlsmtp_export' );
		$q = WLSMTP_Log::query( array( 'status' => isset( $_GET['status'] ) ? sanitize_key( $_GET['status'] ) : '', 'search' => isset( $_GET['s'] ) ? sanitize_text_field( wp_unslash( $_GET['s'] ) ) : '', 'from' => isset( $_GET['from'] ) ? sanitize_text_field( wp_unslash( $_GET['from'] ) ) : '', 'to' => isset( $_GET['to'] ) ? sanitize_text_field( wp_unslash( $_GET['to'] ) ) : '', 'per_page' => 0 ) ); // phpcs:ignore
		nocache_headers();
		header( 'Content-Type: text/csv; charset=utf-8' );
		header( 'Content-Disposition: attachment; filename=email-log-' . gmdate( 'Y-m-d' ) . '.csv' );
		$out = fopen( 'php://output', 'w' ); // phpcs:ignore
		fwrite( $out, "\xEF\xBB\xBF" ); // phpcs:ignore
		fputcsv( $out, array( 'ID', 'Date (UTC)', 'Status', 'To', 'Subject', 'Source', 'Attempts', 'Error' ) );
		foreach ( $q['rows'] as $r ) {
			fputcsv( $out, array_map( array( __CLASS__, 'csv_cell' ), array( $r['id'], $r['created_at'], $r['status'], $r['to_addr'], $r['subject'], $r['source'], $r['attempts'], $r['error'] ) ) );
		}
		fclose( $out ); // phpcs:ignore
		exit;
	}

	/** Neutralise spreadsheet formula injection. */
	public static function csv_cell( $v ) {
		$v = (string) $v;
		return ( '' !== $v && in_array( $v[0], array( '=', '+', '-', '@', "\t", "\r" ), true ) ) ? "'" . $v : $v;
	}

	/* ---------------- Settings ---------------- */

	public static function page_settings() {
		$s     = WLSMTP_Settings::all();
		$lock  = WLSMTP_Settings::constant_overrides();
		$name  = WLSMTP_Settings::OPTION;
		$field = function ( $key, $label, $type = 'text', $extra = '', $group = '' ) use ( $s, $lock, $name ) {
			$v = isset( $lock[ $key ] ) ? $lock[ $key ] : $s[ $key ];
			echo '<tr data-row="' . esc_attr( $key ) . '"' . ( $group ? ' data-group="' . esc_attr( $group ) . '"' : '' ) . '><th scope="row"><label for="wlsmtp_' . esc_attr( $key ) . '">' . esc_html( $label ) . '</label></th><td><input class="regular-text" type="' . esc_attr( $type ) . '" id="wlsmtp_' . esc_attr( $key ) . '" name="' . esc_attr( $name . '[' . $key . ']' ) . '" value="' . esc_attr( $v ) . '"' . ( isset( $lock[ $key ] ) ? ' disabled' : '' ) . ' autocomplete="off" />' . ( isset( $lock[ $key ] ) ? ' <span class="description">' . esc_html__( 'Set in wp-config.php', 'weberslink-smtp' ) . '</span>' : '' ) . $extra . '</td></tr>'; // phpcs:ignore
		};
		$check = function ( $key, $label, $help = '', $group = '' ) use ( $s, $name ) {
			echo '<tr data-row="' . esc_attr( $key ) . '"' . ( $group ? ' data-group="' . esc_attr( $group ) . '"' : '' ) . '><th scope="row">' . esc_html( $label ) . '</th><td><label><input type="checkbox" name="' . esc_attr( $name . '[' . $key . ']' ) . '" value="1"' . checked( ! empty( $s[ $key ] ), true, false ) . ' /> ' . esc_html( $help ) . '</label></td></tr>';
		};
		$secret = function ( $key, $store, $label, $note, $group, $const = '' ) use ( $s, $name ) {
			$has = '' !== WLSMTP_Settings::decrypt( (string) $s[ $store ] );
			echo '<tr data-row="' . esc_attr( $key ) . '" data-group="' . esc_attr( $group ) . '"><th scope="row"><label for="wlsmtp_' . esc_attr( $key ) . '">' . esc_html( $label ) . '</label></th><td>';
			if ( $const && defined( $const ) && '' !== constant( $const ) ) {
				echo '<em>' . esc_html( sprintf( /* translators: %s: constant name */ __( 'Set by %s in wp-config.php', 'weberslink-smtp' ), $const ) ) . '</em>';
			} else {
				echo '<input class="regular-text" type="password" id="wlsmtp_' . esc_attr( $key ) . '" name="' . esc_attr( $name . '[' . $key . ']' ) . '" value="" autocomplete="new-password" placeholder="' . esc_attr( $has ? '•••••••• (saved, leave empty to keep)' : '' ) . '" /> <button type="button" class="button wlsmtp-reveal" data-target="wlsmtp_' . esc_attr( $key ) . '">' . esc_html__( 'Show', 'weberslink-smtp' ) . '</button><p class="description">' . esc_html( $note ) . '</p>';
			}
			echo '</td></tr>';
		};
		// One connection (primary: $p = '', backup: $p = 'bk_').
		$connection = function ( $p ) use ( $s, $name, $field, $check, $secret ) {
			echo '<div class="wlsmtp-conn" data-prefix="' . esc_attr( $p ) . '"><table class="form-table"><tbody>';
			echo '<tr><th scope="row"><label for="wlsmtp_' . esc_attr( $p ) . 'mailer">' . esc_html__( 'Send with', 'weberslink-smtp' ) . '</label></th><td><select class="wlsmtp-mailer" id="wlsmtp_' . esc_attr( $p ) . 'mailer" name="' . esc_attr( $name . '[' . $p . 'mailer]' ) . '">';
			foreach ( WLSMTP_Settings::mailers() as $k => $l ) {
				echo '<option value="' . esc_attr( $k ) . '"' . selected( $s[ $p . 'mailer' ], $k, false ) . '>' . esc_html( $l ) . '</option>';
			}
			echo '</select><p class="description">' . esc_html__( 'API mailers use HTTPS (port 443): the answer when your host blocks SMTP ports.', 'weberslink-smtp' ) . '</p></td></tr>';
			// SMTP provider presets (the primary one is saved; the backup one is only a helper).
			echo '<tr data-group="smtp"><th scope="row"><label for="wlsmtp_' . esc_attr( $p ) . 'provider">' . esc_html__( 'Provider', 'weberslink-smtp' ) . '</label></th><td><select class="wlsmtp-provider" id="wlsmtp_' . esc_attr( $p ) . 'provider"' . ( '' === $p ? ' name="' . esc_attr( $name ) . '[provider]"' : '' ) . '>';
			foreach ( WLSMTP_Settings::presets() as $k => $pr ) {
				echo '<option value="' . esc_attr( $k ) . '"' . selected( '' === $p ? $s['provider'] : 'custom', $k, false ) . '>' . esc_html( $pr['label'] ) . '</option>';
			}
			echo '</select><p class="description wlsmtp-note"></p></td></tr>';
			$field( $p . 'host', __( 'SMTP host', 'weberslink-smtp' ), 'text', '', 'smtp' );
			echo '<tr data-row="' . esc_attr( $p ) . 'encryption" data-group="smtp"><th scope="row">' . esc_html__( 'Encryption', 'weberslink-smtp' ) . '</th><td>';
			foreach ( array( 'tls' => 'STARTTLS (port 587, recommended)', 'ssl' => 'SSL/TLS (port 465)', 'none' => __( 'None (port 25, not recommended)', 'weberslink-smtp' ) ) as $k => $l ) {
				echo '<label style="display:block"><input type="radio" name="' . esc_attr( $name . '[' . $p . 'encryption]' ) . '" value="' . esc_attr( $k ) . '"' . checked( $s[ $p . 'encryption' ], $k, false ) . ' /> ' . esc_html( $l ) . '</label>';
			}
			echo '</td></tr>';
			$field( $p . 'port', __( 'Port', 'weberslink-smtp' ), 'number', '', 'smtp' );
			$check( $p . 'auth', __( 'Authentication', 'weberslink-smtp' ), __( 'My server needs a username and password', 'weberslink-smtp' ), 'smtp' );
			$field( $p . 'user', __( 'Username', 'weberslink-smtp' ), 'text', '', 'smtp' );
			$secret( $p . 'pass', $p . 'pass_enc', __( 'Password', 'weberslink-smtp' ), __( 'Stored encrypted. Enter a single - to remove it.', 'weberslink-smtp' ), 'smtp', '' === $p ? 'WLSMTP_PASS' : '' );
			$secret( $p . 'api_key', $p . 'api_key_enc', __( 'API key', 'weberslink-smtp' ), __( 'Stored encrypted. Enter a single - to remove it. Postmark: Server API token. Mailgun: Private API key.', 'weberslink-smtp' ), 'api', '' === $p ? 'WLSMTP_API_KEY' : '' );
			$field( $p . 'mailgun_domain', __( 'Mailgun domain', 'weberslink-smtp' ), 'text', '<p class="description">' . esc_html__( 'The sending domain you verified in Mailgun, e.g. mg.example.com', 'weberslink-smtp' ) . '</p>', 'mailgun' );
			echo '<tr data-group="mailgun"><th scope="row">' . esc_html__( 'Mailgun region', 'weberslink-smtp' ) . '</th><td>';
			foreach ( array( 'us' => 'US', 'eu' => 'EU' ) as $k => $l ) {
				echo '<label style="margin-right:14px"><input type="radio" name="' . esc_attr( $name . '[' . $p . 'mailgun_region]' ) . '" value="' . esc_attr( $k ) . '"' . checked( $s[ $p . 'mailgun_region' ], $k, false ) . ' /> ' . esc_html( $l ) . '</label>';
			}
			echo '</td></tr></tbody></table></div>';
		};

		echo '<div class="wrap wlsmtp"><h1>' . esc_html__( 'Mail settings', 'weberslink-smtp' ) . '</h1>';
		if ( isset( $_GET['settings-updated'] ) ) { // phpcs:ignore
			echo '<div class="notice notice-success is-dismissible"><p>' . esc_html__( 'Settings saved. Send a test email from the Tools page to confirm everything works.', 'weberslink-smtp' ) . '</p></div>';
		}
		echo '<form method="post" action="options.php">';
		settings_fields( 'wlsmtp_group' );
		echo '<h2>' . esc_html__( 'Primary connection', 'weberslink-smtp' ) . '</h2><table class="form-table"><tbody>';
		$check( 'enabled', __( 'Send through this plugin', 'weberslink-smtp' ), __( 'Turn off to use WordPress\'s default mailer (the log keeps working).', 'weberslink-smtp' ) );
		echo '</tbody></table>';
		$connection( '' );
		echo '<table class="form-table"><tbody>';
		$check( 'verify_cert', __( 'Verify TLS certificate', 'weberslink-smtp' ), __( 'SMTP only. Leave on; turn off only for a server with a self-signed certificate.', 'weberslink-smtp' ) );
		$field( 'timeout', __( 'SMTP timeout (seconds)', 'weberslink-smtp' ), 'number' );
		echo '</tbody></table><h2>' . esc_html__( 'Sender', 'weberslink-smtp' ) . '</h2><table class="form-table"><tbody>';
		$field( 'from_email', __( 'From email', 'weberslink-smtp' ), 'email', '<p class="description">' . esc_html__( 'Must be an address your provider allows you to send from (usually on a domain you verified).', 'weberslink-smtp' ) . '</p>' );
		$check( 'force_from_email', __( 'Force from email', 'weberslink-smtp' ), __( 'Use this address for every email, even if a plugin sets another', 'weberslink-smtp' ) );
		$field( 'from_name', __( 'From name', 'weberslink-smtp' ) );
		$check( 'force_from_name', __( 'Force from name', 'weberslink-smtp' ), __( 'Use this name for every email', 'weberslink-smtp' ) );
		$check( 'return_path', __( 'Return path', 'weberslink-smtp' ), __( 'SMTP only. Set the bounce address to the From email (helps SPF alignment)', 'weberslink-smtp' ) );

		echo '</tbody></table><h2>' . esc_html__( 'Backup connection (automatic failover)', 'weberslink-smtp' ) . '</h2><p class="description">' . esc_html__( 'If the primary connection fails, the email is sent again through this one straight away, so nothing is lost when a provider has an outage. Use a different provider than the primary.', 'weberslink-smtp' ) . '</p><table class="form-table"><tbody>';
		$check( 'bk_enabled', __( 'Enable backup', 'weberslink-smtp' ), __( 'Fail over to the backup connection', 'weberslink-smtp' ) );
		$field( 'bk_from_email', __( 'Backup From email', 'weberslink-smtp' ), 'email', '<p class="description">' . esc_html__( 'Optional. Leave empty to use the From email above.', 'weberslink-smtp' ) . '</p>' );
		echo '</tbody></table>';
		$connection( 'bk_' );

		echo '<h2>' . esc_html__( 'Smart routing', 'weberslink-smtp' ) . '</h2><p class="description">' . esc_html__( 'Send some emails a different way. The first matching rule wins; everything else uses the primary connection. Leave the value empty to skip a row.', 'weberslink-smtp' ) . '</p><table class="form-table"><tbody><tr><th scope="row">' . esc_html__( 'Rules', 'weberslink-smtp' ) . '</th><td>';
		$routes = array_values( (array) $s['routes'] );
		$blank  = max( 0, min( 3, 10 - count( $routes ) ) );
		for ( $i = 0; $i < $blank; $i++ ) {
			$routes[] = array( 'match' => 'source', 'value' => '', 'via' => 'backup' );
		}
		foreach ( $routes as $i => $r ) {
			echo '<div class="wlsmtp-route"><select name="' . esc_attr( $name . '[routes][' . $i . '][match]' ) . '">';
			foreach ( WLSMTP_Settings::route_matches() as $k => $l ) {
				echo '<option value="' . esc_attr( $k ) . '"' . selected( $r['match'], $k, false ) . '>' . esc_html( $l ) . '</option>';
			}
			echo '</select> <input type="text" name="' . esc_attr( $name . '[routes][' . $i . '][value]' ) . '" value="' . esc_attr( $r['value'] ) . '" placeholder="' . esc_attr__( 'e.g. woocommerce, gmail.com, Invoice', 'weberslink-smtp' ) . '" /> → <select name="' . esc_attr( $name . '[routes][' . $i . '][via]' ) . '">';
			foreach ( array( 'primary' => __( 'Primary connection', 'weberslink-smtp' ), 'backup' => __( 'Backup connection', 'weberslink-smtp' ), 'default' => __( 'WordPress default mailer', 'weberslink-smtp' ) ) as $k => $l ) {
				echo '<option value="' . esc_attr( $k ) . '"' . selected( $r['via'], $k, false ) . '>' . esc_html( $l ) . '</option>';
			}
			echo '</select></div>';
		}
		echo '</td></tr></tbody></table>';

		echo '<h2>' . esc_html__( 'Email log', 'weberslink-smtp' ) . '</h2><table class="form-table"><tbody>';
		echo '<tr><th scope="row"><label for="wlsmtp_log_mode">' . esc_html__( 'What to log', 'weberslink-smtp' ) . '</label></th><td><select id="wlsmtp_log_mode" name="' . esc_attr( $name ) . '[log_mode]">';
		foreach ( array( 'full' => __( 'Everything (recipients, subject, message: enables preview, resend and retries)', 'weberslink-smtp' ), 'meta' => __( 'Recipients and subject only (no message bodies)', 'weberslink-smtp' ), 'off' => __( 'Nothing (logging off)', 'weberslink-smtp' ) ) as $k => $l ) {
			echo '<option value="' . esc_attr( $k ) . '"' . selected( $s['log_mode'], $k, false ) . '>' . esc_html( $l ) . '</option>';
		}
		echo '</select></td></tr>';
		$check( 'redact', __( 'Hide secrets in logged messages', 'weberslink-smtp' ), __( 'Replace password-reset keys, magic-link tokens and nonces with [redacted]', 'weberslink-smtp' ) );
		$field( 'keep_days', __( 'Keep log for (days)', 'weberslink-smtp' ), 'number', '<span class="description"> ' . esc_html__( '0 = keep forever', 'weberslink-smtp' ) . '</span>' );
		$check( 'retry_failed', __( 'Retry failed emails', 'weberslink-smtp' ), __( 'Try again after 5 min, 30 min and 2 hours (needs WP-Cron; not for emails with attachments)', 'weberslink-smtp' ) );
		$field( 'retry_max', __( 'Maximum retries', 'weberslink-smtp' ), 'number' );
		$check( 'track_opens', __( 'Track opens', 'weberslink-smtp' ), __( 'Add a 1×1 image to HTML emails and count opens', 'weberslink-smtp' ) );
		$check( 'track_clicks', __( 'Track link clicks', 'weberslink-smtp' ), __( 'Route links in HTML emails through your site and count clicks', 'weberslink-smtp' ) );
		echo '<tr><th></th><td><p class="description">' . esc_html__( 'Tracking is off by default. Tell your recipients if you turn it on (privacy laws such as GDPR may require consent). Open counts are approximate: mail apps that preload images inflate them. Emails with one-time login or reset links are never modified.', 'weberslink-smtp' ) . '</p></td></tr>';

		echo '</tbody></table><h2>' . esc_html__( 'Alerts and reports', 'weberslink-smtp' ) . '</h2><table class="form-table"><tbody>';
		$field( 'alert_webhook', __( 'Alert webhook URL', 'weberslink-smtp' ), 'url', '<p class="description">' . esc_html__( 'Slack or Discord incoming webhook (https). You are alerted when an email fails, at most once every 10 minutes: handy because failed email can\'t email you.', 'weberslink-smtp' ) . '</p>' );
		$check( 'report_enabled', __( 'Weekly report', 'weberslink-smtp' ), __( 'Email a summary every Monday: sent, failed, delivery rate, opens, clicks and the busiest failure sources', 'weberslink-smtp' ) );
		$field( 'report_email', __( 'Send report to', 'weberslink-smtp' ), 'email', '<p class="description">' . esc_html__( 'Leave empty for the site admin email.', 'weberslink-smtp' ) . '</p>' );

		echo '</tbody></table><h2>' . esc_html__( 'Email controls', 'weberslink-smtp' ) . '</h2><p class="description">' . esc_html__( 'Tick the WordPress notification emails you do not want sent at all.', 'weberslink-smtp' ) . '</p><table class="form-table"><tbody><tr><th scope="row">' . esc_html__( 'Do not send', 'weberslink-smtp' ) . '</th><td>';
		foreach ( WLSMTP_Settings::disable_options() as $k => $l ) {
			echo '<label style="display:block;margin-bottom:4px"><input type="checkbox" name="' . esc_attr( $name ) . '[disable][]" value="' . esc_attr( $k ) . '"' . checked( in_array( $k, (array) $s['disable'], true ), true, false ) . ' /> ' . esc_html( $l ) . '</label>';
		}
		echo '</td></tr>';
		$check( 'delete_on_uninstall', __( 'Remove all data on uninstall', 'weberslink-smtp' ), __( 'Deletes the log and settings when the plugin is deleted', 'weberslink-smtp' ) );
		echo '</tbody></table>';
		submit_button();
		echo '</form><h2>' . esc_html__( 'Keep credentials out of the database', 'weberslink-smtp' ) . '</h2><p>' . esc_html__( 'Add any of these to wp-config.php; they override the fields above:', 'weberslink-smtp' ) . '</p><pre class="wlsmtp-pre">define( \'WLSMTP_HOST\', \'smtp.example.com\' );
define( \'WLSMTP_USER\', \'user@example.com\' );
define( \'WLSMTP_PASS\', \'your-password\' );
define( \'WLSMTP_API_KEY\', \'your-api-key\' ); // for the API mailers
define( \'WLSMTP_FROM_EMAIL\', \'hello@example.com\' );</pre></div>';
	}

	/* ---------------- Tools ---------------- */

	public static function page_tools() {
		$uid    = get_current_user_id();
		$result = get_transient( 'wlsmtp_test_' . $uid );
		$s      = WLSMTP_Settings::effective();
		$from   = ! empty( $s['from_email'] ) ? $s['from_email'] : get_option( 'admin_email' );
		$domain = isset( $_GET['domain'] ) ? sanitize_text_field( wp_unslash( $_GET['domain'] ) ) : substr( strrchr( $from, '@' ), 1 ); // phpcs:ignore
		echo '<div class="wrap wlsmtp"><h1>' . esc_html__( 'Tools', 'weberslink-smtp' ) . '</h1>';
		if ( isset( $_GET['msg'] ) ) { // phpcs:ignore
			echo '<div class="notice notice-success is-dismissible"><p>' . esc_html( sanitize_text_field( wp_unslash( $_GET['msg'] ) ) ) . '</p></div>'; // phpcs:ignore
		}
		echo '<h2>' . esc_html__( 'Send a test email', 'weberslink-smtp' ) . '</h2><form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '">';
		wp_nonce_field( 'wlsmtp_test' );
		echo '<input type="hidden" name="action" value="wlsmtp_test" /><input type="email" name="to" class="regular-text" value="' . esc_attr( wp_get_current_user()->user_email ) . '" required /> <select name="via"><option value="">' . esc_html__( 'Normal routing', 'weberslink-smtp' ) . '</option><option value="primary">' . esc_html__( 'Primary connection', 'weberslink-smtp' ) . '</option><option value="backup">' . esc_html__( 'Backup connection', 'weberslink-smtp' ) . '</option></select> <button class="button button-primary">' . esc_html__( 'Send test', 'weberslink-smtp' ) . '</button></form>';
		if ( $result ) {
			delete_transient( 'wlsmtp_test_' . $uid );
			echo '<div class="notice notice-' . ( $result['ok'] ? 'success' : 'error' ) . ' inline" style="max-width:900px"><p><strong>' . esc_html( $result['ok'] ? __( 'Success: the email was accepted by the mail server. Check the inbox (and spam folder).', 'weberslink-smtp' ) : __( 'The test email failed.', 'weberslink-smtp' ) ) . '</strong>' . ( $result['error'] ? '<br>' . esc_html( $result['error'] ) : '' ) . '</p>' . ( $result['transcript'] ? '<details open><summary>' . esc_html__( 'SMTP conversation (credentials hidden)', 'weberslink-smtp' ) . '</summary><pre class="wlsmtp-pre">' . esc_html( $result['transcript'] ) . '</pre></details>' : '' ) . '</div>';
		}
		echo '<h2>' . esc_html__( 'Deliverability check', 'weberslink-smtp' ) . '</h2><p class="description">' . esc_html__( 'Looks up your domain\'s SPF, DKIM and DMARC records and tells you what to fix so your email lands in the inbox.', 'weberslink-smtp' ) . '</p><form method="get"><input type="hidden" name="page" value="wlsmtp-tools" /><input type="text" name="domain" class="regular-text" value="' . esc_attr( $domain ) . '" placeholder="example.com" /> <input type="text" name="selector" value="' . esc_attr( isset( $_GET['selector'] ) ? sanitize_text_field( wp_unslash( $_GET['selector'] ) ) : '' ) . '" placeholder="' . esc_attr__( 'DKIM selector (optional)', 'weberslink-smtp' ) . '" /> <button class="button" name="check" value="1">' . esc_html__( 'Check domain', 'weberslink-smtp' ) . '</button></form>'; // phpcs:ignore
		if ( isset( $_GET['check'] ) ) { // phpcs:ignore
			$res = WLSMTP_Deliverability::check( $domain, $s['provider'], isset( $_GET['selector'] ) ? sanitize_text_field( wp_unslash( $_GET['selector'] ) ) : '' ); // phpcs:ignore
			echo '<ul class="wlsmtp-checks">';
			$icons = array( 'ok' => '✅', 'warn' => '⚠️', 'bad' => '❌', 'info' => 'ℹ️' );
			foreach ( $res as $r ) {
				echo '<li class="wlsmtp-c-' . esc_attr( $r[0] ) . '"><span>' . esc_html( $icons[ $r[0] ] ) . '</span> <strong>' . esc_html( $r[1] ) . '</strong>: ' . esc_html( $r[2] ) . '</li>';
			}
			echo '</ul>';
		}
		echo '<h2>' . esc_html__( 'Weekly report', 'weberslink-smtp' ) . '</h2><p><a class="button" href="' . esc_url( wp_nonce_url( admin_url( 'admin-post.php?action=wlsmtp_report' ), 'wlsmtp_report' ) ) . '">' . esc_html__( 'Send the report now', 'weberslink-smtp' ) . '</a></p>';
		echo '<h2>' . esc_html__( 'Maintenance', 'weberslink-smtp' ) . '</h2><p><a class="button" onclick="return confirm(\'' . esc_js( __( 'Delete the whole email log?', 'weberslink-smtp' ) ) . '\')" href="' . esc_url( wp_nonce_url( admin_url( 'admin-post.php?action=wlsmtp_purge' ), 'wlsmtp_purge' ) ) . '">' . esc_html__( 'Clear the email log', 'weberslink-smtp' ) . '</a></p></div>';
	}

	public static function test_email() {
		self::guard( 'wlsmtp_test' );
		$to  = isset( $_POST['to'] ) ? sanitize_email( wp_unslash( $_POST['to'] ) ) : ''; // phpcs:ignore
		$res = array( 'ok' => false, 'error' => '', 'transcript' => '' );
		if ( is_email( $to ) ) {
			$via                        = isset( $_POST['via'] ) && in_array( $_POST['via'], array( 'primary', 'backup' ), true ) ? $_POST['via'] : ''; // phpcs:ignore
			WLSMTP_Mailer::$force_route = $via;
			WLSMTP_Mailer::$last_error  = '';
			WLSMTP_Mailer::$debug      = true;
			WLSMTP_Mailer::$transcript = '';
			$site                      = wp_specialchars_decode( get_bloginfo( 'name' ), ENT_QUOTES );
			$res['ok']                 = wp_mail( $to, sprintf( /* translators: %s: site */ __( 'Test email from %s', 'weberslink-smtp' ), $site ), '<p>' . esc_html__( 'This is a test email from Weberslink SMTP & Email Log. If you can read it, your site can send email.', 'weberslink-smtp' ) . '</p>', array( 'Content-Type: text/html; charset=UTF-8' ) );
			WLSMTP_Mailer::$debug      = false;
			WLSMTP_Mailer::$force_route = '';
			$res['transcript']         = WLSMTP_Mailer::mask_transcript( WLSMTP_Mailer::$transcript );
			if ( ! $res['ok'] ) {
				$res['error'] = WLSMTP_Mailer::$last_error;
			}
		} else {
			$res['error'] = __( 'Enter a valid email address.', 'weberslink-smtp' );
		}
		set_transient( 'wlsmtp_test_' . get_current_user_id(), $res, 5 * MINUTE_IN_SECONDS );
		wp_safe_redirect( self::url( 'wlsmtp-tools' ) );
		exit;
	}

	public static function send_report() {
		self::guard( 'wlsmtp_report' );
		$ok  = WLSMTP_Report::send();
		$msg = $ok ? __( 'Report sent.', 'weberslink-smtp' ) : __( 'The report could not be sent. Check the email log for the reason.', 'weberslink-smtp' );
		wp_safe_redirect( self::url( 'wlsmtp-tools', array( 'msg' => rawurlencode( $msg ) ) ) );
		exit;
	}

	public static function purge() {
		self::guard( 'wlsmtp_purge' );
		global $wpdb;
		$wpdb->query( 'TRUNCATE TABLE ' . WLSMTP_Log::table() ); // phpcs:ignore
		wp_safe_redirect( self::url( 'wlsmtp-tools', array( 'msg' => rawurlencode( __( 'Email log cleared.', 'weberslink-smtp' ) ) ) ) );
		exit;
	}
}
