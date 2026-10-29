<?php
if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}
$settings = get_option( 'wlfp_settings', array() );
if ( empty( $settings['delete_on_uninstall'] ) ) {
	return;
}
global $wpdb;
foreach ( array( 'wlfp_forms', 'wlfp_entries', 'wlfp_entry_notes', 'wlfp_logs', 'wlfp_views' ) as $t ) {
	$wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}{$t}" ); // phpcs:ignore
}
delete_option( 'wlfp_settings' );
delete_option( 'wlfp_db_version' );
