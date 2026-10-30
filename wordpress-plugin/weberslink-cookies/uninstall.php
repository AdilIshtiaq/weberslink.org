<?php
if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}
global $wpdb;
$wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}wlcc_log" ); // phpcs:ignore
delete_option( 'wlcc_settings' );
delete_option( 'wlcc_db_version' );
