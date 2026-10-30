<?php
/**
 * Plugin Name:       Weberslink Cookie Consent
 * Plugin URI:        https://weberslink.org/plugins/weberslink-cookies
 * Description:       A cookie banner that holds back analytics and marketing scripts until visitors agree: equal Accept and Reject buttons, categories, Google Consent Mode v2, embeds that wait for consent, a consent log you can export as proof, and a cookie table shortcode.
 * Version:           1.0.0
 * Requires at least: 5.9
 * Requires PHP:      7.4
 * Author:            WebersLink
 * Author URI:        https://weberslink.org/
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       weberslink-cookies
 */

defined( 'ABSPATH' ) || exit;

define( 'WLCC_VERSION', '1.0.0' );
define( 'WLCC_FILE', __FILE__ );
define( 'WLCC_DIR', plugin_dir_path( __FILE__ ) );
define( 'WLCC_URL', plugin_dir_url( __FILE__ ) );

foreach ( array( 'settings', 'scripts', 'log', 'front', 'admin' ) as $wlcc_f ) {
	require_once WLCC_DIR . 'includes/class-wlcc-' . $wlcc_f . '.php';
}
unset( $wlcc_f );

register_activation_hook( __FILE__, array( 'WLCC_Log', 'activate' ) );
register_deactivation_hook( __FILE__, array( 'WLCC_Log', 'deactivate' ) );

add_action( 'plugins_loaded', function () {
	load_plugin_textdomain( 'weberslink-cookies', false, dirname( plugin_basename( WLCC_FILE ) ) . '/languages' );
	WLCC_Log::maybe_upgrade();
	WLCC_Log::init();
	WLCC_Front::init();
	if ( is_admin() ) {
		WLCC_Admin::init();
	}
} );
