<?php
defined( 'ABSPATH' ) || exit;

class WLSS_Admin {

	public static function init() {
		add_action( 'admin_menu', array( __CLASS__, 'menu' ) );
		add_action( 'admin_init', array( __CLASS__, 'register' ) );
		add_action( 'admin_enqueue_scripts', array( __CLASS__, 'assets' ) );
		add_action( 'admin_post_wlss_unlock', array( __CLASS__, 'unlock' ) );
		add_action( 'admin_post_wlss_purge', array( __CLASS__, 'purge' ) );
		add_filter( 'plugin_action_links_' . plugin_basename( WLSS_FILE ), function ( $l ) {
			array_unshift( $l, '<a href="' . esc_url( admin_url( 'admin.php?page=wlss' ) ) . '">' . esc_html__( 'Check-up', 'weberslink-security' ) . '</a>' );
			return $l;
		} );
	}

	private static function guard( $action ) {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to do this.', 'weberslink-security' ), '', array( 'response' => 403 ) );
		}
		check_admin_referer( $action );
	}

	private static function url( $page, $args = array() ) {
		return add_query_arg( $args, admin_url( 'admin.php?page=' . $page ) );
	}

	public static function menu() {
		add_menu_page( 'Weberslink Security', 'Security Shield', 'manage_options', 'wlss', array( __CLASS__, 'page_overview' ), 'dashicons-shield-alt', 78 );
		add_submenu_page( 'wlss', __( 'Security check-up', 'weberslink-security' ), __( 'Check-up', 'weberslink-security' ), 'manage_options', 'wlss', array( __CLASS__, 'page_overview' ) );
		add_submenu_page( 'wlss', __( 'Activity log', 'weberslink-security' ), __( 'Activity log', 'weberslink-security' ), 'manage_options', 'wlss-log', array( __CLASS__, 'page_log' ) );
		add_submenu_page( 'wlss', __( 'Settings', 'weberslink-security' ), __( 'Settings', 'weberslink-security' ), 'manage_options', 'wlss-settings', array( __CLASS__, 'page_settings' ) );
	}

	public static function register() {
		register_setting( 'wlss_group', WLSS_Settings::OPTION, array( 'sanitize_callback' => function ( $in ) {
			return WLSS_Settings::sanitize( is_array( $in ) ? wp_unslash( $in ) : array() );
		} ) );
	}

	public static function assets() {
		$page = isset( $_GET['page'] ) ? sanitize_key( $_GET['page'] ) : ''; // phpcs:ignore
		if ( 0 === strpos( $page, 'wlss' ) ) {
			wp_enqueue_style( 'wlss-admin', WLSS_URL . 'assets/admin.css', array(), WLSS_VERSION );
		}
	}

	/** Gather the facts the check-up needs. */
	private static function facts() {
		$admins = get_users( array( 'role' => 'administrator', 'fields' => array( 'ID', 'user_login' ) ) );
		$with   = 0;
		$named  = false;
		foreach ( $admins as $a ) {
			$with  += WLSS_TwoFactor::is_on( $a->ID ) ? 1 : 0;
			$named  = $named || 'admin' === strtolower( $a->user_login );
		}
		$upd = 0;
		foreach ( array( 'update_core', 'update_plugins', 'update_themes' ) as $k ) {
			$t = get_site_transient( $k );
			if ( 'update_core' === $k ) {
				$upd += ! empty( $t->updates ) && isset( $t->updates[0]->response ) && 'upgrade' === $t->updates[0]->response ? 1 : 0;
			} else {
				$upd += ! empty( $t->response ) ? count( $t->response ) : 0;
			}
		}
		return array(
			'ssl'           => is_ssl(),
			'php'           => PHP_VERSION,
			'debug_display' => defined( 'WP_DEBUG' ) && WP_DEBUG && ( ! defined( 'WP_DEBUG_DISPLAY' ) || WP_DEBUG_DISPLAY ),
			'admin_user'    => $named,
			'admins_total'  => count( $admins ),
			'admins_2fa'    => $with,
			'file_edit_off' => defined( 'DISALLOW_FILE_EDIT' ) && DISALLOW_FILE_EDIT,
			'updates'       => $upd,
		);
	}

	public static function page_overview() {
		$found = WLSS_Checkup::evaluate( self::facts(), WLSS_Settings::all() );
		$score = WLSS_Checkup::score( $found );
		$cnt   = WLSS_Log::counts( 7 );
		$cls   = $score >= 80 ? 'good' : ( $score >= 50 ? 'mid' : 'low' );
		echo '<div class="wrap wlss"><h1>' . esc_html__( 'Security check-up', 'weberslink-security' ) . '</h1>';
		echo '<div class="wlss-top"><div class="wlss-score wlss-' . esc_attr( $cls ) . '"><strong>' . (int) $score . '</strong><span>/ 100</span></div><div class="wlss-stats">';
		foreach ( array( 'login_ok' => __( 'Logins', 'weberslink-security' ), 'login_failed' => __( 'Failed logins', 'weberslink-security' ), 'lockout' => __( 'Lockouts', 'weberslink-security' ), 'tfa_failed' => __( 'Bad 2FA codes', 'weberslink-security' ) ) as $k => $l ) {
			echo '<div class="wlss-stat"><strong>' . (int) ( isset( $cnt[ $k ] ) ? $cnt[ $k ] : 0 ) . '</strong><span>' . esc_html( $l ) . '</span></div>';
		}
		echo '</div></div><p class="description">' . esc_html__( 'Last 7 days. Fix the red items first, then the amber ones.', 'weberslink-security' ) . '</p><ul class="wlss-checks">';
		$icons = array( 'ok' => '✅', 'warn' => '⚠️', 'bad' => '❌' );
		usort( $found, function ( $a, $b ) {
			$o = array( 'bad' => 0, 'warn' => 1, 'ok' => 2 );
			return $o[ $a[0] ] - $o[ $b[0] ];
		} );
		foreach ( $found as $f ) {
			echo '<li class="wlss-c-' . esc_attr( $f[0] ) . '"><span>' . esc_html( $icons[ $f[0] ] ) . '</span><div><strong>' . esc_html( $f[1] ) . '</strong><br>' . esc_html( $f[2] ) . '</div></li>';
		}
		echo '</ul><p><a class="button button-primary" href="' . esc_url( self::url( 'wlss-settings' ) ) . '">' . esc_html__( 'Open settings', 'weberslink-security' ) . '</a></p></div>';
	}

	public static function page_log() {
		$ev     = isset( $_GET['event'] ) ? sanitize_key( $_GET['event'] ) : ''; // phpcs:ignore
		$search = isset( $_GET['s'] ) ? sanitize_text_field( wp_unslash( $_GET['s'] ) ) : ''; // phpcs:ignore
		$paged  = max( 1, isset( $_GET['paged'] ) ? (int) $_GET['paged'] : 1 ); // phpcs:ignore
		$q      = WLSS_Log::query( array( 'event' => $ev, 'search' => $search, 'page' => $paged ) );
		echo '<div class="wrap wlss"><h1>' . esc_html__( 'Activity log', 'weberslink-security' ) . '</h1>';
		if ( isset( $_GET['msg'] ) ) { // phpcs:ignore
			echo '<div class="notice notice-success is-dismissible"><p>' . esc_html( sanitize_text_field( wp_unslash( $_GET['msg'] ) ) ) . '</p></div>'; // phpcs:ignore
		}
		echo '<form method="get" class="wlss-filters"><input type="hidden" name="page" value="wlss-log" /><select name="event"><option value="">' . esc_html__( 'All events', 'weberslink-security' ) . '</option>';
		foreach ( WLSS_Log::events() as $k => $l ) {
			echo '<option value="' . esc_attr( $k ) . '"' . selected( $ev, $k, false ) . '>' . esc_html( $l ) . '</option>';
		}
		echo '</select> <input type="search" name="s" value="' . esc_attr( $search ) . '" placeholder="' . esc_attr__( 'Search user, address or details', 'weberslink-security' ) . '" /> <button class="button">' . esc_html__( 'Filter', 'weberslink-security' ) . '</button></form>';
		echo '<table class="wp-list-table widefat fixed striped"><thead><tr><th style="width:140px">' . esc_html__( 'When', 'weberslink-security' ) . '</th><th style="width:170px">' . esc_html__( 'Event', 'weberslink-security' ) . '</th><th style="width:150px">' . esc_html__( 'User', 'weberslink-security' ) . '</th><th style="width:140px">' . esc_html__( 'Address', 'weberslink-security' ) . '</th><th>' . esc_html__( 'Details', 'weberslink-security' ) . '</th></tr></thead><tbody>';
		if ( ! $q['rows'] ) {
			echo '<tr><td colspan="5">' . esc_html__( 'Nothing logged yet.', 'weberslink-security' ) . '</td></tr>';
		}
		$bad = array( 'login_failed', 'lockout', 'blocked', 'tfa_failed', 'tfa_off' );
		foreach ( $q['rows'] as $r ) {
			echo '<tr><td>' . esc_html( get_date_from_gmt( $r['created_at'], 'Y-m-d H:i' ) ) . '</td><td><span class="wlss-pill ' . ( in_array( $r['event'], $bad, true ) ? 'wlss-red' : 'wlss-grey' ) . '">' . esc_html( isset( WLSS_Log::events()[ $r['event'] ] ) ? WLSS_Log::events()[ $r['event'] ] : $r['event'] ) . '</span></td><td>' . esc_html( $r['user_login'] ) . '</td><td><code>' . esc_html( $r['ip'] ) . '</code></td><td>' . esc_html( $r['details'] ) . '</td></tr>';
		}
		echo '</tbody></table>';
		$pages = (int) ceil( $q['total'] / 30 );
		if ( $pages > 1 ) {
			echo '<div class="tablenav bottom"><div class="tablenav-pages">' . wp_kses_post( paginate_links( array( 'base' => add_query_arg( array( 'page' => 'wlss-log', 'event' => $ev, 's' => $search, 'paged' => '%#%' ), admin_url( 'admin.php' ) ), 'format' => '', 'current' => $paged, 'total' => $pages ) ) ) . '</div></div>';
		}
		echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '" style="margin-top:14px" onsubmit="return confirm(\'' . esc_js( __( 'Delete the whole activity log?', 'weberslink-security' ) ) . '\')">';
		wp_nonce_field( 'wlss_purge' );
		echo '<input type="hidden" name="action" value="wlss_purge" /><button class="button">' . esc_html__( 'Clear the log', 'weberslink-security' ) . '</button></form></div>';
	}

	public static function unlock() {
		self::guard( 'wlss_unlock' );
		WLSS_Login::clear_all();
		wp_safe_redirect( self::url( 'wlss-settings', array( 'unlocked' => 1 ) ) );
		exit;
	}

	public static function purge() {
		self::guard( 'wlss_purge' );
		global $wpdb;
		$wpdb->query( 'TRUNCATE TABLE ' . WLSS_Log::table() ); // phpcs:ignore
		wp_safe_redirect( self::url( 'wlss-log', array( 'msg' => rawurlencode( __( 'Log cleared.', 'weberslink-security' ) ) ) ) );
		exit;
	}

	public static function page_settings() {
		$s    = WLSS_Settings::all();
		$name = WLSS_Settings::OPTION;
		$chk  = function ( $k, $label, $help = '' ) use ( $s, $name ) {
			echo '<tr><th scope="row">' . esc_html( $label ) . '</th><td><label><input type="checkbox" name="' . esc_attr( $name . '[' . $k . ']' ) . '" value="1"' . checked( ! empty( $s[ $k ] ), true, false ) . ' /> ' . esc_html( $help ) . '</label></td></tr>';
		};
		$num  = function ( $k, $label, $suffix = '' ) use ( $s, $name ) {
			echo '<tr><th scope="row"><label for="wlss_' . esc_attr( $k ) . '">' . esc_html( $label ) . '</label></th><td><input type="number" class="small-text" id="wlss_' . esc_attr( $k ) . '" name="' . esc_attr( $name . '[' . $k . ']' ) . '" value="' . esc_attr( $s[ $k ] ) . '" /> ' . esc_html( $suffix ) . '</td></tr>';
		};
		echo '<div class="wrap wlss"><h1>' . esc_html__( 'Security settings', 'weberslink-security' ) . '</h1>';
		if ( isset( $_GET['settings-updated'] ) ) { // phpcs:ignore
			echo '<div class="notice notice-success is-dismissible"><p>' . esc_html__( 'Settings saved.', 'weberslink-security' ) . '</p></div>';
		}
		if ( isset( $_GET['unlocked'] ) ) { // phpcs:ignore
			echo '<div class="notice notice-success is-dismissible"><p>' . esc_html__( 'All lockouts removed.', 'weberslink-security' ) . '</p></div>';
		}
		echo '<form method="post" action="options.php">';
		settings_fields( 'wlss_group' );
		echo '<h2>' . esc_html__( 'Login protection', 'weberslink-security' ) . '</h2><table class="form-table"><tbody>';
		$chk( 'limit_enabled', __( 'Limit login attempts', 'weberslink-security' ), __( 'Lock an address out after repeated failures', 'weberslink-security' ) );
		$num( 'max_attempts', __( 'Allowed failures', 'weberslink-security' ), __( 'before a lockout', 'weberslink-security' ) );
		$num( 'window_min', __( 'Counted within', 'weberslink-security' ), __( 'minutes', 'weberslink-security' ) );
		$num( 'lock_min', __( 'Lockout lasts', 'weberslink-security' ), __( 'minutes', 'weberslink-security' ) );
		$chk( 'escalate', __( 'Lock repeat offenders longer', 'weberslink-security' ), __( 'Each new lockout of the same address doubles (up to 24 hours)', 'weberslink-security' ) );
		$chk( 'lock_alert', __( 'Email me on lockouts', 'weberslink-security' ), __( 'To the site admin address, at most one email every 15 minutes', 'weberslink-security' ) );
		$chk( 'generic_errors', __( 'Generic login errors', 'weberslink-security' ), __( 'Never reveal whether a username exists', 'weberslink-security' ) );
		echo '<tr><th scope="row"><label for="wlss_allow_ips">' . esc_html__( 'Always allow', 'weberslink-security' ) . '</label></th><td><textarea id="wlss_allow_ips" name="' . esc_attr( $name ) . '[allow_ips]" rows="3" class="large-text code">' . esc_textarea( $s['allow_ips'] ) . '</textarea><p class="description">' . esc_html__( 'Your office or home address. One per line; ranges like 203.0.113.0/24 work. These are never locked out, so only list addresses you trust.', 'weberslink-security' ) . '</p></td></tr>';
		echo '<tr><th scope="row"><label for="wlss_block_ips">' . esc_html__( 'Always block', 'weberslink-security' ) . '</label></th><td><textarea id="wlss_block_ips" name="' . esc_attr( $name ) . '[block_ips]" rows="3" class="large-text code">' . esc_textarea( $s['block_ips'] ) . '</textarea><p class="description">' . esc_html__( 'These addresses cannot log in at all.', 'weberslink-security' ) . '</p></td></tr>';
		echo '<tr><th scope="row"><label for="wlss_proxy_header">' . esc_html__( 'Visitor address from', 'weberslink-security' ) . '</label></th><td><select id="wlss_proxy_header" name="' . esc_attr( $name ) . '[proxy_header]">';
		foreach ( WLSS_Settings::proxy_headers() as $k => $l ) {
			echo '<option value="' . esc_attr( $k ) . '"' . selected( $s['proxy_header'], $k, false ) . '>' . esc_html( $l ) . '</option>';
		}
		echo '</select><p class="description">' . esc_html__( 'Only change this if your site is behind Cloudflare or a load balancer, otherwise every visitor looks like the proxy. Choosing a header on a site that is reachable directly would let attackers forge their address.', 'weberslink-security' ) . '</p></td></tr>';
		echo '<tr><th scope="row">' . esc_html__( 'Lockouts', 'weberslink-security' ) . '</th><td><a class="button" onclick="return confirm(\'' . esc_js( __( 'Remove every lockout and failed-attempt counter?', 'weberslink-security' ) ) . '\')" href="' . esc_url( wp_nonce_url( admin_url( 'admin-post.php?action=wlss_unlock' ), 'wlss_unlock' ) ) . '">' . esc_html__( 'Unlock everyone', 'weberslink-security' ) . '</a></td></tr>';

		echo '</tbody></table><h2>' . esc_html__( 'Two-factor authentication', 'weberslink-security' ) . '</h2><table class="form-table"><tbody>';
		$chk( 'tfa_enabled', __( 'Allow two-factor login', 'weberslink-security' ), __( 'Users turn it on from their own profile page (authenticator app + recovery codes)', 'weberslink-security' ) );
		echo '<tr><th scope="row">' . esc_html__( 'Recommend for roles', 'weberslink-security' ) . '</th><td>';
		foreach ( wp_roles()->get_names() as $slug => $label ) {
			echo '<label style="display:block"><input type="checkbox" name="' . esc_attr( $name ) . '[tfa_roles][]" value="' . esc_attr( $slug ) . '"' . checked( in_array( $slug, (array) $s['tfa_roles'], true ), true, false ) . ' /> ' . esc_html( translate_user_role( $label ) ) . '</label>';
		}
		echo '<p class="description">' . esc_html__( 'These users see a reminder until they set it up. Nobody is forced, so nobody gets locked out.', 'weberslink-security' ) . '</p></td></tr>';

		echo '</tbody></table><h2>' . esc_html__( 'Hardening', 'weberslink-security' ) . '</h2><table class="form-table"><tbody>';
		$chk( 'strong_passwords', __( 'Strong passwords', 'weberslink-security' ), __( 'New passwords: 12+ characters, mixed, not common, not your username', 'weberslink-security' ) );
		$chk( 'disable_xmlrpc', __( 'Disable XML-RPC', 'weberslink-security' ), __( 'Closes a popular brute-force door (leave on unless you use the WordPress mobile app or Jetpack)', 'weberslink-security' ) );
		$chk( 'block_enum', __( 'Hide usernames', 'weberslink-security' ), __( 'Block ?author=1 scans, the public REST users list and the users sitemap', 'weberslink-security' ) );
		$chk( 'hide_version', __( 'Hide WordPress version', 'weberslink-security' ), __( 'Remove the generator tag from the page source', 'weberslink-security' ) );
		$chk( 'disable_editors', __( 'Disable code editors', 'weberslink-security' ), __( 'Turn off the theme and plugin file editors in the dashboard', 'weberslink-security' ) );
		$chk( 'send_headers', __( 'Security headers', 'weberslink-security' ), __( 'X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy', 'weberslink-security' ) );
		$chk( 'hsts', __( 'HSTS', 'weberslink-security' ), __( 'Tell browsers to always use HTTPS for one year (only when the whole site works over HTTPS)', 'weberslink-security' ) );
		$chk( 'no_app_passwords', __( 'Disable application passwords', 'weberslink-security' ), __( 'If you do not connect apps through the REST API', 'weberslink-security' ) );
		echo '</tbody></table><h2>' . esc_html__( 'Activity log', 'weberslink-security' ) . '</h2><table class="form-table"><tbody>';
		$num( 'keep_days', __( 'Keep entries for', 'weberslink-security' ), __( 'days', 'weberslink-security' ) );
		echo '</tbody></table>';
		submit_button();
		echo '</form></div>';
	}
}
