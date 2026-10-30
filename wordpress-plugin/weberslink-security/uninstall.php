<?php
if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}
global $wpdb;
$wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}wlss_log" ); // phpcs:ignore
delete_option( 'wlss_settings' );
delete_option( 'wlss_db_version' );
// Two-factor secrets are kept on purpose so reinstalling does not lock users out; remove them with: delete_metadata( 'user', 0, 'wlss_totp', '', true );
