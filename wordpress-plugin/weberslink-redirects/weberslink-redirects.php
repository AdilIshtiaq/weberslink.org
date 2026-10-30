<?php
/**
 * Plugin Name:       Weberslink Redirects & 404 Monitor
 * Plugin URI:        https://weberslink.org/plugins/weberslink-redirects
 * Description:       Manage 301/302/307/308/410 redirects (exact, folder or regex), catch and fix 404 errors with smart suggestions, redirect automatically when a post's URL changes, test any URL, and import/export CSV.
 * Version:           1.0.0
 * Requires at least: 5.9
 * Requires PHP:      7.4
 * Author:            WebersLink
 * Author URI:        https://weberslink.org/
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       weberslink-redirects
 */

defined( 'ABSPATH' ) || exit;

define( 'WLR_VERSION', '1.0.0' );
define( 'WLR_FILE', __FILE__ );
define( 'WLR_DIR', plugin_dir_path( __FILE__ ) );
define( 'WLR_URL', plugin_dir_url( __FILE__ ) );

require_once WLR_DIR . 'includes/class-wlr-settings.php';
require_once WLR_DIR . 'includes/class-wlr-matcher.php';
require_once WLR_DIR . 'includes/class-wlr-csv.php';
require_once WLR_DIR . 'includes/class-wlr-suggest.php';
require_once WLR_DIR . 'includes/class-wlr-store.php';
require_once WLR_DIR . 'includes/class-wlr-runtime.php';
require_once WLR_DIR . 'includes/class-wlr-admin.php';

register_activation_hook( __FILE__, array( 'WLR_Store', 'activate' ) );
register_deactivation_hook( __FILE__, array( 'WLR_Store', 'deactivate' ) );

add_action( 'plugins_loaded', function () {
	load_plugin_textdomain( 'weberslink-redirects', false, dirname( plugin_basename( WLR_FILE ) ) . '/languages' );
	WLR_Store::maybe_upgrade();
	WLR_Store::init();
	WLR_Runtime::init();
	if ( is_admin() ) {
		WLR_Admin::init();
	}
} );
