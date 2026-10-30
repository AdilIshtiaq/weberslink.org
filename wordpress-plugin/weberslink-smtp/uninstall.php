<?php
if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}
$s = get_option( 'wlsmtp_settings', array() );
if ( empty( $s['delete_on_uninstall'] ) ) {
	return;
}
global $wpdb;
$wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}wlsmtp_log" ); // phpcs:ignore
delete_option( 'wlsmtp_settings' );
delete_option( 'wlsmtp_db_version' );
delete_option( 'wlsmtp_report_last' );
