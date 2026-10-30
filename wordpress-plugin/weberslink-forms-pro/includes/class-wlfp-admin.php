<?php
defined( 'ABSPATH' ) || exit;

class WLFP_Admin {

	public static function init() {
		add_action( 'admin_menu', array( __CLASS__, 'menu' ) );
		add_action( 'admin_enqueue_scripts', array( __CLASS__, 'assets' ) );
		add_action( 'admin_init', array( __CLASS__, 'register_settings' ) );
		add_action( 'admin_post_wlfp_create_form', array( __CLASS__, 'create_form' ) );
		add_action( 'admin_post_wlfp_form_action', array( __CLASS__, 'form_action' ) );
		add_action( 'admin_post_wlfp_entries_action', array( __CLASS__, 'entries_action' ) );
		add_action( 'admin_post_wlfp_entry_save', array( __CLASS__, 'entry_save' ) );
		add_action( 'admin_post_wlfp_entry_note', array( __CLASS__, 'entry_note' ) );
		add_action( 'admin_post_wlfp_entry_resend', array( __CLASS__, 'entry_resend' ) );
		add_action( 'admin_post_wlfp_entry_feeds', array( __CLASS__, 'entry_feeds' ) );
		add_action( 'admin_post_wlfp_entry_pdf', array( __CLASS__, 'entry_pdf' ) );
		add_action( 'admin_post_wlfp_entry_workflow', array( __CLASS__, 'entry_workflow' ) );
		add_action( 'wp_ajax_wlfp_revisions', array( __CLASS__, 'ajax_revisions' ) );
		add_action( 'wp_ajax_wlfp_revision', array( __CLASS__, 'ajax_revision' ) );
		add_action( 'admin_post_wlfp_entry_email', array( __CLASS__, 'entry_email' ) );
		add_action( 'admin_post_wlfp_test_email', array( __CLASS__, 'test_email' ) );
		add_action( 'admin_post_wlfp_clear_logs', array( __CLASS__, 'clear_logs' ) );
		add_action( 'wp_ajax_wlfp_save_form', array( __CLASS__, 'ajax_save_form' ) );
		add_action( 'wp_dashboard_setup', array( __CLASS__, 'dashboard_widget' ) );
		add_filter( 'plugin_action_links_' . plugin_basename( WLFP_FILE ), function ( $l ) {
			array_unshift( $l, '<a href="' . esc_url( admin_url( 'admin.php?page=wlfp-settings' ) ) . '">' . esc_html__( 'Settings', 'weberslink-forms-pro' ) . '</a>' );
			return $l;
		} );
		add_filter( 'admin_footer_text', function ( $t ) {
			return ( isset( $_GET['page'] ) && 0 === strpos( sanitize_key( $_GET['page'] ), 'wlfp' ) ) ? esc_html__( 'Thank you for building with Weberslink Forms Pro.', 'weberslink-forms-pro' ) : $t; // phpcs:ignore
		} );
	}

	/* ---------------- Menu ---------------- */

	public static function menu() {
		$cap = WLFP_Helpers::cap();
		$unread = WLFP_Entries::counts()['unread'];
		$badge  = $unread ? ' <span class="update-plugins count-' . (int) $unread . '"><span class="plugin-count">' . (int) $unread . '</span></span>' : '';
		add_menu_page( 'Weberslink Forms', 'Weberslink Forms' . $badge, $cap, 'wlfp', array( __CLASS__, 'page_forms' ), 'dashicons-feedback', 26 );
		add_submenu_page( 'wlfp', __( 'All forms', 'weberslink-forms-pro' ), __( 'All forms', 'weberslink-forms-pro' ), $cap, 'wlfp', array( __CLASS__, 'page_forms' ) );
		add_submenu_page( 'wlfp', __( 'Add new', 'weberslink-forms-pro' ), __( 'Add new', 'weberslink-forms-pro' ), $cap, 'wlfp-new', array( __CLASS__, 'page_new' ) );
		add_submenu_page( 'wlfp', __( 'Entries', 'weberslink-forms-pro' ), __( 'Entries', 'weberslink-forms-pro' ) . $badge, $cap, 'wlfp-entries', array( __CLASS__, 'page_entries' ) );
		add_submenu_page( 'wlfp', __( 'Reports', 'weberslink-forms-pro' ), __( 'Reports', 'weberslink-forms-pro' ), $cap, 'wlfp-reports', array( __CLASS__, 'page_reports' ) );
		add_submenu_page( 'wlfp', __( 'Tools & logs', 'weberslink-forms-pro' ), __( 'Tools & logs', 'weberslink-forms-pro' ), $cap, 'wlfp-tools', array( __CLASS__, 'page_tools' ) );
		add_submenu_page( 'wlfp', __( 'Settings', 'weberslink-forms-pro' ), __( 'Settings', 'weberslink-forms-pro' ), $cap, 'wlfp-settings', array( __CLASS__, 'page_settings' ) );
		// The builder is a real submenu page (so WordPress always grants access to it); it is only hidden visually.
		add_submenu_page( 'wlfp', __( 'Form builder', 'weberslink-forms-pro' ), __( 'Form builder', 'weberslink-forms-pro' ), $cap, 'wlfp-builder', array( __CLASS__, 'page_builder' ) );
		add_action( 'admin_head', array( __CLASS__, 'hide_builder_link' ) );
	}

	public static function hide_builder_link() {
		echo '<style>#adminmenu .wp-submenu li:has(> a[href$="page=wlfp-builder"]){display:none}</style>';
		echo '<script>document.addEventListener("DOMContentLoaded",function(){document.querySelectorAll(\'#adminmenu a[href$="page=wlfp-builder"]\').forEach(function(a){if(a.parentNode.tagName==="LI"){a.parentNode.style.display="none";}});});</script>';
	}

	public static function assets( $hook ) {
		$page = isset( $_GET['page'] ) ? sanitize_key( $_GET['page'] ) : ''; // phpcs:ignore
		if ( 0 !== strpos( $page, 'wlfp' ) ) {
			return;
		}
		wp_enqueue_style( 'wlfp-admin', WLFP_URL . 'assets/css/admin.css', array(), WLFP_VERSION );
		if ( 'wlfp-builder' === $page ) {
			wp_enqueue_media();
			wp_enqueue_script( 'wlfp-builder', WLFP_URL . 'assets/js/builder.js', array(), WLFP_VERSION, true );
			$id   = isset( $_GET['form'] ) ? (int) $_GET['form'] : 0; // phpcs:ignore
			$form = $id ? WLFP_Forms::get( $id ) : null;
			if ( ! $form ) {
				$form = array( 'id' => 0, 'title' => __( 'New form', 'weberslink-forms-pro' ), 'status' => 'published', 'fields' => array(), 'settings' => WLFP_Forms::default_settings() );
			}
			$defaults = array();
			foreach ( array_keys( WLFP_Fields::types() ) as $t ) {
				$defaults[ $t ] = WLFP_Fields::defaults( $t );
			}
			$roles = array();
			foreach ( wp_roles()->roles as $slug => $r ) {
				if ( ! in_array( $slug, array( 'administrator' ), true ) ) {
					$roles[ $slug ] = translate_user_role( $r['name'] );
				}
			}
			$pages = array();
			foreach ( get_pages( array( 'number' => 200, 'sort_column' => 'post_title' ) ) as $p ) {
				$pages[ $p->ID ] = $p->post_title;
			}
			$ptypes = array();
			foreach ( get_post_types( array( 'public' => true ), 'objects' ) as $slug => $o ) {
				if ( 'attachment' !== $slug ) {
					$ptypes[ $slug ] = $o->labels->singular_name . ' (' . $slug . ')';
				}
			}
			$taxes = array();
			foreach ( get_taxonomies( array( 'public' => true ), 'objects' ) as $slug => $o ) {
				$taxes[ $slug ] = $o->labels->singular_name . ' (' . $slug . ')';
			}
			$g = WLFP_Helpers::settings();
			wp_localize_script( 'wlfp-builder', 'WLFPB', array(
				'ajax'      => admin_url( 'admin-ajax.php' ),
				'nonce'     => wp_create_nonce( 'wlfp_builder' ),
				'form'      => $form,
				'types'     => WLFP_Fields::types(),
				'defaults'  => $defaults,
				'ops'       => WLFP_Logic::operators(),
				'feeds'     => WLFP_Integrations::types(),
				'currencies' => WLFP_Helpers::currencies(),
				'roles'     => $roles,
				'pages'     => $pages,
				'tags'      => WLFP_Merge::tags_help(),
				'previewUrl' => home_url( '/' ),
				'listUrl'   => admin_url( 'admin.php?page=wlfp' ),
				'entriesUrl' => admin_url( 'admin.php?page=wlfp-entries&form_id=' ),
				'globalCurrency' => $g['currency'],
				'hasStripe' => (bool) $g['stripe_sk'],
				'hasPaypal' => (bool) $g['paypal_client'],
				'hasCaptcha' => array( 'recaptcha' => (bool) $g['recaptcha_secret'], 'hcaptcha' => (bool) $g['hcaptcha_secret'], 'turnstile' => (bool) $g['turnstile_secret'] ),
				'settingsUrl' => admin_url( 'admin.php?page=wlfp-settings' ),
				'akismet'   => class_exists( 'Akismet' ),
				'postTypes' => $ptypes,
				'taxonomies' => $taxes,
				'countries' => WLFP_Helpers::countries(),
				'i18n'      => array(
					'saved'  => __( 'Form saved', 'weberslink-forms-pro' ),
					'saving' => __( 'Saving…', 'weberslink-forms-pro' ),
					'error'  => __( 'Could not save. Please try again.', 'weberslink-forms-pro' ),
					'leave'  => __( 'You have unsaved changes.', 'weberslink-forms-pro' ),
					'confirmDelete' => __( 'Delete this field?', 'weberslink-forms-pro' ),
				),
			) );
		}
	}

	/* ---------------- Helpers ---------------- */

	private static function guard( $action ) {
		if ( ! WLFP_Helpers::can_manage() ) {
			wp_die( esc_html__( 'You do not have permission to do this.', 'weberslink-forms-pro' ), '', array( 'response' => 403 ) );
		}
		check_admin_referer( $action );
	}

	private static function url( $page, $args = array() ) {
		return add_query_arg( $args, admin_url( 'admin.php?page=' . $page ) );
	}

	private static function nonce_url( $page_args, $action ) {
		return wp_nonce_url( add_query_arg( $page_args, admin_url( 'admin-post.php' ) ), $action );
	}

	private static function notice( $msg, $type = 'success' ) {
		echo '<div class="notice notice-' . esc_attr( $type ) . ' is-dismissible"><p>' . wp_kses_post( $msg ) . '</p></div>';
	}

	private static function header( $title, $actions = '' ) {
		echo '<div class="wrap wlfp-admin"><h1 class="wp-heading-inline">' . esc_html( $title ) . '</h1> ' . $actions . '<hr class="wp-header-end">'; // phpcs:ignore
	}

	/* ---------------- Forms list ---------------- */

	public static function page_forms() {
		$status = isset( $_GET['status'] ) ? sanitize_key( $_GET['status'] ) : ''; // phpcs:ignore
		$search = isset( $_GET['s'] ) ? sanitize_text_field( wp_unslash( $_GET['s'] ) ) : ''; // phpcs:ignore
		$counts = WLFP_Forms::count_by_status();
		$forms  = WLFP_Forms::all( array( 'search' => $search, 'status' => $status ) );
		if ( ! $status ) {
			$forms = array_values( array_filter( $forms, function ( $f ) {
				return 'trash' !== $f['status'];
			} ) );
		}
		global $wpdb;
		$views = array();
		foreach ( (array) $wpdb->get_results( "SELECT form_id, SUM(views) v FROM {$wpdb->prefix}wlfp_views GROUP BY form_id", ARRAY_A ) as $r ) { // phpcs:ignore
			$views[ $r['form_id'] ] = (int) $r['v'];
		}
		self::header( __( 'Forms', 'weberslink-forms-pro' ), '<a href="' . esc_url( self::url( 'wlfp-new' ) ) . '" class="page-title-action">' . esc_html__( 'Add new', 'weberslink-forms-pro' ) . '</a>' );
		if ( isset( $_GET['msg'] ) ) { // phpcs:ignore
			$m = array( 'trashed' => __( 'Form moved to trash.', 'weberslink-forms-pro' ), 'restored' => __( 'Form restored.', 'weberslink-forms-pro' ), 'deleted' => __( 'Form deleted permanently.', 'weberslink-forms-pro' ), 'duplicated' => __( 'Form duplicated.', 'weberslink-forms-pro' ) );
			$k = sanitize_key( $_GET['msg'] ); // phpcs:ignore
			if ( isset( $m[ $k ] ) ) {
				self::notice( esc_html( $m[ $k ] ) );
			}
		}
		echo '<ul class="subsubsub"><li><a href="' . esc_url( self::url( 'wlfp' ) ) . '"' . ( ! $status ? ' class="current"' : '' ) . '>' . esc_html__( 'All', 'weberslink-forms-pro' ) . ' <span class="count">(' . (int) ( $counts['published'] + $counts['draft'] ) . ')</span></a> | </li><li><a href="' . esc_url( self::url( 'wlfp', array( 'status' => 'published' ) ) ) . '"' . ( 'published' === $status ? ' class="current"' : '' ) . '>' . esc_html__( 'Published', 'weberslink-forms-pro' ) . ' (' . (int) $counts['published'] . ')</a> | </li><li><a href="' . esc_url( self::url( 'wlfp', array( 'status' => 'draft' ) ) ) . '"' . ( 'draft' === $status ? ' class="current"' : '' ) . '>' . esc_html__( 'Drafts', 'weberslink-forms-pro' ) . ' (' . (int) $counts['draft'] . ')</a> | </li><li><a href="' . esc_url( self::url( 'wlfp', array( 'status' => 'trash' ) ) ) . '"' . ( 'trash' === $status ? ' class="current"' : '' ) . '>' . esc_html__( 'Trash', 'weberslink-forms-pro' ) . ' (' . (int) $counts['trash'] . ')</a></li></ul>';
		echo '<form method="get" class="search-box"><input type="hidden" name="page" value="wlfp" /><input type="search" name="s" value="' . esc_attr( $search ) . '" placeholder="' . esc_attr__( 'Search forms', 'weberslink-forms-pro' ) . '" /> <button class="button">' . esc_html__( 'Search', 'weberslink-forms-pro' ) . '</button></form>';
		echo '<table class="wp-list-table widefat fixed striped"><thead><tr><th style="width:28%">' . esc_html__( 'Title', 'weberslink-forms-pro' ) . '</th><th>' . esc_html__( 'Shortcode', 'weberslink-forms-pro' ) . '</th><th>' . esc_html__( 'Entries', 'weberslink-forms-pro' ) . '</th><th>' . esc_html__( 'Views', 'weberslink-forms-pro' ) . '</th><th>' . esc_html__( 'Conversion', 'weberslink-forms-pro' ) . '</th><th>' . esc_html__( 'Status', 'weberslink-forms-pro' ) . '</th></tr></thead><tbody>';
		if ( ! $forms ) {
			echo '<tr><td colspan="6">' . esc_html__( 'No forms yet.', 'weberslink-forms-pro' ) . ' <a href="' . esc_url( self::url( 'wlfp-new' ) ) . '">' . esc_html__( 'Create your first form', 'weberslink-forms-pro' ) . '</a></td></tr>';
			$empty = true;
		}
		foreach ( $forms as $f ) {
			$n  = WLFP_Forms::entry_count( $f['id'] );
			$v  = isset( $views[ $f['id'] ] ) ? $views[ $f['id'] ] : 0;
			$cv = $v ? round( $n / $v * 100, 1 ) . '%' : '—';
			$edit = self::url( 'wlfp-builder', array( 'form' => $f['id'] ) );
			$acts = array();
			if ( 'trash' === $f['status'] ) {
				$acts[] = '<a href="' . esc_url( self::nonce_url( array( 'action' => 'wlfp_form_action', 'do' => 'restore', 'form' => $f['id'] ), 'wlfp_form_' . $f['id'] ) ) . '">' . esc_html__( 'Restore', 'weberslink-forms-pro' ) . '</a>';
				$acts[] = '<a class="submitdelete" onclick="return confirm(\'' . esc_js( __( 'Delete this form and all its entries permanently?', 'weberslink-forms-pro' ) ) . '\')" href="' . esc_url( self::nonce_url( array( 'action' => 'wlfp_form_action', 'do' => 'delete', 'form' => $f['id'] ), 'wlfp_form_' . $f['id'] ) ) . '">' . esc_html__( 'Delete permanently', 'weberslink-forms-pro' ) . '</a>';
			} else {
				$acts[] = '<a href="' . esc_url( $edit ) . '">' . esc_html__( 'Edit', 'weberslink-forms-pro' ) . '</a>';
				$acts[] = '<a href="' . esc_url( self::url( 'wlfp-entries', array( 'form_id' => $f['id'] ) ) ) . '">' . esc_html__( 'Entries', 'weberslink-forms-pro' ) . '</a>';
				$acts[] = '<a target="_blank" href="' . esc_url( add_query_arg( 'wlfp_preview', $f['id'], home_url( '/' ) ) ) . '">' . esc_html__( 'Preview', 'weberslink-forms-pro' ) . '</a>';
				$acts[] = '<a href="' . esc_url( self::nonce_url( array( 'action' => 'wlfp_form_action', 'do' => 'duplicate', 'form' => $f['id'] ), 'wlfp_form_' . $f['id'] ) ) . '">' . esc_html__( 'Duplicate', 'weberslink-forms-pro' ) . '</a>';
				$acts[] = '<a href="' . esc_url( wp_nonce_url( admin_url( 'admin-post.php?action=wlfp_export_form&form_id=' . $f['id'] ), 'wlfp_export' ) ) . '">' . esc_html__( 'Export', 'weberslink-forms-pro' ) . '</a>';
				$acts[] = '<a class="submitdelete" href="' . esc_url( self::nonce_url( array( 'action' => 'wlfp_form_action', 'do' => 'trash', 'form' => $f['id'] ), 'wlfp_form_' . $f['id'] ) ) . '">' . esc_html__( 'Trash', 'weberslink-forms-pro' ) . '</a>';
			}
			echo '<tr><td><strong><a href="' . esc_url( $edit ) . '">' . esc_html( $f['title'] ) . '</a></strong> <span class="description">#' . (int) $f['id'] . '</span><div class="row-actions visible">' . implode( ' | ', $acts ) . '</div></td>'; // phpcs:ignore
			echo '<td><input type="text" readonly class="wlfp-sc" value="' . esc_attr( '[weberslink_form id="' . $f['id'] . '"]' ) . '" onclick="this.select()" /></td><td>' . (int) $n . '</td><td>' . (int) $v . '</td><td>' . esc_html( $cv ) . '</td><td><span class="wlfp-pill wlfp-pill-' . esc_attr( $f['status'] ) . '">' . esc_html( ucfirst( $f['status'] ) ) . '</span></td></tr>';
		}
		echo '</tbody></table>';
		if ( ! empty( $empty ) && ! $search ) {
			echo '<h2 style="margin-top:28px">' . esc_html__( 'Start from a template', 'weberslink-forms-pro' ) . '</h2>';
			self::template_cards( 8 );
			echo '<p><a class="button" href="' . esc_url( self::url( 'wlfp-new' ) ) . '">' . esc_html__( 'Browse all templates', 'weberslink-forms-pro' ) . '</a></p>';
		}
		echo '</div>';
	}

	private static function template_cards( $limit = 0, $cat = 'all' ) {
		$n = 0;
		echo '<div class="wlfp-tpls">';
		foreach ( WLFP_Templates::all() as $slug => $t ) {
			if ( 'all' !== $cat && ( isset( $t['cat'] ) ? $t['cat'] : 'contact' ) !== $cat ) {
				continue;
			}
			if ( $limit && ++$n > $limit ) {
				break;
			}
			echo '<a class="wlfp-tpl" data-title="' . esc_attr( strtolower( $t['title'] . ' ' . $t['desc'] ) ) . '" href="' . esc_url( self::nonce_url( array( 'action' => 'wlfp_create_form', 'tpl' => $slug ), 'wlfp_create' ) ) . '"><strong>' . esc_html( $t['title'] ) . '</strong><span>' . esc_html( $t['desc'] ) . '</span><em>' . (int) count( $t['fields'] ) . ' ' . esc_html__( 'fields', 'weberslink-forms-pro' ) . '</em></a>';
		}
		echo '</div>';
	}

	public static function page_new() {
		$cat = isset( $_GET['cat'] ) ? sanitize_key( $_GET['cat'] ) : 'all'; // phpcs:ignore
		self::header( __( 'Create a form', 'weberslink-forms-pro' ) );
		echo '<p>' . esc_html__( 'Pick a template or start blank. Everything can be changed in the builder.', 'weberslink-forms-pro' ) . '</p>';
		echo '<ul class="subsubsub" style="float:none;margin-bottom:10px">';
		$cats = WLFP_Templates::categories();
		$i    = 0;
		foreach ( $cats as $k => $l ) {
			echo '<li><a href="' . esc_url( self::url( 'wlfp-new', array( 'cat' => $k ) ) ) . '"' . ( $cat === $k ? ' class="current"' : '' ) . '>' . esc_html( $l ) . '</a>' . ( ++$i < count( $cats ) ? ' | ' : '' ) . '</li>';
		}
		echo '</ul><p><input type="search" id="wlfp-tpl-search" placeholder="' . esc_attr__( 'Search templates…', 'weberslink-forms-pro' ) . '" style="width:280px" /></p>';
		self::template_cards( 0, isset( $cats[ $cat ] ) ? $cat : 'all' );
		echo '<script>(function(){var s=document.getElementById("wlfp-tpl-search");if(!s)return;s.addEventListener("input",function(){var q=s.value.toLowerCase();document.querySelectorAll(".wlfp-tpl").forEach(function(a){a.style.display=a.getAttribute("data-title").indexOf(q)===-1?"none":""});});}());</script>';
		echo '</div>';
	}

	public static function create_form() {
		self::guard( 'wlfp_create' );
		$id = WLFP_Templates::create( isset( $_GET['tpl'] ) ? sanitize_key( $_GET['tpl'] ) : 'blank' ); // phpcs:ignore
		wp_safe_redirect( self::url( 'wlfp-builder', array( 'form' => $id ) ) );
		exit;
	}

	public static function form_action() {
		$id = isset( $_GET['form'] ) ? (int) $_GET['form'] : 0; // phpcs:ignore
		self::guard( 'wlfp_form_' . $id );
		$do = isset( $_GET['do'] ) ? sanitize_key( $_GET['do'] ) : ''; // phpcs:ignore
		switch ( $do ) {
			case 'trash':
				WLFP_Forms::set_status( $id, 'trash' );
				$m = 'trashed';
				break;
			case 'restore':
				WLFP_Forms::set_status( $id, 'draft' );
				$m = 'restored';
				break;
			case 'delete':
				WLFP_Forms::delete( $id );
				$m = 'deleted';
				break;
			case 'duplicate':
				WLFP_Forms::duplicate( $id );
				$m = 'duplicated';
				break;
			default:
				$m = '';
		}
		wp_safe_redirect( self::url( 'wlfp', array( 'msg' => $m ) ) );
		exit;
	}

	/* ---------------- Builder ---------------- */

	public static function page_builder() {
		echo '<div class="wrap wlfp-admin wlfp-builder-wrap"><div id="wlfp-builder"><p>' . esc_html__( 'Loading builder…', 'weberslink-forms-pro' ) . '</p></div><noscript><p>' . esc_html__( 'The form builder needs JavaScript.', 'weberslink-forms-pro' ) . '</p></noscript></div>';
	}

	public static function ajax_save_form() {
		check_ajax_referer( 'wlfp_builder', 'nonce' );
		if ( ! WLFP_Helpers::can_manage() ) {
			wp_send_json_error( array( 'message' => 'forbidden' ), 403 );
		}
		$payload = isset( $_POST['form'] ) ? json_decode( wp_unslash( $_POST['form'] ), true ) : null; // phpcs:ignore
		if ( ! is_array( $payload ) ) {
			wp_send_json_error( array( 'message' => 'bad payload' ), 400 );
		}
		$id = isset( $payload['id'] ) ? (int) $payload['id'] : 0;
		if ( $id && ! WLFP_Forms::get( $id ) ) {
			$id = 0;
		}
		$id   = WLFP_Forms::save( $id, $payload );
		$form = WLFP_Forms::get( $id );
		wp_send_json_success( array( 'id' => $id, 'form' => $form ) );
	}

	/* ---------------- Entries ---------------- */

	public static function page_entries() {
		if ( ! empty( $_GET['entry'] ) ) { // phpcs:ignore
			return self::page_entry( (int) $_GET['entry'] ); // phpcs:ignore
		}
		$form_id = isset( $_GET['form_id'] ) ? (int) $_GET['form_id'] : 0; // phpcs:ignore
		$status  = isset( $_GET['status'] ) ? sanitize_key( $_GET['status'] ) : 'all'; // phpcs:ignore
		$search  = isset( $_GET['s'] ) ? sanitize_text_field( wp_unslash( $_GET['s'] ) ) : ''; // phpcs:ignore
		$from    = isset( $_GET['from'] ) ? sanitize_text_field( wp_unslash( $_GET['from'] ) ) : ''; // phpcs:ignore
		$to      = isset( $_GET['to'] ) ? sanitize_text_field( wp_unslash( $_GET['to'] ) ) : ''; // phpcs:ignore
		$paged    = max( 1, isset( $_GET['paged'] ) ? (int) $_GET['paged'] : 1 ); // phpcs:ignore
		$stage    = isset( $_GET['stage'] ) ? sanitize_text_field( wp_unslash( $_GET['stage'] ) ) : ''; // phpcs:ignore
		$assigned = isset( $_GET['assigned'] ) ? sanitize_text_field( wp_unslash( $_GET['assigned'] ) ) : ''; // phpcs:ignore
		$starred = 'starred' === $status;
		$q       = WLFP_Entries::query( array( 'form_id' => $form_id, 'status' => $starred ? 'all' : $status, 'starred' => $starred ? 1 : 0, 'search' => $search, 'from' => $from, 'to' => $to, 'page' => $paged, 'per_page' => 20, 'stage' => $stage, 'assigned' => $assigned ) );
		$counts  = WLFP_Entries::counts( $form_id );
		$forms   = WLFP_Forms::all();
		$form    = $form_id ? WLFP_Forms::get( $form_id ) : null;
		$base    = array( 'form_id' => $form_id, 's' => $search, 'from' => $from, 'to' => $to, 'stage' => $stage, 'assigned' => $assigned );

		$exp = $form_id ? '<a class="page-title-action" href="' . esc_url( wp_nonce_url( add_query_arg( array( 'action' => 'wlfp_export_entries', 'form_id' => $form_id, 'status' => $status, 's' => $search, 'from' => $from, 'to' => $to ), admin_url( 'admin-post.php' ) ), 'wlfp_export' ) ) . '">' . esc_html__( 'Export CSV', 'weberslink-forms-pro' ) . '</a> <a class="page-title-action" href="' . esc_url( wp_nonce_url( add_query_arg( array( 'action' => 'wlfp_export_xlsx', 'form_id' => $form_id, 'status' => $status, 's' => $search, 'from' => $from, 'to' => $to, 'stage' => $stage, 'assigned' => $assigned ), admin_url( 'admin-post.php' ) ), 'wlfp_export' ) ) . '">' . esc_html__( 'Export Excel', 'weberslink-forms-pro' ) . '</a>' : '';
		self::header( __( 'Entries', 'weberslink-forms-pro' ), $exp );
		if ( isset( $_GET['msg'] ) ) { // phpcs:ignore
			self::notice( esc_html( sanitize_text_field( wp_unslash( $_GET['msg'] ) ) ) ); // phpcs:ignore
		}
		$tabs = array( 'all' => __( 'All', 'weberslink-forms-pro' ), 'unread' => __( 'Unread', 'weberslink-forms-pro' ) . ' (' . $counts['unread'] . ')', 'read' => __( 'Read', 'weberslink-forms-pro' ), 'starred' => __( 'Starred', 'weberslink-forms-pro' ), 'spam' => __( 'Spam', 'weberslink-forms-pro' ) . ' (' . $counts['spam'] . ')', 'trashed' => __( 'Trash', 'weberslink-forms-pro' ) . ' (' . $counts['trashed'] . ')' );
		echo '<ul class="subsubsub">';
		$i = 0;
		foreach ( $tabs as $k => $l ) {
			echo '<li><a href="' . esc_url( self::url( 'wlfp-entries', array_merge( $base, array( 'status' => $k ) ) ) ) . '"' . ( $status === $k ? ' class="current"' : '' ) . '>' . esc_html( $l ) . '</a>' . ( ++$i < count( $tabs ) ? ' | ' : '' ) . '</li>';
		}
		echo '</ul><form method="get" class="wlfp-filters"><input type="hidden" name="page" value="wlfp-entries" /><input type="hidden" name="status" value="' . esc_attr( $status ) . '" /><select name="form_id"><option value="0">' . esc_html__( 'All forms', 'weberslink-forms-pro' ) . '</option>';
		foreach ( $forms as $f ) {
			echo '<option value="' . (int) $f['id'] . '"' . selected( $form_id, $f['id'], false ) . '>' . esc_html( $f['title'] ) . '</option>';
		}
		echo '</select> ' . self::stage_filters( $stage, $assigned ) . ' <input type="date" name="from" value="' . esc_attr( $from ) . '" /> – <input type="date" name="to" value="' . esc_attr( $to ) . '" /> <input type="search" name="s" value="' . esc_attr( $search ) . '" placeholder="' . esc_attr__( 'Search entries', 'weberslink-forms-pro' ) . '" /> <button class="button">' . esc_html__( 'Filter', 'weberslink-forms-pro' ) . '</button></form>';

		echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '">';
		wp_nonce_field( 'wlfp_entries_bulk' );
		echo '<input type="hidden" name="action" value="wlfp_entries_action" /><input type="hidden" name="return" value="' . esc_attr( add_query_arg( array_merge( $base, array( 'status' => $status, 'paged' => $paged ) ), admin_url( 'admin.php?page=wlfp-entries' ) ) ) . '" />';
		echo '<div class="tablenav top"><select name="do"><option value="">' . esc_html__( 'Bulk actions', 'weberslink-forms-pro' ) . '</option><option value="read">' . esc_html__( 'Mark as read', 'weberslink-forms-pro' ) . '</option><option value="unread">' . esc_html__( 'Mark as unread', 'weberslink-forms-pro' ) . '</option><option value="star">' . esc_html__( 'Star', 'weberslink-forms-pro' ) . '</option><option value="unstar">' . esc_html__( 'Unstar', 'weberslink-forms-pro' ) . '</option><option value="spam">' . esc_html__( 'Mark as spam', 'weberslink-forms-pro' ) . '</option><option value="notspam">' . esc_html__( 'Not spam', 'weberslink-forms-pro' ) . '</option><option value="trash">' . esc_html__( 'Move to trash', 'weberslink-forms-pro' ) . '</option><option value="restore">' . esc_html__( 'Restore', 'weberslink-forms-pro' ) . '</option>' . self::stage_bulk_options() . '<option value="delete">' . esc_html__( 'Delete permanently', 'weberslink-forms-pro' ) . '</option></select> <button class="button">' . esc_html__( 'Apply', 'weberslink-forms-pro' ) . '</button></div>';
		echo '<table class="wp-list-table widefat fixed striped wlfp-entries"><thead><tr><td class="check-column"><input type="checkbox" onclick="document.querySelectorAll(\'.wlfp-cb\').forEach(function(c){c.checked=this.checked}.bind(this))" /></td><th style="width:70px">#</th><th>' . esc_html__( 'Details', 'weberslink-forms-pro' ) . '</th><th>' . esc_html__( 'Form', 'weberslink-forms-pro' ) . '</th><th style="width:140px">' . esc_html__( 'Stage', 'weberslink-forms-pro' ) . '</th><th style="width:120px">' . esc_html__( 'Payment', 'weberslink-forms-pro' ) . '</th><th style="width:150px">' . esc_html__( 'Date', 'weberslink-forms-pro' ) . '</th></tr></thead><tbody>';
		$cache = array();
		if ( ! $q['rows'] ) {
			echo '<tr><td colspan="7">' . esc_html__( 'No entries found.', 'weberslink-forms-pro' ) . '</td></tr>';
		}
		foreach ( $q['rows'] as $e ) {
			if ( ! isset( $cache[ $e['form_id'] ] ) ) {
				$cache[ $e['form_id'] ] = WLFP_Forms::get( $e['form_id'] );
			}
			$f   = $cache[ $e['form_id'] ];
			$sum = array();
			if ( $f ) {
				foreach ( WLFP_Forms::value_fields( $f ) as $fld ) {
					if ( count( $sum ) >= 3 ) {
						break;
					}
					if ( isset( $e['data'][ $fld['name'] ] ) && ! WLFP_Fields::is_empty( $e['data'][ $fld['name'] ] ) && ! in_array( $fld['type'], array( 'signature', 'password', 'file', 'image' ), true ) ) {
						$sum[] = '<span class="wlfp-k">' . esc_html( $fld['label'] ) . ':</span> ' . esc_html( mb_strimwidth( WLFP_Fields::format_value( $fld, $e['data'][ $fld['name'] ], false ), 0, 60, '…' ) );
					}
				}
			}
			$link = self::url( 'wlfp-entries', array( 'entry' => $e['id'] ) );
			echo '<tr class="' . ( 'unread' === $e['status'] ? 'wlfp-unread' : '' ) . '"><th class="check-column"><input class="wlfp-cb" type="checkbox" name="ids[]" value="' . (int) $e['id'] . '" /></th><td><a href="' . esc_url( $link ) . '"><strong>#' . (int) $e['serial'] . '</strong></a>' . ( $e['starred'] ? ' <span class="wlfp-star">★</span>' : '' ) . '</td><td><a href="' . esc_url( $link ) . '">' . implode( ' · ', $sum ) . '</a></td><td>' . esc_html( $f ? $f['title'] : '#' . $e['form_id'] ) . '</td><td>' . self::stage_cell( $e ) . '</td><td>' . ( $e['payment_total'] > 0 ? esc_html( WLFP_Helpers::money( $e['payment_total'], $e['currency'] ) ) . '<br><span class="wlfp-pill wlfp-pill-' . esc_attr( $e['payment_status'] ) . '">' . esc_html( $e['payment_status'] ) . '</span>' : '—' ) . '</td><td>' . esc_html( get_date_from_gmt( $e['created_at'], 'Y-m-d H:i' ) ) . '</td></tr>'; // phpcs:ignore
		}
		echo '</tbody></table></form>';
		$pages = (int) ceil( $q['total'] / 20 );
		if ( $pages > 1 ) {
			echo '<div class="tablenav bottom"><div class="tablenav-pages">' . wp_kses_post( paginate_links( array( 'base' => add_query_arg( 'paged', '%#%' ), 'format' => '', 'current' => $paged, 'total' => $pages ) ) ) . '</div></div>';
		}
		echo '</div>';
	}

	public static function entries_action() {
		self::guard( 'wlfp_entries_bulk' );
		$ids = isset( $_POST['ids'] ) ? array_map( 'intval', (array) $_POST['ids'] ) : array(); // phpcs:ignore
		$do  = isset( $_POST['do'] ) ? sanitize_key( $_POST['do'] ) : ''; // phpcs:ignore
		$ret = isset( $_POST['return'] ) ? esc_url_raw( wp_unslash( $_POST['return'] ) ) : self::url( 'wlfp-entries' ); // phpcs:ignore
		foreach ( $ids as $id ) {
			if ( 0 === strpos( $do, 'stage_' ) ) {
				$st = WLFP_Helpers::stages();
				$ix = (int) substr( $do, 6 );
				if ( isset( $st[ $ix ] ) ) {
					WLFP_Entries::update( $id, array( 'stage' => $st[ $ix ] ) );
				}
				continue;
			}
			if ( 'assign_me' === $do || 'unassign' === $do ) {
				WLFP_Entries::update( $id, array( 'assigned_to' => 'assign_me' === $do ? get_current_user_id() : 0 ) );
				continue;
			}
			switch ( $do ) {
				case 'read':
				case 'unread':
					WLFP_Entries::update( $id, array( 'status' => $do ) );
					break;
				case 'star':
					WLFP_Entries::update( $id, array( 'starred' => 1 ) );
					break;
				case 'unstar':
					WLFP_Entries::update( $id, array( 'starred' => 0 ) );
					break;
				case 'spam':
					WLFP_Entries::update( $id, array( 'status' => 'spam' ) );
					break;
				case 'notspam':
				case 'restore':
					WLFP_Entries::update( $id, array( 'status' => 'read' ) );
					break;
				case 'trash':
					WLFP_Entries::update( $id, array( 'status' => 'trashed' ) );
					break;
				case 'delete':
					WLFP_Entries::delete( $id );
					break;
			}
		}
		wp_safe_redirect( add_query_arg( 'msg', rawurlencode( $ids ? __( 'Done.', 'weberslink-forms-pro' ) : __( 'Nothing selected.', 'weberslink-forms-pro' ) ), $ret ) );
		exit;
	}

	private static function page_entry( $id ) {
		$e    = WLFP_Entries::get( $id );
		$form = $e ? WLFP_Forms::get( $e['form_id'] ) : null;
		if ( ! $e || ! $form ) {
			self::header( __( 'Entry', 'weberslink-forms-pro' ) );
			echo '<p>' . esc_html__( 'Entry not found.', 'weberslink-forms-pro' ) . '</p></div>';
			return;
		}
		if ( 'unread' === $e['status'] ) {
			WLFP_Entries::update( $id, array( 'status' => 'read' ) );
			$e['status'] = 'read';
		}
		$edit = ! empty( $_GET['edit'] ); // phpcs:ignore
		self::header( sprintf( /* translators: 1: form title 2: serial */ __( '%1$s — entry #%2$d', 'weberslink-forms-pro' ), $form['title'], $e['serial'] ), '<a class="page-title-action" href="' . esc_url( self::url( 'wlfp-entries', array( 'form_id' => $form['id'] ) ) ) . '">← ' . esc_html__( 'All entries', 'weberslink-forms-pro' ) . '</a>' );
		if ( isset( $_GET['msg'] ) ) { // phpcs:ignore
			self::notice( esc_html( sanitize_text_field( wp_unslash( $_GET['msg'] ) ) ) ); // phpcs:ignore
		}
		echo '<div class="wlfp-entry-grid"><div class="wlfp-entry-main">';
		if ( $edit ) {
			echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '">';
			wp_nonce_field( 'wlfp_entry_save_' . $id );
			echo '<input type="hidden" name="action" value="wlfp_entry_save" /><input type="hidden" name="entry" value="' . (int) $id . '" />';
		}
		echo '<table class="widefat striped wlfp-data"><tbody>';
		foreach ( WLFP_Forms::value_fields( $form ) as $f ) {
			$v = isset( $e['data'][ $f['name'] ] ) ? $e['data'][ $f['name'] ] : '';
			if ( WLFP_Fields::is_empty( $v ) && ! $edit ) {
				continue;
			}
			echo '<tr><th style="width:30%">' . esc_html( $f['label'] ? $f['label'] : $f['name'] ) . '</th><td>';
			$editable = $edit && ! is_array( $v ) && ! in_array( $f['type'], array( 'signature', 'password' ), true );
			if ( $editable ) {
				echo '<textarea name="data[' . esc_attr( $f['name'] ) . ']" rows="' . ( 'textarea' === $f['type'] ? 4 : 1 ) . '" class="large-text">' . esc_textarea( (string) $v ) . '</textarea>';
			} else {
				echo WLFP_Fields::format_value( $f, $v, true ); // phpcs:ignore
			}
			echo '</td></tr>';
		}
		echo '</tbody></table>';
		if ( $edit ) {
			echo '<p><button class="button button-primary">' . esc_html__( 'Save changes', 'weberslink-forms-pro' ) . '</button> <a class="button" href="' . esc_url( self::url( 'wlfp-entries', array( 'entry' => $id ) ) ) . '">' . esc_html__( 'Cancel', 'weberslink-forms-pro' ) . '</a></p></form>';
		}
		if ( ! empty( $e['data']['_payment']['lines'] ) ) {
			echo '<h3>' . esc_html__( 'Order', 'weberslink-forms-pro' ) . '</h3><table class="widefat striped"><tbody>';
			foreach ( $e['data']['_payment']['lines'] as $l ) {
				echo '<tr><td>' . esc_html( $l['label'] ) . ' × ' . (int) $l['qty'] . '</td><td style="text-align:end">' . esc_html( WLFP_Helpers::money( $l['amount'], $e['currency'] ) ) . '</td></tr>';
			}
			$p = $e['data']['_payment'];
			if ( $p['discount'] ) {
				echo '<tr><td>' . esc_html__( 'Discount', 'weberslink-forms-pro' ) . ( $p['coupon'] ? ' (' . esc_html( $p['coupon'] ) . ')' : '' ) . '</td><td style="text-align:end">-' . esc_html( WLFP_Helpers::money( $p['discount'], $e['currency'] ) ) . '</td></tr>';
			}
			if ( $p['tax'] ) {
				echo '<tr><td>' . esc_html__( 'Tax', 'weberslink-forms-pro' ) . '</td><td style="text-align:end">' . esc_html( WLFP_Helpers::money( $p['tax'], $e['currency'] ) ) . '</td></tr>';
			}
			echo '<tr><th>' . esc_html__( 'Total', 'weberslink-forms-pro' ) . '</th><th style="text-align:end">' . esc_html( WLFP_Helpers::money( $p['total'], $e['currency'] ) ) . '</th></tr></tbody></table>';
		}
		if ( ! empty( $e['data']['_quiz'] ) ) {
			$q = $e['data']['_quiz'];
			echo '<h3>' . esc_html__( 'Quiz result', 'weberslink-forms-pro' ) . '</h3><p><strong>' . esc_html( $q['score'] . ' / ' . $q['max'] . ' (' . $q['percent'] . '%)' ) . '</strong> — <span class="wlfp-pill wlfp-pill-' . ( ! empty( $q['passed'] ) ? 'paid' : 'failed' ) . '">' . esc_html( ! empty( $q['passed'] ) ? __( 'Passed', 'weberslink-forms-pro' ) : __( 'Not passed', 'weberslink-forms-pro' ) ) . '</span></p>';
		}
		$to_guess = '';
		foreach ( WLFP_Forms::value_fields( $form ) as $ef ) {
			if ( 'email' === $ef['type'] && ! empty( $e['data'][ $ef['name'] ] ) ) {
				$to_guess = $e['data'][ $ef['name'] ];
				break;
			}
		}
		if ( $to_guess ) {
			echo '<h3>' . esc_html__( 'Reply by email', 'weberslink-forms-pro' ) . '</h3><form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '">';
			wp_nonce_field( 'wlfp_entry_email_' . $id );
			echo '<input type="hidden" name="action" value="wlfp_entry_email" /><input type="hidden" name="entry" value="' . (int) $id . '" /><p><input type="email" name="to" class="large-text" value="' . esc_attr( $to_guess ) . '" required /></p><p><input type="text" name="subject" class="large-text" placeholder="' . esc_attr__( 'Subject', 'weberslink-forms-pro' ) . '" value="' . esc_attr( 'Re: ' . $form['title'] ) . '" required /></p><p><textarea name="message" rows="5" class="large-text" required></textarea></p><p><button class="button">' . esc_html__( 'Send email', 'weberslink-forms-pro' ) . '</button></p></form>';
		}
		echo '<h3>' . esc_html__( 'Notes', 'weberslink-forms-pro' ) . '</h3><form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '">';
		wp_nonce_field( 'wlfp_entry_note_' . $id );
		echo '<input type="hidden" name="action" value="wlfp_entry_note" /><input type="hidden" name="entry" value="' . (int) $id . '" /><textarea name="note" rows="3" class="large-text" required></textarea><p><button class="button">' . esc_html__( 'Add note', 'weberslink-forms-pro' ) . '</button></p></form>';
		foreach ( WLFP_Entries::notes( $id ) as $n ) {
			$u = get_userdata( (int) $n['user_id'] );
			echo '<div class="wlfp-note"><strong>' . esc_html( $u ? $u->display_name : '—' ) . '</strong> <span class="description">' . esc_html( get_date_from_gmt( $n['created_at'], 'Y-m-d H:i' ) ) . '</span><br>' . nl2br( esc_html( $n['note'] ) ) . '</div>';
		}
		echo '</div><div class="wlfp-entry-side">';
		self::workflow_box( $e );
		$refno = WLFP_Merge::reference( $form, $e );
		echo '<div class="postbox"><h2 class="hndle">' . esc_html__( 'Details', 'weberslink-forms-pro' ) . '</h2><div class="inside">' . ( $refno ? '<p><strong>' . esc_html__( 'Reference', 'weberslink-forms-pro' ) . ':</strong> <code>' . esc_html( $refno ) . '</code></p>' : '' ) . '<p><strong>' . esc_html__( 'Submitted', 'weberslink-forms-pro' ) . ':</strong><br>' . esc_html( get_date_from_gmt( $e['created_at'], get_option( 'date_format' ) . ' ' . get_option( 'time_format' ) ) ) . '</p>';
		if ( $e['ip'] ) {
			echo '<p><strong>IP:</strong> ' . esc_html( $e['ip'] ) . '</p>';
		}
		if ( $e['user_id'] ) {
			$u = get_userdata( (int) $e['user_id'] );
			echo '<p><strong>' . esc_html__( 'User', 'weberslink-forms-pro' ) . ':</strong> ' . ( $u ? '<a href="' . esc_url( get_edit_user_link( $u->ID ) ) . '">' . esc_html( $u->display_name ) . '</a>' : '#' . (int) $e['user_id'] ) . '</p>';
		}
		if ( $e['source_url'] ) {
			echo '<p><strong>' . esc_html__( 'Page', 'weberslink-forms-pro' ) . ':</strong><br><a href="' . esc_url( $e['source_url'] ) . '" target="_blank" rel="noopener">' . esc_html( mb_strimwidth( $e['source_url'], 0, 60, '…' ) ) . '</a></p>';
		}
		if ( $e['user_agent'] ) {
			echo '<p class="description">' . esc_html( $e['user_agent'] ) . '</p>';
		}
		if ( $e['payment_total'] > 0 ) {
			echo '<p><strong>' . esc_html__( 'Payment', 'weberslink-forms-pro' ) . ':</strong> ' . esc_html( WLFP_Helpers::money( $e['payment_total'], $e['currency'] ) ) . ' <span class="wlfp-pill wlfp-pill-' . esc_attr( $e['payment_status'] ) . '">' . esc_html( $e['payment_status'] ) . '</span>' . ( $e['payment_method'] ? '<br>' . esc_html( $e['payment_method'] ) : '' ) . ( $e['transaction_id'] ? '<br><code>' . esc_html( $e['transaction_id'] ) . '</code>' : '' ) . '</p>';
		}
		echo '<p>';
		$a = function ( $do, $label, $extra = '' ) use ( $id ) {
			return '<a class="button' . $extra . '" href="' . esc_url( wp_nonce_url( admin_url( 'admin-post.php?action=wlfp_entries_action_single&do=' . $do . '&entry=' . $id ), 'wlfp_single_' . $id ) ) . '">' . esc_html( $label ) . '</a> ';
		};
		echo '<a class="button" href="' . esc_url( self::url( 'wlfp-entries', array( 'entry' => $id, 'edit' => 1 ) ) ) . '">' . esc_html__( 'Edit', 'weberslink-forms-pro' ) . '</a> ';
		echo '<a class="button" href="' . esc_url( wp_nonce_url( admin_url( 'admin-post.php?action=wlfp_entry_pdf&entry=' . $id ), 'wlfp_pdf_' . $id ) ) . '">' . esc_html__( 'Download PDF', 'weberslink-forms-pro' ) . '</a> ';
		echo '<a class="button" target="_blank" href="' . esc_url( wp_nonce_url( admin_url( 'admin-post.php?action=wlfp_print_entry&entry=' . $id ), 'wlfp_print' ) ) . '">' . esc_html__( 'Print view', 'weberslink-forms-pro' ) . '</a> ';
		echo '<a class="button" href="' . esc_url( wp_nonce_url( admin_url( 'admin-post.php?action=wlfp_entry_resend&entry=' . $id ), 'wlfp_resend_' . $id ) ) . '">' . esc_html__( 'Resend emails', 'weberslink-forms-pro' ) . '</a> ';
		echo '<a class="button" href="' . esc_url( wp_nonce_url( admin_url( 'admin-post.php?action=wlfp_entry_feeds&entry=' . $id ), 'wlfp_feeds_' . $id ) ) . '">' . esc_html__( 'Run integrations again', 'weberslink-forms-pro' ) . '</a> ';
		echo ( $e['starred'] ? $a( 'unstar', __( 'Unstar', 'weberslink-forms-pro' ) ) : $a( 'star', __( '★ Star', 'weberslink-forms-pro' ) ) ) . ( 'spam' === $e['status'] ? $a( 'notspam', __( 'Not spam', 'weberslink-forms-pro' ) ) : $a( 'spam', __( 'Spam', 'weberslink-forms-pro' ) ) ) . $a( 'trash', __( 'Trash', 'weberslink-forms-pro' ) ) . $a( 'delete', __( 'Delete', 'weberslink-forms-pro' ), ' button-link-delete' ); // phpcs:ignore
		echo '</p></div></div>';
		$logs = WLFP_Entries::logs( $id );
		if ( $logs ) {
			echo '<div class="postbox"><h2 class="hndle">' . esc_html__( 'Activity log', 'weberslink-forms-pro' ) . '</h2><div class="inside">';
			foreach ( $logs as $l ) {
				echo '<p class="wlfp-log wlfp-log-' . esc_attr( $l['status'] ) . '"><strong>' . esc_html( $l['title'] ) . '</strong><br><span class="description">' . esc_html( $l['component'] . ' · ' . get_date_from_gmt( $l['created_at'], 'H:i:s' ) ) . '</span>' . ( $l['message'] ? '<br><small>' . esc_html( mb_strimwidth( $l['message'], 0, 200, '…' ) ) . '</small>' : '' ) . '</p>';
			}
			echo '</div></div>';
		}
		echo '</div></div></div>';
	}

	public static function entry_save() {
		$id = isset( $_POST['entry'] ) ? (int) $_POST['entry'] : 0; // phpcs:ignore
		self::guard( 'wlfp_entry_save_' . $id );
		$e = WLFP_Entries::get( $id );
		if ( $e && isset( $_POST['data'] ) && is_array( $_POST['data'] ) ) { // phpcs:ignore
			$form = WLFP_Forms::get( $e['form_id'] );
			$names = $form ? wp_list_pluck( WLFP_Forms::value_fields( $form ), 'name' ) : array();
			foreach ( wp_unslash( $_POST['data'] ) as $k => $v ) { // phpcs:ignore
				$k = sanitize_key( $k );
				if ( in_array( $k, $names, true ) && is_scalar( $v ) && ! is_array( $e['data'][ $k ] ?? '' ) ) {
					$e['data'][ $k ] = sanitize_textarea_field( $v );
				}
			}
			WLFP_Entries::update_data( $id, $e['data'] );
			WLFP_Entries::add_note( $id, __( 'Entry edited.', 'weberslink-forms-pro' ) );
		}
		wp_safe_redirect( self::url( 'wlfp-entries', array( 'entry' => $id, 'msg' => rawurlencode( __( 'Entry updated.', 'weberslink-forms-pro' ) ) ) ) );
		exit;
	}

	public static function entry_note() {
		$id = isset( $_POST['entry'] ) ? (int) $_POST['entry'] : 0; // phpcs:ignore
		self::guard( 'wlfp_entry_note_' . $id );
		if ( ! empty( $_POST['note'] ) ) { // phpcs:ignore
			WLFP_Entries::add_note( $id, wp_unslash( $_POST['note'] ) ); // phpcs:ignore
		}
		wp_safe_redirect( self::url( 'wlfp-entries', array( 'entry' => $id ) ) );
		exit;
	}

	public static function entry_resend() {
		$id = isset( $_GET['entry'] ) ? (int) $_GET['entry'] : 0; // phpcs:ignore
		self::guard( 'wlfp_resend_' . $id );
		$e = WLFP_Entries::get( $id );
		$f = $e ? WLFP_Forms::get( $e['form_id'] ) : null;
		if ( $e && $f ) {
			WLFP_Notifications::send_all( $f, $e );
		}
		wp_safe_redirect( self::url( 'wlfp-entries', array( 'entry' => $id, 'msg' => rawurlencode( __( 'Notifications re-sent.', 'weberslink-forms-pro' ) ) ) ) );
		exit;
	}

	public static function entry_feeds() {
		$id = isset( $_GET['entry'] ) ? (int) $_GET['entry'] : 0; // phpcs:ignore
		self::guard( 'wlfp_feeds_' . $id );
		$e = WLFP_Entries::get( $id );
		$f = $e ? WLFP_Forms::get( $e['form_id'] ) : null;
		if ( $e && $f ) {
			WLFP_Integrations::run( $f, $e );
		}
		wp_safe_redirect( self::url( 'wlfp-entries', array( 'entry' => $id, 'msg' => rawurlencode( __( 'Integrations ran again. See the activity log.', 'weberslink-forms-pro' ) ) ) ) );
		exit;
	}

	/* ---------------- Workflow (stages + assignment) ---------------- */

	public static function stage_index( $label ) {
		$i = array_search( $label, WLFP_Helpers::stages(), true );
		return false === $i ? 0 : (int) $i;
	}

	public static function stage_cell( $e ) {
		$label = WLFP_Helpers::entry_stage( $e );
		$out   = '<span class="wlfp-stage wlfp-stage-' . ( self::stage_index( $label ) % 8 ) . '">' . esc_html( $label ) . '</span>';
		if ( ! empty( $e['assigned_to'] ) ) {
			$u    = get_userdata( (int) $e['assigned_to'] );
			$out .= '<br><span class="description">→ ' . esc_html( $u ? $u->display_name : '#' . (int) $e['assigned_to'] ) . '</span>';
		}
		return $out;
	}

	public static function stage_filters( $stage, $assigned ) {
		$o = '<select name="stage"><option value="">' . esc_html__( 'Any stage', 'weberslink-forms-pro' ) . '</option>';
		foreach ( WLFP_Helpers::stages() as $st ) {
			$o .= '<option value="' . esc_attr( $st ) . '"' . selected( $stage, $st, false ) . '>' . esc_html( $st ) . '</option>';
		}
		$o .= '</select> <select name="assigned"><option value="">' . esc_html__( 'Anyone', 'weberslink-forms-pro' ) . '</option><option value="me"' . selected( $assigned, 'me', false ) . '>' . esc_html__( 'Assigned to me', 'weberslink-forms-pro' ) . '</option><option value="none"' . selected( $assigned, 'none', false ) . '>' . esc_html__( 'Unassigned', 'weberslink-forms-pro' ) . '</option></select>';
		return $o;
	}

	public static function stage_bulk_options() {
		$o = '<optgroup label="' . esc_attr__( 'Set stage', 'weberslink-forms-pro' ) . '">';
		foreach ( WLFP_Helpers::stages() as $i => $st ) {
			$o .= '<option value="stage_' . (int) $i . '">' . esc_html( $st ) . '</option>';
		}
		return $o . '</optgroup><option value="assign_me">' . esc_html__( 'Assign to me', 'weberslink-forms-pro' ) . '</option><option value="unassign">' . esc_html__( 'Unassign', 'weberslink-forms-pro' ) . '</option>';
	}

	/** Users who may be assigned entries: anyone allowed to manage forms. */
	public static function assignable_users() {
		$out = array();
		foreach ( get_users( array( 'role__in' => array( 'administrator', 'editor', 'shop_manager', 'author' ), 'number' => 200, 'orderby' => 'display_name' ) ) as $u ) {
			if ( user_can( $u, WLFP_Helpers::cap() ) ) {
				$out[ $u->ID ] = $u->display_name;
			}
		}
		return $out;
	}

	private static function workflow_box( $e ) {
		$id = (int) $e['id'];
		echo '<div class="postbox"><h2 class="hndle">' . esc_html__( 'Workflow', 'weberslink-forms-pro' ) . '</h2><div class="inside"><form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '">';
		wp_nonce_field( 'wlfp_entry_workflow_' . $id );
		echo '<input type="hidden" name="action" value="wlfp_entry_workflow" /><input type="hidden" name="entry" value="' . $id . '" />';
		echo '<p><label><strong>' . esc_html__( 'Stage', 'weberslink-forms-pro' ) . '</strong><br><select name="stage" style="width:100%">';
		$cur = WLFP_Helpers::entry_stage( $e );
		foreach ( WLFP_Helpers::stages() as $st ) {
			echo '<option value="' . esc_attr( $st ) . '"' . selected( $cur, $st, false ) . '>' . esc_html( $st ) . '</option>';
		}
		echo '</select></label></p><p><label><strong>' . esc_html__( 'Assigned to', 'weberslink-forms-pro' ) . '</strong><br><select name="assigned_to" style="width:100%"><option value="0">' . esc_html__( 'Unassigned', 'weberslink-forms-pro' ) . '</option>';
		foreach ( self::assignable_users() as $uid => $name ) {
			echo '<option value="' . (int) $uid . '"' . selected( (int) $e['assigned_to'], $uid, false ) . '>' . esc_html( $name ) . '</option>';
		}
		echo '</select></label></p><p><button class="button button-primary">' . esc_html__( 'Update', 'weberslink-forms-pro' ) . '</button></p></form></div></div>';
	}

	public static function entry_workflow() {
		$id = isset( $_POST['entry'] ) ? (int) $_POST['entry'] : 0; // phpcs:ignore
		self::guard( 'wlfp_entry_workflow_' . $id );
		$e = WLFP_Entries::get( $id );
		if ( $e ) {
			$old_stage = WLFP_Helpers::entry_stage( $e );
			$new_stage = isset( $_POST['stage'] ) ? sanitize_text_field( wp_unslash( $_POST['stage'] ) ) : $old_stage; // phpcs:ignore
			if ( ! in_array( $new_stage, WLFP_Helpers::stages(), true ) ) {
				$new_stage = $old_stage;
			}
			$new_to = isset( $_POST['assigned_to'] ) ? (int) $_POST['assigned_to'] : 0; // phpcs:ignore
			if ( $new_to && ( ! get_userdata( $new_to ) || ! user_can( $new_to, WLFP_Helpers::cap() ) ) ) {
				$new_to = 0;
			}
			WLFP_Entries::update( $id, array( 'stage' => $new_stage, 'assigned_to' => $new_to ) );
			if ( $new_stage !== $old_stage ) {
				WLFP_Entries::add_note( $id, sprintf( /* translators: 1: old stage 2: new stage */ __( 'Stage changed: %1$s → %2$s', 'weberslink-forms-pro' ), $old_stage, $new_stage ) );
				do_action( 'wlfp_entry_stage_changed', $e, $old_stage, $new_stage );
			}
			if ( $new_to !== (int) $e['assigned_to'] ) {
				$u = $new_to ? get_userdata( $new_to ) : null;
				WLFP_Entries::add_note( $id, $u ? sprintf( /* translators: %s: user */ __( 'Assigned to %s', 'weberslink-forms-pro' ), $u->display_name ) : __( 'Unassigned', 'weberslink-forms-pro' ) );
				if ( $u && $new_to !== get_current_user_id() && is_email( $u->user_email ) ) {
					$form = WLFP_Forms::get( $e['form_id'] );
					$ref  = $form ? WLFP_Merge::reference( $form, $e ) : '';
					$body = '<p>' . esc_html( sprintf( /* translators: 1: user 2: form */ __( '%1$s assigned a submission of "%2$s" to you.', 'weberslink-forms-pro' ), wp_get_current_user()->display_name, $form ? $form['title'] : '' ) ) . '</p><p><a href="' . esc_url( admin_url( 'admin.php?page=wlfp-entries&entry=' . $id ) ) . '">' . esc_html__( 'Open the entry', 'weberslink-forms-pro' ) . '</a></p>';
					wp_mail( $u->user_email, sprintf( /* translators: 1: site 2: reference */ __( '[%1$s] Entry %2$s assigned to you', 'weberslink-forms-pro' ), wp_specialchars_decode( get_bloginfo( 'name' ), ENT_QUOTES ), $ref ? $ref : '#' . $e['serial'] ), WLFP_Notifications::wrap_html( $body ), array( 'Content-Type: text/html; charset=UTF-8' ) );
				}
			}
		}
		wp_safe_redirect( self::url( 'wlfp-entries', array( 'entry' => $id, 'msg' => rawurlencode( __( 'Workflow updated.', 'weberslink-forms-pro' ) ) ) ) );
		exit;
	}

	public static function entry_pdf() {
		$id = isset( $_GET['entry'] ) ? (int) $_GET['entry'] : 0; // phpcs:ignore
		self::guard( 'wlfp_pdf_' . $id );
		$e = WLFP_Entries::get( $id );
		$f = $e ? WLFP_Forms::get( $e['form_id'] ) : null;
		if ( ! $e || ! $f ) {
			wp_die( esc_html__( 'Entry not found.', 'weberslink-forms-pro' ) );
		}
		list( $name, $bytes ) = WLFP_Pdf::entry( $f, $e );
		nocache_headers();
		header( 'Content-Type: application/pdf' );
		header( 'Content-Disposition: attachment; filename="' . $name . '"' );
		header( 'Content-Length: ' . strlen( $bytes ) );
		echo $bytes; // phpcs:ignore
		exit;
	}

	public static function ajax_revisions() {
		check_ajax_referer( 'wlfp_builder', 'nonce' );
		if ( ! WLFP_Helpers::can_manage() ) {
			wp_send_json_error( array(), 403 );
		}
		$out = array();
		foreach ( WLFP_Forms::revisions( isset( $_POST['form_id'] ) ? (int) $_POST['form_id'] : 0 ) as $r ) { // phpcs:ignore
			$u     = get_userdata( (int) $r['user_id'] );
			$out[] = array( 'id' => (int) $r['id'], 'title' => $r['title'], 'when' => get_date_from_gmt( $r['created_at'], 'Y-m-d H:i' ), 'user' => $u ? $u->display_name : '—' );
		}
		wp_send_json_success( $out );
	}

	public static function ajax_revision() {
		check_ajax_referer( 'wlfp_builder', 'nonce' );
		if ( ! WLFP_Helpers::can_manage() ) {
			wp_send_json_error( array(), 403 );
		}
		$r = WLFP_Forms::revision( isset( $_POST['revision'] ) ? (int) $_POST['revision'] : 0, isset( $_POST['form_id'] ) ? (int) $_POST['form_id'] : 0 ); // phpcs:ignore
		$r ? wp_send_json_success( $r ) : wp_send_json_error( array(), 404 );
	}

	public static function entry_email() {
		$id = isset( $_POST['entry'] ) ? (int) $_POST['entry'] : 0; // phpcs:ignore
		self::guard( 'wlfp_entry_email_' . $id );
		$to  = isset( $_POST['to'] ) ? sanitize_email( wp_unslash( $_POST['to'] ) ) : ''; // phpcs:ignore
		$sub = isset( $_POST['subject'] ) ? sanitize_text_field( wp_unslash( $_POST['subject'] ) ) : ''; // phpcs:ignore
		$msg = isset( $_POST['message'] ) ? sanitize_textarea_field( wp_unslash( $_POST['message'] ) ) : ''; // phpcs:ignore
		$e   = WLFP_Entries::get( $id );
		$ok  = false;
		if ( $e && is_email( $to ) && $sub && $msg ) {
			$s       = WLFP_Helpers::settings();
			$headers = array( 'Content-Type: text/plain; charset=UTF-8' );
			if ( $s['from_email'] && is_email( $s['from_email'] ) ) {
				$headers[] = 'From: ' . wp_strip_all_tags( str_replace( array( "\r", "\n", '<', '>' ), '', $s['from_name'] ? $s['from_name'] : get_bloginfo( 'name' ) ) ) . ' <' . $s['from_email'] . '>';
			}
			$ok = wp_mail( $to, str_replace( array( "\r", "\n" ), ' ', $sub ), $msg, $headers );
			WLFP_Entries::add_note( $id, ( $ok ? __( 'Email sent to ', 'weberslink-forms-pro' ) : __( 'Email FAILED to ', 'weberslink-forms-pro' ) ) . $to . ': ' . $sub );
			WLFP_Install::log( $e['form_id'], $id, 'email', $ok ? 'success' : 'failed', 'Manual reply to ' . $to );
		}
		wp_safe_redirect( self::url( 'wlfp-entries', array( 'entry' => $id, 'msg' => rawurlencode( $ok ? __( 'Email sent.', 'weberslink-forms-pro' ) : __( 'Email could not be sent.', 'weberslink-forms-pro' ) ) ) ) );
		exit;
	}

	/* ---------------- Reports ---------------- */

	public static function page_reports() {
		global $wpdb;
		$days    = isset( $_GET['days'] ) ? max( 7, min( 365, (int) $_GET['days'] ) ) : 30; // phpcs:ignore
		$form_id = isset( $_GET['form_id'] ) ? (int) $_GET['form_id'] : 0; // phpcs:ignore
		$since   = gmdate( 'Y-m-d 00:00:00', time() - $days * DAY_IN_SECONDS );
		$w       = $form_id ? $wpdb->prepare( ' AND form_id=%d', $form_id ) : '';
		$rows    = $wpdb->get_results( $wpdb->prepare( "SELECT DATE(created_at) d, COUNT(*) c, SUM(CASE WHEN payment_status='paid' THEN payment_total ELSE 0 END) rev FROM {$wpdb->prefix}wlfp_entries WHERE created_at >= %s AND status NOT IN ('spam','trashed') $w GROUP BY DATE(created_at)", $since ), OBJECT_K ); // phpcs:ignore
		$vrows   = $wpdb->get_var( $wpdb->prepare( "SELECT COALESCE(SUM(views),0) FROM {$wpdb->prefix}wlfp_views WHERE day >= %s $w", gmdate( 'Y-m-d', time() - $days * DAY_IN_SECONDS ) ) ); // phpcs:ignore
		$total   = 0;
		$rev     = 0;
		$series  = array();
		for ( $i = $days - 1; $i >= 0; $i-- ) {
			$d  = gmdate( 'Y-m-d', time() - $i * DAY_IN_SECONDS );
			$c  = isset( $rows[ $d ] ) ? (int) $rows[ $d ]->c : 0;
			$total += $c;
			$rev   += isset( $rows[ $d ] ) ? (float) $rows[ $d ]->rev : 0;
			$series[ $d ] = $c;
		}
		$max = max( 1, max( $series ) );
		self::header( __( 'Reports', 'weberslink-forms-pro' ) );
		echo '<form method="get" class="wlfp-filters"><input type="hidden" name="page" value="wlfp-reports" /><select name="form_id"><option value="0">' . esc_html__( 'All forms', 'weberslink-forms-pro' ) . '</option>';
		foreach ( WLFP_Forms::all() as $f ) {
			echo '<option value="' . (int) $f['id'] . '"' . selected( $form_id, $f['id'], false ) . '>' . esc_html( $f['title'] ) . '</option>';
		}
		echo '</select> <select name="days">';
		foreach ( array( 7, 30, 90, 365 ) as $d ) {
			echo '<option value="' . (int) $d . '"' . selected( $days, $d, false ) . '>' . esc_html( sprintf( /* translators: %d: days */ __( 'Last %d days', 'weberslink-forms-pro' ), $d ) ) . '</option>';
		}
		echo '</select> <button class="button">' . esc_html__( 'Apply', 'weberslink-forms-pro' ) . '</button></form>';
		echo '<div class="wlfp-cards"><div class="wlfp-card"><span>' . esc_html__( 'Views', 'weberslink-forms-pro' ) . '</span><strong>' . (int) $vrows . '</strong></div><div class="wlfp-card"><span>' . esc_html__( 'Entries', 'weberslink-forms-pro' ) . '</span><strong>' . (int) $total . '</strong></div><div class="wlfp-card"><span>' . esc_html__( 'Conversion', 'weberslink-forms-pro' ) . '</span><strong>' . ( $vrows ? esc_html( round( $total / $vrows * 100, 1 ) ) . '%' : '—' ) . '</strong></div><div class="wlfp-card"><span>' . esc_html__( 'Paid revenue', 'weberslink-forms-pro' ) . '</span><strong>' . esc_html( WLFP_Helpers::money( $rev ) ) . '</strong></div></div>';
		echo '<h2>' . esc_html__( 'Entries per day', 'weberslink-forms-pro' ) . '</h2><div class="wlfp-chart" role="img" aria-label="' . esc_attr__( 'Entries per day', 'weberslink-forms-pro' ) . '">';
		foreach ( $series as $d => $c ) {
			echo '<span class="wlfp-bar" title="' . esc_attr( $d . ': ' . $c ) . '" style="height:' . esc_attr( max( 2, round( $c / $max * 100 ) ) ) . '%"></span>';
		}
		echo '</div><p class="description">' . esc_html( array_key_first( $series ) ) . ' → ' . esc_html( array_key_last( $series ) ) . '</p>';
		echo '<h2>' . esc_html__( 'By form', 'weberslink-forms-pro' ) . '</h2><table class="widefat striped"><thead><tr><th>' . esc_html__( 'Form', 'weberslink-forms-pro' ) . '</th><th>' . esc_html__( 'Entries', 'weberslink-forms-pro' ) . '</th><th>' . esc_html__( 'Views', 'weberslink-forms-pro' ) . '</th><th>' . esc_html__( 'Conversion', 'weberslink-forms-pro' ) . '</th><th>' . esc_html__( 'Paid', 'weberslink-forms-pro' ) . '</th></tr></thead><tbody>';
		foreach ( WLFP_Forms::all() as $f ) {
			if ( 'trash' === $f['status'] ) {
				continue;
			}
			$n = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$wpdb->prefix}wlfp_entries WHERE form_id=%d AND created_at >= %s AND status NOT IN ('spam','trashed')", $f['id'], $since ) ); // phpcs:ignore
			$v = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COALESCE(SUM(views),0) FROM {$wpdb->prefix}wlfp_views WHERE form_id=%d AND day >= %s", $f['id'], gmdate( 'Y-m-d', time() - $days * DAY_IN_SECONDS ) ) ); // phpcs:ignore
			$r = (float) $wpdb->get_var( $wpdb->prepare( "SELECT COALESCE(SUM(payment_total),0) FROM {$wpdb->prefix}wlfp_entries WHERE form_id=%d AND payment_status='paid' AND created_at >= %s", $f['id'], $since ) ); // phpcs:ignore
			echo '<tr><td>' . esc_html( $f['title'] ) . '</td><td>' . $n . '</td><td>' . $v . '</td><td>' . ( $v ? esc_html( round( $n / $v * 100, 1 ) ) . '%' : '—' ) . '</td><td>' . esc_html( WLFP_Helpers::money( $r ) ) . '</td></tr>'; // phpcs:ignore
		}
		echo '</tbody></table>';
		if ( $form_id ) {
			self::answer_breakdown( $form_id, $since );
		} else {
			echo '<p class="description" style="margin-top:20px">' . esc_html__( 'Pick a single form above to see an answer-by-answer breakdown of its choice, rating and NPS questions.', 'weberslink-forms-pro' ) . '</p>';
		}
		echo '</div>';
	}

	/** Per-question result charts for one form. */
	private static function answer_breakdown( $form_id, $since ) {
		global $wpdb;
		$form = WLFP_Forms::get( $form_id );
		if ( ! $form ) {
			return;
		}
		$rows  = $wpdb->get_col( $wpdb->prepare( "SELECT data FROM {$wpdb->prefix}wlfp_entries WHERE form_id=%d AND created_at >= %s AND status NOT IN ('spam','trashed') LIMIT 20000", $form_id, $since ) ); // phpcs:ignore
		$total = count( $rows );
		echo '<h2>' . esc_html__( 'Answer breakdown', 'weberslink-forms-pro' ) . ' <span class="description">(' . (int) $total . ' ' . esc_html__( 'entries', 'weberslink-forms-pro' ) . ')</span></h2>';
		if ( ! $total ) {
			echo '<p>' . esc_html__( 'No entries in this period yet.', 'weberslink-forms-pro' ) . '</p>';
			return;
		}
		$decoded = array();
		foreach ( $rows as $j ) {
			$d = json_decode( (string) $j, true );
			if ( is_array( $d ) ) {
				$decoded[] = $d;
			}
		}
		$types = array( 'radio', 'select', 'checkbox', 'multiselect', 'image_choice', 'rating', 'nps', 'emoji_rating', 'toggle', 'us_state', 'country' );
		$shown = 0;
		foreach ( WLFP_Forms::value_fields( $form ) as $f ) {
			if ( ! in_array( $f['type'], $types, true ) ) {
				continue;
			}
			$counts = array();
			$n      = 0;
			$sum    = 0;
			foreach ( $decoded as $d ) {
				if ( ! isset( $d[ $f['name'] ] ) || WLFP_Fields::is_empty( $d[ $f['name'] ] ) ) {
					continue;
				}
				$n++;
				foreach ( (array) $d[ $f['name'] ] as $v ) {
					if ( is_scalar( $v ) ) {
						$counts[ (string) $v ] = ( isset( $counts[ (string) $v ] ) ? $counts[ (string) $v ] : 0 ) + 1;
						$sum                  += is_numeric( $v ) ? (float) $v : 0;
					}
				}
			}
			if ( ! $n ) {
				continue;
			}
			$shown++;
			echo '<div class="wlfp-card" style="max-width:760px;margin:12px 0"><strong>' . esc_html( $f['label'] ? $f['label'] : $f['name'] ) . '</strong> <span class="description">' . (int) $n . ' ' . esc_html__( 'answers', 'weberslink-forms-pro' ) . '</span>';
			if ( in_array( $f['type'], array( 'rating', 'emoji_rating', 'nps' ), true ) ) {
				echo '<div style="margin:6px 0">' . esc_html__( 'Average', 'weberslink-forms-pro' ) . ': <strong>' . esc_html( round( $sum / $n, 2 ) ) . '</strong>';
				if ( 'nps' === $f['type'] ) {
					$pro = 0;
					$det = 0;
					foreach ( $counts as $v => $c ) {
						if ( (int) $v >= 9 ) {
							$pro += $c;
						} elseif ( (int) $v <= 6 ) {
							$det += $c;
						}
					}
					echo ' &nbsp;|&nbsp; NPS: <strong>' . esc_html( round( ( $pro - $det ) / $n * 100 ) ) . '</strong> <span class="description">(' . (int) $pro . ' promoters, ' . (int) $det . ' detractors)</span>';
				}
				echo '</div>';
				ksort( $counts, SORT_NUMERIC );
			} else {
				arsort( $counts );
			}
			foreach ( $counts as $v => $c ) {
				$label = WLFP_Fields::format_value( $f, $v, false );
				$pct   = round( $c / $n * 100 );
				echo '<div style="display:grid;grid-template-columns:minmax(120px,32%) 1fr 70px;gap:8px;align-items:center;margin:4px 0"><span>' . esc_html( $label ) . '</span><span style="background:#e8eef5;border-radius:4px;height:14px;overflow:hidden"><i style="display:block;height:100%;width:' . (int) $pct . '%;background:#2271b1"></i></span><span>' . (int) $c . ' (' . (int) $pct . '%)</span></div>';
			}
			echo '</div>';
		}
		if ( ! $shown ) {
			echo '<p class="description">' . esc_html__( 'This form has no choice, rating or NPS questions with answers yet.', 'weberslink-forms-pro' ) . '</p>';
		}
	}

	public static function dashboard_widget() {
		if ( ! WLFP_Helpers::can_manage() ) {
			return;
		}
		wp_add_dashboard_widget( 'wlfp_dash', 'Weberslink Forms', function () {
			$q = WLFP_Entries::query( array( 'per_page' => 5 ) );
			$c = WLFP_Entries::counts();
			echo '<p>' . esc_html( sprintf( /* translators: %d: count */ __( '%d unread entries', 'weberslink-forms-pro' ), $c['unread'] ) ) . '</p><ul>';
			foreach ( $q['rows'] as $e ) {
				$f = WLFP_Forms::get( $e['form_id'] );
				echo '<li><a href="' . esc_url( admin_url( 'admin.php?page=wlfp-entries&entry=' . $e['id'] ) ) . '">#' . (int) $e['serial'] . ' ' . esc_html( $f ? $f['title'] : '' ) . '</a> <span class="description">' . esc_html( human_time_diff( strtotime( $e['created_at'] . ' UTC' ) ) ) . ' ' . esc_html__( 'ago', 'weberslink-forms-pro' ) . '</span></li>';
			}
			echo '</ul>';
		} );
	}

	/* ---------------- Tools & logs ---------------- */

	public static function page_tools() {
		global $wpdb;
		self::header( __( 'Tools & logs', 'weberslink-forms-pro' ) );
		$m = isset( $_GET['msg'] ) ? sanitize_key( $_GET['msg'] ) : ''; // phpcs:ignore
		if ( 'imported' === $m ) {
			self::notice( esc_html( sprintf( /* translators: %d: count */ __( '%d form(s) imported as drafts.', 'weberslink-forms-pro' ), isset( $_GET['n'] ) ? (int) $_GET['n'] : 1 ) ) ); // phpcs:ignore
		} elseif ( 'import_fail' === $m ) {
			self::notice( esc_html__( 'Import failed: not a valid export file.', 'weberslink-forms-pro' ), 'error' );
		} elseif ( 'mail_ok' === $m ) {
			self::notice( esc_html__( 'Test email sent. Check your inbox (and spam folder).', 'weberslink-forms-pro' ) );
		} elseif ( 'mail_fail' === $m ) {
			self::notice( esc_html__( 'wp_mail() failed. Configure SMTP (e.g. a mailer plugin) so notifications are delivered.', 'weberslink-forms-pro' ), 'error' );
		} elseif ( 'logs_cleared' === $m ) {
			self::notice( esc_html__( 'Logs cleared.', 'weberslink-forms-pro' ) );
		}
		echo '<h2>' . esc_html__( 'Import form', 'weberslink-forms-pro' ) . '</h2><form method="post" enctype="multipart/form-data" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '">';
		wp_nonce_field( 'wlfp_import' );
		echo '<input type="hidden" name="action" value="wlfp_import_form" /><input type="file" name="wlfp_file" accept=".json" required /> <button class="button button-primary">' . esc_html__( 'Import', 'weberslink-forms-pro' ) . '</button></form>';
		echo '<h2>' . esc_html__( 'Email deliverability', 'weberslink-forms-pro' ) . '</h2><form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '">';
		wp_nonce_field( 'wlfp_test_email' );
		echo '<input type="hidden" name="action" value="wlfp_test_email" /><input type="email" name="to" value="' . esc_attr( get_option( 'admin_email' ) ) . '" /> <button class="button">' . esc_html__( 'Send test email', 'weberslink-forms-pro' ) . '</button></form>';
		echo '<h2>' . esc_html__( 'System status', 'weberslink-forms-pro' ) . '</h2><table class="widefat striped" style="max-width:640px"><tbody>';
		$u  = WLFP_Install::upload_dir();
		$st = array(
			'Plugin version' => WLFP_VERSION,
			'WordPress'      => get_bloginfo( 'version' ),
			'PHP'            => PHP_VERSION,
			'Upload folder writable' => wp_mkdir_p( $u['path'] ) && wp_is_writable( $u['path'] ) ? 'Yes' : 'No',
			'Max upload size' => size_format( wp_max_upload_size() ),
			'REST API'       => rest_url( 'weberslink-forms/v1/stripe' ),
			'Stripe webhook URL' => rest_url( 'weberslink-forms/v1/stripe' ),
		);
		foreach ( $st as $k => $v ) {
			echo '<tr><th>' . esc_html( $k ) . '</th><td>' . esc_html( $v ) . '</td></tr>';
		}
		echo '</tbody></table><h2>' . esc_html__( 'Recent activity', 'weberslink-forms-pro' ) . '</h2>';
		$logs = $wpdb->get_results( "SELECT * FROM {$wpdb->prefix}wlfp_logs ORDER BY id DESC LIMIT 100", ARRAY_A ); // phpcs:ignore
		echo '<table class="widefat striped"><thead><tr><th>' . esc_html__( 'Time', 'weberslink-forms-pro' ) . '</th><th>' . esc_html__( 'Component', 'weberslink-forms-pro' ) . '</th><th>' . esc_html__( 'Status', 'weberslink-forms-pro' ) . '</th><th>' . esc_html__( 'Message', 'weberslink-forms-pro' ) . '</th><th>' . esc_html__( 'Entry', 'weberslink-forms-pro' ) . '</th></tr></thead><tbody>';
		foreach ( (array) $logs as $l ) {
			echo '<tr><td>' . esc_html( get_date_from_gmt( $l['created_at'], 'Y-m-d H:i:s' ) ) . '</td><td>' . esc_html( $l['component'] ) . '</td><td><span class="wlfp-pill wlfp-pill-' . esc_attr( $l['status'] ) . '">' . esc_html( $l['status'] ) . '</span></td><td>' . esc_html( $l['title'] ) . ( $l['message'] ? '<br><small>' . esc_html( mb_strimwidth( $l['message'], 0, 220, '…' ) ) . '</small>' : '' ) . '</td><td>' . ( $l['entry_id'] ? '<a href="' . esc_url( self::url( 'wlfp-entries', array( 'entry' => $l['entry_id'] ) ) ) . '">#' . (int) $l['entry_id'] . '</a>' : '' ) . '</td></tr>'; // phpcs:ignore
		}
		echo '</tbody></table><p><a class="button" href="' . esc_url( wp_nonce_url( admin_url( 'admin-post.php?action=wlfp_clear_logs' ), 'wlfp_clear_logs' ) ) . '">' . esc_html__( 'Clear logs', 'weberslink-forms-pro' ) . '</a></p></div>';
	}

	public static function test_email() {
		self::guard( 'wlfp_test_email' );
		$to = isset( $_POST['to'] ) ? sanitize_email( wp_unslash( $_POST['to'] ) ) : get_option( 'admin_email' ); // phpcs:ignore
		$ok = wp_mail( $to, 'Weberslink Forms test email', '<p>If you can read this, your site can send email.</p>', array( 'Content-Type: text/html; charset=UTF-8' ) );
		wp_safe_redirect( self::url( 'wlfp-tools', array( 'msg' => $ok ? 'mail_ok' : 'mail_fail' ) ) );
		exit;
	}

	public static function clear_logs() {
		self::guard( 'wlfp_clear_logs' );
		global $wpdb;
		$wpdb->query( "TRUNCATE TABLE {$wpdb->prefix}wlfp_logs" ); // phpcs:ignore
		wp_safe_redirect( self::url( 'wlfp-tools', array( 'msg' => 'logs_cleared' ) ) );
		exit;
	}

	/* ---------------- Settings ---------------- */

	public static function register_settings() {
		register_setting( 'wlfp_settings_group', 'wlfp_settings', array( 'sanitize_callback' => array( __CLASS__, 'sanitize_settings' ) ) );
		// Single-entry quick actions (star, spam, trash, delete).
		add_action( 'admin_post_wlfp_entries_action_single', function () {
			$id = isset( $_GET['entry'] ) ? (int) $_GET['entry'] : 0; // phpcs:ignore
			self::guard( 'wlfp_single_' . $id );
			$do = isset( $_GET['do'] ) ? sanitize_key( $_GET['do'] ) : ''; // phpcs:ignore
			$e  = WLFP_Entries::get( $id );
			$back = self::url( 'wlfp-entries', array( 'entry' => $id ) );
			if ( $e ) {
				$map = array( 'star' => array( 'starred' => 1 ), 'unstar' => array( 'starred' => 0 ), 'spam' => array( 'status' => 'spam' ), 'notspam' => array( 'status' => 'read' ), 'trash' => array( 'status' => 'trashed' ) );
				if ( isset( $map[ $do ] ) ) {
					WLFP_Entries::update( $id, $map[ $do ] );
				} elseif ( 'delete' === $do ) {
					WLFP_Entries::delete( $id );
					$back = self::url( 'wlfp-entries', array( 'form_id' => $e['form_id'] ) );
				}
			}
			wp_safe_redirect( $back );
			exit;
		} );
	}

	public static function sanitize_settings( $in ) {
		$d   = WLFP_Helpers::defaults();
		$old = WLFP_Helpers::settings();
		$out = array();
		foreach ( $d as $k => $def ) {
			$v = isset( $in[ $k ] ) ? $in[ $k ] : ( is_int( $def ) ? 0 : $old[ $k ] );
			if ( is_int( $def ) ) {
				$out[ $k ] = isset( $in[ $k ] ) ? max( 0, (int) $v ) : 0;
			} else {
				$out[ $k ] = is_string( $v ) ? trim( sanitize_text_field( $v ) ) : $old[ $k ];
			}
		}
		if ( ! in_array( $out['capability'], array( 'manage_options', 'edit_pages', 'publish_posts', 'edit_posts' ), true ) ) {
			$out['capability'] = 'manage_options';
		}
		foreach ( array( 'load_css', 'track_views' ) as $b ) {
			$out[ $b ] = isset( $in[ $b ] ) ? 1 : 0;
		}
		$out['stages']       = isset( $in['stages'] ) ? sanitize_textarea_field( $in['stages'] ) : $old['stages'];
		$out['email_color']  = preg_match( '/^#[0-9a-fA-F]{6}$/', (string) $out['email_color'] ) ? $out['email_color'] : '#1d2327';
		$out['email_logo']   = esc_url_raw( $out['email_logo'] );
		$out['email_brand']  = isset( $in['email_brand'] ) ? 1 : 0;
		$out['digest_email'] = sanitize_email( $out['digest_email'] );
		$out['from_email']   = sanitize_email( $out['from_email'] );
		return $out;
	}

	public static function page_settings() {
		$s = WLFP_Helpers::settings();
		$f = function ( $key, $label, $type = 'text', $help = '' ) use ( $s ) {
			$n = 'wlfp_settings[' . $key . ']';
			echo '<tr><th scope="row"><label for="wlfp_' . esc_attr( $key ) . '">' . esc_html( $label ) . '</label></th><td>';
			if ( 'checkbox' === $type ) {
				echo '<label><input type="checkbox" id="wlfp_' . esc_attr( $key ) . '" name="' . esc_attr( $n ) . '" value="1"' . checked( ! empty( $s[ $key ] ), true, false ) . ' /> ' . esc_html( $help ) . '</label>';
			} else {
				echo '<input class="regular-text" type="' . esc_attr( $type ) . '" id="wlfp_' . esc_attr( $key ) . '" name="' . esc_attr( $n ) . '" value="' . esc_attr( $s[ $key ] ) . '" autocomplete="off" />' . ( $help ? '<p class="description">' . wp_kses_post( $help ) . '</p>' : '' );
			}
			echo '</td></tr>';
		};
		self::header( __( 'Settings', 'weberslink-forms-pro' ) );
		echo '<form method="post" action="options.php">';
		settings_fields( 'wlfp_settings_group' );

		echo '<h2>' . esc_html__( 'General', 'weberslink-forms-pro' ) . '</h2><table class="form-table"><tbody>';
		echo '<tr><th><label for="wlfp_capability">' . esc_html__( 'Who can manage forms', 'weberslink-forms-pro' ) . '</label></th><td><select id="wlfp_capability" name="wlfp_settings[capability]">';
		foreach ( array( 'manage_options' => __( 'Administrators', 'weberslink-forms-pro' ), 'edit_pages' => __( 'Editors', 'weberslink-forms-pro' ), 'publish_posts' => __( 'Authors', 'weberslink-forms-pro' ), 'edit_posts' => __( 'Contributors', 'weberslink-forms-pro' ) ) as $k => $l ) {
			echo '<option value="' . esc_attr( $k ) . '"' . selected( $s['capability'], $k, false ) . '>' . esc_html( $l ) . '</option>';
		}
		echo '</select></td></tr>';
		echo '<tr><th><label for="wlfp_currency">' . esc_html__( 'Default currency', 'weberslink-forms-pro' ) . '</label></th><td><select id="wlfp_currency" name="wlfp_settings[currency]">';
		foreach ( WLFP_Helpers::currencies() as $c ) {
			echo '<option' . selected( $s['currency'], $c, false ) . '>' . esc_html( $c ) . '</option>';
		}
		echo '</select></td></tr>';
		$f( 'from_name', __( 'Email "From" name', 'weberslink-forms-pro' ), 'text', __( 'Defaults to your site name.', 'weberslink-forms-pro' ) );
		$f( 'from_email', __( 'Email "From" address', 'weberslink-forms-pro' ), 'email', __( 'Use an address on your own domain for best deliverability.', 'weberslink-forms-pro' ) );
		echo '<tr><th scope="row"><label for="wlfp_stages">' . esc_html__( 'Entry stages (workflow)', 'weberslink-forms-pro' ) . '</label></th><td><textarea id="wlfp_stages" name="wlfp_settings[stages]" rows="5" class="regular-text">' . esc_textarea( $s['stages'] ) . '</textarea><p class="description">' . esc_html__( 'One stage per line (max 12). New entries start in the first stage. Use them to track follow-up: New → In progress → Done.', 'weberslink-forms-pro' ) . '</p></td></tr>';
		$f( 'load_css', __( 'Plugin stylesheet', 'weberslink-forms-pro' ), 'checkbox', __( 'Load the front-end CSS (turn off to style forms entirely from your theme).', 'weberslink-forms-pro' ) );
		$f( 'track_views', __( 'Form views', 'weberslink-forms-pro' ), 'checkbox', __( 'Count form views for conversion reports (no cookies, no personal data).', 'weberslink-forms-pro' ) );
		$f( 'digest_email', __( 'Weekly digest email', 'weberslink-forms-pro' ), 'email', __( 'Receive a Monday summary of entries. Leave empty to disable.', 'weberslink-forms-pro' ) );
		echo '</tbody></table>';

		echo '<h2>' . esc_html__( 'Email design', 'weberslink-forms-pro' ) . '</h2><table class="form-table"><tbody>';
		$f( 'email_brand', __( 'Branded layout', 'weberslink-forms-pro' ), 'checkbox', __( 'Wrap HTML emails in a clean branded layout with your logo, colour and footer (can be switched off per notification).', 'weberslink-forms-pro' ) );
		$f( 'email_logo', __( 'Logo URL', 'weberslink-forms-pro' ), 'url', __( 'Shown in the email header (max height 44px). Leave empty to show your site name.', 'weberslink-forms-pro' ) );
		echo '<tr><th scope="row"><label for="wlfp_email_color">' . esc_html__( 'Header colour', 'weberslink-forms-pro' ) . '</label></th><td><input type="color" id="wlfp_email_color" name="wlfp_settings[email_color]" value="' . esc_attr( $s['email_color'] ) . '" /></td></tr>';
		$f( 'email_footer', __( 'Footer text', 'weberslink-forms-pro' ), 'text', __( 'For example your company name and address.', 'weberslink-forms-pro' ) );
		echo '</tbody></table>';
		echo '<h2>' . esc_html__( 'Privacy & data', 'weberslink-forms-pro' ) . '</h2><table class="form-table"><tbody>';
		$f( 'disable_ip', __( 'Do not store IP addresses', 'weberslink-forms-pro' ), 'checkbox', __( 'Disables IP logging (also disables IP-based duplicate and rate-limit checks).', 'weberslink-forms-pro' ) );
		$f( 'anonymize_ip', __( 'Anonymise IP addresses', 'weberslink-forms-pro' ), 'checkbox', __( 'Store IPs with the last part removed.', 'weberslink-forms-pro' ) );
		$f( 'keep_entries_days', __( 'Delete entries after (days)', 'weberslink-forms-pro' ), 'number', __( '0 keeps entries forever. Uploaded files are deleted with their entry.', 'weberslink-forms-pro' ) );
		$f( 'keep_logs_days', __( 'Delete logs after (days)', 'weberslink-forms-pro' ), 'number' );
		$f( 'delete_on_uninstall', __( 'Remove all data on uninstall', 'weberslink-forms-pro' ), 'checkbox', __( 'Deletes forms, entries and logs when the plugin is deleted.', 'weberslink-forms-pro' ) );
		echo '</tbody></table>';

		echo '<h2>' . esc_html__( 'CAPTCHA', 'weberslink-forms-pro' ) . '</h2><table class="form-table"><tbody>';
		echo '<tr><th><label>reCAPTCHA</label></th><td><select name="wlfp_settings[recaptcha_version]"><option value="v2"' . selected( $s['recaptcha_version'], 'v2', false ) . '>v2 checkbox</option><option value="v3"' . selected( $s['recaptcha_version'], 'v3', false ) . '>v3 invisible</option></select></td></tr>';
		$f( 'recaptcha_site', 'reCAPTCHA site key' );
		$f( 'recaptcha_secret', 'reCAPTCHA secret key', 'password' );
		$f( 'hcaptcha_site', 'hCaptcha site key' );
		$f( 'hcaptcha_secret', 'hCaptcha secret key', 'password' );
		$f( 'turnstile_site', 'Cloudflare Turnstile site key' );
		$f( 'turnstile_secret', 'Cloudflare Turnstile secret key', 'password' );
		echo '</tbody></table><p class="description">' . esc_html__( 'Choose which provider each form uses under Form settings → Spam protection.', 'weberslink-forms-pro' ) . '</p>';

		echo '<h2>' . esc_html__( 'Payments', 'weberslink-forms-pro' ) . '</h2><table class="form-table"><tbody>';
		$f( 'stripe_sk', 'Stripe secret key', 'password', __( 'Starts with <code>sk_test_</code> or <code>sk_live_</code> (or a restricted key). Stripe Checkout is used, so card data never touches your site.', 'weberslink-forms-pro' ) );
		$f( 'stripe_whsec', 'Stripe webhook signing secret', 'password', sprintf( /* translators: %s: URL */ __( 'In Stripe → Developers → Webhooks add the endpoint <code>%s</code> and subscribe to <code>checkout.session.completed</code>, <code>checkout.session.expired</code> and <code>charge.refunded</code>.', 'weberslink-forms-pro' ), esc_html( rest_url( 'weberslink-forms/v1/stripe' ) ) ) );
		echo '<tr><th>PayPal mode</th><td><select name="wlfp_settings[paypal_mode]"><option value="sandbox"' . selected( $s['paypal_mode'], 'sandbox', false ) . '>Sandbox</option><option value="live"' . selected( $s['paypal_mode'], 'live', false ) . '>Live</option></select></td></tr>';
		$f( 'paypal_client', 'PayPal client ID' );
		$f( 'paypal_secret', 'PayPal secret', 'password' );
		echo '</tbody></table><h2>' . esc_html__( 'Integrations', 'weberslink-forms-pro' ) . '</h2><table class="form-table"><tbody>';
		$f( 'mailchimp_key', 'Mailchimp API key', 'password', __( 'Looks like <code>abc123-us21</code>. Per-form audience settings are under Form settings → Integrations.', 'weberslink-forms-pro' ) );
		echo '</tbody></table>';
		WLFP_Api::settings_html();
		submit_button();
		echo '</form>';
		echo '<form id="wlfp-api-form" method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '"><input type="hidden" name="action" value="wlfp_api_create" />';
		wp_nonce_field( 'wlfp_api_create' );
		echo '</form></div>';
	}
}
