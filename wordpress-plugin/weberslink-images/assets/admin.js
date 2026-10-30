/* Weberslink Image Optimizer: bulk optimisation in small steps. */
( function () {
	'use strict';
	var C = window.WLIO; if ( ! C ) { return; }
	var start = document.getElementById( 'wlio-start' ), stop = document.getElementById( 'wlio-stop' );
	var bar = document.querySelector( '.wlio-bar' ), fill = bar && bar.querySelector( 'span' ), msg = document.querySelector( '.wlio-msg' );
	if ( ! start ) { return; }
	var running = false, total = C.todo || 0, errors = 0;
	function step() {
		if ( ! running ) { return; }
		var fd = new FormData(); fd.append( 'action', 'wlio_bulk' ); fd.append( 'nonce', C.nonce );
		fetch( C.ajax, { method: 'POST', body: fd, credentials: 'same-origin' } ).then( function ( r ) { return r.json(); } ).then( function ( j ) {
			if ( ! j || ! j.success ) { throw new Error( 'failed' ); }
			errors = 0; var d = j.data;
			var pct = total ? Math.min( 100, Math.round( 100 * ( total - d.todo ) / total ) ) : 100;
			fill.style.width = pct + '%'; msg.textContent = ( total - d.todo ) + ' / ' + total + ' · ' + d.saved + ' saved';
			if ( d.todo > 0 && d.processed > 0 ) { setTimeout( step, 150 ); } else { finish( d.todo > 0 ? 'Stopped: some images could not be processed.' : 'All done. ' + d.saved + ' saved.' ); }
		} ).catch( function () {
			if ( ++errors >= 3 ) { finish( 'Stopped after repeated errors. Reload the page and try again.' ); } else { setTimeout( step, 1500 ); }
		} );
	}
	function finish( text ) { running = false; start.disabled = false; stop.hidden = true; msg.textContent = text; }
	start.addEventListener( 'click', function () { running = true; start.disabled = true; stop.hidden = false; bar.hidden = false; fill.style.width = '0'; msg.textContent = 'Working…'; step(); } );
	stop.addEventListener( 'click', function () { finish( 'Paused. Click "Optimise all images" to continue.' ); } );
}() );
