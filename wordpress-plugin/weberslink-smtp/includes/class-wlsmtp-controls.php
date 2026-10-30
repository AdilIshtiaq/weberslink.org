<?php
defined( 'ABSPATH' ) || exit;

/** Switch off the WordPress notification emails the site owner does not want. */
class WLSMTP_Controls {

	/** setting key => filter that returns false to stop the email */
	public static function map() {
		return array(
			'new_user_admin'    => 'wp_send_new_user_notification_to_admin',
			'new_user_user'     => 'wp_send_new_user_notification_to_user',
			'password_changed'  => 'send_password_change_email',
			'email_changed'     => 'send_email_change_email',
			'comment_author'    => 'notify_post_author',
			'comment_moderator' => 'notify_moderator',
			'core_updates'      => 'auto_core_update_send_email',
			'plugin_updates'    => 'auto_plugin_update_send_email',
			'theme_updates'     => 'auto_theme_update_send_email',
		);
	}

	public static function init() {
		$off = (array) WLSMTP_Settings::get( 'disable' );
		foreach ( self::map() as $key => $filter ) {
			if ( in_array( $key, $off, true ) ) {
				add_filter( $filter, '__return_false', 99 );
			}
		}
	}
}
