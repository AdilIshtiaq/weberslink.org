<?php
defined( 'ABSPATH' ) || exit;

class WLPOP_Admin {

	public static function init() {
		add_action( 'admin_menu', array( __CLASS__, 'menu' ) );
		add_action( 'admin_init', array( __CLASS__, 'register' ) );
		add_action( 'admin_enqueue_scripts', array( __CLASS__, 'assets' ) );
		foreach ( array( 'save', 'row', 'leads_delete', 'leads_export' ) as $a ) {
			add_action( 'admin_post_wlpop_' . $a, array( __CLASS__, $a ) );
		}
		add_filter( 'plugin_action_links_' . plugin_basename( WLPOP_FILE ), function ( $l ) {
			array_unshift( $l, '<a href="' . esc_url( admin_url( 'admin.php?page=wlpop' ) ) . '">' . esc_html__( 'Popups', 'weberslink-popups' ) . '</a>' );
			return $l;
		} );
	}

	private static function guard( $action ) {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to do this.', 'weberslink-popups' ), '', array( 'response' => 403 ) );
		}
		check_admin_referer( $action );
	}

	private static function url( $page, $args = array() ) {
		return add_query_arg( $args, admin_url( 'admin.php?page=' . $page ) );
	}

	private static function back( $page, $msg, $args = array() ) {
		wp_safe_redirect( self::url( $page, array_merge( array( 'msg' => rawurlencode( $msg ) ), $args ) ) );
		exit;
	}

	public static function menu() {
		add_menu_page( 'Weberslink Popups', 'Popups', 'manage_options', 'wlpop', array( __CLASS__, 'page_list' ), 'dashicons-megaphone', 81 );
		add_submenu_page( 'wlpop', __( 'All popups', 'weberslink-popups' ), __( 'All popups', 'weberslink-popups' ), 'manage_options', 'wlpop', array( __CLASS__, 'page_list' ) );
		add_submenu_page( 'wlpop', __( 'Leads', 'weberslink-popups' ), __( 'Leads', 'weberslink-popups' ), 'manage_options', 'wlpop-leads', array( __CLASS__, 'page_leads' ) );
		add_submenu_page( 'wlpop', __( 'Settings', 'weberslink-popups' ), __( 'Settings', 'weberslink-popups' ), 'manage_options', 'wlpop-settings', array( __CLASS__, 'page_settings' ) );
	}

	public static function register() {
		register_setting( 'wlpop_group', WLPOP_Store::SETTINGS, array( 'sanitize_callback' => function ( $in ) {
			return WLPOP_Store::sanitize_settings( is_array( $in ) ? wp_unslash( $in ) : array() );
		} ) );
	}

	public static function assets() {
		$page = isset( $_GET['page'] ) ? sanitize_key( $_GET['page'] ) : ''; // phpcs:ignore
		if ( 0 === strpos( $page, 'wlpop' ) ) {
			wp_enqueue_style( 'wlpop-admin', WLPOP_URL . 'assets/admin.css', array(), WLPOP_VERSION );
		}
	}

	private static function notice() {
		if ( isset( $_GET['msg'] ) ) { // phpcs:ignore
			echo '<div class="notice notice-success is-dismissible"><p>' . esc_html( sanitize_text_field( wp_unslash( $_GET['msg'] ) ) ) . '</p></div>'; // phpcs:ignore
		}
	}

	/** Views / closes / signups per popup, last 30 days. */
	private static function stat_map() {
		global $wpdb;
		$rows = (array) $wpdb->get_results( $wpdb->prepare( 'SELECT popup_id, SUM(views) v, SUM(closes) c, SUM(signups) s FROM ' . WLPOP_Leads::stats() . ' WHERE day >= %s GROUP BY popup_id', gmdate( 'Y-m-d', time() - 30 * DAY_IN_SECONDS ) ), ARRAY_A ); // phpcs:ignore
		$out  = array();
		foreach ( $rows as $r ) {
			$out[ $r['popup_id'] ] = array( 'v' => (int) $r['v'], 'c' => (int) $r['c'], 's' => (int) $r['s'] );
		}
		return $out;
	}

	/* ---------------- list ---------------- */

	public static function page_list() {
		if ( isset( $_GET['edit'] ) ) { // phpcs:ignore
			self::page_edit( sanitize_key( wp_unslash( $_GET['edit'] ) ) ); // phpcs:ignore
			return;
		}
		$items = WLPOP_Store::all();
		$stats = self::stat_map();
		echo '<div class="wrap wlpop"><h1 class="wp-heading-inline">' . esc_html__( 'Popups', 'weberslink-popups' ) . '</h1> <a class="page-title-action" href="' . esc_url( self::url( 'wlpop', array( 'edit' => 'new' ) ) ) . '">' . esc_html__( 'Add new', 'weberslink-popups' ) . '</a><hr class="wp-header-end">';
		self::notice();
		echo '<table class="wp-list-table widefat fixed striped"><thead><tr><th>' . esc_html__( 'Name', 'weberslink-popups' ) . '</th><th style="width:140px">' . esc_html__( 'Type', 'weberslink-popups' ) . '</th><th style="width:170px">' . esc_html__( 'Shows', 'weberslink-popups' ) . '</th><th style="width:70px">' . esc_html__( 'Views', 'weberslink-popups' ) . '</th><th style="width:80px">' . esc_html__( 'Sign-ups', 'weberslink-popups' ) . '</th><th style="width:80px">' . esc_html__( 'Rate', 'weberslink-popups' ) . '</th><th style="width:230px"></th></tr></thead><tbody>';
		if ( ! $items ) {
			echo '<tr><td colspan="7">' . esc_html__( 'No popups yet. Click “Add new” to create your first one.', 'weberslink-popups' ) . '</td></tr>';
		}
		foreach ( $items as $p ) {
			$p  = array_merge( WLPOP_Store::defaults(), $p );
			$st = isset( $stats[ $p['id'] ] ) ? $stats[ $p['id'] ] : array( 'v' => 0, 'c' => 0, 's' => 0 );
			$rate = $st['v'] ? round( 100 * $st['s'] / $st['v'], 1 ) . '%' : '–';
			$act  = function ( $do, $label, $confirm = '' ) use ( $p ) {
				return '<a href="' . esc_url( wp_nonce_url( admin_url( 'admin-post.php?action=wlpop_row&do=' . $do . '&id=' . $p['id'] ), 'wlpop_row' ) ) . '"' . ( $confirm ? ' onclick="return confirm(\'' . esc_js( $confirm ) . '\')"' : '' ) . '>' . esc_html( $label ) . '</a>';
			};
			echo '<tr' . ( $p['enabled'] ? '' : ' class="wlpop-off"' ) . '><td><a href="' . esc_url( self::url( 'wlpop', array( 'edit' => $p['id'] ) ) ) . '"><strong>' . esc_html( $p['name'] ) . '</strong></a>' . ( $p['enabled'] ? '' : ' <span class="description">— ' . esc_html__( 'off', 'weberslink-popups' ) . '</span>' ) . '</td><td>' . esc_html( WLPOP_Store::types()[ $p['type'] ] ) . '</td><td>' . esc_html( WLPOP_Store::triggers()[ $p['trigger'] ] ) . '</td><td>' . (int) $st['v'] . '</td><td>' . (int) $st['s'] . '</td><td>' . esc_html( $rate ) . '</td><td class="wlpop-actions"><a href="' . esc_url( add_query_arg( 'wlpop_preview', $p['id'], home_url( '/' ) ) ) . '" target="_blank" rel="noopener">' . esc_html__( 'Preview', 'weberslink-popups' ) . '</a> · ' . $act( 'toggle', $p['enabled'] ? __( 'Turn off', 'weberslink-popups' ) : __( 'Turn on', 'weberslink-popups' ) ) . ' · ' . $act( 'copy', __( 'Duplicate', 'weberslink-popups' ) ) . ' · ' . $act( 'delete', __( 'Delete', 'weberslink-popups' ), __( 'Delete this popup?', 'weberslink-popups' ) ) . '</td></tr>'; // phpcs:ignore
		}
		echo '</tbody></table><p class="description">' . esc_html__( 'Views and sign-ups are for the last 30 days.', 'weberslink-popups' ) . '</p></div>';
	}

	public static function row() {
		self::guard( 'wlpop_row' );
		$id    = isset( $_GET['id'] ) ? sanitize_key( $_GET['id'] ) : ''; // phpcs:ignore
		$do    = isset( $_GET['do'] ) ? sanitize_key( $_GET['do'] ) : ''; // phpcs:ignore
		$items = WLPOP_Store::all();
		$msg   = '';
		foreach ( $items as $i => $p ) {
			if ( ! isset( $p['id'] ) || $p['id'] !== $id ) {
				continue;
			}
			if ( 'toggle' === $do ) {
				$items[ $i ]['enabled'] = empty( $p['enabled'] ) ? 1 : 0;
				$msg                    = __( 'Updated.', 'weberslink-popups' );
			} elseif ( 'delete' === $do ) {
				unset( $items[ $i ] );
				$msg = __( 'Popup deleted.', 'weberslink-popups' );
			} elseif ( 'copy' === $do && count( $items ) < WLPOP_Store::MAX ) {
				$c                = array_merge( WLPOP_Store::defaults(), $p );
				$c['id']          = WLPOP_Store::new_id();
				$c['name']        = $c['name'] . ' (copy)';
				$c['enabled']     = 0;
				$items[]          = $c;
				$msg              = __( 'Duplicated. The copy is switched off.', 'weberslink-popups' );
			}
			break;
		}
		WLPOP_Store::save_all( $items );
		self::back( 'wlpop', $msg ? $msg : __( 'Nothing changed.', 'weberslink-popups' ) );
	}

	/* ---------------- editor ---------------- */

	private static function page_edit( $id ) {
		$p = 'new' === $id ? WLPOP_Store::defaults() : WLPOP_Store::get( $id );
		if ( ! $p ) {
			self::back( 'wlpop', __( 'That popup no longer exists.', 'weberslink-popups' ) );
		}
		$name = 'p';
		$text = function ( $k, $label, $help = '', $type = 'text', $cls = 'regular-text' ) use ( $p, $name ) {
			echo '<tr><th scope="row"><label for="wlpop_' . esc_attr( $k ) . '">' . esc_html( $label ) . '</label></th><td><input type="' . esc_attr( $type ) . '" class="' . esc_attr( $cls ) . '" id="wlpop_' . esc_attr( $k ) . '" name="' . esc_attr( $name . '[' . $k . ']' ) . '" value="' . esc_attr( $p[ $k ] ) . '" />' . ( $help ? '<p class="description">' . esc_html( $help ) . '</p>' : '' ) . '</td></tr>';
		};
		$chk  = function ( $k, $label, $help = '' ) use ( $p, $name ) {
			echo '<tr><th scope="row">' . esc_html( $label ) . '</th><td><label><input type="checkbox" name="' . esc_attr( $name . '[' . $k . ']' ) . '" value="1"' . checked( ! empty( $p[ $k ] ), true, false ) . ' /> ' . esc_html( $help ) . '</label></td></tr>';
		};
		$sel  = function ( $k, $label, $opts, $help = '' ) use ( $p, $name ) {
			echo '<tr><th scope="row"><label for="wlpop_' . esc_attr( $k ) . '">' . esc_html( $label ) . '</label></th><td><select id="wlpop_' . esc_attr( $k ) . '" name="' . esc_attr( $name . '[' . $k . ']' ) . '">';
			foreach ( $opts as $v => $l ) {
				echo '<option value="' . esc_attr( $v ) . '"' . selected( (string) $p[ $k ], (string) $v, false ) . '>' . esc_html( $l ) . '</option>';
			}
			echo '</select>' . ( $help ? '<p class="description">' . esc_html( $help ) . '</p>' : '' ) . '</td></tr>';
		};
		$area = function ( $k, $label, $help = '', $rows = 3 ) use ( $p, $name ) {
			echo '<tr><th scope="row"><label for="wlpop_' . esc_attr( $k ) . '">' . esc_html( $label ) . '</label></th><td><textarea class="large-text" rows="' . (int) $rows . '" id="wlpop_' . esc_attr( $k ) . '" name="' . esc_attr( $name . '[' . $k . ']' ) . '">' . esc_textarea( $p[ $k ] ) . '</textarea>' . ( $help ? '<p class="description">' . esc_html( $help ) . '</p>' : '' ) . '</td></tr>';
		};
		echo '<div class="wrap wlpop"><h1>' . esc_html( 'new' === $id ? __( 'New popup', 'weberslink-popups' ) : __( 'Edit popup', 'weberslink-popups' ) ) . '</h1><form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '">';
		wp_nonce_field( 'wlpop_save' );
		echo '<input type="hidden" name="action" value="wlpop_save" /><input type="hidden" name="p[id]" value="' . esc_attr( 'new' === $id ? '' : $p['id'] ) . '" />';
		echo '<h2>' . esc_html__( 'What visitors see', 'weberslink-popups' ) . '</h2><table class="form-table"><tbody>';
		$text( 'name', __( 'Name', 'weberslink-popups' ), __( 'Only you see this.', 'weberslink-popups' ) );
		$chk( 'enabled', __( 'Active', 'weberslink-popups' ) );
		$sel( 'type', __( 'Type', 'weberslink-popups' ), WLPOP_Store::types() );
		$text( 'title', __( 'Headline', 'weberslink-popups' ), '', 'text', 'large-text' );
		$area( 'content', __( 'Text', 'weberslink-popups' ), current_user_can( 'unfiltered_html' ) ? __( 'Basic HTML is allowed.', 'weberslink-popups' ) : __( 'Only plain formatting is kept for your role.', 'weberslink-popups' ), 4 );
		$chk( 'show_form', __( 'Collect emails', 'weberslink-popups' ), __( 'Show an email form (otherwise show a button)', 'weberslink-popups' ) );
		$chk( 'ask_name', __( 'Ask for a name', 'weberslink-popups' ) );
		$text( 'button_text', __( 'Form button', 'weberslink-popups' ) );
		$text( 'consent_text', __( 'Consent checkbox text', 'weberslink-popups' ), __( 'Leave empty for no checkbox. Visitors must tick it when it is shown, e.g. “I agree to receive emails”.', 'weberslink-popups' ), 'text', 'large-text' );
		$text( 'success_message', __( 'Thank-you message', 'weberslink-popups' ), '', 'text', 'large-text' );
		$text( 'redirect_url', __( 'Go to this page after sign-up', 'weberslink-popups' ), __( 'Optional.', 'weberslink-popups' ), 'url' );
		$text( 'cta_text', __( 'Button text (no form)', 'weberslink-popups' ) );
		$text( 'cta_url', __( 'Button link (no form)', 'weberslink-popups' ), '', 'url' );
		echo '<tr><th scope="row">' . esc_html__( 'Colours', 'weberslink-popups' ) . '</th><td>';
		foreach ( array( 'color_primary' => __( 'Button', 'weberslink-popups' ), 'color_bg' => __( 'Background', 'weberslink-popups' ), 'color_text' => __( 'Text', 'weberslink-popups' ) ) as $k => $l ) {
			echo '<label style="margin-right:18px">' . esc_html( $l ) . ' <input type="color" name="p[' . esc_attr( $k ) . ']" value="' . esc_attr( $p[ $k ] ) . '" /></label>';
		}
		echo '</td></tr>';
		$sel( 'position', __( 'Position', 'weberslink-popups' ), array( 'bottom-right' => __( 'Bottom right', 'weberslink-popups' ), 'bottom-left' => __( 'Bottom left', 'weberslink-popups' ), 'top' => __( 'Top (bar)', 'weberslink-popups' ), 'bottom' => __( 'Bottom (bar)', 'weberslink-popups' ) ), __( 'For slide-ins and bars.', 'weberslink-popups' ) );
		$chk( 'close_overlay', __( 'Close on outside click', 'weberslink-popups' ) );
		echo '</tbody></table><h2>' . esc_html__( 'When it appears', 'weberslink-popups' ) . '</h2><table class="form-table"><tbody>';
		$sel( 'trigger', __( 'Trigger', 'weberslink-popups' ), WLPOP_Store::triggers() );
		$text( 'delay_s', __( 'Delay (seconds)', 'weberslink-popups' ), __( 'For “After a delay”.', 'weberslink-popups' ), 'number', 'small-text' );
		$text( 'scroll_pct', __( 'Scroll depth (%)', 'weberslink-popups' ), __( 'For “After scrolling”.', 'weberslink-popups' ), 'number', 'small-text' );
		$text( 'click_selector', __( 'Click target', 'weberslink-popups' ), __( 'For “When something is clicked”: a class or id such as .open-newsletter or #signup-btn (several separated by commas).', 'weberslink-popups' ) );
		$sel( 'frequency', __( 'How often', 'weberslink-popups' ), array( 'always' => __( 'Every page view', 'weberslink-popups' ), 'session' => __( 'Once per visit', 'weberslink-popups' ), 'days' => __( 'Once every N days', 'weberslink-popups' ) ) );
		$text( 'days', __( 'N days', 'weberslink-popups' ), '', 'number', 'small-text' );
		$text( 'hide_after_signup_days', __( 'Hide after sign-up for', 'weberslink-popups' ), __( 'days: people who subscribed are not asked again.', 'weberslink-popups' ), 'number', 'small-text' );
		echo '</tbody></table><h2>' . esc_html__( 'Who sees it', 'weberslink-popups' ) . '</h2><table class="form-table"><tbody>';
		$sel( 'pages', __( 'Pages', 'weberslink-popups' ), array( 'all' => __( 'Every page', 'weberslink-popups' ), 'home' => __( 'Home page only', 'weberslink-popups' ), 'include' => __( 'Only the pages listed below', 'weberslink-popups' ) ) );
		$area( 'include', __( 'Only on these pages', 'weberslink-popups' ), __( 'One path per line, e.g. /pricing or /blog/* (the * covers everything below).', 'weberslink-popups' ) );
		$area( 'exclude', __( 'Never on these pages', 'weberslink-popups' ), __( 'Same format. Good for checkout and thank-you pages.', 'weberslink-popups' ) );
		$sel( 'device', __( 'Devices', 'weberslink-popups' ), array( 'all' => __( 'All devices', 'weberslink-popups' ), 'desktop' => __( 'Desktop only', 'weberslink-popups' ), 'mobile' => __( 'Mobile only', 'weberslink-popups' ) ) );
		$sel( 'logged_in', __( 'Visitors', 'weberslink-popups' ), array( 'any' => __( 'Everyone', 'weberslink-popups' ), 'out' => __( 'Logged-out visitors only', 'weberslink-popups' ) ) );
		$text( 'start', __( 'Start date', 'weberslink-popups' ), __( 'Optional (YYYY-MM-DD).', 'weberslink-popups' ), 'date' );
		$text( 'end', __( 'End date', 'weberslink-popups' ), __( 'Optional. Handy for sales.', 'weberslink-popups' ), 'date' );
		echo '</tbody></table>';
		submit_button( __( 'Save popup', 'weberslink-popups' ) );
		echo '</form></div>';
	}

	public static function save() {
		self::guard( 'wlpop_save' );
		$in    = isset( $_POST['p'] ) ? (array) wp_unslash( $_POST['p'] ) : array(); // phpcs:ignore
		$items = WLPOP_Store::all();
		$old   = null;
		foreach ( $items as $p ) {
			if ( isset( $in['id'] ) && isset( $p['id'] ) && $p['id'] === $in['id'] ) {
				$old = array_merge( WLPOP_Store::defaults(), $p );
			}
		}
		$clean = WLPOP_Store::sanitize( $in, current_user_can( 'unfiltered_html' ), $old );
		if ( $old ) {
			foreach ( $items as $i => $p ) {
				if ( $p['id'] === $old['id'] ) {
					$items[ $i ] = $clean;
				}
			}
		} else {
			if ( count( $items ) >= WLPOP_Store::MAX ) {
				self::back( 'wlpop', __( 'You have reached the limit of 50 popups.', 'weberslink-popups' ) );
			}
			$clean['id'] = WLPOP_Store::new_id();
			$items[]     = $clean;
		}
		WLPOP_Store::save_all( $items );
		self::back( 'wlpop', __( 'Popup saved.', 'weberslink-popups' ) );
	}

	/* ---------------- leads ---------------- */

	private static function names() {
		$n = array();
		foreach ( WLPOP_Store::all() as $p ) {
			$n[ $p['id'] ] = $p['name'];
		}
		return $n;
	}

	public static function page_leads() {
		global $wpdb;
		$search = isset( $_GET['s'] ) ? sanitize_text_field( wp_unslash( $_GET['s'] ) ) : ''; // phpcs:ignore
		$paged  = max( 1, isset( $_GET['paged'] ) ? (int) $_GET['paged'] : 1 ); // phpcs:ignore
		$t      = WLPOP_Leads::leads();
		$where  = '' === $search ? '1=1' : $wpdb->prepare( '(email LIKE %s OR name LIKE %s)', '%' . $wpdb->esc_like( $search ) . '%', '%' . $wpdb->esc_like( $search ) . '%' ); // phpcs:ignore
		$total  = (int) $wpdb->get_var( "SELECT COUNT(*) FROM $t WHERE $where" ); // phpcs:ignore
		$rows   = (array) $wpdb->get_results( $wpdb->prepare( "SELECT * FROM $t WHERE $where ORDER BY id DESC LIMIT 30 OFFSET %d", ( $paged - 1 ) * 30 ), ARRAY_A ); // phpcs:ignore
		$names  = self::names();
		echo '<div class="wrap wlpop"><h1 class="wp-heading-inline">' . esc_html__( 'Leads', 'weberslink-popups' ) . ' <span class="description">(' . (int) $total . ')</span></h1> <a class="page-title-action" href="' . esc_url( wp_nonce_url( admin_url( 'admin-post.php?action=wlpop_leads_export' ), 'wlpop_leads_export' ) ) . '">' . esc_html__( 'Export CSV', 'weberslink-popups' ) . '</a><hr class="wp-header-end">';
		self::notice();
		echo '<form method="get" class="wlpop-filters"><input type="hidden" name="page" value="wlpop-leads" /><input type="search" name="s" value="' . esc_attr( $search ) . '" placeholder="' . esc_attr__( 'Search email or name', 'weberslink-popups' ) . '" /> <button class="button">' . esc_html__( 'Search', 'weberslink-popups' ) . '</button></form>';
		echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '">';
		wp_nonce_field( 'wlpop_leads_delete' );
		echo '<input type="hidden" name="action" value="wlpop_leads_delete" /><table class="wp-list-table widefat fixed striped"><thead><tr><td class="check-column"><input type="checkbox" onclick="document.querySelectorAll(\'.wlpop-cb\').forEach(function(c){c.checked=this.checked}.bind(this))" /></td><th>' . esc_html__( 'Email', 'weberslink-popups' ) . '</th><th>' . esc_html__( 'Name', 'weberslink-popups' ) . '</th><th>' . esc_html__( 'Popup', 'weberslink-popups' ) . '</th><th>' . esc_html__( 'Page', 'weberslink-popups' ) . '</th><th style="width:140px">' . esc_html__( 'Date', 'weberslink-popups' ) . '</th></tr></thead><tbody>';
		if ( ! $rows ) {
			echo '<tr><td colspan="6">' . esc_html__( 'No leads yet.', 'weberslink-popups' ) . '</td></tr>';
		}
		foreach ( $rows as $r ) {
			echo '<tr><th class="check-column"><input class="wlpop-cb" type="checkbox" name="ids[]" value="' . (int) $r['id'] . '" /></th><td><strong>' . esc_html( $r['email'] ) . '</strong></td><td>' . esc_html( $r['name'] ) . '</td><td>' . esc_html( isset( $names[ $r['popup_id'] ] ) ? $names[ $r['popup_id'] ] : $r['popup_id'] ) . '</td><td><code>' . esc_html( mb_strimwidth( $r['page'], 0, 40, '…' ) ) . '</code></td><td>' . esc_html( get_date_from_gmt( $r['created_at'], 'Y-m-d H:i' ) ) . '</td></tr>';
		}
		echo '</tbody></table><p><button class="button" onclick="return confirm(\'' . esc_js( __( 'Delete the selected leads?', 'weberslink-popups' ) ) . '\')">' . esc_html__( 'Delete selected', 'weberslink-popups' ) . '</button></p></form>';
		$pages = (int) ceil( $total / 30 );
		if ( $pages > 1 ) {
			echo '<div class="tablenav bottom"><div class="tablenav-pages">' . wp_kses_post( paginate_links( array( 'base' => add_query_arg( array( 'page' => 'wlpop-leads', 's' => $search, 'paged' => '%#%' ), admin_url( 'admin.php' ) ), 'format' => '', 'current' => $paged, 'total' => $pages ) ) ) . '</div></div>';
		}
		echo '</div>';
	}

	public static function leads_delete() {
		self::guard( 'wlpop_leads_delete' );
		global $wpdb;
		$ids = isset( $_POST['ids'] ) ? array_filter( array_map( 'intval', (array) $_POST['ids'] ) ) : array(); // phpcs:ignore
		if ( $ids ) {
			$wpdb->query( 'DELETE FROM ' . WLPOP_Leads::leads() . ' WHERE id IN (' . implode( ',', $ids ) . ')' ); // phpcs:ignore
		}
		self::back( 'wlpop-leads', sprintf( /* translators: %d: count */ __( '%d lead(s) deleted.', 'weberslink-popups' ), count( $ids ) ) );
	}

	public static function leads_export() {
		self::guard( 'wlpop_leads_export' );
		global $wpdb;
		$rows = (array) $wpdb->get_results( 'SELECT * FROM ' . WLPOP_Leads::leads() . ' ORDER BY id DESC LIMIT 100000', ARRAY_A ); // phpcs:ignore
		nocache_headers();
		header( 'Content-Type: text/csv; charset=utf-8' );
		header( 'Content-Disposition: attachment; filename="leads-' . gmdate( 'Y-m-d' ) . '.csv"' );
		echo WLPOP_Leads::csv( $rows, self::names() ); // phpcs:ignore
		exit;
	}

	/* ---------------- settings ---------------- */

	public static function page_settings() {
		$s    = WLPOP_Store::settings();
		$name = WLPOP_Store::SETTINGS;
		echo '<div class="wrap wlpop"><h1>' . esc_html__( 'Popup settings', 'weberslink-popups' ) . '</h1>';
		if ( isset( $_GET['settings-updated'] ) ) { // phpcs:ignore
			echo '<div class="notice notice-success is-dismissible"><p>' . esc_html__( 'Settings saved.', 'weberslink-popups' ) . '</p></div>';
		}
		echo '<form method="post" action="options.php">';
		settings_fields( 'wlpop_group' );
		echo '<table class="form-table"><tbody><tr><th scope="row">' . esc_html__( 'Email me new leads', 'weberslink-popups' ) . '</th><td><label><input type="checkbox" name="' . esc_attr( $name ) . '[notify]" value="1"' . checked( ! empty( $s['notify'] ), true, false ) . ' /> ' . esc_html__( 'Send a notification for each new subscriber (at most 30 an hour)', 'weberslink-popups' ) . '</label></td></tr>';
		echo '<tr><th scope="row"><label for="wlpop_ne">' . esc_html__( 'Send to', 'weberslink-popups' ) . '</label></th><td><input type="email" class="regular-text" id="wlpop_ne" name="' . esc_attr( $name ) . '[notify_email]" value="' . esc_attr( $s['notify_email'] ) . '" /><p class="description">' . esc_html__( 'Leave empty for the site admin email.', 'weberslink-popups' ) . '</p></td></tr>';
		echo '<tr><th scope="row"><label for="wlpop_wh">' . esc_html__( 'Webhook URL', 'weberslink-popups' ) . '</label></th><td><input type="url" class="large-text" id="wlpop_wh" name="' . esc_attr( $name ) . '[webhook]" value="' . esc_attr( $s['webhook'] ) . '" placeholder="https://hooks.zapier.com/…" /><p class="description">' . esc_html__( 'Optional. Each new lead is sent as JSON to this https address: connect it to Zapier, Make, n8n or your CRM / email service. Internal addresses are blocked.', 'weberslink-popups' ) . '</p></td></tr>';
		echo '<tr><th scope="row"><label for="wlpop_ws">' . esc_html__( 'Webhook secret', 'weberslink-popups' ) . '</label></th><td><input type="text" class="regular-text" id="wlpop_ws" name="' . esc_attr( $name ) . '[webhook_secret]" value="' . esc_attr( $s['webhook_secret'] ) . '" autocomplete="off" /><p class="description">' . esc_html__( 'Optional. If set, each request carries an X-Wlpop-Signature header (HMAC-SHA256 of the body) so you can verify it came from your site.', 'weberslink-popups' ) . '</p></td></tr></tbody></table>';
		submit_button();
		echo '</form></div>';
	}
}
