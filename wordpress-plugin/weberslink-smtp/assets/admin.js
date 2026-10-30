/* Weberslink SMTP: provider presets, mailer-type switching and small settings-page conveniences. */
( function () {
	'use strict';
	var P = ( window.WLSMTP || {} ).presets || {};
	var DEFAULT_PORTS = [ '25', '465', '587', '2525', '' ];

	function initConnection( box ) {
		var pre = box.getAttribute( 'data-prefix' ) || '';
		var q = function ( s ) { return box.querySelector( s ); };
		var byName = function ( n ) { return box.querySelector( '[name$="[' + pre + n + ']"]' ); };
		var mailer = q( '.wlsmtp-mailer' );
		var provider = q( '.wlsmtp-provider' );
		var host = byName( 'host' ), port = byName( 'port' ), user = byName( 'user' ), auth = byName( 'auth' );
		var note = q( '.wlsmtp-note' );
		var enc = box.querySelectorAll( 'input[name$="[' + pre + 'encryption]"]' );

		function setEnc( v ) { enc.forEach( function ( r ) { r.checked = r.value === v; } ); }
		function getEnc() { var c = Array.prototype.filter.call( enc, function ( r ) { return r.checked; } )[ 0 ]; return c ? c.value : 'tls'; }

		function showGroups() {
			var m = mailer ? mailer.value : 'smtp';
			box.querySelectorAll( '[data-group]' ).forEach( function ( row ) {
				var g = row.getAttribute( 'data-group' );
				var on = g === 'smtp' ? m === 'smtp' : g === 'api' ? m !== 'smtp' : m === 'mailgun';
				row.style.display = on ? '' : 'none';
			} );
			syncAuth();
		}
		function syncAuth() {
			if ( mailer && mailer.value !== 'smtp' ) { return; }
			var on = ! auth || auth.checked;
			[ 'user', 'pass' ].forEach( function ( k ) {
				var row = box.querySelector( '[data-row="' + pre + k + '"]' );
				if ( row ) { row.style.display = on ? '' : 'none'; }
			} );
		}
		function applyPreset( fill ) {
			var p = P[ provider.value ];
			if ( note ) { note.textContent = p && p.note ? p.note : ''; }
			if ( ! p || ! fill ) { return; }
			if ( host && ! host.disabled && p.host ) { host.value = p.host; }
			if ( port && ! port.disabled ) { port.value = p.port; }
			setEnc( p.encryption );
			if ( user && ! user.disabled && p.user ) { user.value = p.user; }
		}

		if ( mailer ) { mailer.addEventListener( 'change', showGroups ); }
		if ( provider ) {
			provider.addEventListener( 'change', function () { applyPreset( true ); } );
			applyPreset( false );
		}
		enc.forEach( function ( r ) {
			r.addEventListener( 'change', function () {
				if ( port && ! port.disabled && DEFAULT_PORTS.indexOf( port.value ) !== -1 ) { port.value = { tls: 587, ssl: 465, none: 25 }[ getEnc() ]; }
			} );
		} );
		if ( auth ) { auth.addEventListener( 'change', syncAuth ); }
		showGroups();
	}

	document.querySelectorAll( '.wlsmtp-conn' ).forEach( initConnection );

	document.querySelectorAll( '.wlsmtp-reveal' ).forEach( function ( btn ) {
		btn.addEventListener( 'click', function () {
			var f = document.getElementById( btn.getAttribute( 'data-target' ) );
			if ( ! f ) { return; }
			var show = f.type === 'password';
			f.type = show ? 'text' : 'password';
			btn.textContent = show ? 'Hide' : 'Show';
		} );
	} );
}() );
