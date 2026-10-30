/* Weberslink Cookie Consent: banner, preferences dialog, script release and Google Consent Mode. */
( function () {
	'use strict';
	var C = window.WLCC;
	if ( ! C ) { return; }
	var COOKIE = 'wlcc_consent';
	var T = C.text || {};
	var cats = C.cats || [];
	var root, banner, modal, floatBtn, lastFocus;

	function el( tag, attrs, kids ) {
		var n = document.createElement( tag );
		Object.keys( attrs || {} ).forEach( function ( k ) {
			if ( k === 'text' ) { n.textContent = attrs[ k ]; } else if ( k === 'class' ) { n.className = attrs[ k ]; } else { n.setAttribute( k, attrs[ k ] ); }
		} );
		( kids || [] ).forEach( function ( c ) { if ( c ) { n.appendChild( c ); } } );
		return n;
	}
	function rid() {
		var a = new Uint8Array( 8 ), s = '';
		( window.crypto || window.msCrypto ).getRandomValues( a );
		a.forEach( function ( b ) { s += ( '0' + b.toString( 16 ) ).slice( -2 ); } );
		return s;
	}

	/* ---------- stored choice ---------- */
	function readCookie() {
		var m = document.cookie.match( new RegExp( '(?:^|; )' + COOKIE + '=([^;]*)' ) );
		if ( ! m ) { return null; }
		try { var v = JSON.parse( decodeURIComponent( m[ 1 ] ) ); } catch ( e ) { return null; }
		if ( ! v || typeof v !== 'object' || v.v !== C.version || ! v.c || typeof v.c !== 'object' ) { return null; }
		if ( v.t && C.expire && Date.now() - v.t > C.expire * 86400000 ) { return null; }
		return v;
	}
	function writeCookie( v ) {
		var d = new Date( Date.now() + C.expire * 86400000 );
		document.cookie = COOKIE + '=' + encodeURIComponent( JSON.stringify( v ) ) + '; expires=' + d.toUTCString() + '; path=/; SameSite=Lax' + ( location.protocol === 'https:' ? '; Secure' : '' );
	}
	var state = readCookie();
	function has( cat ) { return cat === 'necessary' || !! ( state && state.c && state.c[ cat ] ); }

	/* ---------- release held-back code ---------- */
	function release() {
		[].slice.call( document.querySelectorAll( 'script[type="text/plain"][data-wlcc-cat]' ) ).forEach( function ( old ) {
			if ( ! has( old.getAttribute( 'data-wlcc-cat' ) ) || old.getAttribute( 'data-wlcc-done' ) ) { return; }
			old.setAttribute( 'data-wlcc-done', '1' );
			var s = document.createElement( 'script' );
			[].slice.call( old.attributes ).forEach( function ( a ) {
				if ( a.name !== 'type' && a.name !== 'data-wlcc-cat' && a.name !== 'data-wlcc-done' ) { s.setAttribute( a.name, a.value ); }
			} );
			s.text = old.text || old.textContent;
			old.parentNode.insertBefore( s, old.nextSibling );
		} );
		[].slice.call( document.querySelectorAll( '[data-wlcc-cat][data-wlcc-src], [data-wlcc-cat][data-wlcc-srcset]' ) ).forEach( function ( n ) {
			if ( ! has( n.getAttribute( 'data-wlcc-cat' ) ) ) { return; }
			if ( n.hasAttribute( 'data-wlcc-src' ) ) { n.setAttribute( 'src', n.getAttribute( 'data-wlcc-src' ) ); n.removeAttribute( 'data-wlcc-src' ); }
			if ( n.hasAttribute( 'data-wlcc-srcset' ) ) { n.setAttribute( 'srcset', n.getAttribute( 'data-wlcc-srcset' ) ); n.removeAttribute( 'data-wlcc-srcset' ); }
		} );
	}
	function gcm() {
		if ( ! C.gcm ) { return; }
		window.dataLayer = window.dataLayer || [];
		function gtag() { window.dataLayer.push( arguments ); }
		var g = function ( b ) { return b ? 'granted' : 'denied'; };
		gtag( 'consent', 'update', {
			analytics_storage: g( has( 'analytics' ) ), ad_storage: g( has( 'marketing' ) ), ad_user_data: g( has( 'marketing' ) ), ad_personalization: g( has( 'marketing' ) ),
			functionality_storage: g( has( 'preferences' ) ), personalization_storage: g( has( 'preferences' ) ), security_storage: 'granted'
		} );
		window.dataLayer.push( { event: 'wlcc_consent', wlcc: JSON.parse( JSON.stringify( state.c ) ) } );
	}
	function announce() {
		try { document.dispatchEvent( new CustomEvent( 'wlcc:consent', { detail: { choices: state ? state.c : {} } } ) ); } catch ( e ) {}
	}
	function send( action ) {
		if ( ! C.log ) { return; }
		var body = JSON.stringify( { action: action, version: C.version, id: state.id, preferences: !! state.c.preferences, analytics: !! state.c.analytics, marketing: !! state.c.marketing } );
		try {
			if ( window.fetch ) { fetch( C.log, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true, credentials: 'omit' } ).catch( function () {} ); }
		} catch ( e ) {}
	}

	function save( choices, action ) {
		var c = {};
		cats.forEach( function ( k ) { c[ k.id ] = choices[ k.id ] ? 1 : 0; } );
		state = { v: C.version, t: Date.now(), id: ( state && state.id ) || rid(), c: c };
		writeCookie( state );
		hideBanner(); closeModal();
		release(); gcm(); announce(); send( action );
		showFloat();
	}
	function all( on ) { var c = {}; cats.forEach( function ( k ) { c[ k.id ] = on; } ); return c; }

	/* ---------- UI ---------- */
	function policyLink() {
		return C.policy && C.policy.url ? el( 'a', { href: C.policy.url, class: 'wlcc-policy', text: C.policy.label } ) : null;
	}
	function buildBanner() {
		var btns = el( 'div', { class: 'wlcc-btns' }, [
			el( 'button', { type: 'button', class: 'wlcc-btn wlcc-reject', text: T.reject } ),
			el( 'button', { type: 'button', class: 'wlcc-btn wlcc-accept', text: T.accept } ),
			cats.length ? el( 'button', { type: 'button', class: 'wlcc-btn wlcc-link wlcc-custom', text: T.custom } ) : null
		] );
		var text = el( 'div', { class: 'wlcc-text' }, [ el( 'strong', { class: 'wlcc-title', id: 'wlcc-title', text: T.title } ), el( 'p', { text: T.message + ' ' }, [ policyLink() ] ) ] );
		banner = el( 'div', { class: 'wlcc-banner wlcc-pos-' + C.position, role: 'region', 'aria-labelledby': 'wlcc-title' }, [ text, btns ] );
		banner.querySelector( '.wlcc-accept' ).addEventListener( 'click', function () { save( all( true ), 'accept_all' ); } );
		banner.querySelector( '.wlcc-reject' ).addEventListener( 'click', function () { save( all( false ), 'reject_all' ); } );
		var cu = banner.querySelector( '.wlcc-custom' ); if ( cu ) { cu.addEventListener( 'click', openModal ); }
		root.appendChild( banner );
	}
	function row( id, label, desc, checked, locked ) {
		var inp = el( 'input', { type: 'checkbox', id: 'wlcc-c-' + id, 'data-cat': id } );
		inp.checked = checked; if ( locked ) { inp.disabled = true; }
		return el( 'div', { class: 'wlcc-cat' }, [ el( 'label', { for: 'wlcc-c-' + id, class: 'wlcc-switch' }, [ inp, el( 'span', { class: 'wlcc-slider', 'aria-hidden': 'true' } ) ] ), el( 'div', {}, [ el( 'strong', { text: label } ), el( 'p', { text: desc } ) ] ) ] );
	}
	function openModal() {
		if ( modal ) { return; }
		lastFocus = document.activeElement;
		var rows = [ row( 'necessary', T.necessary, T.necessaryText, true, true ) ];
		cats.forEach( function ( k ) { rows.push( row( k.id, k.label, ( T.catText || {} )[ k.id ] || '', has( k.id ), false ) ); } );
		var head = el( 'div', { class: 'wlcc-modal-head' }, [ el( 'strong', { id: 'wlcc-mtitle', text: T.title } ), el( 'button', { type: 'button', class: 'wlcc-x', 'aria-label': T.close, text: '×' } ) ] );
		var foot = el( 'div', { class: 'wlcc-btns' }, [ el( 'button', { type: 'button', class: 'wlcc-btn wlcc-reject', text: T.reject } ), el( 'button', { type: 'button', class: 'wlcc-btn wlcc-save', text: T.save } ), el( 'button', { type: 'button', class: 'wlcc-btn wlcc-accept', text: T.accept } ) ] );
		var box = el( 'div', { class: 'wlcc-modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'wlcc-mtitle' }, [ head, el( 'div', { class: 'wlcc-cats' }, rows ), foot ] );
		modal = el( 'div', { class: 'wlcc-overlay' }, [ box ] );
		root.appendChild( modal );
		head.querySelector( '.wlcc-x' ).addEventListener( 'click', closeModal );
		modal.addEventListener( 'mousedown', function ( e ) { if ( e.target === modal ) { closeModal(); } } );
		foot.querySelector( '.wlcc-accept' ).addEventListener( 'click', function () { save( all( true ), 'accept_all' ); } );
		foot.querySelector( '.wlcc-reject' ).addEventListener( 'click', function () { save( all( false ), 'reject_all' ); } );
		foot.querySelector( '.wlcc-save' ).addEventListener( 'click', function () {
			var c = {}; [].forEach.call( modal.querySelectorAll( 'input[data-cat]' ), function ( i ) { if ( i.getAttribute( 'data-cat' ) !== 'necessary' ) { c[ i.getAttribute( 'data-cat' ) ] = i.checked; } } );
			save( c, 'custom' );
		} );
		modal.addEventListener( 'keydown', function ( e ) {
			if ( e.key === 'Escape' ) { closeModal(); }
			if ( e.key === 'Tab' ) {
				var f = [].slice.call( modal.querySelectorAll( 'button, input:not([disabled])' ) ), first = f[ 0 ], last = f[ f.length - 1 ];
				if ( e.shiftKey && document.activeElement === first ) { last.focus(); e.preventDefault(); } else if ( ! e.shiftKey && document.activeElement === last ) { first.focus(); e.preventDefault(); }
			}
		} );
		modal.querySelector( '.wlcc-save' ).focus();
	}
	function closeModal() {
		if ( ! modal ) { return; }
		modal.parentNode.removeChild( modal ); modal = null;
		if ( lastFocus && lastFocus.focus && document.body.contains( lastFocus ) ) { lastFocus.focus(); }
	}
	function hideBanner() { if ( banner && banner.parentNode ) { banner.parentNode.removeChild( banner ); } banner = null; }
	function showFloat() {
		if ( ! C.float || floatBtn ) { return; }
		floatBtn = el( 'button', { type: 'button', class: 'wlcc-float', text: T.float } );
		floatBtn.addEventListener( 'click', openModal );
		root.appendChild( floatBtn );
	}

	function init() {
		root = document.getElementById( 'wlcc-root' );
		if ( ! root ) { root = el( 'div', { id: 'wlcc-root' } ); document.body.appendChild( root ); }
		document.addEventListener( 'click', function ( e ) {
			var t = e.target.closest ? e.target.closest( '[data-wlcc-open]' ) : null;
			if ( t ) { e.preventDefault(); openModal(); }
		} );
		if ( state ) { release(); gcm(); announce(); showFloat(); } else { buildBanner(); }
	}
	window.WLCC_API = { open: openModal, has: has, choices: function () { return state ? JSON.parse( JSON.stringify( state.c ) ) : null; } };
	if ( document.readyState === 'loading' ) { document.addEventListener( 'DOMContentLoaded', init ); } else { init(); }
}() );
