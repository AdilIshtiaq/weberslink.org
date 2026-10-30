<?php
/**
 * Plugin Name:       Weberslink Security Shield
 * Plugin URI:        https://weberslink.org/plugins/weberslink-security
 * Description:       Protect WordPress logins with attempt limiting and optional two-factor authentication (authenticator app + recovery codes), switch on hardening in one click, keep an activity log and get a plain-English security check-up.
 * Version:           1.0.0
 * Requires at least: 5.9
 * Requires PHP:      7.4
 * Author:            WebersLink
 * Author URI:        https://weberslink.org/
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       weberslink-security
 */

defined( 'ABSPATH' ) || exit;

define( 'WLSS_VERSION', '1.0.0' );
define( 'WLSS_FILE', __FILE__ );
define( 'WLSS_DIR', plugin_dir_path( __FILE__ ) );
define( 'WLSS_URL', plugin_dir_url( __FILE__ ) );

foreach ( array( 'settings', 'ip', 'limiter', 'totp', 'password', 'log', 'checkup', 'login', 'twofactor', 'hardening', 'admin' ) as $wlss_f ) {
	require_once WLSS_DIR . 'includes/class-wlss-' . $wlss_f . '.php';
}
unset( $wlss_f );

register_activation_hook( __FILE__, array( 'WLSS_Log', 'activate' ) );
register_deactivation_hook( __FILE__, array( 'WLSS_Log', 'deactivate' ) );

add_action( 'plugins_loaded', function () {
	load_plugin_textdomain( 'weberslink-security', false, dirname( plugin_basename( WLSS_FILE ) ) . '/languages' );
	WLSS_Log::maybe_upgrade();
	WLSS_Log::init();
	WLSS_Login::init();
	WLSS_TwoFactor::init();
	WLSS_Hardening::init();
	if ( is_admin() ) {
		WLSS_Admin::init();
	}
} );
