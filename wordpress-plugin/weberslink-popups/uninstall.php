<?php
if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}
global $wpdb;
$wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}wlpop_leads" ); // phpcs:ignore
$wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}wlpop_stats" ); // phpcs:ignore
foreach ( array( 'wlpop_items', 'wlpop_settings', 'wlpop_db_version' ) as $o ) {
	delete_option( $o );
}
