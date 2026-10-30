<?php
defined( 'ABSPATH' ) || exit;

class WLR_Admin {

	public static function init() {
		add_action( 'admin_menu', array( __CLASS__, 'menu' ) );
		add_action( 'admin_init', array( __CLASS__, 'register' ) );
		add_action( 'admin_enqueue_scripts', array( __CLASS__, 'assets' ) );
		foreach ( array( 'save', 'bulk', 'from404', 'bulk404', 'export', 'import' ) as $a ) {
			add_action( 'admin_post_wlr_' . $a, array( __CLASS__, $a ) );
		}
		add_filter( 'plugin_action_links_' . plugin_basename( WLR_FILE ), function ( $l ) {
			array_unshift( $l, '<a href="' . esc_url( admin_url( 'admin.php?page=wlr' ) ) . '">' . esc_html__( 'Redirects', 'weberslink-redirects' ) . '</a>' );
			return $l;
		} );
	}

	private static function guard( $action ) {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to do this.', 'weberslink-redirects' ), '', array( 'response' => 403 ) );
		}
		check_admin_referer( $action );
	}

	private static function url( $page, $args = array() ) {
		return add_query_arg( $args, admin_url( 'admin.php?page=' . $page ) );
	}

	private static function back( $page, $msg, $type = 'success', $extra = array() ) {
		wp_safe_redirect( self::url( $page, array_merge( array( 'msg' => rawurlencode( $msg ), 'type' => $type ), $extra ) ) );
		exit;
	}

	public static function menu() {
		add_menu_page( 'Weberslink Redirects', 'Redirects', 'manage_options', 'wlr', array( __CLASS__, 'page_rules' ), 'dashicons-randomize', 77 );
		add_submenu_page( 'wlr', __( 'Redirects', 'weberslink-redirects' ), __( 'Redirects', 'weberslink-redirects' ), 'manage_options', 'wlr', array( __CLASS__, 'page_rules' ) );
		add_submenu_page( 'wlr', __( '404 monitor', 'weberslink-redirects' ), __( '404 monitor', 'weberslink-redirects' ), 'manage_options', 'wlr-404', array( __CLASS__, 'page_404' ) );
		add_submenu_page( 'wlr', __( 'Tools', 'weberslink-redirects' ), __( 'Tools', 'weberslink-redirects' ), 'manage_options', 'wlr-tools', array( __CLASS__, 'page_tools' ) );
		add_submenu_page( 'wlr', __( 'Settings', 'weberslink-redirects' ), __( 'Settings', 'weberslink-redirects' ), 'manage_options', 'wlr-settings', array( __CLASS__, 'page_settings' ) );
	}

	public static function register() {
		register_setting( 'wlr_group', WLR_Settings::OPTION, array( 'sanitize_callback' => function ( $in ) {
			$out = WLR_Settings::sanitize( is_array( $in ) ? wp_unslash( $in ) : array() );
			add_action( 'shutdown', array( 'WLR_Store', 'rebuild_cache' ) ); // case / slash options are baked into the cache
			return $out;
		} ) );
	}

	public static function assets() {
		$page = isset( $_GET['page'] ) ? sanitize_key( $_GET['page'] ) : ''; // phpcs:ignore
		if ( 0 === strpos( $page, 'wlr' ) ) {
			wp_enqueue_style( 'wlr-admin', WLR_URL . 'assets/admin.css', array(), WLR_VERSION );
		}
	}

	private static function notice() {
		if ( isset( $_GET['msg'] ) ) { // phpcs:ignore
			$type = isset( $_GET['type'] ) && 'error' === $_GET['type'] ? 'error' : 'success'; // phpcs:ignore
			echo '<div class="notice notice-' . esc_attr( $type ) . ' is-dismissible"><p>' . esc_html( sanitize_text_field( wp_unslash( $_GET['msg'] ) ) ) . '</p></div>'; // phpcs:ignore
		}
	}

	private static function select( $name, $options, $current ) {
		$o = '<select name="' . esc_attr( $name ) . '">';
		foreach ( $options as $k => $l ) {
			$o .= '<option value="' . esc_attr( $k ) . '"' . selected( (string) $current, (string) $k, false ) . '>' . esc_html( $l ) . '</option>';
		}
		return $o . '</select>';
	}

	/* ---------------- Redirects ---------------- */

	public static function page_rules() {
		$edit   = ! empty( $_GET['edit'] ) ? WLR_Store::get( (int) $_GET['edit'] ) : null; // phpcs:ignore
		$search = isset( $_GET['s'] ) ? sanitize_text_field( wp_unslash( $_GET['s'] ) ) : ''; // phpcs:ignore
		$status = isset( $_GET['status'] ) ? sanitize_key( $_GET['status'] ) : ''; // phpcs:ignore
		$order  = isset( $_GET['orderby'] ) && 'hits' === $_GET['orderby'] ? 'hits' : 'id'; // phpcs:ignore
		$paged  = max( 1, isset( $_GET['paged'] ) ? (int) $_GET['paged'] : 1 ); // phpcs:ignore
		$q      = WLR_Store::query( array( 'search' => $search, 'status' => $status, 'orderby' => $order, 'page' => $paged ) );
		$r      = $edit ? $edit : array( 'id' => 0, 'source' => '', 'target' => '', 'match' => 'exact', 'code' => (int) WLR_Settings::get( 'default_code' ), 'query' => 'ignore', 'enabled' => 1, 'note' => '' );
		echo '<div class="wrap wlr"><h1>' . esc_html__( 'Redirects', 'weberslink-redirects' ) . '</h1>';
		self::notice();
		echo '<div class="wlr-card"><h2>' . esc_html( $edit ? __( 'Edit redirect', 'weberslink-redirects' ) : __( 'Add redirect', 'weberslink-redirects' ) ) . '</h2><form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '" class="wlr-form">';
		wp_nonce_field( 'wlr_save' );
		echo '<input type="hidden" name="action" value="wlr_save" /><input type="hidden" name="id" value="' . (int) $r['id'] . '" />';
		echo '<p><label>' . esc_html__( 'Source URL', 'weberslink-redirects' ) . '<br><input type="text" class="large-text" name="source" value="' . esc_attr( $r['source'] ) . '" placeholder="/old-page" required /></label></p>';
		echo '<p><label>' . esc_html__( 'Target URL', 'weberslink-redirects' ) . '<br><input type="text" class="large-text" name="target" value="' . esc_attr( $r['target'] ) . '" placeholder="/new-page or https://example.com/page" /></label></p>';
		echo '<p class="wlr-row"><label>' . esc_html__( 'Match', 'weberslink-redirects' ) . ' ' . self::select( 'match', array( 'exact' => __( 'Exact URL', 'weberslink-redirects' ), 'prefix' => __( 'Folder (and everything below)', 'weberslink-redirects' ), 'regex' => __( 'Regular expression', 'weberslink-redirects' ) ), $r['match'] ) . '</label> ';
		echo '<label>' . esc_html__( 'Status', 'weberslink-redirects' ) . ' ' . self::select( 'code', WLR_Settings::codes(), $r['code'] ) . '</label> ';
		echo '<label>' . esc_html__( 'Query string', 'weberslink-redirects' ) . ' ' . self::select( 'query', array( 'ignore' => __( 'Ignore it', 'weberslink-redirects' ), 'pass' => __( 'Pass it on to the target', 'weberslink-redirects' ), 'exact' => __( 'Must match exactly', 'weberslink-redirects' ) ), $r['query'] ) . '</label></p>';
		echo '<p><label>' . esc_html__( 'Note (optional)', 'weberslink-redirects' ) . '<br><input type="text" class="large-text" name="note" value="' . esc_attr( $r['note'] ) . '" /></label></p>';
		echo '<p><label><input type="checkbox" name="enabled" value="1"' . checked( ! empty( $r['enabled'] ), true, false ) . ' /> ' . esc_html__( 'Enabled', 'weberslink-redirects' ) . '</label></p>';
		echo '<p class="description">' . esc_html__( 'Folder rules: put {rest} in the target to keep the rest of the path (/blog/x → /news/{rest}). Regex rules: use $1, $2… in the target. Status 410 and 451 need no target.', 'weberslink-redirects' ) . '</p>';
		echo '<p><button class="button button-primary">' . esc_html( $edit ? __( 'Update redirect', 'weberslink-redirects' ) : __( 'Add redirect', 'weberslink-redirects' ) ) . '</button>' . ( $edit ? ' <a class="button" href="' . esc_url( self::url( 'wlr' ) ) . '">' . esc_html__( 'Cancel', 'weberslink-redirects' ) . '</a>' : '' ) . '</p></form></div>';

		$base = array( 's' => $search, 'status' => $status, 'orderby' => $order );
		echo '<form method="get" class="wlr-filters"><input type="hidden" name="page" value="wlr" /><select name="status"><option value="">' . esc_html__( 'All', 'weberslink-redirects' ) . '</option><option value="on"' . selected( $status, 'on', false ) . '>' . esc_html__( 'Enabled', 'weberslink-redirects' ) . '</option><option value="off"' . selected( $status, 'off', false ) . '>' . esc_html__( 'Disabled', 'weberslink-redirects' ) . '</option></select> <select name="orderby"><option value="id">' . esc_html__( 'Newest first', 'weberslink-redirects' ) . '</option><option value="hits"' . selected( $order, 'hits', false ) . '>' . esc_html__( 'Most hits', 'weberslink-redirects' ) . '</option></select> <input type="search" name="s" value="' . esc_attr( $search ) . '" placeholder="' . esc_attr__( 'Search source, target or note', 'weberslink-redirects' ) . '" /> <button class="button">' . esc_html__( 'Filter', 'weberslink-redirects' ) . '</button></form>';
		echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '">';
		wp_nonce_field( 'wlr_bulk' );
		echo '<input type="hidden" name="action" value="wlr_bulk" /><input type="hidden" name="return" value="' . esc_attr( add_query_arg( array_merge( $base, array( 'paged' => $paged ) ), admin_url( 'admin.php?page=wlr' ) ) ) . '" />';
		echo '<div class="tablenav top"><select name="do"><option value="">' . esc_html__( 'Bulk actions', 'weberslink-redirects' ) . '</option><option value="enable">' . esc_html__( 'Enable', 'weberslink-redirects' ) . '</option><option value="disable">' . esc_html__( 'Disable', 'weberslink-redirects' ) . '</option><option value="delete">' . esc_html__( 'Delete', 'weberslink-redirects' ) . '</option></select> <button class="button">' . esc_html__( 'Apply', 'weberslink-redirects' ) . '</button></div>';
		echo '<table class="wp-list-table widefat fixed striped"><thead><tr><td class="check-column"><input type="checkbox" onclick="document.querySelectorAll(\'.wlr-cb\').forEach(function(c){c.checked=this.checked}.bind(this))" /></td><th>' . esc_html__( 'Source', 'weberslink-redirects' ) . '</th><th>' . esc_html__( 'Target', 'weberslink-redirects' ) . '</th><th style="width:90px">' . esc_html__( 'Type', 'weberslink-redirects' ) . '</th><th style="width:60px">' . esc_html__( 'Hits', 'weberslink-redirects' ) . '</th><th style="width:120px">' . esc_html__( 'Last hit', 'weberslink-redirects' ) . '</th></tr></thead><tbody>';
		if ( ! $q['rows'] ) {
			echo '<tr><td colspan="6">' . esc_html__( 'No redirects yet. Add one above, or fix a broken link from the 404 monitor.', 'weberslink-redirects' ) . '</td></tr>';
		}
		$types = array( 'exact' => __( 'Exact', 'weberslink-redirects' ), 'prefix' => __( 'Folder', 'weberslink-redirects' ), 'regex' => 'Regex' );
		foreach ( $q['rows'] as $row ) {
			echo '<tr' . ( $row['enabled'] ? '' : ' class="wlr-off"' ) . '><th class="check-column"><input class="wlr-cb" type="checkbox" name="ids[]" value="' . (int) $row['id'] . '" /></th><td><a href="' . esc_url( self::url( 'wlr', array( 'edit' => $row['id'] ) ) ) . '"><code>' . esc_html( mb_strimwidth( $row['source'], 0, 70, '…' ) ) . '</code></a>' . ( $row['note'] ? '<br><span class="description">' . esc_html( mb_strimwidth( $row['note'], 0, 80, '…' ) ) . '</span>' : '' ) . ( $row['enabled'] ? '' : '<br><span class="description">' . esc_html__( 'disabled', 'weberslink-redirects' ) . '</span>' ) . '</td><td>' . ( $row['target'] ? '<code>' . esc_html( mb_strimwidth( $row['target'], 0, 70, '…' ) ) . '</code>' : '<em>' . esc_html__( '(none)', 'weberslink-redirects' ) . '</em>' ) . '</td><td><span class="wlr-pill wlr-c' . (int) $row['code'] . '">' . (int) $row['code'] . '</span> <span class="description">' . esc_html( $types[ $row['match'] ] ) . '</span></td><td>' . (int) $row['hits'] . '</td><td>' . esc_html( $row['last_hit'] ? get_date_from_gmt( $row['last_hit'], 'Y-m-d H:i' ) : '—' ) . '</td></tr>';
		}
		echo '</tbody></table></form>';
		self::pager( $q['total'], $paged, array_merge( $base, array( 'page' => 'wlr' ) ) );
		echo '</div>';
	}

	private static function pager( $total, $paged, $args ) {
		$pages = (int) ceil( $total / 25 );
		if ( $pages > 1 ) {
			echo '<div class="tablenav bottom"><div class="tablenav-pages">' . wp_kses_post( paginate_links( array( 'base' => add_query_arg( array_merge( $args, array( 'paged' => '%#%' ) ), admin_url( 'admin.php' ) ), 'format' => '', 'current' => $paged, 'total' => $pages ) ) ) . '</div></div>';
		}
	}

	public static function save() {
		self::guard( 'wlr_save' );
		$id = isset( $_POST['id'] ) ? (int) $_POST['id'] : 0;
		$in = wp_unslash( $_POST ); // phpcs:ignore
		unset( $in['id'] );
		$in['enabled'] = isset( $in['enabled'] ) ? 1 : 0;
		list( $clean, $err ) = WLR_Matcher::validate( $in );
		if ( ! $clean ) {
			self::back( 'wlr', $err, 'error', $id ? array( 'edit' => $id ) : array() );
		}
		if ( $id && WLR_Store::get( $id ) ) {
			WLR_Store::update( $id, $clean );
			self::back( 'wlr', __( 'Redirect updated.', 'weberslink-redirects' ) );
		}
		if ( WLR_Store::exists( $clean['source'], $clean['match'] ) ) {
			self::back( 'wlr', __( 'A redirect with that source already exists. Edit it instead.', 'weberslink-redirects' ), 'error' );
		}
		WLR_Store::add( $clean );
		if ( 'exact' === $clean['match'] ) {
			list( $p ) = WLR_Matcher::split( $clean['source'] );
			WLR_Store::delete_404_path( $p );
		}
		self::back( 'wlr', __( 'Redirect added.', 'weberslink-redirects' ) );
	}

	public static function bulk() {
		self::guard( 'wlr_bulk' );
		$ids  = isset( $_POST['ids'] ) ? array_map( 'intval', (array) $_POST['ids'] ) : array(); // phpcs:ignore
		$do   = isset( $_POST['do'] ) ? sanitize_key( $_POST['do'] ) : '';
		$ret  = isset( $_POST['return'] ) ? wp_validate_redirect( esc_url_raw( wp_unslash( $_POST['return'] ) ), self::url( 'wlr' ) ) : self::url( 'wlr' ); // phpcs:ignore
		$msg  = __( 'Nothing selected.', 'weberslink-redirects' );
		if ( $ids && 'delete' === $do ) {
			WLR_Store::delete( $ids );
			$msg = sprintf( /* translators: %d: count */ __( '%d redirect(s) deleted.', 'weberslink-redirects' ), count( $ids ) );
		} elseif ( $ids && in_array( $do, array( 'enable', 'disable' ), true ) ) {
			WLR_Store::set_enabled( $ids, 'enable' === $do );
			$msg = sprintf( /* translators: %d: count */ __( '%d redirect(s) updated.', 'weberslink-redirects' ), count( $ids ) );
		}
		wp_safe_redirect( add_query_arg( array( 'msg' => rawurlencode( $msg ), 'type' => 'success' ), $ret ) );
		exit;
	}

	/* ---------------- 404 monitor ---------------- */

	/** slug => post id for published public content (one query). */
	private static function slugs() {
		global $wpdb;
		$types = array_values( get_post_types( array( 'public' => true ) ) );
		if ( ! $types ) {
			return array();
		}
		$in   = "'" . implode( "','", array_map( 'esc_sql', $types ) ) . "'";
		$rows = (array) $wpdb->get_results( "SELECT ID, post_name FROM {$wpdb->posts} WHERE post_status='publish' AND post_type IN ($in) AND post_name<>'' ORDER BY ID DESC LIMIT 3000", ARRAY_A ); // phpcs:ignore
		$out  = array();
		foreach ( $rows as $r ) {
			if ( ! isset( $out[ $r['post_name'] ] ) ) {
				$out[ $r['post_name'] ] = (int) $r['ID'];
			}
		}
		return $out;
	}

	public static function page_404() {
		$search = isset( $_GET['s'] ) ? sanitize_text_field( wp_unslash( $_GET['s'] ) ) : ''; // phpcs:ignore
		$paged  = max( 1, isset( $_GET['paged'] ) ? (int) $_GET['paged'] : 1 ); // phpcs:ignore
		$q      = WLR_Store::query_404( array( 'search' => $search, 'page' => $paged ) );
		$slugs  = $q['rows'] ? self::slugs() : array();
		echo '<div class="wrap wlr"><h1>' . esc_html__( '404 monitor', 'weberslink-redirects' ) . '</h1>';
		self::notice();
		if ( ! WLR_Settings::get( 'log_404' ) ) {
			echo '<div class="notice notice-info"><p>' . esc_html__( '404 logging is switched off in Settings.', 'weberslink-redirects' ) . '</p></div>';
		}
		echo '<p class="description">' . esc_html__( 'Addresses visitors asked for that do not exist, most requested first. Redirect them to the right page with one click: the plugin suggests the closest match.', 'weberslink-redirects' ) . '</p>';
		echo '<form method="get" class="wlr-filters"><input type="hidden" name="page" value="wlr-404" /><input type="search" name="s" value="' . esc_attr( $search ) . '" placeholder="' . esc_attr__( 'Search addresses', 'weberslink-redirects' ) . '" /> <button class="button">' . esc_html__( 'Search', 'weberslink-redirects' ) . '</button></form>';
		echo '<table class="wp-list-table widefat fixed striped"><thead><tr><th>' . esc_html__( 'Address', 'weberslink-redirects' ) . '</th><th style="width:60px">' . esc_html__( 'Hits', 'weberslink-redirects' ) . '</th><th style="width:120px">' . esc_html__( 'Last seen', 'weberslink-redirects' ) . '</th><th style="width:44%">' . esc_html__( 'Fix it', 'weberslink-redirects' ) . '</th></tr></thead><tbody>';
		if ( ! $q['rows'] ) {
			echo '<tr><td colspan="4">' . esc_html__( 'No 404 errors recorded. 🎉', 'weberslink-redirects' ) . '</td></tr>';
		}
		foreach ( $q['rows'] as $row ) {
			$sug    = $slugs ? WLR_Suggest::best( $row['path'], $slugs ) : null;
			$target = $sug ? get_permalink( (int) $sug['url'] ) : '';
			echo '<tr><td><code>' . esc_html( mb_strimwidth( $row['path'], 0, 70, '…' ) ) . '</code>' . ( $row['referrer'] ? '<br><span class="description">' . esc_html__( 'from', 'weberslink-redirects' ) . ' ' . esc_html( mb_strimwidth( $row['referrer'], 0, 60, '…' ) ) . '</span>' : '' ) . '</td><td>' . (int) $row['hits'] . '</td><td>' . esc_html( get_date_from_gmt( $row['last_seen'], 'Y-m-d H:i' ) ) . '</td><td>';
			echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '" class="wlr-inline">';
			wp_nonce_field( 'wlr_from404' );
			echo '<input type="hidden" name="action" value="wlr_from404" /><input type="hidden" name="id" value="' . (int) $row['id'] . '" /><input type="text" name="target" value="' . esc_attr( $target ) . '" placeholder="' . esc_attr__( '/redirect-to', 'weberslink-redirects' ) . '" /> <button class="button button-primary" name="do" value="redirect">' . esc_html__( 'Redirect', 'weberslink-redirects' ) . '</button> <button class="button" name="do" value="gone" title="' . esc_attr__( 'Answer 410 Gone', 'weberslink-redirects' ) . '">410</button> <button class="button" name="do" value="ignore" title="' . esc_attr__( 'Remove from the list', 'weberslink-redirects' ) . '">' . esc_html__( 'Ignore', 'weberslink-redirects' ) . '</button>';
			if ( $sug ) {
				echo '<br><span class="wlr-sug">' . esc_html( sprintf( /* translators: %d: confidence */ __( 'Suggested (%d%% match)', 'weberslink-redirects' ), $sug['score'] ) ) . '</span>';
			}
			echo '</form></td></tr>';
		}
		echo '</tbody></table>';
		self::pager( $q['total'], $paged, array( 'page' => 'wlr-404', 's' => $search ) );
		if ( $q['total'] ) {
			echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '" onsubmit="return confirm(\'' . esc_js( __( 'Clear the whole 404 list?', 'weberslink-redirects' ) ) . '\')" style="margin-top:14px">';
			wp_nonce_field( 'wlr_bulk404' );
			echo '<input type="hidden" name="action" value="wlr_bulk404" /><button class="button">' . esc_html__( 'Clear the list', 'weberslink-redirects' ) . '</button></form>';
		}
		echo '</div>';
	}

	public static function from404() {
		self::guard( 'wlr_from404' );
		global $wpdb;
		$id  = isset( $_POST['id'] ) ? (int) $_POST['id'] : 0; // phpcs:ignore
		$do  = isset( $_POST['do'] ) ? sanitize_key( $_POST['do'] ) : '';
		$row = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . WLR_Store::t_404() . ' WHERE id=%d', $id ), ARRAY_A ); // phpcs:ignore
		if ( ! $row ) {
			self::back( 'wlr-404', __( 'That entry no longer exists.', 'weberslink-redirects' ), 'error' );
		}
		if ( 'ignore' === $do ) {
			WLR_Store::delete_404( array( $id ) );
			self::back( 'wlr-404', __( 'Removed from the list.', 'weberslink-redirects' ) );
		}
		$data = array( 'source' => $row['path'], 'target' => 'gone' === $do ? '' : ( isset( $_POST['target'] ) ? wp_unslash( $_POST['target'] ) : '' ), 'code' => 'gone' === $do ? 410 : (int) WLR_Settings::get( 'default_code' ) ); // phpcs:ignore
		list( $clean, $err ) = WLR_Matcher::validate( $data );
		if ( ! $clean ) {
			self::back( 'wlr-404', $err, 'error' );
		}
		if ( ! WLR_Store::exists( $clean['source'] ) ) {
			WLR_Store::add( $clean );
		}
		WLR_Store::delete_404( array( $id ) );
		self::back( 'wlr-404', 'gone' === $do ? __( 'Now answering 410 Gone.', 'weberslink-redirects' ) : __( 'Redirect created.', 'weberslink-redirects' ) );
	}

	public static function bulk404() {
		self::guard( 'wlr_bulk404' );
		global $wpdb;
		$wpdb->query( 'TRUNCATE TABLE ' . WLR_Store::t_404() ); // phpcs:ignore
		self::back( 'wlr-404', __( '404 list cleared.', 'weberslink-redirects' ) );
	}

	/* ---------------- Tools ---------------- */

	public static function page_tools() {
		$test = isset( $_GET['test'] ) ? sanitize_text_field( wp_unslash( $_GET['test'] ) ) : ''; // phpcs:ignore
		echo '<div class="wrap wlr"><h1>' . esc_html__( 'Tools', 'weberslink-redirects' ) . '</h1>';
		self::notice();
		echo '<div class="wlr-card"><h2>' . esc_html__( 'Test a URL', 'weberslink-redirects' ) . '</h2><p class="description">' . esc_html__( 'See exactly where an address would go, including chains and loops, before a visitor finds out.', 'weberslink-redirects' ) . '</p><form method="get"><input type="hidden" name="page" value="wlr-tools" /><input type="text" class="regular-text" name="test" value="' . esc_attr( $test ) . '" placeholder="/old-page" /> <button class="button button-primary">' . esc_html__( 'Test', 'weberslink-redirects' ) . '</button></form>';
		if ( '' !== $test ) {
			echo '<ol class="wlr-chain">';
			foreach ( self::trace( $test ) as $step ) {
				echo '<li>' . wp_kses( $step, array( 'code' => array(), 'strong' => array(), 'span' => array( 'class' => array() ) ) ) . '</li>';
			}
			echo '</ol>';
		}
		echo '</div>';
		echo '<div class="wlr-card"><h2>' . esc_html__( 'Export', 'weberslink-redirects' ) . '</h2><p><a class="button" href="' . esc_url( wp_nonce_url( admin_url( 'admin-post.php?action=wlr_export' ), 'wlr_export' ) ) . '">' . esc_html__( 'Download all redirects (CSV)', 'weberslink-redirects' ) . '</a></p></div>';
		echo '<div class="wlr-card"><h2>' . esc_html__( 'Import', 'weberslink-redirects' ) . '</h2><p class="description">' . esc_html__( 'CSV with columns: source, target, code, match, query, enabled, note. Only source and target are needed. Invalid rows are skipped and listed; duplicates are ignored.', 'weberslink-redirects' ) . '</p><form method="post" enctype="multipart/form-data" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '">';
		wp_nonce_field( 'wlr_import' );
		echo '<input type="hidden" name="action" value="wlr_import" /><input type="file" name="csv" accept=".csv,text/csv" required /> <button class="button button-primary">' . esc_html__( 'Import', 'weberslink-redirects' ) . '</button></form></div></div>';
	}

	/** Follow a URL through the rules, up to 6 hops. Returns HTML-safe step strings. */
	private static function trace( $url ) {
		$cache = WLR_Store::cache();
		$base  = wp_parse_url( home_url(), PHP_URL_PATH );
		$base  = $base ? rtrim( $base, '/' ) : '';
		$seen  = array();
		$steps = array();
		$cur   = $url;
		for ( $i = 0; $i < 6; $i++ ) {
			$hit = WLR_Runtime::resolve( $cur, $cache, $base );
			if ( ! $hit ) {
				$steps[] = $i ? sprintf( /* translators: %s: url */ esc_html__( 'Final address: %s (no further rule): the visitor lands here.', 'weberslink-redirects' ), '<code>' . esc_html( $cur ) . '</code>' ) : esc_html__( 'No rule matches: WordPress handles this address normally.', 'weberslink-redirects' );
				return $steps;
			}
			list( $rule, $target, $code ) = $hit;
			if ( null === $target ) {
				$steps[] = sprintf( /* translators: 1: code 2: url */ esc_html__( '%1$s on %2$s: the visitor sees a "gone" page.', 'weberslink-redirects' ), '<strong>' . (int) $code . '</strong>', '<code>' . esc_html( $cur ) . '</code>' );
				return $steps;
			}
			$steps[] = sprintf( /* translators: 1: code 2: from 3: to */ esc_html__( '%1$s: %2$s → %3$s', 'weberslink-redirects' ), '<strong>' . (int) $code . '</strong>', '<code>' . esc_html( $cur ) . '</code>', '<code>' . esc_html( $target ) . '</code>' );
			if ( preg_match( '#^https?://#i', $target ) && 0 !== strpos( $target, home_url() ) ) {
				$steps[] = esc_html__( 'The target is another website, so the trace stops here.', 'weberslink-redirects' );
				return $steps;
			}
			$key = strtolower( $target );
			if ( isset( $seen[ $key ] ) ) {
				$steps[] = '<span class="wlr-bad">' . esc_html__( 'Loop detected: these redirects send visitors in circles. Fix one of them.', 'weberslink-redirects' ) . '</span>';
				return $steps;
			}
			$seen[ $key ] = 1;
			$cur          = $target;
		}
		$steps[] = '<span class="wlr-bad">' . esc_html__( 'Too many hops: browsers give up on long redirect chains. Point the first redirect straight at the final page.', 'weberslink-redirects' ) . '</span>';
		return $steps;
	}

	public static function export() {
		self::guard( 'wlr_export' );
		$q = WLR_Store::query( array( 'per_page' => 0 ) );
		nocache_headers();
		header( 'Content-Type: text/csv; charset=utf-8' );
		header( 'Content-Disposition: attachment; filename="redirects-' . gmdate( 'Y-m-d' ) . '.csv"' );
		echo WLR_Csv::build( $q['rows'] ); // phpcs:ignore
		exit;
	}

	public static function import() {
		self::guard( 'wlr_import' );
		if ( empty( $_FILES['csv']['tmp_name'] ) || ! is_uploaded_file( $_FILES['csv']['tmp_name'] ) || (int) $_FILES['csv']['size'] > 2 * MB_IN_BYTES ) { // phpcs:ignore
			self::back( 'wlr-tools', __( 'Choose a CSV file smaller than 2 MB.', 'weberslink-redirects' ), 'error' );
		}
		$res   = WLR_Csv::parse( (string) file_get_contents( $_FILES['csv']['tmp_name'] ) ); // phpcs:ignore
		$added = 0;
		$dupes = 0;
		foreach ( $res['rules'] as $clean ) {
			if ( WLR_Store::exists( $clean['source'], $clean['match'] ) ) {
				$dupes++;
				continue;
			}
			WLR_Store::add( $clean );
			$added++;
		}
		$msg = sprintf( /* translators: 1: added 2: duplicates 3: errors */ __( 'Imported %1$d redirect(s). %2$d duplicate(s) ignored, %3$d invalid row(s) skipped.', 'weberslink-redirects' ), $added, $dupes, count( $res['errors'] ) );
		if ( $res['errors'] ) {
			$msg .= ' ' . implode( '; ', array_slice( $res['errors'], 0, 5 ) );
		}
		self::back( 'wlr-tools', $msg, $added || ! $res['errors'] ? 'success' : 'error' );
	}

	/* ---------------- Settings ---------------- */

	public static function page_settings() {
		$s    = WLR_Settings::all();
		$name = WLR_Settings::OPTION;
		$chk  = function ( $k, $label, $help ) use ( $s, $name ) {
			echo '<tr><th scope="row">' . esc_html( $label ) . '</th><td><label><input type="checkbox" name="' . esc_attr( $name . '[' . $k . ']' ) . '" value="1"' . checked( ! empty( $s[ $k ] ), true, false ) . ' /> ' . esc_html( $help ) . '</label></td></tr>';
		};
		$num  = function ( $k, $label, $help ) use ( $s, $name ) {
			echo '<tr><th scope="row"><label for="wlr_' . esc_attr( $k ) . '">' . esc_html( $label ) . '</label></th><td><input type="number" id="wlr_' . esc_attr( $k ) . '" name="' . esc_attr( $name . '[' . $k . ']' ) . '" value="' . esc_attr( $s[ $k ] ) . '" class="small-text" /> <span class="description">' . esc_html( $help ) . '</span></td></tr>';
		};
		echo '<div class="wrap wlr"><h1>' . esc_html__( 'Redirect settings', 'weberslink-redirects' ) . '</h1>';
		if ( isset( $_GET['settings-updated'] ) ) { // phpcs:ignore
			echo '<div class="notice notice-success is-dismissible"><p>' . esc_html__( 'Settings saved.', 'weberslink-redirects' ) . '</p></div>';
		}
		echo '<form method="post" action="options.php">';
		settings_fields( 'wlr_group' );
		echo '<h2>' . esc_html__( 'Matching', 'weberslink-redirects' ) . '</h2><table class="form-table"><tbody>';
		$chk( 'case_insensitive', __( 'Ignore case', 'weberslink-redirects' ), __( '/About and /about are the same address', 'weberslink-redirects' ) );
		$chk( 'ignore_slash', __( 'Ignore trailing slash', 'weberslink-redirects' ), __( '/about and /about/ are the same address', 'weberslink-redirects' ) );
		echo '<tr><th scope="row"><label for="wlr_default_code">' . esc_html__( 'Default status', 'weberslink-redirects' ) . '</label></th><td>' . self::select( $name . '[default_code]', array_filter( WLR_Settings::codes(), function ( $k ) {
			return $k < 400;
		}, ARRAY_FILTER_USE_KEY ), $s['default_code'] ) . '</td></tr>';
		$chk( 'track_hits', __( 'Count hits', 'weberslink-redirects' ), __( 'Show how often each redirect is used', 'weberslink-redirects' ) );
		$chk( 'auto_slug', __( 'Redirect when a post URL changes', 'weberslink-redirects' ), __( 'When a published post or page gets a new slug, add a 301 from the old address automatically', 'weberslink-redirects' ) );
		echo '</tbody></table><h2>' . esc_html__( '404 monitor', 'weberslink-redirects' ) . '</h2><table class="form-table"><tbody>';
		$chk( 'log_404', __( 'Log 404 errors', 'weberslink-redirects' ), __( 'Record addresses visitors asked for that do not exist', 'weberslink-redirects' ) );
		$chk( 'ignore_bots', __( 'Ignore bots', 'weberslink-redirects' ), __( 'Skip search-engine crawlers and scripts so the list shows real visitors', 'weberslink-redirects' ) );
		$num( 'keep_days', __( 'Keep entries for (days)', 'weberslink-redirects' ), '' );
		$num( 'max_404', __( 'Maximum entries', 'weberslink-redirects' ), __( 'The least requested are dropped first', 'weberslink-redirects' ) );
		echo '<tr><th scope="row"><label for="wlr_ignore_ext">' . esc_html__( 'Ignore file types', 'weberslink-redirects' ) . '</label></th><td><input type="text" id="wlr_ignore_ext" class="large-text" name="' . esc_attr( $name ) . '[ignore_ext]" value="' . esc_attr( $s['ignore_ext'] ) . '" /><p class="description">' . esc_html__( 'Comma-separated extensions that are never logged.', 'weberslink-redirects' ) . '</p></td></tr>';
		echo '<tr><th scope="row"><label for="wlr_ignore_paths">' . esc_html__( 'Ignore addresses containing', 'weberslink-redirects' ) . '</label></th><td><textarea id="wlr_ignore_paths" name="' . esc_attr( $name ) . '[ignore_paths]" rows="4" class="large-text">' . esc_textarea( $s['ignore_paths'] ) . '</textarea><p class="description">' . esc_html__( 'One per line, e.g. /wp-content/ or /feed', 'weberslink-redirects' ) . '</p></td></tr>';
		echo '</tbody></table>';
		submit_button();
		echo '</form></div>';
	}
}
