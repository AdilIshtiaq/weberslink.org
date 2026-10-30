<?php
if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}
global $wpdb;
$wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}wlr_rules" ); // phpcs:ignore
$wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}wlr_404" ); // phpcs:ignore
foreach ( array( 'wlr_settings', 'wlr_db_version', 'wlr_cache' ) as $o ) {
	delete_option( $o );
}
