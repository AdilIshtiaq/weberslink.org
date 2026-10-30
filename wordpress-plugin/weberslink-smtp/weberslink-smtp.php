<?php
/**
 * Plugin Name:       Weberslink SMTP & Email Log
 * Plugin URI:        https://weberslink.org/plugins/weberslink-smtp
 * Description:       Reliable WordPress email: send through any SMTP provider, keep a searchable log of every email (with preview and resend), retry failures automatically, get failure alerts and check your SPF / DKIM / DMARC.
 * Version:           1.1.0
 * Requires at least: 5.9
 * Requires PHP:      7.4
 * Author:            WebersLink
 * Author URI:        https://weberslink.org/
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       weberslink-smtp
 */

defined( 'ABSPATH' ) || exit;

define( 'WLSMTP_VERSION', '1.1.0' );
define( 'WLSMTP_FILE', __FILE__ );
define( 'WLSMTP_DIR', plugin_dir_path( __FILE__ ) );
define( 'WLSMTP_URL', plugin_dir_url( __FILE__ ) );

require_once WLSMTP_DIR . 'includes/class-wlsmtp-settings.php';
require_once WLSMTP_DIR . 'includes/class-wlsmtp-log.php';
require_once WLSMTP_DIR . 'includes/class-wlsmtp-transport.php';
require_once WLSMTP_DIR . 'includes/class-wlsmtp-router.php';
require_once WLSMTP_DIR . 'includes/class-wlsmtp-tracking.php';
require_once WLSMTP_DIR . 'includes/class-wlsmtp-report.php';
require_once WLSMTP_DIR . 'includes/class-wlsmtp-controls.php';
require_once WLSMTP_DIR . 'includes/class-wlsmtp-mailer.php';
require_once WLSMTP_DIR . 'includes/class-wlsmtp-deliverability.php';
require_once WLSMTP_DIR . 'includes/class-wlsmtp-admin.php';

register_activation_hook( __FILE__, array( 'WLSMTP_Log', 'activate' ) );
register_deactivation_hook( __FILE__, array( 'WLSMTP_Log', 'deactivate' ) );

add_action( 'plugins_loaded', function () {
	load_plugin_textdomain( 'weberslink-smtp', false, dirname( plugin_basename( WLSMTP_FILE ) ) . '/languages' );
	WLSMTP_Log::maybe_upgrade();
	WLSMTP_Mailer::init();
	WLSMTP_Log::init();
	WLSMTP_Tracking::init();
	WLSMTP_Controls::init();
	if ( is_admin() ) {
		WLSMTP_Admin::init();
	}
} );
