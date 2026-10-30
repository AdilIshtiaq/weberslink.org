<?php
/**
 * Plugin Name:       Weberslink Image Optimizer
 * Plugin URI:        https://weberslink.org/plugins/weberslink-images
 * Description:       Make images smaller without visible loss: compress and resize on upload, fix rotation and remove metadata, create WebP versions that browsers get automatically, optimise your existing media library in one click, and restore any original.
 * Version:           1.0.0
 * Requires at least: 5.9
 * Requires PHP:      7.4
 * Author:            WebersLink
 * Author URI:        https://weberslink.org/
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       weberslink-images
 */

defined( 'ABSPATH' ) || exit;

define( 'WLIO_VERSION', '1.0.0' );
define( 'WLIO_FILE', __FILE__ );
define( 'WLIO_DIR', plugin_dir_path( __FILE__ ) );
define( 'WLIO_URL', plugin_dir_url( __FILE__ ) );

foreach ( array( 'settings', 'exif', 'engine', 'picture', 'media', 'admin' ) as $wlio_f ) {
	require_once WLIO_DIR . 'includes/class-wlio-' . $wlio_f . '.php';
}
unset( $wlio_f );

add_action( 'plugins_loaded', function () {
	load_plugin_textdomain( 'weberslink-images', false, dirname( plugin_basename( WLIO_FILE ) ) . '/languages' );
	WLIO_Media::init();
	WLIO_Picture::init();
	if ( is_admin() ) {
		WLIO_Admin::init();
	}
} );
