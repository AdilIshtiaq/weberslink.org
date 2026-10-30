<?php
defined( 'ABSPATH' ) || exit;

class WLSEO_Admin {

	public static function init() {
		add_action( 'admin_menu', array( __CLASS__, 'menu' ) );
		add_action( 'admin_init', array( __CLASS__, 'register' ) );
		add_action( 'add_meta_boxes', array( __CLASS__, 'add_box' ) );
		add_action( 'save_post', array( __CLASS__, 'save_box' ), 10, 2 );
		add_action( 'admin_enqueue_scripts', array( __CLASS__, 'assets' ) );
		add_action( 'wp_ajax_wlseo_analyze', array( __CLASS__, 'ajax_analyze' ) );
		add_filter( 'plugin_action_links_' . plugin_basename( WLSEO_FILE ), function ( $l ) {
			array_unshift( $l, '<a href="' . esc_url( admin_url( 'admin.php?page=wlseo-settings' ) ) . '">' . esc_html__( 'Settings', 'weberslink-seo' ) . '</a>' );
			return $l;
		} );
	}

	public static function menu() {
		add_menu_page( 'Weberslink SEO', 'SEO', 'manage_options', 'wlseo', array( __CLASS__, 'page_audit' ), 'dashicons-chart-area', 79 );
		add_submenu_page( 'wlseo', __( 'SEO audit', 'weberslink-seo' ), __( 'Audit', 'weberslink-seo' ), 'manage_options', 'wlseo', array( __CLASS__, 'page_audit' ) );
		add_submenu_page( 'wlseo', __( 'SEO settings', 'weberslink-seo' ), __( 'Settings', 'weberslink-seo' ), 'manage_options', 'wlseo-settings', array( __CLASS__, 'page_settings' ) );
	}

	public static function register() {
		register_setting( 'wlseo_group', WLSEO_Settings::OPTION, array( 'sanitize_callback' => function ( $in ) {
			return WLSEO_Settings::sanitize( is_array( $in ) ? wp_unslash( $in ) : array() );
		} ) );
	}

	public static function post_types() {
		$t = get_post_types( array( 'public' => true ), 'names' );
		unset( $t['attachment'] );
		return array_values( $t );
	}

	public static function assets( $hook ) {
		$page = isset( $_GET['page'] ) ? sanitize_key( $_GET['page'] ) : ''; // phpcs:ignore
		if ( 0 === strpos( $page, 'wlseo' ) || in_array( $hook, array( 'post.php', 'post-new.php' ), true ) ) {
			wp_enqueue_style( 'wlseo-admin', WLSEO_URL . 'assets/admin.css', array(), WLSEO_VERSION );
		}
		if ( in_array( $hook, array( 'post.php', 'post-new.php' ), true ) ) {
			wp_enqueue_script( 'wlseo-box', WLSEO_URL . 'assets/metabox.js', array(), WLSEO_VERSION, true );
			wp_localize_script( 'wlseo-box', 'WLSEO', array( 'ajax' => admin_url( 'admin-ajax.php' ), 'nonce' => wp_create_nonce( 'wlseo_analyze' ), 'sitename' => wp_specialchars_decode( get_bloginfo( 'name' ), ENT_QUOTES ), 'sep' => WLSEO_Settings::get( 'sep' ), 'tpl' => WLSEO_Settings::get( 'title_post' ), 'host' => wp_parse_url( home_url(), PHP_URL_HOST ) ) );
		}
	}

	/* ---------------- meta box ---------------- */

	public static function add_box() {
		foreach ( self::post_types() as $pt ) {
			add_meta_box( 'wlseo', __( 'SEO', 'weberslink-seo' ), array( __CLASS__, 'box' ), $pt, 'normal', 'high' );
		}
	}

	public static function box( $post ) {
		wp_nonce_field( 'wlseo_save', 'wlseo_nonce' );
		$g = function ( $k ) use ( $post ) {
			return WLSEO_Output::meta( $post->ID, $k );
		};
		echo '<div class="wlseo-box" data-slug="' . esc_attr( $post->post_name ) . '" data-link="' . esc_attr( get_permalink( $post ) ) . '">';
		echo '<div class="wlseo-serp" aria-label="' . esc_attr__( 'Search result preview', 'weberslink-seo' ) . '"><div class="wlseo-serp-url"></div><div class="wlseo-serp-title"></div><div class="wlseo-serp-desc"></div></div>';
		echo '<p><label>' . esc_html__( 'Focus keyword', 'weberslink-seo' ) . '<br><input type="text" class="widefat" name="wlseo_kw" value="' . esc_attr( $g( 'kw' ) ) . '" placeholder="' . esc_attr__( 'the phrase you want to rank for', 'weberslink-seo' ) . '" /></label></p>';
		echo '<p><label>' . esc_html__( 'SEO title', 'weberslink-seo' ) . ' <span class="wlseo-count" data-for="title"></span><br><input type="text" class="widefat" name="wlseo_title" value="' . esc_attr( $g( 'title' ) ) . '" placeholder="' . esc_attr( WLSEO_Settings::get( 'title_post' ) ) . '" /></label></p>';
		echo '<p><label>' . esc_html__( 'Meta description', 'weberslink-seo' ) . ' <span class="wlseo-count" data-for="desc"></span><br><textarea class="widefat" rows="3" name="wlseo_desc" placeholder="' . esc_attr__( 'Leave empty to use the start of the content', 'weberslink-seo' ) . '">' . esc_textarea( $g( 'desc' ) ) . '</textarea></label></p>';
		echo '<details><summary>' . esc_html__( 'Advanced', 'weberslink-seo' ) . '</summary>';
		echo '<p><label>' . esc_html__( 'Canonical URL', 'weberslink-seo' ) . '<br><input type="url" class="widefat" name="wlseo_canon" value="' . esc_attr( $g( 'canon' ) ) . '" placeholder="https://" /></label></p>';
		echo '<p><label>' . esc_html__( 'Social image URL', 'weberslink-seo' ) . '<br><input type="url" class="widefat" name="wlseo_og_image" value="' . esc_attr( $g( 'og_image' ) ) . '" placeholder="' . esc_attr__( 'Defaults to the featured image', 'weberslink-seo' ) . '" /></label></p>';
		echo '<p><label><input type="checkbox" name="wlseo_noindex" value="1"' . checked( '1', $g( 'noindex' ), false ) . ' /> ' . esc_html__( 'Hide this page from search engines (noindex)', 'weberslink-seo' ) . '</label><br><label><input type="checkbox" name="wlseo_nofollow" value="1"' . checked( '1', $g( 'nofollow' ), false ) . ' /> ' . esc_html__( 'Tell search engines not to follow links on this page (nofollow)', 'weberslink-seo' ) . '</label></p></details>';
		echo '<div class="wlseo-score-row"><div class="wlseo-score" data-score="seo"><strong>–</strong><span>' . esc_html__( 'SEO', 'weberslink-seo' ) . '</span></div><div class="wlseo-score" data-score="read"><strong>–</strong><span>' . esc_html__( 'Readability', 'weberslink-seo' ) . '</span></div></div><ul class="wlseo-checks" aria-live="polite"></ul></div>';
	}

	public static function save_box( $post_id, $post ) {
		if ( ! isset( $_POST['wlseo_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['wlseo_nonce'] ) ), 'wlseo_save' ) || ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) || ! current_user_can( 'edit_post', $post_id ) || 'revision' === $post->post_type ) {
			return;
		}
		$clean = array(
			'title'    => mb_substr( sanitize_text_field( wp_unslash( $_POST['wlseo_title'] ?? '' ) ), 0, 300 ),
			'desc'     => mb_substr( sanitize_text_field( wp_unslash( $_POST['wlseo_desc'] ?? '' ) ), 0, 400 ),
			'kw'       => mb_substr( sanitize_text_field( wp_unslash( $_POST['wlseo_kw'] ?? '' ) ), 0, 100 ),
			'canon'    => esc_url_raw( wp_unslash( $_POST['wlseo_canon'] ?? '' ) ),
			'og_image' => esc_url_raw( wp_unslash( $_POST['wlseo_og_image'] ?? '' ) ),
			'noindex'  => ! empty( $_POST['wlseo_noindex'] ) ? '1' : '',
			'nofollow' => ! empty( $_POST['wlseo_nofollow'] ) ? '1' : '',
		);
		foreach ( $clean as $k => $v ) {
			if ( '' === $v ) {
				delete_post_meta( $post_id, WLSEO_Output::META[ $k ] );
			} else {
				update_post_meta( $post_id, WLSEO_Output::META[ $k ], $v );
			}
		}
	}

	/** One analyser, two uses: this endpoint feeds the live panel in the editor. */
	public static function ajax_analyze() {
		check_ajax_referer( 'wlseo_analyze', 'nonce' );
		if ( ! current_user_can( 'edit_posts' ) ) {
			wp_send_json_error( null, 403 );
		}
		$p      = wp_unslash( $_POST ); // phpcs:ignore
		$checks = WLSEO_Analyzer::analyze( array(
			'title'       => isset( $p['title'] ) ? sanitize_text_field( $p['title'] ) : '',
			'description' => isset( $p['description'] ) ? sanitize_text_field( $p['description'] ) : '',
			'keyword'     => isset( $p['keyword'] ) ? sanitize_text_field( $p['keyword'] ) : '',
			'slug'        => isset( $p['slug'] ) ? sanitize_title( $p['slug'] ) : '',
			'html'        => isset( $p['content'] ) ? wp_kses_post( mb_substr( $p['content'], 0, 400000 ) ) : '',
			'home_host'   => (string) wp_parse_url( home_url(), PHP_URL_HOST ),
		) );
		wp_send_json_success( array( 'checks' => $checks, 'seo' => WLSEO_Analyzer::score( $checks, 'seo' ), 'read' => WLSEO_Analyzer::score( $checks, 'read' ) ) );
	}

	/* ---------------- audit ---------------- */

	public static function page_audit() {
		global $wpdb;
		$types = self::post_types();
		$in    = "'" . implode( "','", array_map( 'esc_sql', $types ) ) . "'";
		$pm    = $wpdb->postmeta;
		$total = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_status='publish' AND post_type IN ($in)" ); // phpcs:ignore
		$nodesc = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$wpdb->posts} p WHERE p.post_status='publish' AND p.post_type IN ($in) AND NOT EXISTS (SELECT 1 FROM $pm m WHERE m.post_id=p.ID AND m.meta_key='_wlseo_desc' AND m.meta_value<>'')" ); // phpcs:ignore
		$nokw   = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$wpdb->posts} p WHERE p.post_status='publish' AND p.post_type IN ($in) AND NOT EXISTS (SELECT 1 FROM $pm m WHERE m.post_id=p.ID AND m.meta_key='_wlseo_kw' AND m.meta_value<>'')" ); // phpcs:ignore
		$noidx  = (int) $wpdb->get_var( "SELECT COUNT(*) FROM $pm m JOIN {$wpdb->posts} p ON p.ID=m.post_id WHERE m.meta_key='_wlseo_noindex' AND m.meta_value='1' AND p.post_status='publish'" ); // phpcs:ignore
		$rows   = (array) $wpdb->get_results( "SELECT p.ID, p.post_title, p.post_type FROM {$wpdb->posts} p WHERE p.post_status='publish' AND p.post_type IN ($in) AND NOT EXISTS (SELECT 1 FROM $pm m WHERE m.post_id=p.ID AND m.meta_key='_wlseo_desc' AND m.meta_value<>'') ORDER BY p.post_modified DESC LIMIT 20", ARRAY_A ); // phpcs:ignore
		echo '<div class="wrap wlseo"><h1>' . esc_html__( 'SEO audit', 'weberslink-seo' ) . '</h1><div class="wlseo-stats">';
		foreach ( array( array( $total, __( 'Published pages', 'weberslink-seo' ), '' ), array( $nodesc, __( 'No meta description', 'weberslink-seo' ), $nodesc ? 'bad' : 'good' ), array( $nokw, __( 'No focus keyword', 'weberslink-seo' ), $nokw ? 'warn' : 'good' ), array( $noidx, __( 'Hidden from search', 'weberslink-seo' ), '' ) ) as $s ) {
			echo '<div class="wlseo-stat ' . esc_attr( $s[2] ) . '"><strong>' . (int) $s[0] . '</strong><span>' . esc_html( $s[1] ) . '</span></div>';
		}
		echo '</div><h2>' . esc_html__( 'Fix these first: no meta description', 'weberslink-seo' ) . '</h2><p class="description">' . esc_html__( 'Without one, search engines show a random snippet. Most recently edited first.', 'weberslink-seo' ) . '</p><table class="wp-list-table widefat fixed striped"><thead><tr><th>' . esc_html__( 'Page', 'weberslink-seo' ) . '</th><th style="width:120px">' . esc_html__( 'Type', 'weberslink-seo' ) . '</th><th style="width:120px"></th></tr></thead><tbody>';
		if ( ! $rows ) {
			echo '<tr><td colspan="3">' . esc_html__( 'Every published page has a meta description. 🎉', 'weberslink-seo' ) . '</td></tr>';
		}
		foreach ( $rows as $r ) {
			echo '<tr><td><strong>' . esc_html( $r['post_title'] ? $r['post_title'] : '(no title)' ) . '</strong></td><td>' . esc_html( $r['post_type'] ) . '</td><td><a class="button" href="' . esc_url( get_edit_post_link( (int) $r['ID'] ) ) . '">' . esc_html__( 'Edit SEO', 'weberslink-seo' ) . '</a></td></tr>';
		}
		echo '</tbody></table></div>';
	}

	/* ---------------- settings ---------------- */

	public static function page_settings() {
		$s    = WLSEO_Settings::all();
		$name = WLSEO_Settings::OPTION;
		$txt  = function ( $k, $label, $help = '', $type = 'text' ) use ( $s, $name ) {
			echo '<tr><th scope="row"><label for="wlseo_' . esc_attr( $k ) . '">' . esc_html( $label ) . '</label></th><td><input type="' . esc_attr( $type ) . '" class="large-text" id="wlseo_' . esc_attr( $k ) . '" name="' . esc_attr( $name . '[' . $k . ']' ) . '" value="' . esc_attr( $s[ $k ] ) . '" />' . ( $help ? '<p class="description">' . esc_html( $help ) . '</p>' : '' ) . '</td></tr>';
		};
		$area = function ( $k, $label, $help = '', $rows = 4 ) use ( $s, $name ) {
			echo '<tr><th scope="row"><label for="wlseo_' . esc_attr( $k ) . '">' . esc_html( $label ) . '</label></th><td><textarea class="large-text code" rows="' . (int) $rows . '" id="wlseo_' . esc_attr( $k ) . '" name="' . esc_attr( $name . '[' . $k . ']' ) . '">' . esc_textarea( $s[ $k ] ) . '</textarea>' . ( $help ? '<p class="description">' . esc_html( $help ) . '</p>' : '' ) . '</td></tr>';
		};
		$chk  = function ( $k, $label, $help = '' ) use ( $s, $name ) {
			echo '<tr><th scope="row">' . esc_html( $label ) . '</th><td><label><input type="checkbox" name="' . esc_attr( $name . '[' . $k . ']' ) . '" value="1"' . checked( ! empty( $s[ $k ] ), true, false ) . ' /> ' . esc_html( $help ) . '</label></td></tr>';
		};
		echo '<div class="wrap wlseo"><h1>' . esc_html__( 'SEO settings', 'weberslink-seo' ) . '</h1>';
		if ( isset( $_GET['settings-updated'] ) ) { // phpcs:ignore
			echo '<div class="notice notice-success is-dismissible"><p>' . esc_html__( 'Settings saved.', 'weberslink-seo' ) . '</p></div>';
		}
		echo '<form method="post" action="options.php">';
		settings_fields( 'wlseo_group' );
		echo '<h2>' . esc_html__( 'Titles and descriptions', 'weberslink-seo' ) . '</h2><p class="description">' . esc_html__( 'Variables: %title% %sitename% %tagline% %sep% %excerpt% %term% %author% %category% %date% %searchphrase% %page%', 'weberslink-seo' ) . '</p><table class="form-table"><tbody>';
		echo '<tr><th scope="row">' . esc_html__( 'Separator', 'weberslink-seo' ) . '</th><td>';
		foreach ( WLSEO_Settings::separators() as $k => $l ) {
			echo '<label style="margin-right:14px"><input type="radio" name="' . esc_attr( $name ) . '[sep]" value="' . esc_attr( $k ) . '"' . checked( $s['sep'], $k, false ) . ' /> ' . esc_html( $l ) . '</label>';
		}
		echo '</td></tr>';
		$txt( 'title_home', __( 'Home page title', 'weberslink-seo' ) );
		$txt( 'desc_home', __( 'Home page description', 'weberslink-seo' ), __( 'Leave empty to use the tagline.', 'weberslink-seo' ) );
		$txt( 'title_post', __( 'Posts and pages title', 'weberslink-seo' ), __( 'Used when a page has no SEO title of its own.', 'weberslink-seo' ) );
		$txt( 'desc_post', __( 'Posts and pages description', 'weberslink-seo' ), __( '%excerpt% uses the excerpt or the start of the content.', 'weberslink-seo' ) );
		$txt( 'title_tax', __( 'Category and tag title', 'weberslink-seo' ) );
		$txt( 'title_author', __( 'Author archive title', 'weberslink-seo' ) );
		$txt( 'title_search', __( 'Search results title', 'weberslink-seo' ) );
		$txt( 'title_404', __( '404 page title', 'weberslink-seo' ) );
		echo '</tbody></table><h2>' . esc_html__( 'Social sharing', 'weberslink-seo' ) . '</h2><table class="form-table"><tbody>';
		$chk( 'og', __( 'Open Graph and Twitter cards', 'weberslink-seo' ), __( 'Nice previews when your pages are shared on Facebook, LinkedIn, X, WhatsApp and Slack', 'weberslink-seo' ) );
		$txt( 'og_image', __( 'Default social image', 'weberslink-seo' ), __( 'Used when a page has no featured image. 1200×630 works best.', 'weberslink-seo' ), 'url' );
		echo '<tr><th scope="row">' . esc_html__( 'Twitter card', 'weberslink-seo' ) . '</th><td><select name="' . esc_attr( $name ) . '[twitter_card]"><option value="summary_large_image"' . selected( $s['twitter_card'], 'summary_large_image', false ) . '>' . esc_html__( 'Large image', 'weberslink-seo' ) . '</option><option value="summary"' . selected( $s['twitter_card'], 'summary', false ) . '>' . esc_html__( 'Small image', 'weberslink-seo' ) . '</option></select></td></tr>';
		$txt( 'twitter_user', __( 'X / Twitter username', 'weberslink-seo' ) );
		echo '</tbody></table><h2>' . esc_html__( 'Schema (structured data)', 'weberslink-seo' ) . '</h2><table class="form-table"><tbody>';
		$chk( 'schema', __( 'Add JSON-LD', 'weberslink-seo' ), __( 'WebSite, Organization, WebPage, Article and breadcrumbs, so search engines understand your site', 'weberslink-seo' ) );
		echo '<tr><th scope="row">' . esc_html__( 'This site is', 'weberslink-seo' ) . '</th><td><select name="' . esc_attr( $name ) . '[org_type]"><option value="Organization"' . selected( $s['org_type'], 'Organization', false ) . '>' . esc_html__( 'An organization / company', 'weberslink-seo' ) . '</option><option value="Person"' . selected( $s['org_type'], 'Person', false ) . '>' . esc_html__( 'A person', 'weberslink-seo' ) . '</option></select></td></tr>';
		$txt( 'org_name', __( 'Name', 'weberslink-seo' ), __( 'Leave empty to use the site title.', 'weberslink-seo' ) );
		$txt( 'org_logo', __( 'Logo URL', 'weberslink-seo' ), '', 'url' );
		$area( 'same_as', __( 'Profiles', 'weberslink-seo' ), __( 'One URL per line: Facebook, LinkedIn, X, Instagram, YouTube…', 'weberslink-seo' ), 4 );
		echo '</tbody></table><h2>' . esc_html__( 'Search engines', 'weberslink-seo' ) . '</h2><table class="form-table"><tbody>';
		$chk( 'noindex_search', __( 'Hide search results pages', 'weberslink-seo' ), __( 'Add noindex to your internal search results', 'weberslink-seo' ) );
		$chk( 'noindex_date', __( 'Hide date archives', 'weberslink-seo' ), __( 'Thin pages like /2024/05/', 'weberslink-seo' ) );
		$chk( 'noindex_author', __( 'Hide author archives', 'weberslink-seo' ), __( 'Useful on one-author sites, where it duplicates the blog', 'weberslink-seo' ) );
		$chk( 'sitemap_noindex', __( 'Keep noindex pages out of the sitemap', 'weberslink-seo' ), __( 'Applies to the WordPress sitemap at /wp-sitemap.xml', 'weberslink-seo' ) );
		$chk( 'robots_sitemap', __( 'Add the sitemap to robots.txt', 'weberslink-seo' ) );
		$area( 'robots_extra', __( 'Extra robots.txt rules', 'weberslink-seo' ), __( 'Only User-agent, Disallow, Allow, Crawl-delay and Sitemap lines are kept. Works with WordPress\'s virtual robots.txt (not when a real robots.txt file exists).', 'weberslink-seo' ), 4 );
		$txt( 'verify_google', __( 'Google Search Console', 'weberslink-seo' ), __( 'Only the code from the verification tag (the content value).', 'weberslink-seo' ) );
		$txt( 'verify_bing', __( 'Bing Webmaster Tools', 'weberslink-seo' ) );
		$txt( 'verify_yandex', __( 'Yandex Webmaster', 'weberslink-seo' ) );
		$txt( 'verify_pinterest', __( 'Pinterest', 'weberslink-seo' ) );
		echo '</tbody></table>';
		submit_button();
		echo '</form></div>';
	}
}
