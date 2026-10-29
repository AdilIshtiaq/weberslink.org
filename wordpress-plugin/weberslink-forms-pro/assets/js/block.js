( function ( wp ) {
	var el = wp.element.createElement;
	var __ = wp.i18n.__;
	var cfg = window.WLFPBlock || { forms: [] };
	wp.blocks.registerBlockType( 'weberslink-forms-pro/form', {
		apiVersion: 2,
		title: 'Weberslink Form',
		description: __( 'Embed a Weberslink form.', 'weberslink-forms-pro' ),
		icon: 'feedback',
		category: 'widgets',
		keywords: [ 'form', 'contact', 'weberslink' ],
		attributes: { formId: { type: 'integer', default: 0 }, showTitle: { type: 'boolean', default: false } },
		edit: function ( props ) {
			var a = props.attributes;
			var blockProps = wp.blockEditor.useBlockProps();
			return el( 'div', blockProps,
				el( wp.blockEditor.InspectorControls, null,
					el( wp.components.PanelBody, { title: __( 'Form settings', 'weberslink-forms-pro' ), initialOpen: true },
						el( wp.components.SelectControl, { label: __( 'Form', 'weberslink-forms-pro' ), value: a.formId, options: cfg.forms, onChange: function ( v ) { props.setAttributes( { formId: parseInt( v, 10 ) || 0 } ); } } ),
						el( wp.components.ToggleControl, { label: __( 'Show form title', 'weberslink-forms-pro' ), checked: !! a.showTitle, onChange: function ( v ) { props.setAttributes( { showTitle: v } ); } } )
					)
				),
				a.formId
					? el( wp.serverSideRender, { block: 'weberslink-forms-pro/form', attributes: a } )
					: el( wp.components.Placeholder, { icon: 'feedback', label: 'Weberslink Form', instructions: __( 'Choose a form to display.', 'weberslink-forms-pro' ) },
						el( wp.components.SelectControl, { value: a.formId, options: cfg.forms, onChange: function ( v ) { props.setAttributes( { formId: parseInt( v, 10 ) || 0 } ); } } ) )
			);
		},
		save: function () { return null; }
	} );
} )( window.wp );
