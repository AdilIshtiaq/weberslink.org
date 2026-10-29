<?php
/**
 * Plugin Name:       Weberslink Forms Pro
 * Plugin URI:        https://weberslink.org/
 * Description:       A complete drag-and-drop form builder: 45+ field types, multi-step and conversational (one-question-at-a-time) forms, conditional logic, calculations, file uploads, spam protection, entries manager, email notifications, payments and integrations. Styled to blend into any theme.
 * Version:           1.3.0
 * Requires at least: 5.8
 * Requires PHP:      7.4
 * Author:            WebersLink
 * Author URI:        https://weberslink.org/
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       weberslink-forms-pro
 * Domain Path:       /languages
 */

defined( 'ABSPATH' ) || exit;

define( 'WLFP_VERSION', '1.3.0' );
define( 'WLFP_FILE', __FILE__ );
define( 'WLFP_DIR', plugin_dir_path( __FILE__ ) );
define( 'WLFP_URL', plugin_dir_url( __FILE__ ) );
define( 'WLFP_DB_VERSION', '2' );

require_once WLFP_DIR . 'includes/class-wlfp-helpers.php';
require_once WLFP_DIR . 'includes/class-wlfp-install.php';
require_once WLFP_DIR . 'includes/class-wlfp-forms.php';
require_once WLFP_DIR . 'includes/class-wlfp-entries.php';
require_once WLFP_DIR . 'includes/class-wlfp-fields.php';
require_once WLFP_DIR . 'includes/class-wlfp-logic.php';
require_once WLFP_DIR . 'includes/class-wlfp-calc.php';
require_once WLFP_DIR . 'includes/class-wlfp-renderer.php';
require_once WLFP_DIR . 'includes/class-wlfp-submit.php';
require_once WLFP_DIR . 'includes/class-wlfp-spam.php';
require_once WLFP_DIR . 'includes/class-wlfp-uploads.php';
require_once WLFP_DIR . 'includes/class-wlfp-merge.php';
require_once WLFP_DIR . 'includes/class-wlfp-notifications.php';
require_once WLFP_DIR . 'includes/class-wlfp-payments.php';
require_once WLFP_DIR . 'includes/class-wlfp-integrations.php';
require_once WLFP_DIR . 'includes/class-wlfp-templates.php';
require_once WLFP_DIR . 'includes/class-wlfp-export.php';
require_once WLFP_DIR . 'includes/class-wlfp-privacy.php';
require_once WLFP_DIR . 'includes/class-wlfp-blocks.php';
require_once WLFP_DIR . 'includes/class-wlfp-shortcodes.php';
require_once WLFP_DIR . 'includes/class-wlfp-pdf.php';
require_once WLFP_DIR . 'includes/class-wlfp-drafts.php';
require_once WLFP_DIR . 'includes/class-wlfp-admin.php';

register_activation_hook( __FILE__, array( 'WLFP_Install', 'activate' ) );
register_deactivation_hook( __FILE__, array( 'WLFP_Install', 'deactivate' ) );

final class WLFP_Plugin {

	public static function boot() {
		load_plugin_textdomain( 'weberslink-forms-pro', false, dirname( plugin_basename( WLFP_FILE ) ) . '/languages' );

		WLFP_Install::maybe_upgrade();
		WLFP_Renderer::init();
		WLFP_Submit::init();
		WLFP_Payments::init();
		WLFP_Notifications::init();
		WLFP_Integrations::init();
		WLFP_Export::init();
		WLFP_Privacy::init();
		WLFP_Blocks::init();
		WLFP_Shortcodes::init();
		WLFP_Drafts::init();
		WLFP_Install::init_cron();

		if ( is_admin() ) {
			WLFP_Admin::init();
		}
	}
}
add_action( 'plugins_loaded', array( 'WLFP_Plugin', 'boot' ) );

/** Template tag: echo a form. */
function wlfp_form( $form_id, $args = array() ) {
	echo WLFP_Renderer::render( (int) $form_id, $args ); // phpcs:ignore WordPress.Security.EscapeOutput
}
