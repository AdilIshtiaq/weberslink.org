/* Weberslink Popups: triggers, frequency, targeting by device, accessible dialog, lead form. */
( function () {
	'use strict';
	var C = window.WLPOP;
	if ( ! C || ! C.popups || ! C.popups.length ) { return; }
	var I = C.i18n || {};
	var LS = 'wlpop_v1';

	/* ---------- remembered state (localStorage with a cookie fallback) ---------- */
	function read() {
		try { var v = JSON.parse( localStorage.getItem( LS ) || '{}' ); return v && typeof v === 'object' ? v : {}; } catch ( e ) {}
		try { var m = document.cookie.match( /(?:^|; )wlpop_v1=([^;]*)/ ); return m ? JSON.parse( decodeURIComponent( m[ 1 ] ) ) || {} : {}; } catch ( e2 ) { return {}; }
	}
	function write( s ) {
		var j = JSON.stringify( s );
		try { localStorage.setItem( LS, j ); return; } catch ( e ) {}
		try { document.cookie = LS + '=' + encodeURIComponent( j ) + '; max-age=31536000; path=/; SameSite=Lax'; } catch ( e2 ) {}
	}
	function sessionSeen( id ) { try { return sessionStorage.getItem( 'wlpop_s_' + id ) === '1'; } catch ( e ) { return false; } }
	function markSession( id ) { try { sessionStorage.setItem( 'wlpop_s_' + id, '1' ); } catch ( e ) {} }

	function isMobile() { return window.matchMedia ? window.matchMedia( '(max-width: 767px)' ).matches : window.innerWidth < 768; }
	function allowed( p ) {
		if ( p.preview ) { return true; }
		if ( p.device === 'desktop' && isMobile() ) { return false; }
		if ( p.device === 'mobile' && ! isMobile() ) { return false; }
		var s = read(), now = Date.now();
		if ( s[ 'su_' + p.id ] && now < s[ 'su_' + p.id ] ) { return false; } // subscribed: leave them alone
		if ( p.freq === 'session' ) { return ! sessionSeen( p.id ); }
		if ( p.freq === 'days' ) { return ! ( s[ 'seen_' + p.id ] && now - s[ 'seen_' + p.id ] < p.days * 86400000 ); }
		return true;
	}
	function remember( p ) {
		if ( p.preview ) { return; }
		var s = read(); s[ 'seen_' + p.id ] = Date.now(); write( s ); markSession( p.id );
	}

	/* ---------- beacons ---------- */
	function beacon( p, type ) {
		if ( p.preview || ! C.event ) { return; }
		try { fetch( C.event, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify( { popup: p.id, type: type } ), keepalive: true, credentials: 'omit' } ).catch( function () {} ); } catch ( e ) {}
	}

	/* ---------- dom helper ---------- */
	function el( tag, attrs, kids ) {
		var n = document.createElement( tag );
		Object.keys( attrs || {} ).forEach( function ( k ) { if ( k === 'text' ) { n.textContent = attrs[ k ]; } else if ( k === 'class' ) { n.className = attrs[ k ]; } else { n.setAttribute( k, attrs[ k ] ); } } );
		( kids || [] ).forEach( function ( c ) { if ( c ) { n.appendChild( c ); } } );
		return n;
	}

	var open = null;   // the popup currently on screen
	var queue = [];

	function show( p ) {
		if ( open ) { queue.push( p ); return; }
		var lastFocus = document.activeElement;
		var uid = 'wlpop-' + p.id;
		var box = el( 'div', { class: 'wlpop-box wlpop-' + p.type + ' wlpop-pos-' + p.position, role: p.type === 'bar' ? 'region' : 'dialog', 'aria-labelledby': uid + '-t', style: '--wlpop-primary:' + p.colors.primary + ';--wlpop-bg:' + p.colors.bg + ';--wlpop-text:' + p.colors.text } );
		if ( p.type !== 'bar' ) { box.setAttribute( 'aria-modal', p.type === 'modal' ? 'true' : 'false' ); }
		var close = el( 'button', { type: 'button', class: 'wlpop-x', 'aria-label': I.close || 'Close', text: '×' } );
		var body = el( 'div', { class: 'wlpop-body' } );
		if ( p.title ) { body.appendChild( el( 'strong', { class: 'wlpop-title', id: uid + '-t', text: p.title } ) ); }
		if ( p.content ) { var c = el( 'div', { class: 'wlpop-content' } ); c.innerHTML = p.content; body.appendChild( c ); } // sanitised on the server (wp_kses_post)
		var msg = el( 'p', { class: 'wlpop-msg', 'aria-live': 'polite' } );
		if ( p.form ) {
			var email = el( 'input', { type: 'email', name: 'email', required: 'required', autocomplete: 'email', placeholder: I.email || 'Your email', 'aria-label': I.email || 'Your email', class: 'wlpop-in' } );
			var name = p.askName ? el( 'input', { type: 'text', name: 'name', autocomplete: 'name', placeholder: I.name || 'Your name', 'aria-label': I.name || 'Your name', class: 'wlpop-in' } ) : null;
			var hp = el( 'input', { type: 'text', name: 'hp', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true', class: 'wlpop-hp' } );
			var consent = null, cb = null;
			if ( p.consent ) { cb = el( 'input', { type: 'checkbox', name: 'consent', required: 'required' } ); consent = el( 'label', { class: 'wlpop-consent' }, [ cb, el( 'span', { text: ' ' + p.consent } ) ] ); }
			var btn = el( 'button', { type: 'submit', class: 'wlpop-btn', text: p.button } );
			var form = el( 'form', { class: 'wlpop-form', novalidate: 'novalidate' }, [ name, email, hp, consent, btn ] );
			form.addEventListener( 'submit', function ( e ) {
				e.preventDefault(); msg.className = 'wlpop-msg';
				if ( ! email.value || ! /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test( email.value ) ) { msg.textContent = I.emailError || 'Please enter a valid email address.'; msg.className += ' wlpop-err'; email.focus(); return; }
				if ( cb && ! cb.checked ) { msg.textContent = I.consentError || 'Please tick the box to agree.'; msg.className += ' wlpop-err'; cb.focus(); return; }
				btn.disabled = true; var label = btn.textContent; btn.textContent = I.sending || 'Sending…';
				var payload = { popup: p.id, email: email.value, name: name ? name.value : '', consent: cb ? cb.checked : false, hp: hp.value, page: location.pathname + location.search };
				if ( p.preview ) { done( p.success ); return; }
				fetch( C.lead, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify( payload ), credentials: 'omit' } )
					.then( function ( r ) { return r.json().then( function ( j ) { return { ok: r.ok && j.ok, j: j }; } ); } )
					.then( function ( x ) {
						if ( x.ok ) { var s = read(); s[ 'su_' + p.id ] = Date.now() + p.hideDays * 86400000; write( s ); done( x.j.message || p.success, x.j.redirect ); }
						else { throw new Error( ( x.j && x.j.error ) || '' ); }
					} )
					.catch( function ( err ) { btn.disabled = false; btn.textContent = label; msg.textContent = ( err && err.message ) || I.error || 'Something went wrong. Please try again.'; msg.className += ' wlpop-err'; } );
			} );
			body.appendChild( form );
		} else if ( p.cta && p.cta.url ) {
			body.appendChild( el( 'a', { href: p.cta.url, class: 'wlpop-btn', text: p.cta.text || 'Learn more' } ) );
		}
		body.appendChild( msg );
		box.appendChild( close ); box.appendChild( body );
		function done( text, redirect ) {
			body.innerHTML = ''; body.appendChild( el( 'strong', { class: 'wlpop-title', text: text } ) );
			setTimeout( function () { if ( redirect ) { location.href = redirect; } }, redirect ? 900 : 0 );
		}
		var overlay = null;
		if ( p.type === 'modal' ) { overlay = el( 'div', { class: 'wlpop-overlay' }, [ box ] ); document.body.appendChild( overlay ); document.documentElement.classList.add( 'wlpop-lock' ); }
		else { document.body.appendChild( box ); }
		open = { p: p, node: overlay || box, box: box };
		remember( p ); beacon( p, 'view' );
		requestAnimationFrame( function () { ( overlay || box ).classList.add( 'wlpop-in-view' ); } );
		var first = box.querySelector( 'input:not(.wlpop-hp), a.wlpop-btn, button.wlpop-btn' ); if ( p.type === 'modal' && first ) { first.focus(); }

		function dismiss() {
			if ( ! open ) { return; }
			beacon( p, 'close' );
			open.node.parentNode && open.node.parentNode.removeChild( open.node ); open = null;
			document.documentElement.classList.remove( 'wlpop-lock' ); document.removeEventListener( 'keydown', onKey, true );
			if ( lastFocus && lastFocus.focus && document.body.contains( lastFocus ) ) { lastFocus.focus(); }
			if ( queue.length ) { show( queue.shift() ); }
		}
		function onKey( e ) {
			if ( e.key === 'Escape' ) { dismiss(); }
			if ( e.key === 'Tab' && p.type === 'modal' ) {
				var f = [].slice.call( box.querySelectorAll( 'button, input:not(.wlpop-hp), a[href]' ) ).filter( function ( n ) { return ! n.disabled; } ), a = f[ 0 ], z = f[ f.length - 1 ];
				if ( e.shiftKey && document.activeElement === a ) { z.focus(); e.preventDefault(); } else if ( ! e.shiftKey && document.activeElement === z ) { a.focus(); e.preventDefault(); }
			}
		}
		document.addEventListener( 'keydown', onKey, true );
		close.addEventListener( 'click', dismiss );
		if ( overlay && p.overlay ) { overlay.addEventListener( 'mousedown', function ( e ) { if ( e.target === overlay ) { dismiss(); } } ); }
	}

	/* ---------- triggers ---------- */
	function arm( p ) {
		var fired = false;
		function go() { if ( fired ) { return; } if ( ! allowed( p ) ) { return; } fired = true; show( p ); }
		switch ( p.trigger ) {
			case 'immediate': go(); break;
			case 'delay': setTimeout( go, Math.max( 0, p.delay ) * 1000 ); break;
			case 'scroll':
				var onScroll = function () {
					var h = document.documentElement.scrollHeight - window.innerHeight;
					if ( h <= 0 || ( window.scrollY / h * 100 ) >= p.scroll ) { window.removeEventListener( 'scroll', onScroll ); go(); }
				};
				window.addEventListener( 'scroll', onScroll, { passive: true } ); onScroll(); break;
			case 'exit':
				if ( isMobile() ) { break; } // no mouse to leave with
				document.addEventListener( 'mouseout', function ex( e ) { if ( ! e.relatedTarget && e.clientY <= 0 ) { document.removeEventListener( 'mouseout', ex ); go(); } } ); break;
			case 'click':
				if ( p.selector ) { document.addEventListener( 'click', function ( e ) { var t = e.target.closest ? e.target.closest( p.selector ) : null; if ( t ) { e.preventDefault(); fired = false; show( p ); } } ); }
				break;
		}
	}
	function start() { C.popups.forEach( arm ); }
	window.WLPOP_API = { open: function ( id ) { C.popups.forEach( function ( p ) { if ( p.id === id ) { show( p ); } } ); } };
	if ( document.readyState === 'loading' ) { document.addEventListener( 'DOMContentLoaded', start ); } else { start(); }
}() );
