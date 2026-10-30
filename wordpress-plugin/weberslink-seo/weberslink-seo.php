<?php
/**
 * Plugin Name:       Weberslink SEO Toolkit
 * Plugin URI:        https://weberslink.org/plugins/weberslink-seo
 * Description:       Titles and meta descriptions with templates, live SEO and readability analysis with a Google preview, Open Graph and Twitter cards, JSON-LD schema, robots and sitemap controls, and an SEO audit of your content.
 * Version:           1.0.0
 * Requires at least: 5.9
 * Requires PHP:      7.4
 * Author:            WebersLink
 * Author URI:        https://weberslink.org/
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       weberslink-seo
 */

defined( 'ABSPATH' ) || exit;

define( 'WLSEO_VERSION', '1.0.0' );
define( 'WLSEO_FILE', __FILE__ );
define( 'WLSEO_DIR', plugin_dir_path( __FILE__ ) );
define( 'WLSEO_URL', plugin_dir_url( __FILE__ ) );

foreach ( array( 'settings', 'templates', 'analyzer', 'schema', 'output', 'admin' ) as $wlseo_f ) {
	require_once WLSEO_DIR . 'includes/class-wlseo-' . $wlseo_f . '.php';
}
unset( $wlseo_f );

add_action( 'plugins_loaded', function () {
	load_plugin_textdomain( 'weberslink-seo', false, dirname( plugin_basename( WLSEO_FILE ) ) . '/languages' );
	WLSEO_Output::init();
	if ( is_admin() ) {
		WLSEO_Admin::init();
	}
} );
