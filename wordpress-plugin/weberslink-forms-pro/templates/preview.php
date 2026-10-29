<?php
defined( 'ABSPATH' ) || exit;
$wlfp_id = isset( $GLOBALS['wlfp_preview_id'] ) ? (int) $GLOBALS['wlfp_preview_id'] : 0;
$wlfp_banner = '<div style="background:#1d2327;color:#fff;padding:8px 16px;font:13px/1.4 system-ui,sans-serif;text-align:center">' . esc_html__( 'Weberslink Forms preview — only visible to administrators. Your theme styles are applied.', 'weberslink-forms-pro' ) . '</div>';
if ( function_exists( 'wp_is_block_theme' ) && wp_is_block_theme() ) {
	?><!doctype html>
<html <?php language_attributes(); ?>>
<head><meta charset="<?php bloginfo( 'charset' ); ?>"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title><?php esc_html_e( 'Form preview', 'weberslink-forms-pro' ); ?></title><?php wp_head(); ?></head>
<body <?php body_class(); ?>><?php wp_body_open(); echo $wlfp_banner; // phpcs:ignore ?>
<main class="wp-site-blocks" style="max-width:760px;margin:40px auto;padding:0 16px"><?php echo WLFP_Renderer::render( $wlfp_id, array( 'preview' => 1 ) ); // phpcs:ignore ?></main>
<?php wp_footer(); ?></body></html>
	<?php
} else {
	get_header();
	echo $wlfp_banner; // phpcs:ignore
	echo '<div id="primary" class="content-area"><main id="main" class="site-main" style="max-width:760px;margin:40px auto;padding:0 16px">';
	echo WLFP_Renderer::render( $wlfp_id, array( 'preview' => 1 ) ); // phpcs:ignore
	echo '</main></div>';
	get_footer();
}
