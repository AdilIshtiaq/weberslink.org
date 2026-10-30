<?php
defined( 'ABSPATH' ) || exit;

class WLFP_Install {

	public static function activate() {
		self::create_tables();
		if ( ! get_option( 'wlfp_settings' ) ) {
			add_option( 'wlfp_settings', WLFP_Helpers::defaults() );
		}
		update_option( 'wlfp_db_version', WLFP_DB_VERSION );
		self::protect_upload_dir();
		if ( ! wp_next_scheduled( 'wlfp_daily' ) ) {
			wp_schedule_event( time() + HOUR_IN_SECONDS, 'daily', 'wlfp_daily' );
		}
	}

	public static function deactivate() {
		wp_clear_scheduled_hook( 'wlfp_daily' );
	}

	public static function maybe_upgrade() {
		if ( get_option( 'wlfp_db_version' ) !== WLFP_DB_VERSION ) {
			self::create_tables();
			update_option( 'wlfp_db_version', WLFP_DB_VERSION );
		}
	}

	public static function init_cron() {
		add_action( 'wlfp_daily', array( __CLASS__, 'daily' ) );
		if ( ! wp_next_scheduled( 'wlfp_daily' ) ) {
			wp_schedule_event( time() + HOUR_IN_SECONDS, 'daily', 'wlfp_daily' );
		}
	}

	public static function create_tables() {
		global $wpdb;
		require_once ABSPATH . 'wp-admin/includes/upgrade.php';
		$c = $wpdb->get_charset_collate();
		$p = $wpdb->prefix;

		dbDelta( "CREATE TABLE {$p}wlfp_forms (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			title varchar(255) NOT NULL DEFAULT '',
			status varchar(20) NOT NULL DEFAULT 'published',
			fields longtext,
			settings longtext,
			created_by bigint(20) unsigned NOT NULL DEFAULT 0,
			created_at datetime NOT NULL,
			updated_at datetime NOT NULL,
			PRIMARY KEY  (id),
			KEY status (status)
		) $c;" );

		dbDelta( "CREATE TABLE {$p}wlfp_entries (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			form_id bigint(20) unsigned NOT NULL,
			serial int(10) unsigned NOT NULL DEFAULT 0,
			user_id bigint(20) unsigned NOT NULL DEFAULT 0,
			status varchar(20) NOT NULL DEFAULT 'unread',
			starred tinyint(1) NOT NULL DEFAULT 0,
			ip varchar(64) NOT NULL DEFAULT '',
			user_agent varchar(255) NOT NULL DEFAULT '',
			source_url text,
			payment_status varchar(20) NOT NULL DEFAULT '',
			payment_method varchar(20) NOT NULL DEFAULT '',
			payment_total decimal(14,2) NOT NULL DEFAULT 0,
			currency varchar(10) NOT NULL DEFAULT '',
			transaction_id varchar(191) NOT NULL DEFAULT '',
			stage varchar(40) NOT NULL DEFAULT '',
			assigned_to bigint(20) unsigned NOT NULL DEFAULT 0,
			data longtext,
			created_at datetime NOT NULL,
			PRIMARY KEY  (id),
			KEY form_id (form_id),
			KEY status (status),
			KEY created_at (created_at),
			KEY transaction_id (transaction_id),
			KEY stage (stage),
			KEY assigned_to (assigned_to)
		) $c;" );

		dbDelta( "CREATE TABLE {$p}wlfp_entry_notes (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			entry_id bigint(20) unsigned NOT NULL,
			user_id bigint(20) unsigned NOT NULL DEFAULT 0,
			note text,
			created_at datetime NOT NULL,
			PRIMARY KEY  (id),
			KEY entry_id (entry_id)
		) $c;" );

		dbDelta( "CREATE TABLE {$p}wlfp_logs (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			form_id bigint(20) unsigned NOT NULL DEFAULT 0,
			entry_id bigint(20) unsigned NOT NULL DEFAULT 0,
			component varchar(40) NOT NULL DEFAULT '',
			status varchar(20) NOT NULL DEFAULT 'info',
			title varchar(255) NOT NULL DEFAULT '',
			message text,
			created_at datetime NOT NULL,
			PRIMARY KEY  (id),
			KEY form_id (form_id),
			KEY entry_id (entry_id),
			KEY created_at (created_at)
		) $c;" );

		dbDelta( "CREATE TABLE {$p}wlfp_drafts (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			token varchar(40) NOT NULL,
			form_id bigint(20) unsigned NOT NULL,
			email varchar(190) NOT NULL DEFAULT '',
			data longtext,
			step int(10) unsigned NOT NULL DEFAULT 0,
			created_at datetime NOT NULL,
			expires_at datetime NOT NULL,
			PRIMARY KEY  (id),
			UNIQUE KEY token (token),
			KEY form_id (form_id),
			KEY expires_at (expires_at)
		) $c;" );

		dbDelta( "CREATE TABLE {$p}wlfp_revisions (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			form_id bigint(20) unsigned NOT NULL,
			user_id bigint(20) unsigned NOT NULL DEFAULT 0,
			title varchar(255) NOT NULL DEFAULT '',
			fields longtext,
			settings longtext,
			created_at datetime NOT NULL,
			PRIMARY KEY  (id),
			KEY form_id (form_id)
		) $c;" );

		dbDelta( "CREATE TABLE {$p}wlfp_views (
			form_id bigint(20) unsigned NOT NULL,
			day date NOT NULL,
			views int(10) unsigned NOT NULL DEFAULT 0,
			PRIMARY KEY  (form_id,day)
		) $c;" );
	}

	public static function upload_dir() {
		$u = wp_upload_dir();
		return array(
			'path' => trailingslashit( $u['basedir'] ) . 'wlfp-uploads',
			'url'  => trailingslashit( $u['baseurl'] ) . 'wlfp-uploads',
		);
	}

	public static function protect_upload_dir() {
		$d = self::upload_dir();
		wp_mkdir_p( $d['path'] );
		if ( ! file_exists( $d['path'] . '/index.html' ) ) {
			file_put_contents( $d['path'] . '/index.html', '' ); // phpcs:ignore
		}
		// Block script execution in the uploads folder (Apache); files are still downloadable.
		if ( ! file_exists( $d['path'] . '/.htaccess' ) ) {
			file_put_contents( $d['path'] . '/.htaccess', "Options -Indexes\n<FilesMatch \"\\.(php|phtml|php[0-9]|phar|pl|py|cgi|sh)$\">\n  Require all denied\n</FilesMatch>\n" ); // phpcs:ignore
		}
	}

	public static function daily() {
		global $wpdb;
		$s    = WLFP_Helpers::settings();
		$days = (int) $s['keep_entries_days'];
		if ( $days > 0 ) {
			$cut = gmdate( 'Y-m-d H:i:s', time() - $days * DAY_IN_SECONDS );
			$ids = $wpdb->get_col( $wpdb->prepare( "SELECT id FROM {$wpdb->prefix}wlfp_entries WHERE created_at < %s LIMIT 1000", $cut ) ); // phpcs:ignore
			foreach ( $ids as $id ) {
				WLFP_Entries::delete( (int) $id );
			}
		}
		$ld = (int) $s['keep_logs_days'];
		if ( $ld > 0 ) {
			$cut = gmdate( 'Y-m-d H:i:s', time() - $ld * DAY_IN_SECONDS );
			$wpdb->query( $wpdb->prepare( "DELETE FROM {$wpdb->prefix}wlfp_logs WHERE created_at < %s", $cut ) ); // phpcs:ignore
		}
		WLFP_Drafts::cleanup();
		// Abandoned pending payments older than 3 days -> failed status label (kept for the record).
		$cut = gmdate( 'Y-m-d H:i:s', time() - 3 * DAY_IN_SECONDS );
		$wpdb->query( $wpdb->prepare( "UPDATE {$wpdb->prefix}wlfp_entries SET payment_status='abandoned' WHERE payment_status='pending' AND created_at < %s", $cut ) ); // phpcs:ignore

		if ( ! empty( $s['digest_email'] ) && is_email( $s['digest_email'] ) && (int) gmdate( 'w' ) === 1 ) {
			WLFP_Notifications::weekly_digest( $s['digest_email'] );
		}
	}

	public static function log( $form_id, $entry_id, $component, $status, $title, $message = '' ) {
		global $wpdb;
		$wpdb->insert( $wpdb->prefix . 'wlfp_logs', array(
			'form_id'    => (int) $form_id,
			'entry_id'   => (int) $entry_id,
			'component'  => substr( $component, 0, 40 ),
			'status'     => substr( $status, 0, 20 ),
			'title'      => substr( $title, 0, 255 ),
			'message'    => is_scalar( $message ) ? (string) $message : wp_json_encode( $message ),
			'created_at' => current_time( 'mysql', true ),
		) );
	}
}
