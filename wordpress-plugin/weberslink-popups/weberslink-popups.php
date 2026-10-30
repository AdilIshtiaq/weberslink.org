<?php
/**
 * Plugin Name:       Weberslink Popups & Lead Capture
 * Plugin URI:        https://weberslink.org/plugins/weberslink-popups
 * Description:       Popups, slide-ins and announcement bars that grow your email list: show them after a delay, on scroll, on exit intent or when a button is clicked, target the right pages and visitors, limit how often they appear, and collect leads with spam protection, CSV export and a webhook.
 * Version:           1.0.0
 * Requires at least: 5.9
 * Requires PHP:      7.4
 * Author:            WebersLink
 * Author URI:        https://weberslink.org/
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       weberslink-popups
 */

defined( 'ABSPATH' ) || exit;

define( 'WLPOP_VERSION', '1.0.0' );
define( 'WLPOP_FILE', __FILE__ );
define( 'WLPOP_DIR', plugin_dir_path( __FILE__ ) );
define( 'WLPOP_URL', plugin_dir_url( __FILE__ ) );

foreach ( array( 'store', 'rules', 'leads', 'front', 'admin' ) as $wlpop_f ) {
	require_once WLPOP_DIR . 'includes/class-wlpop-' . $wlpop_f . '.php';
}
unset( $wlpop_f );

register_activation_hook( __FILE__, array( 'WLPOP_Leads', 'activate' ) );

add_action( 'plugins_loaded', function () {
	load_plugin_textdomain( 'weberslink-popups', false, dirname( plugin_basename( WLPOP_FILE ) ) . '/languages' );
	WLPOP_Leads::maybe_upgrade();
	WLPOP_Leads::init();
	WLPOP_Front::init();
	if ( is_admin() ) {
		WLPOP_Admin::init();
	}
} );
