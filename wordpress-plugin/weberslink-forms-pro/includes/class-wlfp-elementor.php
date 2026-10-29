<?php
defined( 'ABSPATH' ) || exit;

class WLFP_Elementor_Widget extends \Elementor\Widget_Base {

	public function get_name() {
		return 'weberslink_form';
	}

	public function get_title() {
		return __( 'Weberslink Form', 'weberslink-forms-pro' );
	}

	public function get_icon() {
		return 'eicon-form-horizontal';
	}

	public function get_categories() {
		return array( 'general' );
	}

	protected function register_controls() {
		$this->start_controls_section( 'content', array( 'label' => __( 'Form', 'weberslink-forms-pro' ) ) );
		$opts = array();
		foreach ( WLFP_Blocks::form_options() as $o ) {
			$opts[ $o['value'] ] = $o['label'];
		}
		$this->add_control( 'form_id', array( 'label' => __( 'Select form', 'weberslink-forms-pro' ), 'type' => \Elementor\Controls_Manager::SELECT, 'options' => $opts, 'default' => 0 ) );
		$this->end_controls_section();
	}

	protected function render() {
		$s = $this->get_settings_for_display();
		echo WLFP_Renderer::render( (int) $s['form_id'] ); // phpcs:ignore
	}
}
