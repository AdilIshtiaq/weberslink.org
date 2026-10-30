/* Weberslink SMTP: provider presets and small settings-page conveniences. */
( function () {
	'use strict';
	var P = ( window.WLSMTP || {} ).presets || {};
	var $ = function ( s ) { return document.querySelector( s ); };
	var provider = $( '#wlsmtp_provider' );
	if ( ! provider ) { return; }
	var host = $( '#wlsmtp_host' );
	var port = $( '#wlsmtp_port' );
	var user = $( '#wlsmtp_user' );
	var note = $( '#wlsmtp_note' );
	var enc = document.querySelectorAll( 'input[name$="[encryption]"]' );
	var auth = $( 'input[name$="[auth]"]' );
	var DEFAULT_PORTS = [ '25', '465', '587', '2525', '' ];

	function setEnc( v ) { enc.forEach( function ( r ) { r.checked = r.value === v; } ); }
	function getEnc() { var c = Array.prototype.filter.call( enc, function ( r ) { return r.checked; } )[ 0 ]; return c ? c.value : 'tls'; }

	function applyPreset( fill ) {
		var p = P[ provider.value ];
		note.textContent = p && p.note ? p.note : '';
		if ( ! p || ! fill ) { return; }
		if ( host && ! host.disabled && p.host ) { host.value = p.host; }
		if ( port && ! port.disabled ) { port.value = p.port; }
		setEnc( p.encryption );
		if ( user && ! user.disabled && p.user ) { user.value = p.user; }
	}
	provider.addEventListener( 'change', function () { applyPreset( true ); } );
	applyPreset( false );

	enc.forEach( function ( r ) {
		r.addEventListener( 'change', function () {
			if ( port && ! port.disabled && DEFAULT_PORTS.indexOf( port.value ) !== -1 ) { port.value = { tls: 587, ssl: 465, none: 25 }[ getEnc() ]; }
		} );
	} );

	function syncAuth() {
		var on = ! auth || auth.checked;
		[ 'user', 'pass' ].forEach( function ( k ) { var row = document.querySelector( '[data-row="' + k + '"]' ); if ( row ) { row.style.display = on ? '' : 'none'; } } );
	}
	if ( auth ) { auth.addEventListener( 'change', syncAuth ); syncAuth(); }

	var reveal = $( '#wlsmtp_reveal' );
	var pass = $( '#wlsmtp_pass' );
	if ( reveal && pass ) {
		reveal.addEventListener( 'click', function () {
			var show = pass.type === 'password';
			pass.type = show ? 'text' : 'password';
			reveal.textContent = show ? 'Hide' : 'Show';
		} );
	}
}() );
