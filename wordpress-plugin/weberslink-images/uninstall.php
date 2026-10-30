<?php
if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}
delete_option( 'wlio_settings' );
// Optimised images, WebP twins and the wlio-backup folder are kept on purpose: they are your media files.
