<?php
if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}
delete_option( 'wlseo_settings' );
// Per-page SEO fields (_wlseo_*) are kept on purpose so reinstalling restores them.
