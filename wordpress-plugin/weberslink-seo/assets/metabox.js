/* Weberslink SEO: live SERP preview and analysis panel in the editor. */
( function () {
	'use strict';
	var C = window.WLSEO || {};
	var box = document.querySelector( '.wlseo-box' );
	if ( ! box ) { return; }
	var $ = function ( s ) { return box.querySelector( s ); };
	var f = { kw: $( '[name=wlseo_kw]' ), title: $( '[name=wlseo_title]' ), desc: $( '[name=wlseo_desc]' ) };
	var list = $( '.wlseo-checks' ), timer = null, req = 0;
	var icons = { ok: '✅', warn: '⚠️', bad: '❌', info: 'ℹ️' };

	function postTitle() {
		try { if ( window.wp && wp.data && wp.data.select( 'core/editor' ) ) { return wp.data.select( 'core/editor' ).getEditedPostAttribute( 'title' ) || ''; } } catch ( e ) {}
		var t = document.getElementById( 'title' ); return t ? t.value : '';
	}
	function postContent() {
		try { if ( window.wp && wp.data && wp.data.select( 'core/editor' ) ) { return wp.data.select( 'core/editor' ).getEditedPostContent() || ''; } } catch ( e ) {}
		if ( window.tinymce && tinymce.get && tinymce.get( 'content' ) && ! tinymce.get( 'content' ).isHidden() ) { return tinymce.get( 'content' ).getContent(); }
		var c = document.getElementById( 'content' ); return c ? c.value : '';
	}
	function postSlug() {
		try { if ( window.wp && wp.data && wp.data.select( 'core/editor' ) ) { return wp.data.select( 'core/editor' ).getEditedPostAttribute( 'slug' ) || box.dataset.slug || ''; } } catch ( e ) {}
		var s = document.getElementById( 'post_name' ); return s && s.value ? s.value : ( box.dataset.slug || '' );
	}
	function effectiveTitle() {
		if ( f.title.value.trim() ) { return f.title.value.trim(); }
		return ( C.tpl || '%title%' ).replace( /%title%/g, postTitle() ).replace( /%sitename%/g, C.sitename || '' ).replace( /%sep%/g, C.sep || '-' ).replace( /%[a-z]+%/g, '' ).replace( /\s+/g, ' ' ).trim();
	}
	function effectiveDesc() {
		if ( f.desc.value.trim() ) { return f.desc.value.trim(); }
		var d = document.createElement( 'div' ); d.innerHTML = postContent();
		var t = ( d.textContent || '' ).replace( /\[\/?[a-z_][^\]]*\]/gi, ' ' ).replace( /\s+/g, ' ' ).trim();
		return t.length > 160 ? t.slice( 0, 157 ).replace( /\s+\S*$/, '' ) + '…' : t;
	}
	function cut( s, n ) { return s.length > n ? s.slice( 0, n - 1 ).replace( /\s+\S*$/, '' ) + '…' : s; }
	function preview() {
		var link = box.dataset.link || ( 'https://' + ( C.host || 'example.com' ) + '/' );
		$( '.wlseo-serp-url' ).textContent = link.replace( /^https?:\/\//, '' ).replace( /\/$/, '' ).replace( /\//g, ' › ' );
		$( '.wlseo-serp-title' ).textContent = cut( effectiveTitle(), 60 ) || '…';
		$( '.wlseo-serp-desc' ).textContent = cut( effectiveDesc(), 160 ) || '…';
		[ 'title', 'desc' ].forEach( function ( k ) {
			var n = box.querySelector( '.wlseo-count[data-for=' + k + ']' ), v = ( k === 'title' ? effectiveTitle() : effectiveDesc() ).length, max = k === 'title' ? 60 : 160;
			if ( n ) { n.textContent = v + ' / ' + max; n.className = 'wlseo-count' + ( v > max ? ' over' : '' ); }
		} );
	}
	function render( d ) {
		[ 'seo', 'read' ].forEach( function ( g ) {
			var el = box.querySelector( '[data-score=' + g + ']' ), v = d[ g ];
			el.querySelector( 'strong' ).textContent = v + '';
			el.className = 'wlseo-score ' + ( v >= 75 ? 'good' : v >= 50 ? 'mid' : 'low' );
		} );
		list.innerHTML = '';
		d.checks.forEach( function ( c ) {
			var li = document.createElement( 'li' ); li.className = 'wlseo-c-' + c[ 0 ];
			var i = document.createElement( 'span' ); i.textContent = icons[ c[ 0 ] ] || '';
			var b = document.createElement( 'div' ), s = document.createElement( 'strong' ); s.textContent = c[ 2 ]; b.appendChild( s ); b.appendChild( document.createTextNode( ' ' + c[ 3 ] ) );
			li.appendChild( i ); li.appendChild( b ); list.appendChild( li );
		} );
	}
	function analyze() {
		var id = ++req, fd = new FormData();
		fd.append( 'action', 'wlseo_analyze' ); fd.append( 'nonce', C.nonce );
		fd.append( 'title', effectiveTitle() ); fd.append( 'description', effectiveDesc() ); fd.append( 'keyword', f.kw.value ); fd.append( 'slug', postSlug() ); fd.append( 'content', postContent() );
		fetch( C.ajax, { method: 'POST', body: fd, credentials: 'same-origin' } ).then( function ( r ) { return r.json(); } ).then( function ( j ) { if ( id === req && j && j.success ) { render( j.data ); } } ).catch( function () {} );
	}
	function schedule() { preview(); clearTimeout( timer ); timer = setTimeout( analyze, 700 ); }
	[ f.kw, f.title, f.desc ].forEach( function ( el ) { el.addEventListener( 'input', schedule ); } );
	var t = document.getElementById( 'title' ); if ( t ) { t.addEventListener( 'input', schedule ); }
	var c = document.getElementById( 'content' ); if ( c ) { c.addEventListener( 'input', schedule ); }
	try { if ( window.wp && wp.data && wp.data.subscribe ) { var last = ''; wp.data.subscribe( function () { var s = postTitle() + '|' + postContent().length; if ( s !== last ) { last = s; schedule(); } } ); } } catch ( e ) {}
	preview(); analyze();
}() );
