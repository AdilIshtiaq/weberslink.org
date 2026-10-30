<?php
defined( 'ABSPATH' ) || exit;

class WLCC_Admin {

	public static function init() {
		add_action( 'admin_menu', array( __CLASS__, 'menu' ) );
		add_action( 'admin_init', array( __CLASS__, 'register' ) );
		add_action( 'admin_enqueue_scripts', array( __CLASS__, 'assets' ) );
		add_action( 'admin_post_wlcc_export', array( __CLASS__, 'export' ) );
		add_filter( 'plugin_action_links_' . plugin_basename( WLCC_FILE ), function ( $l ) {
			array_unshift( $l, '<a href="' . esc_url( admin_url( 'admin.php?page=wlcc' ) ) . '">' . esc_html__( 'Settings', 'weberslink-cookies' ) . '</a>' );
			return $l;
		} );
	}

	public static function menu() {
		add_menu_page( 'Weberslink Cookie Consent', 'Cookie Consent', 'manage_options', 'wlcc', array( __CLASS__, 'page_settings' ), 'dashicons-privacy', 80 );
		add_submenu_page( 'wlcc', __( 'Cookie consent settings', 'weberslink-cookies' ), __( 'Settings', 'weberslink-cookies' ), 'manage_options', 'wlcc', array( __CLASS__, 'page_settings' ) );
		add_submenu_page( 'wlcc', __( 'Consent log', 'weberslink-cookies' ), __( 'Consent log', 'weberslink-cookies' ), 'manage_options', 'wlcc-log', array( __CLASS__, 'page_log' ) );
	}

	public static function register() {
		register_setting( 'wlcc_group', WLCC_Settings::OPTION, array( 'sanitize_callback' => function ( $in ) {
			return WLCC_Settings::sanitize( is_array( $in ) ? wp_unslash( $in ) : array(), get_option( WLCC_Settings::OPTION, array() ), current_user_can( 'unfiltered_html' ) );
		} ) );
	}

	public static function assets() {
		$page = isset( $_GET['page'] ) ? sanitize_key( $_GET['page'] ) : ''; // phpcs:ignore
		if ( 0 === strpos( $page, 'wlcc' ) ) {
			wp_enqueue_style( 'wlcc-admin', WLCC_URL . 'assets/admin.css', array(), WLCC_VERSION );
		}
	}

	public static function page_settings() {
		$s    = WLCC_Settings::all();
		$name = WLCC_Settings::OPTION;
		$txt  = function ( $k, $label, $help = '', $type = 'text' ) use ( $s, $name ) {
			echo '<tr><th scope="row"><label for="wlcc_' . esc_attr( $k ) . '">' . esc_html( $label ) . '</label></th><td><input type="' . esc_attr( $type ) . '" class="regular-text" id="wlcc_' . esc_attr( $k ) . '" name="' . esc_attr( $name . '[' . $k . ']' ) . '" value="' . esc_attr( $s[ $k ] ) . '" />' . ( $help ? '<p class="description">' . esc_html( $help ) . '</p>' : '' ) . '</td></tr>';
		};
		$chk  = function ( $k, $label, $help = '' ) use ( $s, $name ) {
			echo '<tr><th scope="row">' . esc_html( $label ) . '</th><td><label><input type="checkbox" name="' . esc_attr( $name . '[' . $k . ']' ) . '" value="1"' . checked( ! empty( $s[ $k ] ), true, false ) . ' /> ' . esc_html( $help ) . '</label></td></tr>';
		};
		$code = function ( $k, $label, $help ) use ( $s, $name ) {
			echo '<tr><th scope="row"><label for="wlcc_' . esc_attr( $k ) . '">' . esc_html( $label ) . '</label></th><td><textarea class="large-text code" rows="5" id="wlcc_' . esc_attr( $k ) . '" name="' . esc_attr( $name . '[' . $k . ']' ) . '" placeholder="&lt;script async src=&quot;https://…&quot;&gt;&lt;/script&gt;"' . ( current_user_can( 'unfiltered_html' ) ? '' : ' disabled' ) . '>' . esc_textarea( $s[ $k ] ) . '</textarea><p class="description">' . esc_html( $help ) . '</p></td></tr>';
		};
		echo '<div class="wrap wlcc"><h1>' . esc_html__( 'Cookie consent', 'weberslink-cookies' ) . '</h1>';
		if ( isset( $_GET['settings-updated'] ) ) { // phpcs:ignore
			echo '<div class="notice notice-success is-dismissible"><p>' . esc_html__( 'Settings saved.', 'weberslink-cookies' ) . '</p></div>';
		}
		echo '<form method="post" action="options.php">';
		settings_fields( 'wlcc_group' );
		echo '<h2>' . esc_html__( 'Banner', 'weberslink-cookies' ) . '</h2><table class="form-table"><tbody>';
		$chk( 'enabled', __( 'Show the banner', 'weberslink-cookies' ) );
		echo '<tr><th scope="row"><label for="wlcc_position">' . esc_html__( 'Position', 'weberslink-cookies' ) . '</label></th><td><select id="wlcc_position" name="' . esc_attr( $name ) . '[position]">';
		foreach ( WLCC_Settings::positions() as $k => $l ) {
			echo '<option value="' . esc_attr( $k ) . '"' . selected( $s['position'], $k, false ) . '>' . esc_html( $l ) . '</option>';
		}
		echo '</select></td></tr><tr><th scope="row">' . esc_html__( 'Colours', 'weberslink-cookies' ) . '</th><td>';
		foreach ( array( 'color_primary' => __( 'Buttons', 'weberslink-cookies' ), 'color_bg' => __( 'Background', 'weberslink-cookies' ), 'color_text' => __( 'Text', 'weberslink-cookies' ) ) as $k => $l ) {
			echo '<label style="margin-right:18px">' . esc_html( $l ) . ' <input type="color" name="' . esc_attr( $name . '[' . $k . ']' ) . '" value="' . esc_attr( $s[ $k ] ) . '" /></label>';
		}
		echo '</td></tr>';
		$txt( 'title', __( 'Title', 'weberslink-cookies' ) );
		echo '<tr><th scope="row"><label for="wlcc_message">' . esc_html__( 'Message', 'weberslink-cookies' ) . '</label></th><td><textarea class="large-text" rows="3" id="wlcc_message" name="' . esc_attr( $name ) . '[message]">' . esc_textarea( $s['message'] ) . '</textarea></td></tr>';
		$txt( 'btn_accept', __( 'Accept button', 'weberslink-cookies' ) );
		$txt( 'btn_reject', __( 'Reject button', 'weberslink-cookies' ), __( 'Shown next to Accept with the same size and style: rejecting must be as easy as accepting.', 'weberslink-cookies' ) );
		$txt( 'btn_custom', __( 'Customise button', 'weberslink-cookies' ) );
		$txt( 'btn_save', __( 'Save choices button', 'weberslink-cookies' ) );
		$txt( 'policy_url', __( 'Cookie / privacy policy link', 'weberslink-cookies' ), '', 'url' );
		$txt( 'policy_label', __( 'Policy link text', 'weberslink-cookies' ) );
		$chk( 'float', __( 'Reopen button', 'weberslink-cookies' ), __( 'Show a small "Cookie settings" button after a choice is made, so visitors can change their mind', 'weberslink-cookies' ) );
		$txt( 'btn_float', __( 'Reopen button text', 'weberslink-cookies' ) );
		echo '</tbody></table><h2>' . esc_html__( 'Categories and scripts', 'weberslink-cookies' ) . '</h2><p class="description">' . esc_html__( 'Necessary cookies are always on. Paste third-party tags into the matching box: they are held back and only run after the visitor agrees to that category.', 'weberslink-cookies' ) . '</p><table class="form-table"><tbody>';
		$chk( 'use_preferences', __( 'Preferences', 'weberslink-cookies' ), __( 'Language, layout and similar choices', 'weberslink-cookies' ) );
		$code( 'scripts_preferences', __( 'Preferences scripts', 'weberslink-cookies' ), __( 'Scripts, iframes and images that need this consent.', 'weberslink-cookies' ) );
		$chk( 'use_analytics', __( 'Analytics', 'weberslink-cookies' ), __( 'Statistics such as Google Analytics, Matomo, Hotjar', 'weberslink-cookies' ) );
		$code( 'scripts_analytics', __( 'Analytics scripts', 'weberslink-cookies' ), __( 'Paste your Google Analytics or Matomo snippet here.', 'weberslink-cookies' ) );
		$chk( 'use_marketing', __( 'Marketing', 'weberslink-cookies' ), __( 'Advertising and social pixels such as Meta Pixel, TikTok, LinkedIn, and video embeds', 'weberslink-cookies' ) );
		$code( 'scripts_marketing', __( 'Marketing scripts', 'weberslink-cookies' ), __( 'Paste pixels and embeds here. For a YouTube video use an iframe: it stays blank until consent.', 'weberslink-cookies' ) );
		$chk( 'gcm', __( 'Google Consent Mode v2', 'weberslink-cookies' ), __( 'Tell Google tags (GA4, Ads, Tag Manager) the visitor\'s choice. Everything starts denied.', 'weberslink-cookies' ) );
		echo '</tbody></table><h2>' . esc_html__( 'Consent records', 'weberslink-cookies' ) . '</h2><table class="form-table"><tbody>';
		$chk( 'log', __( 'Keep a consent log', 'weberslink-cookies' ), __( 'Record each choice (no IP address, only a one-way fingerprint) so you can show proof', 'weberslink-cookies' ) );
		echo '<tr><th scope="row"><label for="wlcc_expire_days">' . esc_html__( 'Ask again after', 'weberslink-cookies' ) . '</label></th><td><input type="number" class="small-text" id="wlcc_expire_days" name="' . esc_attr( $name ) . '[expire_days]" value="' . esc_attr( $s['expire_days'] ) . '" /> ' . esc_html__( 'days', 'weberslink-cookies' ) . '</td></tr>';
		echo '<tr><th scope="row"><label for="wlcc_keep_days">' . esc_html__( 'Keep the log for', 'weberslink-cookies' ) . '</label></th><td><input type="number" class="small-text" id="wlcc_keep_days" name="' . esc_attr( $name ) . '[keep_days]" value="' . esc_attr( $s['keep_days'] ) . '" /> ' . esc_html__( 'days', 'weberslink-cookies' ) . '</td></tr>';
		echo '<tr><th scope="row">' . esc_html__( 'Policy version', 'weberslink-cookies' ) . '</th><td>' . (int) $s['policy_version'] . ' <label style="margin-left:14px"><input type="checkbox" name="' . esc_attr( $name ) . '[reask]" value="1" /> ' . esc_html__( 'Ask every visitor again (after you change cookies or your policy)', 'weberslink-cookies' ) . '</label></td></tr></tbody></table>';
		echo '<h2>' . esc_html__( 'Cookie declaration', 'weberslink-cookies' ) . '</h2><table class="form-table"><tbody><tr><th scope="row"><label for="wlcc_cookies">' . esc_html__( 'Cookies you use', 'weberslink-cookies' ) . '</label></th><td><textarea class="large-text code" rows="6" id="wlcc_cookies" name="' . esc_attr( $name ) . '[cookies]" placeholder="_ga | analytics | Distinguishes visitors | 2 years">' . esc_textarea( $s['cookies'] ) . '</textarea><p class="description">' . esc_html__( 'One per line: name | category | purpose | duration. Show it on your cookie policy page with the shortcode [wlcc_cookies]. Add a "Cookie settings" link anywhere with [wlcc_settings].', 'weberslink-cookies' ) . '</p></td></tr></tbody></table>';
		submit_button();
		echo '</form></div>';
	}

	public static function page_log() {
		$paged = max( 1, isset( $_GET['paged'] ) ? (int) $_GET['paged'] : 1 ); // phpcs:ignore
		$st    = WLCC_Log::stats( 30 );
		$q     = WLCC_Log::query( $paged );
		$pc    = function ( $n ) use ( $st ) {
			return $st['total'] ? round( 100 * $n / $st['total'] ) . '%' : '–';
		};
		echo '<div class="wrap wlcc"><h1 class="wp-heading-inline">' . esc_html__( 'Consent log', 'weberslink-cookies' ) . '</h1> <a class="page-title-action" href="' . esc_url( wp_nonce_url( admin_url( 'admin-post.php?action=wlcc_export' ), 'wlcc_export' ) ) . '">' . esc_html__( 'Export CSV', 'weberslink-cookies' ) . '</a><hr class="wp-header-end">';
		echo '<div class="wlcc-stats">';
		foreach ( array( array( $st['total'], __( 'Choices, last 30 days', 'weberslink-cookies' ) ), array( $pc( $st['acc'] ), __( 'Accepted all', 'weberslink-cookies' ) ), array( $pc( $st['rej'] ), __( 'Rejected all', 'weberslink-cookies' ) ), array( $pc( $st['cus'] ), __( 'Customised', 'weberslink-cookies' ) ), array( $pc( $st['a'] ), __( 'Allow analytics', 'weberslink-cookies' ) ), array( $pc( $st['m'] ), __( 'Allow marketing', 'weberslink-cookies' ) ) ) as $x ) {
			echo '<div class="wlcc-stat"><strong>' . esc_html( $x[0] ) . '</strong><span>' . esc_html( $x[1] ) . '</span></div>';
		}
		echo '</div><table class="wp-list-table widefat fixed striped"><thead><tr><th style="width:150px">' . esc_html__( 'When', 'weberslink-cookies' ) . '</th><th style="width:150px">' . esc_html__( 'Visitor ID', 'weberslink-cookies' ) . '</th><th style="width:130px">' . esc_html__( 'Choice', 'weberslink-cookies' ) . '</th><th>' . esc_html__( 'Preferences', 'weberslink-cookies' ) . '</th><th>' . esc_html__( 'Analytics', 'weberslink-cookies' ) . '</th><th>' . esc_html__( 'Marketing', 'weberslink-cookies' ) . '</th><th style="width:80px">' . esc_html__( 'Policy', 'weberslink-cookies' ) . '</th></tr></thead><tbody>';
		if ( ! $q['rows'] ) {
			echo '<tr><td colspan="7">' . esc_html__( 'No choices recorded yet.', 'weberslink-cookies' ) . '</td></tr>';
		}
		$lbl = array( 'accept_all' => __( 'Accepted all', 'weberslink-cookies' ), 'reject_all' => __( 'Rejected all', 'weberslink-cookies' ), 'custom' => __( 'Customised', 'weberslink-cookies' ) );
		foreach ( $q['rows'] as $r ) {
			$y = function ( $v ) {
				return $v ? '<span class="wlcc-y">✓</span>' : '<span class="wlcc-n">–</span>';
			};
			echo '<tr><td>' . esc_html( get_date_from_gmt( $r['created_at'], 'Y-m-d H:i' ) ) . '</td><td><code>' . esc_html( $r['consent_id'] ? $r['consent_id'] : '—' ) . '</code></td><td>' . esc_html( $lbl[ $r['action'] ] ) . '</td><td>' . $y( $r['prefs'] ) . '</td><td>' . $y( $r['analytics'] ) . '</td><td>' . $y( $r['marketing'] ) . '</td><td>v' . (int) $r['version'] . '</td></tr>'; // phpcs:ignore
		}
		echo '</tbody></table>';
		$pages = (int) ceil( $q['total'] / 30 );
		if ( $pages > 1 ) {
			echo '<div class="tablenav bottom"><div class="tablenav-pages">' . wp_kses_post( paginate_links( array( 'base' => add_query_arg( array( 'page' => 'wlcc-log', 'paged' => '%#%' ), admin_url( 'admin.php' ) ), 'format' => '', 'current' => $paged, 'total' => $pages ) ) ) . '</div></div>';
		}
		echo '</div>';
	}

	public static function export() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to do this.', 'weberslink-cookies' ), '', array( 'response' => 403 ) );
		}
		check_admin_referer( 'wlcc_export' );
		global $wpdb;
		$rows = (array) $wpdb->get_results( 'SELECT * FROM ' . WLCC_Log::table() . ' ORDER BY id DESC LIMIT 100000', ARRAY_A ); // phpcs:ignore
		nocache_headers();
		header( 'Content-Type: text/csv; charset=utf-8' );
		header( 'Content-Disposition: attachment; filename="consent-log-' . gmdate( 'Y-m-d' ) . '.csv"' );
		echo WLCC_Log::csv( $rows ); // phpcs:ignore
		exit;
	}
}
