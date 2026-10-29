/* Weberslink Forms Pro — admin form builder (vanilla JS). */
( function () {
	'use strict';
	var C = window.WLFPB;
	var root = document.getElementById( 'wlfp-builder' );
	if ( ! C || ! root ) { return; }
	var I = C.i18n;
	var F = C.form;
	F.fields = F.fields || [];
	var S = { sel: null, tab: 'build', sub: 'confirmation', dirty: false, last: null, q: '' };

	/* ---------- tiny DOM helper ---------- */
	function h( tag, props ) {
		var e = document.createElement( tag );
		props = props || {};
		Object.keys( props ).forEach( function ( k ) {
			var v = props[ k ];
			if ( v === undefined || v === null || v === false ) { return; }
			if ( k === 'class' ) { e.className = v; }
			else if ( k === 'text' ) { e.textContent = v; }
			else if ( k.slice( 0, 2 ) === 'on' ) { e.addEventListener( k.slice( 2 ), v ); }
			else if ( k === 'value' ) { e.value = v; }
			else if ( k === 'checked' ) { e.checked = !! v; }
			else if ( k === 'selected' ) { e.selected = !! v; }
			else { e.setAttribute( k, v === true ? '' : v ); }
		} );
		for ( var i = 2; i < arguments.length; i++ ) { add( e, arguments[ i ] ); }
		return e;
	}
	function add( p, c ) {
		if ( c === null || c === undefined || c === false ) { return; }
		if ( Array.isArray( c ) ) { c.forEach( function ( x ) { add( p, x ); } ); }
		else if ( c.nodeType ) { p.appendChild( c ); }
		else { p.appendChild( document.createTextNode( String( c ) ) ); }
	}
	function clear( e ) { while ( e.firstChild ) { e.removeChild( e.firstChild ); } }
	function touch() { S.dirty = true; }
	function uid() { return 'f_' + Math.random().toString( 36 ).slice( 2, 10 ); }
	function slug( s ) { return String( s ).toLowerCase().replace( /[^a-z0-9]+/g, '_' ).replace( /^_+|_+$/g, '' ); }
	function clone( o ) { return JSON.parse( JSON.stringify( o ) ); }
	function toast( msg, err ) {
		var t = h( 'div', { class: 'wlfpb-toast' + ( err ? ' err' : '' ), role: 'status', text: msg } );
		document.body.appendChild( t );
		setTimeout( function () { t.remove(); }, 2600 );
	}

	/* ---------- generic controls ---------- */
	function track( el ) { el.addEventListener( 'focus', function () { S.last = el; } ); return el; }
	function row( label, el, help ) { return h( 'div', { class: 'wlfpb-f' }, label ? h( 'label', { text: label } ) : null, el, help ? h( 'div', { class: 'd', text: help } ) : null ); }
	function text( obj, key, o ) {
		o = o || {};
		var e = track( h( 'input', { type: o.type || 'text', value: obj[ key ] === undefined || obj[ key ] === null ? '' : obj[ key ], placeholder: o.ph, min: o.min, max: o.max, step: o.step, class: o.cls } ) );
		e.addEventListener( 'input', function () { obj[ key ] = o.type === 'number' ? e.value : e.value; touch(); if ( o.on ) { o.on( e.value ); } } );
		return o.label === false ? e : row( o.label, e, o.help );
	}
	function area( obj, key, o ) {
		o = o || {};
		var e = track( h( 'textarea', { rows: o.rows || 4, placeholder: o.ph } ) );
		e.value = obj[ key ] || '';
		e.addEventListener( 'input', function () { obj[ key ] = e.value; touch(); if ( o.on ) { o.on(); } } );
		return row( o.label, e, o.help );
	}
	function check( obj, key, label, o ) {
		o = o || {};
		var e = h( 'input', { type: 'checkbox', checked: !! Number( obj[ key ] ) || obj[ key ] === true } );
		e.addEventListener( 'change', function () { obj[ key ] = e.checked ? 1 : 0; touch(); if ( o.on ) { o.on( e.checked ); } } );
		return h( 'label', { class: 'wlfpb-ck' }, e, h( 'span', { text: label } ) );
	}
	function sel( obj, key, opts, o ) {
		o = o || {};
		var e = h( 'select' );
		var list = Array.isArray( opts ) ? opts : Object.keys( opts ).map( function ( k ) { return [ k, opts[ k ] ]; } );
		list.forEach( function ( p ) { e.appendChild( h( 'option', { value: p[ 0 ], text: p[ 1 ], selected: String( obj[ key ] ) === String( p[ 0 ] ) } ) ); } );
		e.addEventListener( 'change', function () { obj[ key ] = e.value; touch(); if ( o.on ) { o.on( e.value ); } } );
		return o.label === false ? e : row( o.label, e, o.help );
	}
	function color( obj, key, label ) {
		var e = h( 'input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test( obj[ key ] || '' ) ? obj[ key ] : '#2563eb' } );
		var clr = h( 'button', { type: 'button', class: 'button button-small', text: 'Reset', onclick: function () { obj[ key ] = ''; e.value = '#2563eb'; used.textContent = 'Theme default'; touch(); } } );
		var used = h( 'span', { class: 'd', text: obj[ key ] ? obj[ key ] : 'Theme default' } );
		e.addEventListener( 'input', function () { obj[ key ] = e.value; used.textContent = e.value; touch(); } );
		return row( label, h( 'div', { style: 'display:flex;gap:8px;align-items:center' }, e, clr, used ) );
	}

	/* ---------- field helpers ---------- */
	function valueFields() { return F.fields.filter( function ( f ) { return f.name && [ 'section', 'html', 'divider', 'page_break', 'captcha', 'payment_summary', 'shortcode' ].indexOf( f.type ) === -1; } ); }
	function byId( id ) { for ( var i = 0; i < F.fields.length; i++ ) { if ( F.fields[ i ].id === id ) { return F.fields[ i ]; } } return null; }
	function indexOf( id ) { for ( var i = 0; i < F.fields.length; i++ ) { if ( F.fields[ i ].id === id ) { return i; } } return -1; }
	function uniqueName( base, selfId ) {
		base = slug( base ) || 'field';
		var n = base, i = 2;
		var taken = function ( x ) { return F.fields.some( function ( f ) { return f.id !== selfId && f.name === x; } ); };
		while ( taken( n ) ) { n = base + '_' + i++; }
		return n;
	}
	function newField( type ) {
		var f = clone( C.defaults[ type ] );
		f.id = uid();
		if ( [ 'section', 'html', 'divider', 'page_break', 'captcha', 'payment_summary', 'shortcode' ].indexOf( type ) === -1 ) {
			f.name = uniqueName( f.label || type, f.id );
		} else { f.name = ''; }
		if ( type === 'payment_item' ) { f.label = 'Product'; }
		return f;
	}
	function addField( type, at ) {
		var f = newField( type );
		if ( typeof at !== 'number' ) { at = S.sel ? indexOf( S.sel ) + 1 : F.fields.length; }
		F.fields.splice( at, 0, f );
		S.sel = f.id;
		touch(); renderBuild();
	}

	/* ---------- header ---------- */
	function renderAll() {
		clear( root );
		root.appendChild( topBar() );
		root.appendChild( tabsBar() );
		var body = h( 'div', { class: 'wlfpb-body', id: 'wlfpb-body' } );
		root.appendChild( body );
		renderTab();
	}
	function renderTab() {
		var body = document.getElementById( 'wlfpb-body' );
		clear( body );
		( { build: buildTab, settings: settingsTab, emails: emailsTab, feeds: feedsTab, payments: paymentsTab }[ S.tab ] )( body );
	}
	var scEl;
	function topBar() {
		var title = h( 'input', { class: 'wlfpb-title', type: 'text', value: F.title, 'aria-label': 'Form title' } );
		title.addEventListener( 'input', function () { F.title = title.value; touch(); } );
		var status = sel( F, 'status', [ [ 'published', 'Published' ], [ 'draft', 'Draft' ] ], { label: false } );
		scEl = h( 'code', { title: 'Click to copy', onclick: function () { try { navigator.clipboard.writeText( scEl.textContent ); toast( 'Shortcode copied' ); } catch ( e ) {} } }, shortcodeText() );
		var back = h( 'a', { href: C.listUrl, class: 'button', text: '← Forms' } );
		var prev = h( 'a', { class: 'button', target: '_blank', rel: 'noopener', text: 'Preview', onclick: function ( e ) { if ( ! F.id ) { e.preventDefault(); toast( 'Save the form first', true ); } else { prev.href = C.previewUrl + '?wlfp_preview=' + F.id; } } } );
		prev.href = F.id ? C.previewUrl + '?wlfp_preview=' + F.id : '#';
		var save = h( 'button', { class: 'button button-primary', type: 'button', text: 'Save', onclick: function () { save.textContent = I.saving; doSave( function () { save.textContent = 'Save'; } ); } } );
		return h( 'div', { class: 'wlfpb-top' }, back, title, status, scEl, prev, save );
	}
	function shortcodeText() { return F.id ? '[weberslink_form id="' + F.id + '"]' : '(save to get the shortcode)'; }
	function tabsBar() {
		var tabs = [ [ 'build', 'Build' ], [ 'settings', 'Settings' ], [ 'emails', 'Emails' ], [ 'feeds', 'Integrations' ], [ 'payments', 'Payments' ] ];
		return h( 'div', { class: 'wlfpb-tabs', role: 'tablist' }, tabs.map( function ( t ) {
			return h( 'button', { type: 'button', role: 'tab', class: 'wlfpb-tab' + ( S.tab === t[ 0 ] ? ' on' : '' ), text: t[ 1 ], onclick: function () { S.tab = t[ 0 ]; renderAll(); } } );
		} ) );
	}
	function doSave( done ) {
		var fd = new FormData();
		fd.append( 'action', 'wlfp_save_form' );
		fd.append( 'nonce', C.nonce );
		fd.append( 'form', JSON.stringify( { id: F.id, title: F.title, status: F.status, fields: F.fields, settings: F.settings } ) );
		fetch( C.ajax, { method: 'POST', body: fd, credentials: 'same-origin' } ).then( function ( r ) { return r.json(); } ).then( function ( j ) {
			if ( done ) { done(); }
			if ( j && j.success ) {
				var firstSave = ! F.id;
				F.id = j.data.id;
				// Adopt server-normalised names so conditional logic / calculations match.
				var map = {};
				j.data.form.fields.forEach( function ( sf ) { map[ sf.id ] = sf; } );
				F.fields.forEach( function ( lf ) { if ( map[ lf.id ] && map[ lf.id ].name !== lf.name ) { lf.name = map[ lf.id ].name; } } );
				S.dirty = false;
				if ( firstSave ) { try { history.replaceState( null, '', location.pathname + '?page=wlfp-builder&form=' + F.id ); } catch ( e ) {} }
				if ( scEl ) { scEl.textContent = shortcodeText(); }
				toast( I.saved );
				if ( S.tab === 'build' ) { renderBuild(); }
			} else { toast( I.error, true ); }
		} ).catch( function () { if ( done ) { done(); } toast( I.error, true ); } );
	}
	window.addEventListener( 'beforeunload', function ( e ) { if ( S.dirty ) { e.preventDefault(); e.returnValue = I.leave; return I.leave; } } );
	document.addEventListener( 'keydown', function ( e ) { if ( ( e.ctrlKey || e.metaKey ) && e.key === 's' ) { e.preventDefault(); doSave(); } } );

	/* ---------- BUILD tab ---------- */
	var palEl, canvasEl, sideEl;
	function buildTab( body ) {
		palEl = h( 'div', { class: 'wlfpb-panel wlfpb-palette' } );
		canvasEl = h( 'div', { class: 'wlfpb-panel wlfpb-canvas', 'aria-label': 'Form canvas' } );
		sideEl = h( 'div', { class: 'wlfpb-panel wlfpb-side' } );
		body.appendChild( h( 'div', { class: 'wlfpb-build' }, palEl, canvasEl, sideEl ) );
		renderBuild();
	}
	function renderBuild() { renderPalette(); renderCanvas(); renderSide(); }

	function renderPalette() {
		clear( palEl );
		var search = h( 'input', { type: 'search', placeholder: 'Search fields…', value: S.q, style: 'width:100%;margin-bottom:8px' } );
		search.addEventListener( 'input', function () { S.q = search.value.toLowerCase(); renderPaletteList(); } );
		palEl.appendChild( search );
		palEl.appendChild( h( 'div', { id: 'wlfpb-pal-list' } ) );
		renderPaletteList();
	}
	function renderPaletteList() {
		var list = document.getElementById( 'wlfpb-pal-list' );
		clear( list );
		var groups = { basic: 'Basic', advanced: 'Advanced', payment: 'Payments', layout: 'Layout' };
		Object.keys( groups ).forEach( function ( g ) {
			var items = Object.keys( C.types ).filter( function ( t ) { return C.types[ t ].group === g && ( ! S.q || C.types[ t ].label.toLowerCase().indexOf( S.q ) !== -1 ); } );
			if ( ! items.length ) { return; }
			list.appendChild( h( 'h4', { text: groups[ g ] } ) );
			items.forEach( function ( t ) {
				var b = h( 'button', { type: 'button', class: 'wlfpb-pal', draggable: 'true', title: 'Click to add, or drag onto the form' }, h( 'i', { text: C.types[ t ].icon } ), C.types[ t ].label );
				b.addEventListener( 'click', function () { addField( t ); } );
				b.addEventListener( 'dragstart', function ( e ) { e.dataTransfer.setData( 'text/plain', 'new:' + t ); e.dataTransfer.effectAllowed = 'copy'; } );
				list.appendChild( b );
			} );
		} );
	}

	function dropIndex( e ) {
		var cards = Array.prototype.slice.call( canvasEl.querySelectorAll( '.wlfpb-card' ) );
		for ( var i = 0; i < cards.length; i++ ) {
			var r = cards[ i ].getBoundingClientRect();
			if ( e.clientY < r.top + r.height / 2 ) { return i; }
		}
		return cards.length;
	}
	function renderCanvas() {
		clear( canvasEl );
		canvasEl.ondragover = function ( e ) {
			e.preventDefault();
			var idx = dropIndex( e );
			Array.prototype.forEach.call( canvasEl.querySelectorAll( '.wlfpb-drop' ), function ( d ) { d.remove(); } );
			var cards = canvasEl.querySelectorAll( '.wlfpb-card' );
			var ind = h( 'div', { class: 'wlfpb-drop' } );
			if ( cards[ idx ] ) { canvasEl.insertBefore( ind, cards[ idx ] ); } else { canvasEl.appendChild( ind ); }
		};
		canvasEl.ondragleave = function ( e ) { if ( e.target === canvasEl ) { Array.prototype.forEach.call( canvasEl.querySelectorAll( '.wlfpb-drop' ), function ( d ) { d.remove(); } ); } };
		canvasEl.ondrop = function ( e ) {
			e.preventDefault();
			var idx = dropIndex( e );
			Array.prototype.forEach.call( canvasEl.querySelectorAll( '.wlfpb-drop' ), function ( d ) { d.remove(); } );
			var d = e.dataTransfer.getData( 'text/plain' );
			if ( d.indexOf( 'new:' ) === 0 ) { addField( d.slice( 4 ), idx ); }
			else if ( d.indexOf( 'move:' ) === 0 ) {
				var from = indexOf( d.slice( 5 ) );
				if ( from < 0 ) { return; }
				var f = F.fields.splice( from, 1 )[ 0 ];
				if ( from < idx ) { idx--; }
				F.fields.splice( idx, 0, f );
				touch(); renderCanvas();
			}
		};
		canvasEl.onclick = function ( e ) { if ( e.target === canvasEl ) { S.sel = null; renderCanvas(); renderSide(); } };
		if ( ! F.fields.length ) {
			canvasEl.appendChild( h( 'div', { class: 'wlfpb-empty', text: 'Drag fields here, or click a field on the left to add it.' } ) );
			return;
		}
		F.fields.forEach( function ( f, i ) { canvasEl.appendChild( card( f, i ) ); } );
	}

	function card( f, i ) {
		var t = C.types[ f.type ] || { label: f.type, icon: '?' };
		var el = h( 'div', { class: 'wlfpb-card' + ( S.sel === f.id ? ' sel' : '' ), 'data-id': f.id, tabindex: '0' } );
		var handle = h( 'span', { class: 'wlfpb-handle', draggable: 'true', title: 'Drag to reorder', text: '⠿' } );
		handle.addEventListener( 'dragstart', function ( e ) { e.dataTransfer.setData( 'text/plain', 'move:' + f.id ); e.dataTransfer.effectAllowed = 'move'; el.classList.add( 'dragging' ); setTimeout( function () { el.classList.remove( 'dragging' ); }, 0 ); } );
		var ib = function ( txt, title, fn, cls ) { return h( 'button', { type: 'button', class: 'wlfpb-ib ' + ( cls || '' ), title: title, 'aria-label': title, text: txt, onclick: function ( e ) { e.stopPropagation(); fn(); } } ); };
		var acts = h( 'div', { class: 'wlfpb-acts' },
			ib( '↑', 'Move up', function () { if ( i > 0 ) { F.fields.splice( i - 1, 0, F.fields.splice( i, 1 )[ 0 ] ); touch(); renderCanvas(); } } ),
			ib( '↓', 'Move down', function () { if ( i < F.fields.length - 1 ) { F.fields.splice( i + 1, 0, F.fields.splice( i, 1 )[ 0 ] ); touch(); renderCanvas(); } } ),
			ib( '⧉', 'Duplicate', function () { var c = clone( f ); c.id = uid(); if ( c.name ) { c.name = uniqueName( c.name, c.id ); } F.fields.splice( i + 1, 0, c ); S.sel = c.id; touch(); renderBuild(); } ),
			ib( '🗑', 'Delete', function () { if ( window.confirm( I.confirmDelete ) ) { F.fields.splice( i, 1 ); if ( S.sel === f.id ) { S.sel = null; } touch(); renderBuild(); } }, 'del' ) );
		var head = h( 'div', { class: 'wlfpb-card-h' }, handle, h( 'span', { class: 'wlfpb-card-l', text: f.label || ( '(' + t.label + ')' ) } ),
			f.required ? h( 'span', { class: 'wlfpb-badge req', text: 'required' } ) : null,
			f.conditional && Number( f.conditional.enabled ) ? h( 'span', { class: 'wlfpb-badge cond', text: 'logic' } ) : null,
			h( 'span', { class: 'wlfpb-badge', text: t.label + ( f.width && f.width !== 'full' ? ' · ' + f.width.replace( '_', ' ' ) : '' ) } ), acts );
		el.appendChild( head );
		el.appendChild( mock( f ) );
		el.addEventListener( 'click', function () { S.sel = f.id; Array.prototype.forEach.call( canvasEl.querySelectorAll( '.wlfpb-card' ), function ( c ) { c.classList.toggle( 'sel', c.getAttribute( 'data-id' ) === f.id ); } ); renderSide(); } );
		el.addEventListener( 'keydown', function ( e ) { if ( e.key === 'Enter' && e.target === el ) { el.click(); } } );
		return el;
	}

	function mock( f ) {
		var m = h( 'div', { class: 'wlfpb-mock' } );
		var box = function ( txt, cls ) { return h( 'div', { class: 'm ' + ( cls || '' ) }, h( 'span', { text: txt || '' } ) ); };
		var opts = function ( kind ) { return ( f.options || [] ).slice( 0, 4 ).map( function ( o ) { return h( 'div', { class: 'c' }, h( 'b', { style: kind === 'checkbox' ? 'border-radius:2px' : '' } ), o.label + ( o.price ? ' (' + o.price + ')' : '' ) ); } ); };
		switch ( f.type ) {
			case 'textarea': add( m, box( f.placeholder, 'tall' ) ); break;
			case 'select': case 'country': case 'multiselect': add( m, h( 'div', { class: 'm' }, h( 'span', { text: f.placeholder || ( f.type === 'country' ? 'Select a country' : 'Select…' ) } ), '▾' ) ); break;
			case 'radio': case 'checkbox': add( m, opts( f.type ) ); break;
			case 'consent': add( m, h( 'div', { class: 'c' }, h( 'b', { style: 'border-radius:2px' } ), ( f.terms || '' ).replace( /<[^>]+>/g, '' ) ) ); break;
			case 'name': add( m, h( 'div', { class: 'g' }, box( 'First name' ), box( 'Last name' ) ) ); break;
			case 'address': add( m, h( 'div', { class: 'g' }, box( 'Address line 1' ), box( 'City' ), box( 'ZIP' ), box( 'Country' ) ) ); break;
			case 'file': case 'image': add( m, box( ( f.type === 'image' ? 'Choose image' : 'Choose file' ) + ' (' + ( f.allowed || '' ) + ')' ) ); break;
			case 'rating': add( m, h( 'div', { class: 'st', text: new Array( ( parseInt( f.max, 10 ) || 5 ) + 1 ).join( '★' ) } ) ); break;
			case 'nps': add( m, box( '0 1 2 3 4 5 6 7 8 9 10' ) ); break;
			case 'range': add( m, box( ( f.min || 0 ) + ' ——●—— ' + ( f.max || 100 ) ) ); break;
			case 'likert': add( m, box( ( f.rows_list || [] ).length + ' rows × ' + ( f.options || [] ).length + ' columns' ) ); break;
			case 'signature': add( m, box( '✍ Sign here', 'tall' ) ); break;
			case 'repeater': add( m, h( 'div', { class: 'g' }, ( f.columns || [] ).map( function ( c ) { return box( c.label ); } ) ) ); break;
			case 'calculation': add( m, box( '= ' + ( f.formula || '(add a formula)' ) ) ); break;
			case 'payment_item': add( m, f.kind === 'fixed' ? box( 'Price: ' + ( f.price || 0 ) ) : ( f.kind === 'custom' ? box( 'Enter amount' ) : opts( f.kind ) ) ); break;
			case 'quantity': add( m, box( 'Qty ' + ( f.default || 1 ) ) ); break;
			case 'coupon': add( m, box( 'Coupon code     [Apply]' ) ); break;
			case 'payment_summary': add( m, box( 'Order summary & total appear here' ) ); break;
			case 'section': add( m, h( 'strong', { text: f.label } ) ); break;
			case 'html': add( m, h( 'div', { text: ( f.html || '' ).replace( /<[^>]+>/g, ' ' ).slice( 0, 160 ) } ) ); break;
			case 'divider': add( m, h( 'hr' ) ); break;
			case 'page_break': add( m, h( 'div', { text: '⇥ Step break' + ( f.step_title ? ': ' + f.step_title : '' ), style: 'text-align:center;border:1px dashed #8c8f94;padding:6px;border-radius:4px' } ) ); break;
			case 'captcha': add( m, box( '🛡 CAPTCHA' ) ); break;
			case 'shortcode': add( m, box( f.shortcode || '[shortcode]' ) ); break;
			case 'hidden': add( m, box( 'Hidden: ' + ( f.default || '' ) ) ); break;
			case 'color': add( m, box( '🎨 #000000' ) ); break;
			default: add( m, box( f.placeholder ) );
		}
		return m;
	}

	/* ---------- side panel (field settings) ---------- */
	function renderSide() {
		clear( sideEl );
		var f = S.sel ? byId( S.sel ) : null;
		if ( ! f ) {
			sideEl.appendChild( h( 'h3', { text: 'Field settings' } ) );
			sideEl.appendChild( h( 'p', { class: 'description', text: 'Select a field on the canvas to edit it. Use ↑ ↓ or drag the ⠿ handle to reorder.' } ) );
			return;
		}
		var t = C.types[ f.type ] || { label: f.type };
		var refresh = function () { var c = canvasEl.querySelector( '.wlfpb-card[data-id="' + f.id + '"]' ); if ( c ) { var n = card( f, indexOf( f.id ) ); c.replaceWith( n ); } };
		sideEl.appendChild( h( 'h3', { text: t.label } ) );
		var isLayout = [ 'section', 'html', 'divider', 'page_break', 'captcha', 'payment_summary', 'shortcode' ].indexOf( f.type ) !== -1;
		var gen = h( 'details', { open: true }, h( 'summary', { text: 'General' } ) );
		if ( f.type !== 'divider' && f.type !== 'html' && f.type !== 'captcha' && f.type !== 'payment_summary' && f.type !== 'shortcode' ) {
			gen.appendChild( text( f, 'label', { label: f.type === 'page_break' ? 'Button label / step title' : 'Label', on: function ( v ) { refresh(); if ( f.type === 'page_break' && ! f.step_title ) { /* keep */ } } } ) );
		}
		if ( ! isLayout ) {
			gen.appendChild( text( f, 'name', { label: 'Field key', help: 'Used in merge tags {field:key}, exports and conditions.', on: function () { f.name = slug( f.name ); } } ) );
		}
		if ( [ 'text', 'textarea', 'email', 'number', 'phone', 'url', 'password', 'select' ].indexOf( f.type ) !== -1 ) { gen.appendChild( text( f, 'placeholder', { label: 'Placeholder', on: refresh } ) ); }
		if ( f.type === 'consent' ) { gen.appendChild( area( f, 'terms', { label: 'Consent text (HTML allowed)', rows: 3, on: refresh } ) ); }
		if ( f.type === 'html' ) { gen.appendChild( area( f, 'html', { label: 'HTML / text', rows: 8, on: refresh } ) ); }
		if ( f.type === 'section' ) { gen.appendChild( text( f, 'help', { label: 'Description (optional)' } ) ); }
		if ( f.type === 'page_break' ) { gen.appendChild( text( f, 'step_title', { label: 'Title of the step that ends here', help: 'Shown in the progress bar. The first step is named in Settings → Steps.' } ) ); }
		if ( f.type === 'shortcode' ) { gen.appendChild( text( f, 'shortcode', { label: 'Shortcode', ph: '[my_shortcode]', on: refresh } ) ); }
		if ( ! isLayout && f.type !== 'hidden' && f.type !== 'consent' ) { gen.appendChild( text( f, 'help', { label: 'Help text' } ) ); }
		if ( ! isLayout && [ 'file', 'image', 'signature', 'repeater', 'calculation', 'rating', 'nps', 'likert', 'payment_item', 'quantity', 'coupon' ].indexOf( f.type ) === -1 ) {
			var dv = text( f, 'default', { label: 'Default value', help: 'Merge tags work: {user_email}, {get:param}…' } );
			gen.appendChild( dv );
		}
		if ( ! isLayout && [ 'hidden', 'calculation', 'coupon' ].indexOf( f.type ) === -1 ) {
			gen.appendChild( check( f, 'required', 'Required', { on: function () { refresh(); } } ) );
			if ( f.required ) { gen.appendChild( text( f, 'req_msg', { label: 'Custom "required" message' } ) ); }
		}
		if ( f.type !== 'hidden' ) {
			gen.appendChild( sel( f, 'width', [ [ 'full', 'Full width' ], [ 'half', 'Half (1/2)' ], [ 'third', 'Third (1/3)' ], [ 'two_third', 'Two thirds (2/3)' ], [ 'quarter', 'Quarter (1/4)' ] ], { label: 'Width', on: refresh } ) );
			gen.appendChild( text( f, 'css_class', { label: 'Custom CSS class' } ) );
		}
		sideEl.appendChild( gen );

		var spec = typeSettings( f, refresh );
		if ( spec ) { sideEl.appendChild( h( 'details', { open: true }, h( 'summary', { text: 'Options' } ), spec ) ); }

		if ( f.type !== 'page_break' ) {
			f.conditional = f.conditional || { enabled: 0, match: 'all', rules: [] };
			sideEl.appendChild( h( 'details', { open: !! Number( f.conditional.enabled ) }, h( 'summary', { text: 'Conditional logic' } ), condEditor( f.conditional, f.id, refresh ) ) );
		}
	}

	function optionsEditor( f, o ) {
		o = o || {};
		var wrap = h( 'div' );
		var draw = function () {
			clear( wrap );
			f.options = f.options || [];
			f.options.forEach( function ( op, i ) {
				var lab = h( 'input', { type: 'text', value: op.label, placeholder: 'Label', 'aria-label': 'Option label' } );
				var val = h( 'input', { type: 'text', value: op.value, placeholder: 'Value', 'aria-label': 'Option value' } );
				var manual = op.value !== slug( op.label );
				lab.addEventListener( 'input', function () { op.label = lab.value; if ( ! manual ) { op.value = slug( lab.value ); val.value = op.value; } touch(); if ( o.on ) { o.on(); } } );
				val.addEventListener( 'input', function () { manual = true; op.value = val.value; touch(); } );
				var r = h( 'div', { class: 'wlfpb-opt' + ( o.price ? ' price' : '' ) }, lab, val );
				if ( o.price ) { var pr = h( 'input', { type: 'text', value: op.price || '', placeholder: 'Price', 'aria-label': 'Option price' } ); pr.addEventListener( 'input', function () { op.price = pr.value; touch(); } ); r.appendChild( pr ); }
				r.appendChild( h( 'button', { type: 'button', class: 'wlfpb-ib', title: 'Move up', text: '↑', onclick: function () { if ( i ) { f.options.splice( i - 1, 0, f.options.splice( i, 1 )[ 0 ] ); touch(); draw(); if ( o.on ) { o.on(); } } } } ) );
				r.appendChild( h( 'button', { type: 'button', class: 'wlfpb-ib del', title: 'Remove', text: '✕', onclick: function () { f.options.splice( i, 1 ); touch(); draw(); if ( o.on ) { o.on(); } } } ) );
				wrap.appendChild( r );
			} );
			wrap.appendChild( h( 'div', { style: 'display:flex;gap:6px;margin-top:6px' },
				h( 'button', { type: 'button', class: 'button button-small', text: '+ Add option', onclick: function () { var n = f.options.length + 1; f.options.push( { label: 'Option ' + n, value: 'option_' + n, price: '' } ); touch(); draw(); if ( o.on ) { o.on(); } } } ),
				h( 'button', { type: 'button', class: 'button button-small', text: 'Bulk edit', onclick: function () {
					var cur = f.options.map( function ( x ) { return x.label + ( o.price && x.price ? ' | ' + x.price : '' ); } ).join( '\n' );
					var v = window.prompt( 'One option per line' + ( o.price ? ' (use "Label | price")' : '' ), cur );
					if ( v === null ) { return; }
					f.options = v.split( /\r?\n/ ).map( function ( l ) { return l.trim(); } ).filter( Boolean ).map( function ( l ) { var p = l.split( '|' ); return { label: p[ 0 ].trim(), value: slug( p[ 0 ] ), price: o.price && p[ 1 ] ? p[ 1 ].trim() : '' }; } );
					touch(); draw(); if ( o.on ) { o.on(); }
				} } ) ) );
		};
		draw();
		return wrap;
	}

	function pairEditor( list, a, b, labels ) {
		var wrap = h( 'div' );
		var draw = function () {
			clear( wrap );
			list.forEach( function ( it, i ) {
				var x = h( 'input', { type: 'text', value: it[ a ], placeholder: labels[ 0 ] } );
				var y = h( 'input', { type: 'text', value: it[ b ], placeholder: labels[ 1 ] } );
				x.addEventListener( 'input', function () { it[ a ] = x.value; if ( a === 'label' && b === 'value' && it.__auto !== false ) { it[ b ] = slug( x.value ); y.value = it[ b ]; } touch(); } );
				y.addEventListener( 'input', function () { it.__auto = false; it[ b ] = y.value; touch(); } );
				wrap.appendChild( h( 'div', { class: 'wlfpb-opt', style: 'grid-template-columns:1fr 1fr auto' }, x, y, h( 'button', { type: 'button', class: 'wlfpb-ib del', text: '✕', onclick: function () { list.splice( i, 1 ); touch(); draw(); } } ) ) );
			} );
			wrap.appendChild( h( 'button', { type: 'button', class: 'button button-small', text: '+ Add', onclick: function () { var o = {}; o[ a ] = labels[ 0 ] + ' ' + ( list.length + 1 ); o[ b ] = slug( o[ a ] ); list.push( o ); touch(); draw(); } } ) );
		};
		draw();
		return wrap;
	}

	function typeSettings( f, refresh ) {
		var w = h( 'div' );
		var any = true;
		switch ( f.type ) {
			case 'select': case 'multiselect': case 'radio': case 'checkbox':
				w.appendChild( optionsEditor( f, { on: refresh } ) );
				if ( f.type === 'radio' || f.type === 'checkbox' ) {
					w.appendChild( sel( f, 'layout', [ [ 'vertical', 'Vertical list' ], [ 'horizontal', 'Inline' ] ], { label: 'Layout' } ) );
					w.appendChild( check( f, 'other', 'Add an "Other" option with text box' ) );
				}
				break;
			case 'number':
				w.appendChild( text( f, 'min', { label: 'Minimum', type: 'number' } ) ); w.appendChild( text( f, 'max', { label: 'Maximum', type: 'number' } ) ); w.appendChild( text( f, 'step', { label: 'Step', type: 'number', help: 'Leave empty to allow decimals.' } ) ); break;
			case 'text':
				w.appendChild( text( f, 'maxlength', { label: 'Max length', type: 'number' } ) );
				w.appendChild( text( f, 'mask', { label: 'Input mask', ph: '(999) 999-9999', help: '9 = digit, a = letter, * = any' } ) ); break;
			case 'textarea':
				w.appendChild( text( f, 'rows', { label: 'Rows', type: 'number' } ) ); w.appendChild( text( f, 'maxlength', { label: 'Max length (shows a counter)', type: 'number' } ) ); break;
			case 'date':
				w.appendChild( text( f, 'min', { label: 'Earliest date', type: 'date' } ) ); w.appendChild( text( f, 'max', { label: 'Latest date', type: 'date' } ) ); break;
			case 'name':
				f.parts = f.parts || {};
				[ [ 'prefix', 'Prefix' ], [ 'first', 'First name' ], [ 'middle', 'Middle name' ], [ 'last', 'Last name' ] ].forEach( function ( p ) { w.appendChild( check( f.parts, p[ 0 ], p[ 1 ] ) ); } ); break;
			case 'address':
				f.parts = f.parts || {};
				[ [ 'line1', 'Address line 1' ], [ 'line2', 'Address line 2' ], [ 'city', 'City' ], [ 'state', 'State / province' ], [ 'zip', 'ZIP / postal code' ], [ 'country', 'Country' ] ].forEach( function ( p ) { w.appendChild( check( f.parts, p[ 0 ], p[ 1 ] ) ); } ); break;
			case 'file': case 'image':
				w.appendChild( text( f, 'allowed', { label: 'Allowed extensions', help: 'Comma separated. Executables and scripts are always blocked.' } ) );
				w.appendChild( text( f, 'max_size', { label: 'Max size per file (MB)', type: 'number' } ) );
				w.appendChild( text( f, 'max_files', { label: 'Max files', type: 'number' } ) ); break;
			case 'rating': w.appendChild( text( f, 'max', { label: 'Number of stars (1-10)', type: 'number', on: refresh } ) ); break;
			case 'range': w.appendChild( text( f, 'min', { label: 'Minimum', type: 'number' } ) ); w.appendChild( text( f, 'max', { label: 'Maximum', type: 'number' } ) ); w.appendChild( text( f, 'step', { label: 'Step', type: 'number' } ) ); break;
			case 'nps': w.appendChild( text( f, 'low_label', { label: 'Low label' } ) ); w.appendChild( text( f, 'high_label', { label: 'High label' } ) ); break;
			case 'likert':
				f.rows_list = f.rows_list || []; f.options = f.options || [];
				w.appendChild( h( 'div', { class: 'lb', text: 'Rows (questions)' } ) ); w.appendChild( pairEditor( f.rows_list, 'label', 'value', [ 'Question', 'key' ] ) );
				w.appendChild( h( 'div', { class: 'lb', style: 'margin-top:10px', text: 'Columns (answers)' } ) ); w.appendChild( pairEditor( f.options, 'label', 'value', [ 'Answer', 'value' ] ) ); break;
			case 'repeater':
				f.columns = f.columns || [];
				w.appendChild( h( 'div', { class: 'lb', text: 'Columns' } ) );
				f.columns.forEach( function ( c, i ) {
					w.appendChild( h( 'div', { class: 'wlfpb-opt', style: 'grid-template-columns:1fr 90px auto' }, ( function () { var x = h( 'input', { type: 'text', value: c.label } ); x.addEventListener( 'input', function () { c.label = x.value; touch(); } ); return x; }() ), sel( c, 'type', [ [ 'text', 'Text' ], [ 'number', 'Number' ], [ 'email', 'Email' ], [ 'date', 'Date' ] ], { label: false } ), h( 'button', { type: 'button', class: 'wlfpb-ib del', text: '✕', onclick: function () { f.columns.splice( i, 1 ); touch(); renderSide(); } } ) ) );
				} );
				w.appendChild( h( 'button', { type: 'button', class: 'button button-small', text: '+ Add column', onclick: function () { f.columns.push( { label: 'Column ' + ( f.columns.length + 1 ), type: 'text' } ); touch(); renderSide(); } } ) );
				w.appendChild( text( f, 'min_rows', { label: 'Minimum rows', type: 'number' } ) ); w.appendChild( text( f, 'max_rows', { label: 'Maximum rows', type: 'number' } ) ); w.appendChild( text( f, 'add_text', { label: '"Add row" button text' } ) ); break;
			case 'calculation':
				w.appendChild( text( f, 'formula', { label: 'Formula', ph: '{quantity} * {price} * 1.2', help: 'Use {field_key}, + - * / % ^, ( ), and round() floor() ceil() abs() min() max() sqrt() pow().' } ) );
				w.appendChild( chipsFor( function ( n ) { return '{' + n + '}'; }, function ( v ) { f.formula = ( f.formula || '' ) + v; touch(); renderSide(); } ) );
				w.appendChild( text( f, 'decimals', { label: 'Decimals', type: 'number' } ) ); w.appendChild( text( f, 'prefix', { label: 'Prefix', ph: '$' } ) ); w.appendChild( text( f, 'suffix', { label: 'Suffix' } ) ); break;
			case 'payment_item':
				w.appendChild( sel( f, 'kind', [ [ 'fixed', 'Fixed price' ], [ 'custom', 'Customer enters amount' ], [ 'select', 'Dropdown of priced options' ], [ 'radio', 'Radio buttons (pick one)' ], [ 'checkbox', 'Checkboxes (pick many)' ] ], { label: 'Pricing type', on: function () { renderSide(); refresh(); } } ) );
				if ( f.kind === 'fixed' ) { w.appendChild( text( f, 'price', { label: 'Price', type: 'number', step: 'any', on: refresh } ) ); }
				else if ( f.kind === 'custom' ) { w.appendChild( text( f, 'min', { label: 'Minimum amount', type: 'number', step: 'any' } ) ); }
				else { w.appendChild( optionsEditor( f, { price: true, on: refresh } ) ); }
				break;
			case 'quantity': {
				var items = F.fields.filter( function ( x ) { return x.type === 'payment_item'; } ).map( function ( x ) { return [ x.name, x.label + ' (' + x.name + ')' ]; } );
				w.appendChild( sel( f, 'item', [ [ '', '— not linked —' ] ].concat( items ), { label: 'Multiplies this product' } ) );
				w.appendChild( text( f, 'min', { label: 'Min', type: 'number' } ) ); w.appendChild( text( f, 'max', { label: 'Max', type: 'number' } ) ); break;
			}
			case 'coupon': w.appendChild( h( 'p', { class: 'description', text: 'Create coupon codes under Payments.' } ) ); break;
			default: any = false;
		}
		return any ? w : null;
	}

	function chipsFor( fmt, onPick ) {
		return h( 'div', { class: 'wlfpb-chips' }, valueFields().map( function ( f ) { return h( 'button', { type: 'button', class: 'wlfpb-chip', title: f.label, text: fmt( f.name ), onclick: function () { onPick( fmt( f.name ) ); } } ); } ) );
	}

	/* ---------- conditional logic editor ---------- */
	function condEditor( cond, selfId, onchange ) {
		cond.rules = cond.rules || [];
		cond.match = cond.match || 'all';
		var wrap = h( 'div' );
		var draw = function () {
			clear( wrap );
			wrap.appendChild( check( cond, 'enabled', 'Enable conditional logic', { on: function () { draw(); if ( onchange ) { onchange(); } } } ) );
			if ( ! Number( cond.enabled ) ) { return; }
			wrap.appendChild( h( 'div', { class: 'wlfpb-f' }, 'Show / use when ', sel( cond, 'match', [ [ 'all', 'ALL' ], [ 'any', 'ANY' ] ], { label: false } ), ' of these match:' ) );
			var fields = valueFields().filter( function ( f ) { return f.id !== selfId; } );
			cond.rules.forEach( function ( r, i ) {
				var fs = h( 'select', { 'aria-label': 'Field' }, h( 'option', { value: '', text: '— field —' } ), fields.map( function ( f ) { return h( 'option', { value: f.name, text: f.label || f.name, selected: f.name === r.field } ); } ) );
				fs.addEventListener( 'change', function () { r.field = fs.value; r.value = ''; touch(); draw(); } );
				var os = h( 'select', { 'aria-label': 'Operator' }, Object.keys( C.ops ).map( function ( k ) { return h( 'option', { value: k, text: C.ops[ k ], selected: ( r.op || 'eq' ) === k } ); } ) );
				os.addEventListener( 'change', function () { r.op = os.value; touch(); draw(); } );
				var src = fields.filter( function ( f ) { return f.name === r.field; } )[ 0 ];
				var vi;
				if ( src && src.options && src.options.length && [ 'eq', 'neq' ].indexOf( r.op || 'eq' ) !== -1 ) {
					vi = h( 'select', { 'aria-label': 'Value' }, h( 'option', { value: '', text: '— value —' } ), src.options.map( function ( o ) { return h( 'option', { value: o.value, text: o.label, selected: String( o.value ) === String( r.value ) } ); } ) );
					vi.addEventListener( 'change', function () { r.value = vi.value; touch(); } );
				} else if ( [ 'empty', 'not_empty' ].indexOf( r.op ) !== -1 ) { vi = h( 'span', { class: 'd', text: '—' } ); }
				else { vi = h( 'input', { type: 'text', value: r.value || '', placeholder: 'value', 'aria-label': 'Value' } ); vi.addEventListener( 'input', function () { r.value = vi.value; touch(); } ); }
				wrap.appendChild( h( 'div', { class: 'wlfpb-rule' }, fs, os, vi, h( 'button', { type: 'button', class: 'wlfpb-ib del', text: '✕', 'aria-label': 'Remove rule', onclick: function () { cond.rules.splice( i, 1 ); touch(); draw(); if ( onchange ) { onchange(); } } } ) ) );
			} );
			wrap.appendChild( h( 'button', { type: 'button', class: 'button button-small', text: '+ Add rule', onclick: function () { cond.rules.push( { field: '', op: 'eq', value: '' } ); touch(); draw(); } } ) );
		};
		draw();
		return wrap;
	}

	/* ---------- merge-tag chips ---------- */
	function insertAtLast( tag ) {
		var el = S.last;
		if ( ! el || ! document.body.contains( el ) ) { toast( 'Click into a text box first', true ); return; }
		var s = el.selectionStart || el.value.length, e = el.selectionEnd || el.value.length;
		el.value = el.value.slice( 0, s ) + tag + el.value.slice( e );
		el.dispatchEvent( new Event( 'input', { bubbles: true } ) );
		el.focus();
	}
	function tagChips() {
		var tags = C.tags.filter( function ( t ) { return t.indexOf( 'FIELD_NAME' ) === -1 && t.indexOf( 'PARAM' ) === -1; } );
		return h( 'div', null, h( 'div', { class: 'd', text: 'Click a tag to insert it where your cursor is:' } ),
			h( 'div', { class: 'wlfpb-chips' }, tags.map( function ( t ) { return h( 'button', { type: 'button', class: 'wlfpb-chip', text: t, onclick: function () { insertAtLast( t ); } } ); } ),
				valueFields().map( function ( f ) { return h( 'button', { type: 'button', class: 'wlfpb-chip', title: f.label, text: '{field:' + f.name + '}', onclick: function () { insertAtLast( '{field:' + f.name + '}' ); } } ); } ) ) );
	}

	/* ---------- SETTINGS tab ---------- */
	function settingsTab( body ) {
		var S2 = F.settings;
		var secs = [ [ 'confirmation', 'Confirmation' ], [ 'button', 'Button & steps' ], [ 'style', 'Appearance' ], [ 'restrictions', 'Restrictions' ], [ 'spam', 'Spam protection' ], [ 'entries', 'Entries & behaviour' ] ];
		var nav = h( 'div', { class: 'wlfpb-panel wlfpb-nav' }, secs.map( function ( s ) { return h( 'button', { type: 'button', class: S.sub === s[ 0 ] ? 'on' : '', text: s[ 1 ], onclick: function () { S.sub = s[ 0 ]; renderTab(); } } ); } ) );
		var main = h( 'div', { class: 'wlfpb-panel wlfpb-wide' } );
		var c;
		switch ( S.sub ) {
			case 'confirmation':
				c = S2.confirmation;
				main.appendChild( sel( c, 'type', [ [ 'message', 'Show a message' ], [ 'redirect', 'Redirect to a URL' ], [ 'page', 'Redirect to a page' ] ], { label: 'After submission', on: renderTab } ) );
				if ( c.type === 'message' ) { main.appendChild( area( c, 'message', { label: 'Message (HTML + merge tags)', rows: 6 } ) ); main.appendChild( check( c, 'hide_form', 'Hide the form after submitting' ) ); main.appendChild( check( c, 'scroll', 'Scroll to the message' ) ); main.appendChild( tagChips() ); }
				if ( c.type === 'redirect' ) { main.appendChild( text( c, 'url', { label: 'Redirect URL', ph: 'https://…/thank-you?name={field:name:first}', help: 'Merge tags allowed.' } ) ); }
				if ( c.type === 'page' ) { main.appendChild( sel( c, 'page_id', [ [ 0, '— choose —' ] ].concat( Object.keys( C.pages ).map( function ( k ) { return [ k, C.pages[ k ] ]; } ) ), { label: 'Page' } ) ); }
				break;
			case 'button':
				c = S2.button;
				main.appendChild( text( c, 'text', { label: 'Submit button text' } ) ); main.appendChild( text( c, 'loading_text', { label: 'Text while sending' } ) );
				main.appendChild( sel( c, 'align', [ [ 'left', 'Left' ], [ 'center', 'Center' ], [ 'right', 'Right' ], [ 'full', 'Full width' ] ], { label: 'Alignment' } ) );
				main.appendChild( sel( c, 'style', [ [ 'solid', 'Solid' ], [ 'outline', 'Outline' ] ], { label: 'Style' } ) );
				main.appendChild( h( 'h3', { text: 'Multi-step (add "Step / page break" fields)' } ) );
				c = S2.steps;
				main.appendChild( sel( c, 'progress', [ [ 'bar', 'Progress bar' ], [ 'steps', 'Step tabs' ], [ 'none', 'None' ] ], { label: 'Progress indicator' } ) );
				main.appendChild( text( c, 'first_title', { label: 'First step title' } ) ); main.appendChild( text( c, 'next_text', { label: '"Next" text' } ) ); main.appendChild( text( c, 'prev_text', { label: '"Back" text' } ) ); main.appendChild( check( c, 'show_prev', 'Show the Back button' ) );
				break;
			case 'style':
				c = S2.style;
				main.appendChild( h( 'p', { class: 'description', text: 'Forms inherit fonts and text colour from your theme, so they look native on any theme. Use these options only to fine-tune.' } ) );
				main.appendChild( sel( c, 'preset', [ [ 'inherit', 'Minimal outline (default)' ], [ 'modern', 'Modern (soft filled fields)' ], [ 'underline', 'Underline' ], [ 'pill', 'Rounded / pill' ], [ 'card', 'Card with shadow' ], [ 'dark', 'Dark panel' ] ], { label: 'Style preset' } ) );
				main.appendChild( color( c, 'primary', 'Accent / button colour' ) ); main.appendChild( color( c, 'text', 'Text colour (empty = theme)' ) ); main.appendChild( color( c, 'bg', 'Background (empty = transparent)' ) ); main.appendChild( color( c, 'border', 'Border colour (empty = auto)' ) );
				main.appendChild( text( c, 'radius', { label: 'Corner radius (px)', type: 'number' } ) );
				main.appendChild( sel( c, 'label_position', [ [ 'top', 'Above field' ], [ 'left', 'Left of field' ], [ 'hidden', 'Hidden (use placeholders)' ] ], { label: 'Label position' } ) );
				main.appendChild( sel( c, 'input_size', [ [ 'sm', 'Small' ], [ 'md', 'Medium' ], [ 'lg', 'Large' ] ], { label: 'Field size' } ) );
				main.appendChild( sel( c, 'asterisk', [ [ 'end', 'Show * on required' ], [ 'none', 'No asterisk' ] ], { label: 'Required marker' } ) );
				main.appendChild( check( c, 'show_title', 'Show the form title above the form' ) );
				main.appendChild( area( c, 'custom_css', { label: 'Custom CSS', rows: 6, help: 'Use .wlfp-this as the form selector, e.g. .wlfp-this .wlfp-btn{background:#000}' } ) );
				break;
			case 'restrictions':
				c = S2.restrictions;
				main.appendChild( check( c, 'limit_entries', 'Limit total entries', { on: renderTab } ) );
				if ( Number( c.limit_entries ) ) { main.appendChild( text( c, 'max_entries', { label: 'Maximum entries', type: 'number' } ) ); main.appendChild( text( c, 'limit_msg', { label: 'Message when full' } ) ); }
				main.appendChild( text( c, 'daily_limit', { label: 'Max entries per day (0 = unlimited)', type: 'number' } ) );
				main.appendChild( check( c, 'schedule', 'Schedule availability', { on: renderTab } ) );
				if ( Number( c.schedule ) ) { main.appendChild( text( c, 'start', { label: 'Opens', type: 'datetime-local' } ) ); main.appendChild( text( c, 'end', { label: 'Closes', type: 'datetime-local' } ) ); main.appendChild( text( c, 'schedule_msg', { label: 'Message when closed' } ) ); }
				main.appendChild( check( c, 'login_required', 'Only logged-in users', { on: renderTab } ) );
				if ( Number( c.login_required ) ) { main.appendChild( text( c, 'login_msg', { label: 'Message for logged-out visitors' } ) ); }
				main.appendChild( check( c, 'one_per_user', 'One submission per logged-in user' ) ); main.appendChild( check( c, 'one_per_ip', 'One submission per IP address' ) ); main.appendChild( text( c, 'dup_msg', { label: 'Message for repeat submissions' } ) );
				break;
			case 'spam':
				c = S2.spam;
				main.appendChild( check( c, 'honeypot', 'Honeypot trap (invisible field bots fill in)' ) );
				main.appendChild( text( c, 'min_seconds', { label: 'Minimum seconds to fill the form', type: 'number', help: 'Submissions faster than this are treated as bots.' } ) );
				main.appendChild( text( c, 'rate_limit', { label: 'Max submissions per IP per 10 minutes (0 = off)', type: 'number' } ) );
				main.appendChild( sel( c, 'captcha', [ [ 'none', 'No CAPTCHA' ], [ 'recaptcha', 'Google reCAPTCHA' ], [ 'hcaptcha', 'hCaptcha' ], [ 'turnstile', 'Cloudflare Turnstile' ] ], { label: 'CAPTCHA', on: renderTab } ) );
				if ( c.captcha !== 'none' && ! C.hasCaptcha[ c.captcha ] ) { main.appendChild( h( 'div', { class: 'wlfpb-warn' }, 'Add your ' + c.captcha + ' keys in ', h( 'a', { href: C.settingsUrl, target: '_blank', text: 'Settings' } ), ' — submissions are blocked until the secret key is set.' ) ); }
				main.appendChild( area( c, 'keywords', { label: 'Blocked words / phrases (one per line)', rows: 4, help: 'Matching submissions go to the Spam folder.' } ) );
				main.appendChild( text( c, 'max_links', { label: 'Max links allowed in submission (0 = unlimited)', type: 'number' } ) );
				if ( C.akismet ) { main.appendChild( check( c, 'akismet', 'Also check with Akismet' ) ); }
				break;
			case 'entries':
				main.appendChild( check( S2.entries, 'store', 'Save entries in the database', { help: '' } ) );
				main.appendChild( h( 'div', { class: 'd', text: 'Turn off to only e-mail / forward data (no entries kept). Payment forms always save entries.' } ) );
				main.appendChild( check( S2.misc, 'autosave', 'Auto-save progress in the visitor\'s browser (resume later)' ) );
				main.appendChild( check( S2.misc, 'prefill_get', 'Prefill fields from URL parameters (?email=…)' ) );
				break;
		}
		body.appendChild( h( 'div', { class: 'wlfpb-settings' }, nav, main ) );
	}

	/* ---------- EMAILS tab ---------- */
	function emailsTab( body ) {
		var list = F.settings.notifications;
		var wrap = h( 'div', { class: 'wlfpb-wide' } );
		wrap.appendChild( h( 'p', { class: 'description', text: 'Send admin alerts and auto-replies. To e-mail the visitor, use their email field as the recipient, e.g. {field:email}.' } ) );
		list.forEach( function ( n, i ) {
			n.conditional = n.conditional || { enabled: 0, match: 'all', rules: [] };
			var item = h( 'div', { class: 'wlfpb-list-item' } );
			item.appendChild( h( 'header', null, check( n, 'enabled', '' ), h( 'span', { text: n.name || 'Notification' } ),
				h( 'button', { type: 'button', class: 'button button-small', text: 'Duplicate', onclick: function () { list.splice( i + 1, 0, clone( n ) ); touch(); renderTab(); } } ),
				h( 'button', { type: 'button', class: 'button button-small', text: 'Delete', onclick: function () { list.splice( i, 1 ); touch(); renderTab(); } } ) ) );
			var d = h( 'div' );
			d.appendChild( text( n, 'name', { label: 'Internal name' } ) ); d.appendChild( text( n, 'to', { label: 'Send to', help: 'Comma-separated. Merge tags allowed.' } ) );
			d.appendChild( text( n, 'subject', { label: 'Subject' } ) ); d.appendChild( area( n, 'message', { label: 'Message', rows: 8, help: 'HTML allowed. {all_data} prints a table of every answer.' } ) );
			d.appendChild( h( 'details', null, h( 'summary', { text: 'More options' } ), text( n, 'reply_to', { label: 'Reply-To' } ), text( n, 'cc', { label: 'CC' } ), text( n, 'bcc', { label: 'BCC' } ), text( n, 'from_name', { label: 'From name' } ), text( n, 'from_email', { label: 'From email' } ), sel( n, 'format', [ [ 'html', 'HTML' ], [ 'plain', 'Plain text' ] ], { label: 'Format' } ), check( n, 'attach', 'Attach uploaded files' ) ) );
			d.appendChild( h( 'details', { open: !! Number( n.conditional.enabled ) }, h( 'summary', { text: 'Send only if…' } ), condEditor( n.conditional, null ) ) );
			item.appendChild( d ); wrap.appendChild( item );
		} );
		wrap.appendChild( h( 'button', { type: 'button', class: 'button', text: '+ Add notification', onclick: function () { list.push( { name: 'Notification ' + ( list.length + 1 ), enabled: 1, to: '{admin_email}', cc: '', bcc: '', reply_to: '', from_name: '', from_email: '', subject: 'New submission: {form_title}', message: '{all_data}', format: 'html', attach: 0, conditional: { enabled: 0, match: 'all', rules: [] } } ); touch(); renderTab(); } } ) );
		wrap.appendChild( h( 'div', { class: 'wlfpb-panel', style: 'margin-top:16px' }, h( 'strong', { text: 'Merge tags' } ), tagChips() ) );
		body.appendChild( wrap );
	}

	/* ---------- INTEGRATIONS tab ---------- */
	function feedsTab( body ) {
		var list = F.settings.feeds;
		var wrap = h( 'div', { class: 'wlfpb-wide' } );
		wrap.appendChild( h( 'p', { class: 'description', text: 'Feeds run after each successful submission (or after payment, for paid forms). Google Sheets: use a Webhook feed with a Google Apps Script URL, Zapier, Make or n8n.' } ) );
		list.forEach( function ( fd, i ) {
			fd.conditional = fd.conditional || { enabled: 0, match: 'all', rules: [] };
			var item = h( 'div', { class: 'wlfpb-list-item' } );
			item.appendChild( h( 'header', null, check( fd, 'enabled', '' ), h( 'span', { text: ( fd.name || fd.type ) + ' — ' + ( C.feeds[ fd.type ] || fd.type ) } ), h( 'button', { type: 'button', class: 'button button-small', text: 'Delete', onclick: function () { list.splice( i, 1 ); touch(); renderTab(); } } ) ) );
			var d = h( 'div' );
			d.appendChild( text( fd, 'name', { label: 'Name' } ) );
			switch ( fd.type ) {
				case 'webhook':
					d.appendChild( text( fd, 'url', { label: 'Webhook URL', ph: 'https://hooks.zapier.com/…' } ) );
					d.appendChild( sel( fd, 'method', [ [ 'POST', 'POST' ], [ 'GET', 'GET' ] ], { label: 'Method' } ) ); d.appendChild( sel( fd, 'format', [ [ 'json', 'JSON body' ], [ 'form', 'Form-encoded' ] ], { label: 'Format' } ) );
					d.appendChild( area( fd, 'mapping', { label: 'Custom payload (optional)', rows: 4, ph: 'email={field:email}\nname={field:name}', help: 'One key=value per line. Leave empty to send every field.' } ) );
					d.appendChild( area( fd, 'headers', { label: 'Extra headers (optional)', rows: 2, ph: 'Authorization: Bearer abc' } ) ); break;
				case 'slack': case 'discord': case 'teams':
					d.appendChild( text( fd, 'url', { label: 'Incoming webhook URL' } ) ); d.appendChild( area( fd, 'message', { label: 'Message', rows: 4, ph: 'New submission on {form_title}\n{all_data}' } ) ); break;
				case 'telegram':
					d.appendChild( text( fd, 'token', { label: 'Bot token' } ) ); d.appendChild( text( fd, 'chat_id', { label: 'Chat ID' } ) ); d.appendChild( area( fd, 'message', { label: 'Message', rows: 4 } ) ); break;
				case 'mailchimp':
					if ( ! C.hasStripe && false ) { /* noop */ }
					d.appendChild( h( 'div', { class: 'wlfpb-warn' }, 'Set your Mailchimp API key in ', h( 'a', { href: C.settingsUrl, target: '_blank', text: 'Settings' } ), '.' ) );
					d.appendChild( text( fd, 'list_id', { label: 'Audience (list) ID' } ) ); d.appendChild( text( fd, 'email', { label: 'Email', ph: '{field:email}' } ) ); d.appendChild( text( fd, 'fname', { label: 'First name', ph: '{field:name:first}' } ) ); d.appendChild( text( fd, 'lname', { label: 'Last name', ph: '{field:name:last}' } ) ); d.appendChild( text( fd, 'tags', { label: 'Tags (comma separated)' } ) ); d.appendChild( check( fd, 'double_optin', 'Require double opt-in' ) ); break;
				case 'user_registration':
					d.appendChild( h( 'div', { class: 'wlfpb-warn', text: 'Creates a WordPress account. Administrator/Editor roles are blocked for safety.' } ) );
					d.appendChild( text( fd, 'email', { label: 'Email', ph: '{field:email}' } ) ); d.appendChild( text( fd, 'username', { label: 'Username', ph: '{field:username}' } ) ); d.appendChild( text( fd, 'password', { label: 'Password (empty = generate)', ph: '{field:password}' } ) );
					d.appendChild( text( fd, 'first_name', { label: 'First name', ph: '{field:name:first}' } ) ); d.appendChild( text( fd, 'last_name', { label: 'Last name', ph: '{field:name:last}' } ) );
					d.appendChild( sel( fd, 'role', Object.keys( C.roles ).map( function ( k ) { return [ k, C.roles[ k ] ]; } ), { label: 'Role' } ) ); d.appendChild( check( fd, 'notify', 'Send the WordPress new-user email' ) ); break;
				default: d.appendChild( h( 'p', { class: 'description', text: 'Custom feed type: handled by the wlfp_feed_' + fd.type + ' action.' } ) );
			}
			d.appendChild( h( 'details', { open: !! Number( fd.conditional.enabled ) }, h( 'summary', { text: 'Run only if…' } ), condEditor( fd.conditional, null ) ) );
			item.appendChild( d ); wrap.appendChild( item );
		} );
		var types = h( 'select', null, Object.keys( C.feeds ).map( function ( k ) { return h( 'option', { value: k, text: C.feeds[ k ] } ); } ) );
		wrap.appendChild( h( 'div', { style: 'display:flex;gap:8px' }, types, h( 'button', { type: 'button', class: 'button', text: '+ Add integration', onclick: function () { list.push( { type: types.value, name: C.feeds[ types.value ], enabled: 1, method: 'POST', format: 'json', role: 'subscriber', conditional: { enabled: 0, match: 'all', rules: [] } } ); touch(); renderTab(); } } ) ) );
		body.appendChild( wrap );
	}

	/* ---------- PAYMENTS tab ---------- */
	function paymentsTab( body ) {
		var p = F.settings.payment;
		var wrap = h( 'div', { class: 'wlfpb-wide wlfpb-panel' } );
		var hasItems = F.fields.some( function ( f ) { return f.type === 'payment_item'; } );
		if ( ! hasItems ) { wrap.appendChild( h( 'div', { class: 'wlfpb-warn', text: 'Add a "Product / payment item" field in the Build tab to start taking payments.' } ) ); }
		wrap.appendChild( sel( p, 'provider', [ [ 'none', 'No payment (just record totals)' ], [ 'stripe', 'Stripe Checkout (cards, wallets)' ], [ 'paypal', 'PayPal' ], [ 'offline', 'Offline / pay later (invoice, bank transfer)' ] ], { label: 'Payment method', on: renderTab } ) );
		if ( p.provider === 'stripe' && ! C.hasStripe ) { wrap.appendChild( h( 'div', { class: 'wlfpb-warn' }, 'Add your Stripe keys in ', h( 'a', { href: C.settingsUrl, target: '_blank', text: 'Settings' } ), '.' ) ); }
		if ( p.provider === 'paypal' && ! C.hasPaypal ) { wrap.appendChild( h( 'div', { class: 'wlfpb-warn' }, 'Add your PayPal credentials in ', h( 'a', { href: C.settingsUrl, target: '_blank', text: 'Settings' } ), '.' ) ); }
		wrap.appendChild( sel( p, 'currency', [ [ '', 'Site default (' + C.globalCurrency + ')' ] ].concat( C.currencies.map( function ( c ) { return [ c, c ]; } ) ), { label: 'Currency' } ) );
		wrap.appendChild( text( p, 'tax_percent', { label: 'Tax (%)', type: 'number', step: 'any' } ) );
		wrap.appendChild( text( p, 'description', { label: 'Payment description', help: 'Merge tags allowed.' } ) );
		wrap.appendChild( check( p, 'send_after_payment', 'Send emails & run integrations only after payment succeeds' ) );
		wrap.appendChild( text( p, 'success_url', { label: 'Success URL (optional)' } ) ); wrap.appendChild( text( p, 'cancel_url', { label: 'Cancel URL (optional)' } ) );
		wrap.appendChild( h( 'h3', { text: 'Coupons' } ) );
		p.coupons = p.coupons || [];
		var cw = h( 'div' );
		var draw = function () {
			clear( cw );
			p.coupons.forEach( function ( c, i ) {
				cw.appendChild( h( 'div', { class: 'wlfpb-opt', style: 'grid-template-columns:1.2fr 1fr 1fr 1fr 1fr auto' }, text( c, 'code', { label: false, ph: 'CODE' } ), sel( c, 'type', [ [ 'percent', '% off' ], [ 'fixed', 'Fixed off' ] ], { label: false } ), text( c, 'amount', { label: false, type: 'number', ph: 'Amount', step: 'any' } ), text( c, 'expires', { label: false, type: 'date' } ), text( c, 'limit', { label: false, type: 'number', ph: 'Max uses' } ), h( 'button', { type: 'button', class: 'wlfpb-ib del', text: '✕', onclick: function () { p.coupons.splice( i, 1 ); touch(); draw(); } } ) ) );
			} );
			cw.appendChild( h( 'button', { type: 'button', class: 'button button-small', text: '+ Add coupon', onclick: function () { p.coupons.push( { code: '', type: 'percent', amount: '10', expires: '', limit: '' } ); touch(); draw(); } } ) );
		};
		draw(); wrap.appendChild( cw );
		wrap.appendChild( h( 'p', { class: 'description', text: 'Add a "Coupon code" field to the form so visitors can apply codes. Totals are always recalculated on the server.' } ) );
		body.appendChild( wrap );
	}

	if ( ! F.id && ! F.fields.length ) { touch(); }
	S.dirty = false;
	renderAll();
}() );
