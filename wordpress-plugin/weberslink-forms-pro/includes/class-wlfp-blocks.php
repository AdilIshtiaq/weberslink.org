<?php
defined( 'ABSPATH' ) || exit;

/** Gutenberg block, classic widget and Elementor widget. All render through the same shortcode renderer. */
class WLFP_Blocks {

	public static function init() {
		add_action( 'init', array( __CLASS__, 'register_block' ) );
		add_action( 'widgets_init', function () {
			register_widget( 'WLFP_Widget' );
		} );
		add_action( 'elementor/widgets/register', array( __CLASS__, 'elementor' ) );
	}

	public static function form_options() {
		$o = array( array( 'value' => 0, 'label' => __( '— Select a form —', 'weberslink-forms-pro' ) ) );
		foreach ( WLFP_Forms::all( array( 'status' => 'published' ) ) as $f ) {
			$o[] = array( 'value' => $f['id'], 'label' => $f['title'] . ' (#' . $f['id'] . ')' );
		}
		return $o;
	}

	public static function register_block() {
		wp_register_script( 'wlfp-block', WLFP_URL . 'assets/js/block.js', array( 'wp-blocks', 'wp-element', 'wp-block-editor', 'wp-components', 'wp-server-side-render', 'wp-i18n' ), WLFP_VERSION, true );
		wp_register_style( 'wlfp-block-editor', WLFP_URL . 'assets/css/form.css', array(), WLFP_VERSION );
		register_block_type( 'weberslink-forms-pro/form', array(
			'api_version'     => 2,
			'editor_script'   => 'wlfp-block',
			'editor_style'    => 'wlfp-block-editor',
			'attributes'      => array( 'formId' => array( 'type' => 'integer', 'default' => 0 ), 'showTitle' => array( 'type' => 'boolean', 'default' => false ) ),
			'render_callback' => function ( $atts ) {
				if ( empty( $atts['formId'] ) ) {
					return current_user_can( 'edit_posts' ) ? '<p>' . esc_html__( 'Select a Weberslink form in the block settings.', 'weberslink-forms-pro' ) . '</p>' : '';
				}
				return WLFP_Renderer::render( (int) $atts['formId'], array( 'title' => ! empty( $atts['showTitle'] ) ? 'true' : '' ) );
			},
		) );
		add_action( 'enqueue_block_editor_assets', function () {
			wp_localize_script( 'wlfp-block', 'WLFPBlock', array( 'forms' => self::form_options() ) );
		} );
	}

	public static function elementor( $widgets_manager ) {
		if ( ! class_exists( '\Elementor\Widget_Base' ) ) {
			return;
		}
		require_once WLFP_DIR . 'includes/class-wlfp-elementor.php';
		$widgets_manager->register( new WLFP_Elementor_Widget() );
	}
}

class WLFP_Widget extends WP_Widget {

	public function __construct() {
		parent::__construct( 'wlfp_form_widget', __( 'Weberslink Form', 'weberslink-forms-pro' ), array( 'description' => __( 'Display one of your forms.', 'weberslink-forms-pro' ) ) );
	}

	public function widget( $args, $instance ) {
		echo $args['before_widget']; // phpcs:ignore
		if ( ! empty( $instance['title'] ) ) {
			echo $args['before_title'] . esc_html( $instance['title'] ) . $args['after_title']; // phpcs:ignore
		}
		echo WLFP_Renderer::render( (int) ( $instance['form_id'] ?? 0 ) ); // phpcs:ignore
		echo $args['after_widget']; // phpcs:ignore
	}

	public function form( $instance ) {
		$title = isset( $instance['title'] ) ? $instance['title'] : '';
		$fid   = isset( $instance['form_id'] ) ? (int) $instance['form_id'] : 0;
		echo '<p><label>' . esc_html__( 'Title', 'weberslink-forms-pro' ) . '<input class="widefat" name="' . esc_attr( $this->get_field_name( 'title' ) ) . '" value="' . esc_attr( $title ) . '" /></label></p><p><label>' . esc_html__( 'Form', 'weberslink-forms-pro' ) . '<select class="widefat" name="' . esc_attr( $this->get_field_name( 'form_id' ) ) . '">';
		foreach ( WLFP_Blocks::form_options() as $o ) {
			echo '<option value="' . (int) $o['value'] . '"' . selected( $fid, $o['value'], false ) . '>' . esc_html( $o['label'] ) . '</option>';
		}
		echo '</select></label></p>';
	}

	public function update( $new, $old ) {
		return array( 'title' => sanitize_text_field( $new['title'] ?? '' ), 'form_id' => (int) ( $new['form_id'] ?? 0 ) );
	}
}
