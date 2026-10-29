<?php
defined( 'ABSPATH' ) || exit;

/**
 * Field registry, rendering, sanitising and validating of each field type.
 */
class WLFP_Fields {

	/** Types that do not store a value. */
	public static function layout_types() {
		return array( 'section', 'html', 'divider', 'page_break', 'captcha', 'payment_summary', 'shortcode', 'image_block', 'embed' );
	}

	public static function stores_value( $type ) {
		return ! in_array( $type, self::layout_types(), true );
	}

	public static function types() {
		return apply_filters( 'wlfp_field_types', array(
			'text'        => array( 'label' => __( 'Single line text', 'weberslink-forms-pro' ), 'group' => 'basic', 'icon' => 'T' ),
			'textarea'    => array( 'label' => __( 'Paragraph text', 'weberslink-forms-pro' ), 'group' => 'basic', 'icon' => '¶' ),
			'email'       => array( 'label' => __( 'Email', 'weberslink-forms-pro' ), 'group' => 'basic', 'icon' => '@' ),
			'number'      => array( 'label' => __( 'Number', 'weberslink-forms-pro' ), 'group' => 'basic', 'icon' => '#' ),
			'select'      => array( 'label' => __( 'Dropdown', 'weberslink-forms-pro' ), 'group' => 'basic', 'icon' => '▾' ),
			'radio'       => array( 'label' => __( 'Radio buttons', 'weberslink-forms-pro' ), 'group' => 'basic', 'icon' => '◉' ),
			'checkbox'    => array( 'label' => __( 'Checkboxes', 'weberslink-forms-pro' ), 'group' => 'basic', 'icon' => '☑' ),
			'consent'     => array( 'label' => __( 'Consent / terms checkbox', 'weberslink-forms-pro' ), 'group' => 'basic', 'icon' => '✔' ),
			'name'        => array( 'label' => __( 'Name (first / last)', 'weberslink-forms-pro' ), 'group' => 'advanced', 'icon' => 'N' ),
			'address'     => array( 'label' => __( 'Address', 'weberslink-forms-pro' ), 'group' => 'advanced', 'icon' => '⌂' ),
			'phone'       => array( 'label' => __( 'Phone', 'weberslink-forms-pro' ), 'group' => 'advanced', 'icon' => '✆' ),
			'url'         => array( 'label' => __( 'Website URL', 'weberslink-forms-pro' ), 'group' => 'advanced', 'icon' => '🔗' ),
			'password'    => array( 'label' => __( 'Password', 'weberslink-forms-pro' ), 'group' => 'advanced', 'icon' => '•' ),
			'date'        => array( 'label' => __( 'Date', 'weberslink-forms-pro' ), 'group' => 'advanced', 'icon' => '📅' ),
			'time'        => array( 'label' => __( 'Time', 'weberslink-forms-pro' ), 'group' => 'advanced', 'icon' => '⏱' ),
			'datetime'    => array( 'label' => __( 'Date & time', 'weberslink-forms-pro' ), 'group' => 'advanced', 'icon' => '🗓' ),
			'country'     => array( 'label' => __( 'Country', 'weberslink-forms-pro' ), 'group' => 'advanced', 'icon' => '🌐' ),
			'multiselect' => array( 'label' => __( 'Multi-select', 'weberslink-forms-pro' ), 'group' => 'advanced', 'icon' => '☰' ),
			'file'        => array( 'label' => __( 'File upload', 'weberslink-forms-pro' ), 'group' => 'advanced', 'icon' => '⇪' ),
			'image'       => array( 'label' => __( 'Image upload', 'weberslink-forms-pro' ), 'group' => 'advanced', 'icon' => '🖼' ),
			'rating'      => array( 'label' => __( 'Star rating', 'weberslink-forms-pro' ), 'group' => 'advanced', 'icon' => '★' ),
			'range'       => array( 'label' => __( 'Range slider', 'weberslink-forms-pro' ), 'group' => 'advanced', 'icon' => '↔' ),
			'nps'         => array( 'label' => __( 'Net promoter score', 'weberslink-forms-pro' ), 'group' => 'advanced', 'icon' => '0-10' ),
			'likert'      => array( 'label' => __( 'Likert / matrix', 'weberslink-forms-pro' ), 'group' => 'advanced', 'icon' => '▦' ),
			'signature'   => array( 'label' => __( 'Signature', 'weberslink-forms-pro' ), 'group' => 'advanced', 'icon' => '✍' ),
			'color'       => array( 'label' => __( 'Color picker', 'weberslink-forms-pro' ), 'group' => 'advanced', 'icon' => '🎨' ),
			'repeater'    => array( 'label' => __( 'Repeater (add more rows)', 'weberslink-forms-pro' ), 'group' => 'advanced', 'icon' => '⧉' ),
			'hidden'      => array( 'label' => __( 'Hidden field', 'weberslink-forms-pro' ), 'group' => 'advanced', 'icon' => '👁' ),
			'calculation' => array( 'label' => __( 'Calculation', 'weberslink-forms-pro' ), 'group' => 'advanced', 'icon' => '∑' ),
			'payment_item'    => array( 'label' => __( 'Product / payment item', 'weberslink-forms-pro' ), 'group' => 'payment', 'icon' => '$' ),
			'quantity'        => array( 'label' => __( 'Quantity', 'weberslink-forms-pro' ), 'group' => 'payment', 'icon' => '×' ),
			'payment_summary' => array( 'label' => __( 'Order summary', 'weberslink-forms-pro' ), 'group' => 'payment', 'icon' => '∑$' ),
			'coupon'          => array( 'label' => __( 'Coupon code', 'weberslink-forms-pro' ), 'group' => 'payment', 'icon' => '%' ),
			'toggle'      => array( 'label' => __( 'Toggle switch (yes / no)', 'weberslink-forms-pro' ), 'group' => 'advanced', 'icon' => '⏽' ),
			'image_choice' => array( 'label' => __( 'Image choice', 'weberslink-forms-pro' ), 'group' => 'advanced', 'icon' => '▣' ),
			'ranking'     => array( 'label' => __( 'Ranking (order the options)', 'weberslink-forms-pro' ), 'group' => 'advanced', 'icon' => '⇅' ),
			'date_range'  => array( 'label' => __( 'Date range', 'weberslink-forms-pro' ), 'group' => 'advanced', 'icon' => '↔📅' ),
			'emoji_rating' => array( 'label' => __( 'Emoji rating', 'weberslink-forms-pro' ), 'group' => 'advanced', 'icon' => '🙂' ),
			'terms'       => array( 'label' => __( 'Terms & conditions (scroll box)', 'weberslink-forms-pro' ), 'group' => 'advanced', 'icon' => '§' ),
			'us_state'    => array( 'label' => __( 'US state', 'weberslink-forms-pro' ), 'group' => 'advanced', 'icon' => 'ST' ),
			'post_select' => array( 'label' => __( 'Dynamic dropdown (posts / terms)', 'weberslink-forms-pro' ), 'group' => 'advanced', 'icon' => '⛁' ),
			'image_block' => array( 'label' => __( 'Image', 'weberslink-forms-pro' ), 'group' => 'layout', 'icon' => '🖼' ),
			'embed'       => array( 'label' => __( 'Embed (video / oEmbed)', 'weberslink-forms-pro' ), 'group' => 'layout', 'icon' => '▶' ),
			'section'     => array( 'label' => __( 'Section heading', 'weberslink-forms-pro' ), 'group' => 'layout', 'icon' => 'H' ),
			'html'        => array( 'label' => __( 'Custom HTML / text', 'weberslink-forms-pro' ), 'group' => 'layout', 'icon' => '<>' ),
			'divider'     => array( 'label' => __( 'Divider', 'weberslink-forms-pro' ), 'group' => 'layout', 'icon' => '—' ),
			'page_break'  => array( 'label' => __( 'Step / page break', 'weberslink-forms-pro' ), 'group' => 'layout', 'icon' => '⇥' ),
			'captcha'     => array( 'label' => __( 'CAPTCHA', 'weberslink-forms-pro' ), 'group' => 'layout', 'icon' => '🛡' ),
			'shortcode'   => array( 'label' => __( 'Shortcode', 'weberslink-forms-pro' ), 'group' => 'layout', 'icon' => '[ ]' ),
		) );
	}

	/** Default config for a new field. */
	public static function defaults( $type ) {
		$base = array( 'id' => WLFP_Helpers::uid(), 'type' => $type, 'label' => '', 'name' => '', 'placeholder' => '', 'help' => '', 'required' => 0, 'default' => '', 'width' => 'full', 'css_class' => '', 'req_msg' => '', 'conditional' => array( 'enabled' => 0, 'match' => 'all', 'rules' => array() ) );
		$t    = self::types();
		$base['label'] = isset( $t[ $type ] ) ? $t[ $type ]['label'] : $type;
		$opts = array( array( 'label' => 'Option 1', 'value' => 'option_1', 'price' => '' ), array( 'label' => 'Option 2', 'value' => 'option_2', 'price' => '' ), array( 'label' => 'Option 3', 'value' => 'option_3', 'price' => '' ) );
		switch ( $type ) {
			case 'select':
			case 'radio':
			case 'checkbox':
			case 'multiselect':
				$base['options'] = $opts;
				if ( 'radio' === $type || 'checkbox' === $type ) {
					$base['layout'] = 'vertical';
					$base['other']  = 0;
				}
				if ( 'select' === $type ) {
					$base['placeholder'] = '— Select —';
				}
				break;
			case 'consent':
				$base['label']   = '';
				$base['terms']   = 'I agree to the <a href="/privacy" target="_blank" rel="noopener">privacy policy</a>.';
				$base['required'] = 1;
				break;
			case 'name':
				$base['parts'] = array( 'first' => 1, 'middle' => 0, 'last' => 1, 'prefix' => 0 );
				break;
			case 'address':
				$base['parts'] = array( 'line1' => 1, 'line2' => 1, 'city' => 1, 'state' => 1, 'zip' => 1, 'country' => 1 );
				break;
			case 'number':
				$base['min'] = '';
				$base['max'] = '';
				$base['step'] = '';
				break;
			case 'textarea':
				$base['rows'] = 5;
				$base['maxlength'] = '';
				break;
			case 'text':
				$base['maxlength'] = '';
				$base['mask'] = '';
				break;
			case 'file':
				$base['allowed'] = 'jpg,jpeg,png,gif,pdf,doc,docx,xls,xlsx,zip,txt';
				$base['max_size'] = 5;
				$base['max_files'] = 1;
				break;
			case 'image':
				$base['allowed'] = 'jpg,jpeg,png,gif,webp';
				$base['max_size'] = 5;
				$base['max_files'] = 1;
				break;
			case 'rating':
				$base['max'] = 5;
				break;
			case 'range':
				$base['min'] = 0;
				$base['max'] = 100;
				$base['step'] = 1;
				$base['default'] = 50;
				break;
			case 'nps':
				$base['low_label'] = 'Not likely';
				$base['high_label'] = 'Very likely';
				break;
			case 'likert':
				$base['rows_list'] = array( array( 'label' => 'Question 1', 'value' => 'q1' ), array( 'label' => 'Question 2', 'value' => 'q2' ) );
				$base['options'] = array( array( 'label' => 'Strongly disagree', 'value' => '1' ), array( 'label' => 'Disagree', 'value' => '2' ), array( 'label' => 'Neutral', 'value' => '3' ), array( 'label' => 'Agree', 'value' => '4' ), array( 'label' => 'Strongly agree', 'value' => '5' ) );
				break;
			case 'repeater':
				$base['columns'] = array( array( 'label' => 'Column 1', 'type' => 'text' ), array( 'label' => 'Column 2', 'type' => 'text' ) );
				$base['min_rows'] = 1;
				$base['max_rows'] = 10;
				$base['add_text'] = 'Add row';
				break;
			case 'calculation':
				$base['formula'] = '';
				$base['prefix'] = '';
				$base['suffix'] = '';
				$base['decimals'] = 2;
				break;
			case 'payment_item':
				$base['kind']   = 'fixed';
				$base['price']  = '10';
				$base['options'] = $opts;
				$base['label']  = 'Product';
				break;
			case 'quantity':
				$base['min'] = 1;
				$base['max'] = 99;
				$base['default'] = 1;
				$base['item'] = '';
				break;
			case 'toggle':
				$base['toggle_text'] = 'Yes';
				break;
			case 'image_choice':
				$base['options']  = array( array( 'label' => 'Option 1', 'value' => 'option_1', 'image' => '', 'price' => '' ), array( 'label' => 'Option 2', 'value' => 'option_2', 'image' => '', 'price' => '' ), array( 'label' => 'Option 3', 'value' => 'option_3', 'image' => '', 'price' => '' ) );
				$base['multiple'] = 0;
				$base['columns']  = 3;
				break;
			case 'ranking':
				$base['options'] = $opts;
				break;
			case 'date_range':
				$base['min'] = '';
				$base['max'] = '';
				break;
			case 'terms':
				$base['label']      = 'Terms & conditions';
				$base['terms_text'] = '<p>Write your terms here…</p>';
				$base['agree_label'] = 'I have read and agree to the terms';
				$base['must_scroll'] = 0;
				$base['required']   = 1;
				break;
			case 'post_select':
				$base['source_kind'] = 'posts';
				$base['source']      = 'page';
				$base['limit']       = 200;
				$base['multiple']    = 0;
				$base['placeholder'] = '— Select —';
				break;
			case 'image_block':
				$base['url']       = '';
				$base['alt']       = '';
				$base['link']      = '';
				$base['max_width'] = 100;
				$base['align']     = 'left';
				$base['label']     = 'Image';
				break;
			case 'embed':
				$base['url']   = '';
				$base['label'] = 'Embed';
				break;
			case 'section':
				$base['label'] = 'Section title';
				$base['help']  = '';
				break;
			case 'html':
				$base['html'] = '<p>Your text here.</p>';
				break;
			case 'page_break':
				$base['label'] = 'Next step';
				$base['step_title'] = '';
				break;
			case 'hidden':
				$base['default'] = '';
				break;
			case 'shortcode':
				$base['shortcode'] = '';
				break;
		}
		return apply_filters( 'wlfp_field_defaults', $base, $type );
	}

	/* ---------------- Rendering ---------------- */

	public static function dom_id( $form_id, $field ) {
		return 'wlfp-' . (int) $form_id . '-' . $field['id'];
	}

	/** Render the input(s) only (no label/wrapper). */
	public static function render_input( $f, $form, $value = null ) {
		$fid  = self::dom_id( $form['id'], $f );
		$name = $f['name'];
		$req  = ! empty( $f['required'] );
		$val  = null === $value ? ( isset( $f['default'] ) ? $f['default'] : '' ) : $value;
		$desc = ! empty( $f['help'] ) ? $fid . '-help' : null;
		$base = array( 'id' => $fid, 'name' => $name, 'class' => 'wlfp-input', 'aria-describedby' => $desc, 'aria-required' => $req ? 'true' : null, 'data-wlfp-field' => $name, 'readonly' => ! empty( $f['readonly'] ) ? true : null );
		if ( ! empty( $f['placeholder'] ) && in_array( $f['type'], array( 'text', 'textarea', 'email', 'number', 'phone', 'url', 'password' ), true ) ) {
			$base['placeholder'] = $f['placeholder'];
		}
		$o = '';
		switch ( $f['type'] ) {
			case 'text':
			case 'email':
			case 'url':
			case 'password':
			case 'phone':
				$map  = array( 'text' => 'text', 'email' => 'email', 'url' => 'url', 'password' => 'password', 'phone' => 'tel' );
				$attr = $base + array( 'type' => $map[ $f['type'] ], 'value' => 'password' === $f['type'] ? null : $val );
				if ( 'email' === $f['type'] ) {
					$attr['autocomplete'] = 'email';
				}
				if ( 'phone' === $f['type'] ) {
					$attr['autocomplete'] = 'tel';
					$attr['inputmode']    = 'tel';
				}
				if ( 'password' === $f['type'] ) {
					$attr['autocomplete'] = 'new-password';
				}
				if ( ! empty( $f['maxlength'] ) ) {
					$attr['maxlength'] = (int) $f['maxlength'];
				}
				if ( ! empty( $f['mask'] ) ) {
					$attr['data-mask'] = $f['mask'];
				}
				$o = '<input' . WLFP_Helpers::esc_attrs( $attr ) . ' />';
				if ( ! empty( $f['confirm'] ) && in_array( $f['type'], array( 'email', 'password' ), true ) ) {
					$o .= '<input type="' . ( 'email' === $f['type'] ? 'email' : 'password' ) . '" class="wlfp-input wlfp-confirm" id="' . esc_attr( $fid ) . '-confirm" name="' . esc_attr( $name ) . '__confirm" autocomplete="off" placeholder="' . esc_attr( 'email' === $f['type'] ? __( 'Confirm email', 'weberslink-forms-pro' ) : __( 'Confirm password', 'weberslink-forms-pro' ) ) . '" aria-label="' . esc_attr( 'email' === $f['type'] ? __( 'Confirm email', 'weberslink-forms-pro' ) : __( 'Confirm password', 'weberslink-forms-pro' ) ) . '" data-confirm-for="' . esc_attr( $name ) . '" />';
				}
				break;
			case 'hidden':
				$o = '<input type="hidden" id="' . esc_attr( $fid ) . '" name="' . esc_attr( $name ) . '" value="' . esc_attr( $val ) . '" data-wlfp-field="' . esc_attr( $name ) . '" />';
				break;
			case 'number':
				$attr = $base + array( 'type' => 'number', 'value' => $val, 'inputmode' => 'decimal', 'min' => '' !== ( $f['min'] ?? '' ) ? $f['min'] : null, 'max' => '' !== ( $f['max'] ?? '' ) ? $f['max'] : null, 'step' => '' !== ( $f['step'] ?? '' ) ? $f['step'] : 'any' );
				$o    = '<input' . WLFP_Helpers::esc_attrs( $attr ) . ' />';
				break;
			case 'textarea':
				$attr = $base + array( 'rows' => (int) ( $f['rows'] ?? 5 ), 'maxlength' => ! empty( $f['maxlength'] ) ? (int) $f['maxlength'] : null );
				unset( $attr['value'] );
				$o = '<textarea' . WLFP_Helpers::esc_attrs( $attr ) . '>' . esc_textarea( $val ) . '</textarea>';
				if ( ! empty( $f['maxlength'] ) ) {
					$o .= '<span class="wlfp-counter" data-for="' . esc_attr( $fid ) . '" aria-hidden="true"></span>';
				}
				break;
			case 'date':
			case 'time':
			case 'datetime':
				$t    = array( 'date' => 'date', 'time' => 'time', 'datetime' => 'datetime-local' );
				$attr = $base + array( 'type' => $t[ $f['type'] ], 'value' => $val, 'min' => ! empty( $f['min'] ) ? $f['min'] : null, 'max' => ! empty( $f['max'] ) ? $f['max'] : null );
				$o    = '<input' . WLFP_Helpers::esc_attrs( $attr ) . ' />';
				break;
			case 'color':
				$attr = $base + array( 'type' => 'color', 'value' => $val ? $val : '#000000' );
				$o    = '<input' . WLFP_Helpers::esc_attrs( $attr ) . ' />';
				break;
			case 'select':
			case 'country':
			case 'multiselect':
				$multi = 'multiselect' === $f['type'];
				$attr  = $base;
				if ( $multi ) {
					$attr['multiple'] = true;
					$attr['name']     = $name . '[]';
					$attr['size']     = min( 6, max( 3, count( (array) ( $f['options'] ?? array() ) ) ) );
				}
				$o = '<select' . WLFP_Helpers::esc_attrs( $attr ) . '>';
				if ( ! $multi ) {
					$o .= '<option value="">' . esc_html( ! empty( $f['placeholder'] ) ? $f['placeholder'] : __( '— Select —', 'weberslink-forms-pro' ) ) . '</option>';
				}
				$sel = (array) $val;
				if ( 'country' === $f['type'] ) {
					foreach ( WLFP_Helpers::countries() as $code => $label ) {
						$o .= '<option value="' . esc_attr( $code ) . '"' . selected( in_array( $code, $sel, true ), true, false ) . '>' . esc_html( $label ) . '</option>';
					}
				} else {
					foreach ( (array) ( $f['options'] ?? array() ) as $opt ) {
						$o .= '<option value="' . esc_attr( $opt['value'] ) . '"' . selected( in_array( (string) $opt['value'], array_map( 'strval', $sel ), true ), true, false ) . '>' . esc_html( $opt['label'] ) . '</option>';
					}
				}
				$o .= '</select>';
				break;
			case 'radio':
			case 'checkbox':
				$o   = '<div class="wlfp-choices wlfp-choices-' . esc_attr( $f['layout'] ?? 'vertical' ) . '" role="' . ( 'radio' === $f['type'] ? 'radiogroup' : 'group' ) . '" aria-labelledby="' . esc_attr( $fid ) . '-label" data-wlfp-field="' . esc_attr( $name ) . '">';
				$sel = array_map( 'strval', (array) $val );
				$n   = 0;
				foreach ( (array) ( $f['options'] ?? array() ) as $opt ) {
					$cid = $fid . '-' . $n++;
					$o  .= '<label class="wlfp-choice" for="' . esc_attr( $cid ) . '"><input type="' . $f['type'] . '" id="' . esc_attr( $cid ) . '" name="' . esc_attr( $name ) . ( 'checkbox' === $f['type'] ? '[]' : '' ) . '" value="' . esc_attr( $opt['value'] ) . '"' . checked( in_array( (string) $opt['value'], $sel, true ), true, false ) . ' data-wlfp-field="' . esc_attr( $name ) . '" /><span>' . esc_html( $opt['label'] ) . '</span></label>';
				}
				if ( ! empty( $f['other'] ) ) {
					$cid = $fid . '-other';
					$o  .= '<label class="wlfp-choice wlfp-choice-other" for="' . esc_attr( $cid ) . '"><input type="' . $f['type'] . '" id="' . esc_attr( $cid ) . '" name="' . esc_attr( $name ) . ( 'checkbox' === $f['type'] ? '[]' : '' ) . '" value="__other__" data-wlfp-field="' . esc_attr( $name ) . '" /><span>' . esc_html__( 'Other', 'weberslink-forms-pro' ) . '</span></label><input type="text" class="wlfp-input wlfp-other-text" name="' . esc_attr( $name ) . '__other" placeholder="' . esc_attr__( 'Please specify', 'weberslink-forms-pro' ) . '" />';
				}
				$o .= '</div>';
				break;
			case 'consent':
				$o = '<label class="wlfp-choice wlfp-consent" for="' . esc_attr( $fid ) . '"><input type="checkbox" id="' . esc_attr( $fid ) . '" name="' . esc_attr( $name ) . '" value="yes" data-wlfp-field="' . esc_attr( $name ) . '"' . ( $req ? ' aria-required="true"' : '' ) . ' /><span>' . wp_kses( $f['terms'] ?? '', WLFP_Helpers::allowed_html() ) . '</span></label>';
				break;
			case 'name':
				$parts = array_merge( array( 'first' => 1, 'last' => 1 ), (array) ( $f['parts'] ?? array() ) );
				$lab   = array( 'prefix' => __( 'Prefix', 'weberslink-forms-pro' ), 'first' => __( 'First name', 'weberslink-forms-pro' ), 'middle' => __( 'Middle name', 'weberslink-forms-pro' ), 'last' => __( 'Last name', 'weberslink-forms-pro' ) );
				$o     = '<div class="wlfp-composite wlfp-composite-name">';
				foreach ( array( 'prefix', 'first', 'middle', 'last' ) as $p ) {
					if ( empty( $parts[ $p ] ) ) {
						continue;
					}
					$pid = $fid . '-' . $p;
					$ac  = array( 'prefix' => 'honorific-prefix', 'first' => 'given-name', 'middle' => 'additional-name', 'last' => 'family-name' );
					$o  .= '<div class="wlfp-sub"><input type="text" class="wlfp-input" id="' . esc_attr( $pid ) . '" name="' . esc_attr( $name ) . '[' . $p . ']" autocomplete="' . $ac[ $p ] . '" data-wlfp-field="' . esc_attr( $name ) . '" value="' . esc_attr( is_array( $val ) && isset( $val[ $p ] ) ? $val[ $p ] : '' ) . '" /><label class="wlfp-sublabel" for="' . esc_attr( $pid ) . '">' . esc_html( $lab[ $p ] ) . '</label></div>';
				}
				$o .= '</div>';
				break;
			case 'address':
				$parts = array_merge( array( 'line1' => 1, 'city' => 1, 'zip' => 1, 'country' => 1 ), (array) ( $f['parts'] ?? array() ) );
				$lab   = array( 'line1' => __( 'Address line 1', 'weberslink-forms-pro' ), 'line2' => __( 'Address line 2', 'weberslink-forms-pro' ), 'city' => __( 'City', 'weberslink-forms-pro' ), 'state' => __( 'State / Province', 'weberslink-forms-pro' ), 'zip' => __( 'ZIP / Postal code', 'weberslink-forms-pro' ), 'country' => __( 'Country', 'weberslink-forms-pro' ) );
				$ac    = array( 'line1' => 'address-line1', 'line2' => 'address-line2', 'city' => 'address-level2', 'state' => 'address-level1', 'zip' => 'postal-code', 'country' => 'country' );
				$o     = '<div class="wlfp-composite wlfp-composite-address">';
				foreach ( array( 'line1', 'line2', 'city', 'state', 'zip', 'country' ) as $p ) {
					if ( empty( $parts[ $p ] ) ) {
						continue;
					}
					$pid = $fid . '-' . $p;
					$cur = is_array( $val ) && isset( $val[ $p ] ) ? $val[ $p ] : '';
					$cls = in_array( $p, array( 'line1', 'line2' ), true ) ? 'wlfp-sub wlfp-sub-full' : 'wlfp-sub';
					if ( 'country' === $p ) {
						$in = '<select class="wlfp-input" id="' . esc_attr( $pid ) . '" name="' . esc_attr( $name ) . '[country]" autocomplete="country" data-wlfp-field="' . esc_attr( $name ) . '"><option value=""></option>';
						foreach ( WLFP_Helpers::countries() as $code => $l ) {
							$in .= '<option value="' . esc_attr( $code ) . '"' . selected( $cur, $code, false ) . '>' . esc_html( $l ) . '</option>';
						}
						$in .= '</select>';
					} else {
						$in = '<input type="text" class="wlfp-input" id="' . esc_attr( $pid ) . '" name="' . esc_attr( $name ) . '[' . $p . ']" autocomplete="' . $ac[ $p ] . '" data-wlfp-field="' . esc_attr( $name ) . '" value="' . esc_attr( $cur ) . '" />';
					}
					$o .= '<div class="' . $cls . '">' . $in . '<label class="wlfp-sublabel" for="' . esc_attr( $pid ) . '">' . esc_html( $lab[ $p ] ) . '</label></div>';
				}
				$o .= '</div>';
				break;
			case 'file':
			case 'image':
				$accept = '';
				if ( ! empty( $f['allowed'] ) ) {
					$accept = '.' . implode( ',.', array_filter( array_map( 'trim', explode( ',', strtolower( $f['allowed'] ) ) ) ) );
				}
				$multi = (int) ( $f['max_files'] ?? 1 ) > 1;
				$o     = '<div class="wlfp-file"><input type="file" class="wlfp-input wlfp-file-input" id="' . esc_attr( $fid ) . '" name="' . esc_attr( $name ) . ( $multi ? '[]' : '' ) . '"' . ( $multi ? ' multiple' : '' ) . ' accept="' . esc_attr( $accept ) . '" data-max-size="' . (float) ( $f['max_size'] ?? 5 ) . '" data-max-files="' . (int) ( $f['max_files'] ?? 1 ) . '" data-wlfp-field="' . esc_attr( $name ) . '"' . ( $desc ? ' aria-describedby="' . esc_attr( $desc ) . '"' : '' ) . ' /><div class="wlfp-file-list" aria-live="polite"></div></div>';
				break;
			case 'rating':
				$max = max( 1, min( 10, (int) ( $f['max'] ?? 5 ) ) );
				$o   = '<div class="wlfp-rating" role="radiogroup" aria-labelledby="' . esc_attr( $fid ) . '-label" data-wlfp-field="' . esc_attr( $name ) . '">';
				for ( $i = $max; $i >= 1; $i-- ) {
					$o .= '<input type="radio" id="' . esc_attr( $fid . '-' . $i ) . '" name="' . esc_attr( $name ) . '" value="' . $i . '"' . checked( (string) $val, (string) $i, false ) . ' data-wlfp-field="' . esc_attr( $name ) . '" /><label for="' . esc_attr( $fid . '-' . $i ) . '" title="' . esc_attr( $i ) . '"><span class="screen-reader-text wlfp-sr">' . esc_html( sprintf( /* translators: %d: stars */ _n( '%d star', '%d stars', $i, 'weberslink-forms-pro' ), $i ) ) . '</span></label>';
				}
				$o .= '</div>';
				break;
			case 'nps':
				$o = '<div class="wlfp-nps" role="radiogroup" aria-labelledby="' . esc_attr( $fid ) . '-label" data-wlfp-field="' . esc_attr( $name ) . '">';
				for ( $i = 0; $i <= 10; $i++ ) {
					$o .= '<label class="wlfp-nps-item"><input type="radio" name="' . esc_attr( $name ) . '" value="' . $i . '"' . checked( (string) $val, (string) $i, false ) . ' data-wlfp-field="' . esc_attr( $name ) . '" /><span>' . $i . '</span></label>';
				}
				$o .= '</div><div class="wlfp-nps-labels"><span>' . esc_html( $f['low_label'] ?? '' ) . '</span><span>' . esc_html( $f['high_label'] ?? '' ) . '</span></div>';
				break;
			case 'range':
				$attr = $base + array( 'type' => 'range', 'min' => $f['min'] ?? 0, 'max' => $f['max'] ?? 100, 'step' => $f['step'] ?? 1, 'value' => '' !== $val ? $val : ( $f['min'] ?? 0 ), 'class' => 'wlfp-input wlfp-range' );
				$o    = '<div class="wlfp-range-wrap"><input' . WLFP_Helpers::esc_attrs( $attr ) . ' /><output class="wlfp-range-out" for="' . esc_attr( $fid ) . '">' . esc_html( $attr['value'] ) . '</output></div>';
				break;
			case 'likert':
				$o = '<div class="wlfp-likert-scroll"><table class="wlfp-likert"><thead><tr><th></th>';
				foreach ( (array) ( $f['options'] ?? array() ) as $opt ) {
					$o .= '<th scope="col">' . esc_html( $opt['label'] ) . '</th>';
				}
				$o .= '</tr></thead><tbody>';
				foreach ( (array) ( $f['rows_list'] ?? array() ) as $ri => $row ) {
					$o .= '<tr><th scope="row">' . esc_html( $row['label'] ) . '</th>';
					foreach ( (array) ( $f['options'] ?? array() ) as $oi => $opt ) {
						$o .= '<td><input type="radio" name="' . esc_attr( $name ) . '[' . esc_attr( $row['value'] ) . ']" value="' . esc_attr( $opt['value'] ) . '" aria-label="' . esc_attr( $row['label'] . ': ' . $opt['label'] ) . '" data-wlfp-field="' . esc_attr( $name ) . '" /></td>';
					}
					$o .= '</tr>';
				}
				$o .= '</tbody></table></div>';
				break;
			case 'signature':
				$o = '<div class="wlfp-signature" data-wlfp-field="' . esc_attr( $name ) . '"><canvas class="wlfp-sig-canvas" width="600" height="200" role="img" aria-label="' . esc_attr__( 'Signature pad', 'weberslink-forms-pro' ) . '"></canvas><input type="hidden" name="' . esc_attr( $name ) . '" id="' . esc_attr( $fid ) . '" data-wlfp-field="' . esc_attr( $name ) . '" /><button type="button" class="wlfp-sig-clear">' . esc_html__( 'Clear', 'weberslink-forms-pro' ) . '</button></div>';
				break;
			case 'repeater':
				$min = max( 1, (int) ( $f['min_rows'] ?? 1 ) );
				$o   = '<div class="wlfp-repeater" data-name="' . esc_attr( $name ) . '" data-max="' . (int) ( $f['max_rows'] ?? 10 ) . '" data-min="' . $min . '" data-wlfp-field="' . esc_attr( $name ) . '"><div class="wlfp-rep-rows">';
				for ( $r = 0; $r < $min; $r++ ) {
					$o .= self::repeater_row( $f, $r );
				}
				$o .= '</div><template class="wlfp-rep-tpl">' . self::repeater_row( $f, '__i__' ) . '</template><button type="button" class="wlfp-rep-add">' . esc_html( ! empty( $f['add_text'] ) ? $f['add_text'] : __( 'Add row', 'weberslink-forms-pro' ) ) . '</button></div>';
				break;
			case 'calculation':
				$o = '<div class="wlfp-calc" data-formula="' . esc_attr( $f['formula'] ?? '' ) . '" data-decimals="' . (int) ( $f['decimals'] ?? 2 ) . '" data-prefix="' . esc_attr( $f['prefix'] ?? '' ) . '" data-suffix="' . esc_attr( $f['suffix'] ?? '' ) . '"><output class="wlfp-calc-out" id="' . esc_attr( $fid ) . '-out">0</output><input type="hidden" name="' . esc_attr( $name ) . '" id="' . esc_attr( $fid ) . '" data-wlfp-field="' . esc_attr( $name ) . '" value="0" /></div>';
				break;
			case 'payment_item':
				$cur = WLFP_Payments::currency( $form );
				if ( 'fixed' === ( $f['kind'] ?? 'fixed' ) ) {
					$o = '<div class="wlfp-price" data-wlfp-field="' . esc_attr( $name ) . '"><strong class="wlfp-price-val" data-price="' . esc_attr( (float) ( $f['price'] ?? 0 ) ) . '">' . esc_html( WLFP_Helpers::money( (float) ( $f['price'] ?? 0 ), $cur ) ) . '</strong><input type="hidden" name="' . esc_attr( $name ) . '" value="1" data-price="' . esc_attr( (float) ( $f['price'] ?? 0 ) ) . '" data-wlfp-field="' . esc_attr( $name ) . '" /></div>';
				} elseif ( 'custom' === $f['kind'] ) {
					$o = '<input type="number" class="wlfp-input wlfp-amount" min="' . esc_attr( $f['min'] ?? 1 ) . '" step="any" id="' . esc_attr( $fid ) . '" name="' . esc_attr( $name ) . '" data-wlfp-field="' . esc_attr( $name ) . '" data-custom-amount="1" value="' . esc_attr( $val ) . '" />';
				} else {
					$type = 'select' === $f['kind'] ? 'select' : ( 'radio' === $f['kind'] ? 'radio' : 'checkbox' );
					$ff   = $f;
					$ff['type'] = $type;
					$o = self::render_input( $ff, $form, $value );
					$o = preg_replace( '/<(option|input) ([^>]*?)value="([^"]*)"/', '<$1 $2data-v="$3" value="$3"', $o );
				}
				break;
			case 'quantity':
				$attr = $base + array( 'type' => 'number', 'min' => $f['min'] ?? 1, 'max' => $f['max'] ?? 99, 'step' => 1, 'value' => '' !== $val ? $val : 1, 'inputmode' => 'numeric', 'data-qty-for' => $f['item'] ?? '' );
				$o    = '<input' . WLFP_Helpers::esc_attrs( $attr ) . ' />';
				break;
			case 'coupon':
				$o = '<div class="wlfp-coupon"><input type="text" class="wlfp-input" id="' . esc_attr( $fid ) . '" name="' . esc_attr( $name ) . '" data-wlfp-field="' . esc_attr( $name ) . '" /><button type="button" class="wlfp-coupon-apply">' . esc_html__( 'Apply', 'weberslink-forms-pro' ) . '</button><span class="wlfp-coupon-msg" aria-live="polite"></span></div>';
				break;
			case 'toggle':
				$on = in_array( (string) $val, array( 'yes', '1', 'on', 'true' ), true );
				$o  = '<label class="wlfp-toggle" for="' . esc_attr( $fid ) . '"><input type="checkbox" role="switch" id="' . esc_attr( $fid ) . '" name="' . esc_attr( $name ) . '" value="yes" data-wlfp-field="' . esc_attr( $name ) . '"' . checked( $on, true, false ) . ( $req ? ' aria-required="true"' : '' ) . ' /><span class="wlfp-switch" aria-hidden="true"></span><span class="wlfp-toggle-text">' . esc_html( $f['toggle_text'] ?? '' ) . '</span></label>';
				break;
			case 'image_choice':
				$multi = ! empty( $f['multiple'] );
				$type  = $multi ? 'checkbox' : 'radio';
				$cols  = max( 1, min( 6, (int) ( $f['columns'] ?? 3 ) ) );
				$sel   = array_map( 'strval', (array) $val );
				$o     = '<div class="wlfp-imgchoices" style="--wlfp-cols:' . $cols . '" role="' . ( $multi ? 'group' : 'radiogroup' ) . '" aria-labelledby="' . esc_attr( $fid ) . '-label" data-wlfp-field="' . esc_attr( $name ) . '" data-multiple="' . ( $multi ? 1 : 0 ) . '">';
				$n     = 0;
				foreach ( (array) ( $f['options'] ?? array() ) as $opt ) {
					$cid = $fid . '-' . $n++;
					$o  .= '<label class="wlfp-imgchoice" for="' . esc_attr( $cid ) . '"><input type="' . $type . '" id="' . esc_attr( $cid ) . '" name="' . esc_attr( $name ) . ( $multi ? '[]' : '' ) . '" value="' . esc_attr( $opt['value'] ) . '"' . checked( in_array( (string) $opt['value'], $sel, true ), true, false ) . ' data-wlfp-field="' . esc_attr( $name ) . '" /><span class="wlfp-imgchoice-box">' . ( ! empty( $opt['image'] ) ? '<img src="' . esc_url( $opt['image'] ) . '" alt="" loading="lazy" />' : '' ) . '<span class="wlfp-imgchoice-cap">' . esc_html( $opt['label'] ) . '</span></span></label>';
				}
				$o .= '</div>';
				break;
			case 'ranking':
				$o = '<ol class="wlfp-rank" id="' . esc_attr( $fid ) . '" data-wlfp-field="' . esc_attr( $name ) . '">';
				foreach ( (array) ( $f['options'] ?? array() ) as $opt ) {
					$o .= '<li class="wlfp-rank-item"><input type="hidden" name="' . esc_attr( $name ) . '[]" value="' . esc_attr( $opt['value'] ) . '" data-wlfp-field="' . esc_attr( $name ) . '" /><span class="wlfp-rank-label">' . esc_html( $opt['label'] ) . '</span><span class="wlfp-rank-btns"><button type="button" class="wlfp-rank-up" aria-label="' . esc_attr__( 'Move up', 'weberslink-forms-pro' ) . '">↑</button><button type="button" class="wlfp-rank-down" aria-label="' . esc_attr__( 'Move down', 'weberslink-forms-pro' ) . '">↓</button></span></li>';
				}
				$o .= '</ol>';
				break;
			case 'date_range':
				$o = '<div class="wlfp-composite">';
				foreach ( array( 'start' => __( 'Start date', 'weberslink-forms-pro' ), 'end' => __( 'End date', 'weberslink-forms-pro' ) ) as $p => $l ) {
					$pid = $fid . '-' . $p;
					$o  .= '<div class="wlfp-sub"><input type="date" class="wlfp-input" id="' . esc_attr( $pid ) . '" name="' . esc_attr( $name ) . '[' . $p . ']" data-wlfp-field="' . esc_attr( $name ) . '" value="' . esc_attr( is_array( $val ) && isset( $val[ $p ] ) ? $val[ $p ] : '' ) . '"' . ( ! empty( $f['min'] ) ? ' min="' . esc_attr( $f['min'] ) . '"' : '' ) . ( ! empty( $f['max'] ) ? ' max="' . esc_attr( $f['max'] ) . '"' : '' ) . ' /><label class="wlfp-sublabel" for="' . esc_attr( $pid ) . '">' . esc_html( $l ) . '</label></div>';
				}
				$o .= '</div>';
				break;
			case 'emoji_rating':
				$o = '<div class="wlfp-emoji" role="radiogroup" aria-labelledby="' . esc_attr( $fid ) . '-label" data-wlfp-field="' . esc_attr( $name ) . '">';
				foreach ( self::emoji() as $i => $e ) {
					$o .= '<label class="wlfp-emoji-item"><input type="radio" name="' . esc_attr( $name ) . '" value="' . (int) $i . '"' . checked( (string) $val, (string) $i, false ) . ' data-wlfp-field="' . esc_attr( $name ) . '" /><span aria-hidden="true">' . $e . '</span><span class="wlfp-sr">' . esc_html( $i . ' / 5' ) . '</span></label>';
				}
				$o .= '</div>';
				break;
			case 'terms':
				$o = '<div class="wlfp-terms-box" tabindex="0" role="region" aria-label="' . esc_attr__( 'Terms and conditions', 'weberslink-forms-pro' ) . '"' . ( ! empty( $f['must_scroll'] ) ? ' data-must-scroll="1"' : '' ) . '>' . wp_kses( $f['terms_text'] ?? '', WLFP_Helpers::allowed_html() ) . '</div><label class="wlfp-choice wlfp-consent" for="' . esc_attr( $fid ) . '"><input type="checkbox" id="' . esc_attr( $fid ) . '" name="' . esc_attr( $name ) . '" value="yes" data-wlfp-field="' . esc_attr( $name ) . '"' . ( $req ? ' aria-required="true"' : '' ) . ' /><span>' . esc_html( $f['agree_label'] ?? '' ) . '</span></label>';
				break;
			case 'us_state':
				$o = '<select' . WLFP_Helpers::esc_attrs( $base ) . '><option value="">' . esc_html( ! empty( $f['placeholder'] ) ? $f['placeholder'] : __( '— Select state —', 'weberslink-forms-pro' ) ) . '</option>';
				foreach ( WLFP_Helpers::us_states() as $code => $label ) {
					$o .= '<option value="' . esc_attr( $code ) . '"' . selected( (string) $val, $code, false ) . '>' . esc_html( $label ) . '</option>';
				}
				$o .= '</select>';
				break;
			case 'post_select':
				$multi = ! empty( $f['multiple'] );
				$attr  = $base;
				if ( $multi ) {
					$attr['multiple'] = true;
					$attr['name']     = $name . '[]';
					$attr['size']     = 6;
				}
				$o   = '<select' . WLFP_Helpers::esc_attrs( $attr ) . '>' . ( $multi ? '' : '<option value="">' . esc_html( ! empty( $f['placeholder'] ) ? $f['placeholder'] : __( '— Select —', 'weberslink-forms-pro' ) ) . '</option>' );
				$sel = array_map( 'strval', (array) $val );
				foreach ( self::post_options( $f ) as $v => $label ) {
					$o .= '<option value="' . esc_attr( $v ) . '"' . selected( in_array( (string) $v, $sel, true ), true, false ) . '>' . esc_html( $label ) . '</option>';
				}
				$o .= '</select>';
				break;
			default:
				$o = apply_filters( 'wlfp_render_field_' . $f['type'], '', $f, $form, $val );
		}
		return $o;
	}

	public static function emoji() {
		return array( 1 => '😡', 2 => '🙁', 3 => '😐', 4 => '🙂', 5 => '😍' );
	}

	/** image_choice behaves like radio / checkbox everywhere except rendering. */
	public static function alias( $f ) {
		if ( isset( $f['type'] ) && 'image_choice' === $f['type'] ) {
			$f['type'] = ! empty( $f['multiple'] ) ? 'checkbox' : 'radio';
		}
		return $f;
	}

	/** value => label for a dynamic dropdown (published posts of a public type, or taxonomy terms). */
	public static function post_options( $f ) {
		static $cache = array();
		$kind  = ( $f['source_kind'] ?? 'posts' ) === 'terms' ? 'terms' : 'posts';
		$slug  = sanitize_key( $f['source'] ?? ( 'terms' === $kind ? 'category' : 'page' ) );
		$limit = max( 1, min( 500, (int) ( $f['limit'] ?? 200 ) ) );
		$key   = $kind . '|' . $slug . '|' . $limit;
		if ( isset( $cache[ $key ] ) ) {
			return $cache[ $key ];
		}
		$out = array();
		if ( 'terms' === $kind ) {
			if ( taxonomy_exists( $slug ) ) {
				$terms = get_terms( array( 'taxonomy' => $slug, 'hide_empty' => false, 'number' => $limit ) );
				if ( ! is_wp_error( $terms ) ) {
					foreach ( $terms as $t ) {
						$out[ (string) $t->term_id ] = $t->name;
					}
				}
			}
		} else {
			$obj = post_type_exists( $slug ) ? get_post_type_object( $slug ) : null;
			if ( $obj && $obj->public ) {
				foreach ( get_posts( array( 'post_type' => $slug, 'post_status' => 'publish', 'numberposts' => $limit, 'orderby' => 'title', 'order' => 'ASC', 'has_password' => false ) ) as $p ) {
					$t                       = get_the_title( $p );
					$out[ (string) $p->ID ] = '' !== $t ? $t : '#' . $p->ID;
				}
			}
		}
		$cache[ $key ] = $out;
		return $out;
	}

	public static function repeater_row( $f, $i ) {
		$o = '<div class="wlfp-rep-row">';
		foreach ( (array) ( $f['columns'] ?? array() ) as $ci => $c ) {
			$type = in_array( $c['type'] ?? 'text', array( 'text', 'number', 'email', 'date' ), true ) ? $c['type'] : 'text';
			$o   .= '<label class="wlfp-rep-cell"><span class="wlfp-sublabel">' . esc_html( $c['label'] ) . '</span><input type="' . esc_attr( $type ) . '" class="wlfp-input" name="' . esc_attr( $f['name'] ) . '[' . esc_attr( $i ) . '][' . (int) $ci . ']" data-wlfp-field="' . esc_attr( $f['name'] ) . '" /></label>';
		}
		$o .= '<button type="button" class="wlfp-rep-del" aria-label="' . esc_attr__( 'Remove row', 'weberslink-forms-pro' ) . '">×</button></div>';
		return $o;
	}

	/* ---------------- Sanitise / validate ---------------- */

	/**
	 * Read the raw posted value for a field, sanitised. Files are handled separately.
	 */
	public static function collect( $f, $post ) {
		$f    = self::alias( $f );
		$name = $f['name'];
		$raw  = isset( $post[ $name ] ) ? wp_unslash( $post[ $name ] ) : null;
		if ( 'payment_item' === $f['type'] ) {
			$kind = isset( $f['kind'] ) ? $f['kind'] : 'fixed';
			if ( 'checkbox' === $kind || 'radio' === $kind || 'select' === $kind ) {
				$f['type'] = $kind;
			} elseif ( 'custom' === $kind ) {
				return null === $raw || is_array( $raw ) ? '' : ( is_numeric( $raw ) ? (string) max( 0, (float) $raw ) : '' );
			} else {
				return '1';
			}
		}
		switch ( $f['type'] ) {
			case 'textarea':
				return null === $raw ? '' : sanitize_textarea_field( is_array( $raw ) ? '' : $raw );
			case 'email':
				return null === $raw || is_array( $raw ) ? '' : sanitize_email( $raw );
			case 'url':
				return null === $raw || is_array( $raw ) ? '' : esc_url_raw( trim( $raw ) );
			case 'password':
				return null === $raw || is_array( $raw ) ? '' : (string) $raw;
			case 'checkbox':
			case 'multiselect':
				$vals = array_map( 'sanitize_text_field', array_map( 'strval', (array) $raw ) );
				if ( in_array( '__other__', $vals, true ) && isset( $post[ $name . '__other' ] ) ) {
					$vals = array_diff( $vals, array( '__other__' ) );
					$o    = sanitize_text_field( wp_unslash( $post[ $name . '__other' ] ) );
					if ( '' !== $o ) {
						$vals[] = $o;
					}
				}
				return array_values( array_filter( $vals, function ( $v ) {
					return '' !== $v;
				} ) );
			case 'radio':
				$v = null === $raw || is_array( $raw ) ? '' : sanitize_text_field( $raw );
				if ( '__other__' === $v ) {
					$v = isset( $post[ $name . '__other' ] ) ? sanitize_text_field( wp_unslash( $post[ $name . '__other' ] ) ) : '';
				}
				return $v;
			case 'name':
			case 'address':
			case 'date_range':
				$out = array();
				foreach ( (array) $raw as $k => $v ) {
					if ( is_scalar( $v ) ) {
						$out[ sanitize_key( $k ) ] = sanitize_text_field( (string) $v );
					}
				}
				return array_filter( $out, function ( $v ) {
					return '' !== $v;
				} );
			case 'likert':
				$out = array();
				foreach ( (array) $raw as $k => $v ) {
					if ( is_scalar( $v ) ) {
						$out[ sanitize_key( $k ) ] = sanitize_text_field( (string) $v );
					}
				}
				return $out;
			case 'repeater':
				$rows = array();
				foreach ( (array) $raw as $row ) {
					if ( ! is_array( $row ) ) {
						continue;
					}
					$clean = array_map( function ( $v ) {
						return sanitize_text_field( is_scalar( $v ) ? (string) $v : '' );
					}, array_values( $row ) );
					if ( array_filter( $clean, 'strlen' ) ) {
						$rows[] = $clean;
					}
				}
				return array_slice( $rows, 0, (int) ( $f['max_rows'] ?? 10 ) );
			case 'signature':
				$v = null === $raw || is_array( $raw ) ? '' : (string) $raw;
				return 0 === strpos( $v, 'data:image/png;base64,' ) && strlen( $v ) < 400000 && preg_match( '#^data:image/png;base64,[A-Za-z0-9+/=]+$#', $v ) ? $v : '';
			case 'consent':
			case 'terms':
				return $raw ? 'yes' : '';
			case 'toggle':
				return $raw ? 'yes' : 'no';
			case 'ranking':
				return array_values( array_unique( array_filter( array_map( 'sanitize_text_field', array_map( 'strval', array_filter( (array) $raw, 'is_scalar' ) ) ), 'strlen' ) ) );
			case 'post_select':
				if ( ! empty( $f['multiple'] ) ) {
					return array_values( array_filter( array_map( 'sanitize_text_field', array_map( 'strval', array_filter( (array) $raw, 'is_scalar' ) ) ), 'strlen' ) );
				}
				return null === $raw || is_array( $raw ) ? '' : sanitize_text_field( $raw );
			default:
				return null === $raw || is_array( $raw ) ? '' : sanitize_text_field( $raw );
		}
	}

	public static function is_empty( $v ) {
		if ( is_array( $v ) ) {
			return 0 === count( array_filter( $v, function ( $x ) {
				return is_array( $x ) ? ! empty( $x ) : '' !== (string) $x;
			} ) );
		}
		return '' === trim( (string) $v );
	}

	/** Returns an error string or ''. */
	public static function validate( $f, $v, $form ) {
		$f     = self::alias( $f );
		$label = ! empty( $f['label'] ) ? $f['label'] : $f['name'];
		if ( 'toggle' === $f['type'] ) {
			return ( ! empty( $f['required'] ) && 'yes' !== $v ) ? ( ! empty( $f['req_msg'] ) ? $f['req_msg'] : sprintf( /* translators: %s: field label */ __( '%s is required.', 'weberslink-forms-pro' ), $label ) ) : '';
		}
		if ( ! empty( $f['required'] ) && 'hidden' !== $f['type'] && self::is_empty( $v ) ) {
			return ! empty( $f['req_msg'] ) ? $f['req_msg'] : sprintf( /* translators: %s: field label */ __( '%s is required.', 'weberslink-forms-pro' ), $label );
		}
		if ( self::is_empty( $v ) ) {
			return '';
		}
		switch ( $f['type'] ) {
			case 'email':
				if ( ! is_email( $v ) ) {
					return __( 'Please enter a valid email address.', 'weberslink-forms-pro' );
				}
				break;
			case 'url':
				if ( ! preg_match( '#^https?://[^\s/$.?\#].[^\s]*$#i', $v ) ) {
					return __( 'Please enter a valid URL (starting with http:// or https://).', 'weberslink-forms-pro' );
				}
				break;
			case 'phone':
				if ( ! preg_match( '/^[0-9+()\-\s.#*ext]{5,30}$/i', $v ) ) {
					return __( 'Please enter a valid phone number.', 'weberslink-forms-pro' );
				}
				break;
			case 'number':
			case 'range':
			case 'quantity':
			case 'rating':
			case 'nps':
			case 'emoji_rating':
				if ( ! is_numeric( $v ) ) {
					return __( 'Please enter a number.', 'weberslink-forms-pro' );
				}
				if ( '' !== ( $f['min'] ?? '' ) && (float) $v < (float) $f['min'] ) {
					return sprintf( /* translators: %s: number */ __( 'Value must be at least %s.', 'weberslink-forms-pro' ), $f['min'] );
				}
				if ( '' !== ( $f['max'] ?? '' ) && (float) $v > (float) $f['max'] ) {
					return sprintf( /* translators: %s: number */ __( 'Value must be at most %s.', 'weberslink-forms-pro' ), $f['max'] );
				}
				break;
			case 'date':
				if ( ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $v ) || ! strtotime( $v ) ) {
					return __( 'Please enter a valid date.', 'weberslink-forms-pro' );
				}
				if ( ! empty( $f['min'] ) && $v < $f['min'] ) {
					return sprintf( /* translators: %s: date */ __( 'Date must be on or after %s.', 'weberslink-forms-pro' ), $f['min'] );
				}
				if ( ! empty( $f['max'] ) && $v > $f['max'] ) {
					return sprintf( /* translators: %s: date */ __( 'Date must be on or before %s.', 'weberslink-forms-pro' ), $f['max'] );
				}
				break;
			case 'time':
				if ( ! preg_match( '/^\d{2}:\d{2}(:\d{2})?$/', $v ) ) {
					return __( 'Please enter a valid time.', 'weberslink-forms-pro' );
				}
				break;
			case 'datetime':
				if ( ! preg_match( '/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/', $v ) ) {
					return __( 'Please enter a valid date and time.', 'weberslink-forms-pro' );
				}
				break;
			case 'ranking':
				$allowed = array_map( 'strval', wp_list_pluck( (array) ( $f['options'] ?? array() ), 'value' ) );
				foreach ( (array) $v as $x ) {
					if ( ! in_array( (string) $x, $allowed, true ) ) {
						return __( 'Invalid ranking.', 'weberslink-forms-pro' );
					}
				}
				break;
			case 'date_range':
				$a = isset( $v['start'] ) ? $v['start'] : '';
				$b = isset( $v['end'] ) ? $v['end'] : '';
				if ( ( '' === $a || '' === $b ) && ! empty( $f['required'] ) ) {
					return __( 'Please choose both a start and an end date.', 'weberslink-forms-pro' );
				}
				foreach ( array( $a, $b ) as $d ) {
					if ( '' !== $d && ( ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $d ) || ! strtotime( $d ) ) ) {
						return __( 'Please enter valid dates.', 'weberslink-forms-pro' );
					}
				}
				if ( '' !== $a && '' !== $b && $b < $a ) {
					return __( 'The end date must be on or after the start date.', 'weberslink-forms-pro' );
				}
				break;
			case 'us_state':
				if ( ! isset( WLFP_Helpers::us_states()[ $v ] ) ) {
					return __( 'Please choose a valid state.', 'weberslink-forms-pro' );
				}
				break;
			case 'post_select':
				$allowed = array_map( 'strval', array_keys( self::post_options( $f ) ) );
				foreach ( (array) $v as $x ) {
					if ( ! in_array( (string) $x, $allowed, true ) ) {
						return __( 'Please choose a valid option.', 'weberslink-forms-pro' );
					}
				}
				break;
			case 'color':
				if ( ! preg_match( '/^#[0-9a-fA-F]{6}$/', $v ) ) {
					return __( 'Invalid color.', 'weberslink-forms-pro' );
				}
				break;
			case 'country':
				if ( ! isset( WLFP_Helpers::countries()[ $v ] ) ) {
					return __( 'Please choose a valid country.', 'weberslink-forms-pro' );
				}
				break;
			case 'payment_item':
				if ( in_array( $f['kind'] ?? 'fixed', array( 'select', 'radio', 'checkbox' ), true ) ) {
					$allowed = array_map( 'strval', wp_list_pluck( (array) ( $f['options'] ?? array() ), 'value' ) );
					foreach ( (array) $v as $x ) {
						if ( ! in_array( (string) $x, $allowed, true ) ) {
							return __( 'Please choose a valid option.', 'weberslink-forms-pro' );
						}
					}
				} elseif ( 'custom' === ( $f['kind'] ?? '' ) && is_numeric( $v ) && '' !== ( $f['min'] ?? '' ) && (float) $v < (float) $f['min'] ) {
					return sprintf( /* translators: %s: amount */ __( 'The minimum amount is %s.', 'weberslink-forms-pro' ), $f['min'] );
				}
				break;
			case 'select':
			case 'radio':
				if ( ! empty( $f['options'] ) && empty( $f['other'] ) ) {
					$allowed = array_map( 'strval', wp_list_pluck( $f['options'], 'value' ) );
					if ( ! in_array( (string) $v, $allowed, true ) ) {
						return __( 'Please choose a valid option.', 'weberslink-forms-pro' );
					}
				}
				break;
			case 'checkbox':
			case 'multiselect':
				if ( ! empty( $f['options'] ) && empty( $f['other'] ) ) {
					$allowed = array_map( 'strval', wp_list_pluck( $f['options'], 'value' ) );
					foreach ( (array) $v as $x ) {
						if ( ! in_array( (string) $x, $allowed, true ) ) {
							return __( 'Please choose valid options.', 'weberslink-forms-pro' );
						}
					}
				}
				break;
			case 'likert':
				if ( ! empty( $f['required'] ) ) {
					foreach ( (array) ( $f['rows_list'] ?? array() ) as $row ) {
						if ( empty( $v[ sanitize_key( $row['value'] ) ] ) ) {
							return __( 'Please answer every row.', 'weberslink-forms-pro' );
						}
					}
				}
				break;
			case 'name':
				if ( ! empty( $f['required'] ) ) {
					foreach ( array( 'first', 'last' ) as $p ) {
						if ( ! empty( $f['parts'][ $p ] ) && empty( $v[ $p ] ) ) {
							return __( 'Please enter your full name.', 'weberslink-forms-pro' );
						}
					}
				}
				break;
			case 'address':
				if ( ! empty( $f['required'] ) ) {
					foreach ( array( 'line1', 'city', 'zip', 'country' ) as $p ) {
						if ( ! empty( $f['parts'][ $p ] ) && empty( $v[ $p ] ) ) {
							return __( 'Please complete the address.', 'weberslink-forms-pro' );
						}
					}
				}
				break;
		}
		if ( in_array( $f['type'], array( 'text', 'textarea' ), true ) && ! empty( $f['max_words'] ) && str_word_count( wp_strip_all_tags( (string) $v ) ) > (int) $f['max_words'] ) {
			return sprintf( /* translators: %d: words */ __( 'Please use at most %d words.', 'weberslink-forms-pro' ), (int) $f['max_words'] );
		}
		if ( in_array( $f['type'], array( 'text', 'textarea' ), true ) && ! empty( $f['maxlength'] ) && mb_strlen( (string) $v ) > (int) $f['maxlength'] ) {
			return sprintf( /* translators: %d: characters */ __( 'Please use at most %d characters.', 'weberslink-forms-pro' ), (int) $f['maxlength'] );
		}
		return apply_filters( 'wlfp_validate_field', '', $f, $v, $form );
	}

	/* ---------------- Display of stored values ---------------- */

	public static function format_value( $f, $v, $html = false ) {
		$f   = self::alias( $f );
		$out = '';
		switch ( $f['type'] ) {
			case 'toggle':
				$out = 'yes' === $v ? __( 'Yes', 'weberslink-forms-pro' ) : __( 'No', 'weberslink-forms-pro' );
				break;
			case 'terms':
				$out = $v ? __( 'Agreed', 'weberslink-forms-pro' ) : '';
				break;
			case 'ranking':
				$lines = array();
				foreach ( array_values( (array) $v ) as $i => $x ) {
					$lines[] = ( $i + 1 ) . '. ' . self::option_label( $f, $x );
				}
				return $html ? implode( '<br>', array_map( 'esc_html', $lines ) ) : implode( "\n", $lines );
			case 'date_range':
				$out = ( $v['start'] ?? '' ) . ' → ' . ( $v['end'] ?? '' );
				break;
			case 'emoji_rating':
				$e   = self::emoji();
				$out = ( isset( $e[ (int) $v ] ) ? $e[ (int) $v ] . ' ' : '' ) . $v . ' / 5';
				break;
			case 'us_state':
				$st  = WLFP_Helpers::us_states();
				$out = isset( $st[ $v ] ) ? $st[ $v ] : (string) $v;
				break;
			case 'post_select':
				$opts = self::post_options( $f );
				$out  = implode( ', ', array_map( function ( $x ) use ( $opts ) {
					return isset( $opts[ (string) $x ] ) ? $opts[ (string) $x ] : (string) $x;
				}, (array) $v ) );
				break;
			case 'name':
				$out = trim( implode( ' ', array_filter( array( $v['prefix'] ?? '', $v['first'] ?? '', $v['middle'] ?? '', $v['last'] ?? '' ) ) ) );
				break;
			case 'address':
				$parts = array();
				foreach ( array( 'line1', 'line2', 'city', 'state', 'zip' ) as $p ) {
					if ( ! empty( $v[ $p ] ) ) {
						$parts[] = $v[ $p ];
					}
				}
				if ( ! empty( $v['country'] ) ) {
					$c       = WLFP_Helpers::countries();
					$parts[] = isset( $c[ $v['country'] ] ) ? $c[ $v['country'] ] : $v['country'];
				}
				$out = implode( ', ', $parts );
				break;
			case 'country':
				$c   = WLFP_Helpers::countries();
				$out = isset( $c[ $v ] ) ? $c[ $v ] : (string) $v;
				break;
			case 'select':
			case 'radio':
				$out = self::option_label( $f, $v );
				break;
			case 'checkbox':
			case 'multiselect':
				$out = implode( ', ', array_map( function ( $x ) use ( $f ) {
					return self::option_label( $f, $x );
				}, (array) $v ) );
				break;
			case 'consent':
				$out = $v ? __( 'Agreed', 'weberslink-forms-pro' ) : '';
				break;
			case 'file':
			case 'image':
				$links = array();
				foreach ( (array) $v as $file ) {
					if ( is_array( $file ) && ! empty( $file['url'] ) ) {
						$links[] = $html ? '<a href="' . esc_url( $file['url'] ) . '" target="_blank" rel="noopener">' . esc_html( $file['name'] ) . '</a>' : $file['name'] . ' (' . $file['url'] . ')';
					}
				}
				return $html ? implode( '<br>', $links ) : implode( "\n", $links );
			case 'signature':
				return $v ? ( $html ? '<img src="' . esc_attr( $v ) . '" alt="" style="max-width:300px;height:auto;border:1px solid #ddd" />' : __( '[signature]', 'weberslink-forms-pro' ) ) : '';
			case 'likert':
				$lines = array();
				foreach ( (array) ( $f['rows_list'] ?? array() ) as $row ) {
					if ( isset( $v[ sanitize_key( $row['value'] ) ] ) ) {
						$lines[] = $row['label'] . ': ' . self::option_label( $f, $v[ sanitize_key( $row['value'] ) ] );
					}
				}
				$out = implode( $html ? '<br>' : "\n", array_map( $html ? 'esc_html' : 'strval', $lines ) );
				return $out;
			case 'repeater':
				$lines = array();
				foreach ( (array) $v as $row ) {
					$lines[] = implode( ' | ', (array) $row );
				}
				$out = implode( $html ? '<br>' : "\n", array_map( $html ? 'esc_html' : 'strval', $lines ) );
				return $out;
			case 'rating':
				$out = $v . ' / ' . (int) ( $f['max'] ?? 5 );
				break;
			case 'nps':
				$out = $v . ' / 10';
				break;
			case 'payment_item':
				if ( is_array( $v ) ) {
					$out = implode( ', ', array_map( function ( $x ) use ( $f ) {
						return self::option_label( $f, $x );
					}, $v ) );
				} elseif ( 'fixed' === ( $f['kind'] ?? 'fixed' ) ) {
					$out = ( $f['label'] ?? '' );
				} elseif ( 'custom' === ( $f['kind'] ?? '' ) ) {
					$out = (string) $v;
				} else {
					$out = self::option_label( $f, $v );
				}
				break;
			case 'textarea':
				return $html ? nl2br( esc_html( (string) $v ) ) : (string) $v;
			case 'url':
				return $html ? '<a href="' . esc_url( $v ) . '">' . esc_html( $v ) . '</a>' : (string) $v;
			case 'email':
				return $html ? '<a href="mailto:' . esc_attr( $v ) . '">' . esc_html( $v ) . '</a>' : (string) $v;
			case 'password':
				return $v ? '••••••••' : '';
			default:
				$out = is_array( $v ) ? implode( ', ', $v ) : (string) $v;
		}
		return $html ? esc_html( $out ) : $out;
	}

	public static function option_label( $f, $v ) {
		foreach ( (array) ( $f['options'] ?? array() ) as $o ) {
			if ( (string) $o['value'] === (string) $v ) {
				return $o['label'];
			}
		}
		return (string) $v;
	}
}
