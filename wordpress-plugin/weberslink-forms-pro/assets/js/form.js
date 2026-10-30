/*
 * Weberslink Forms Pro — front-end behaviour (vanilla JS, no dependencies).
 * Handles: conditional logic, multi-step, validation UX, masks, calculations, pricing, repeater,
 * signature, file lists, CAPTCHA, AJAX submit with nonce self-healing, draft autosave, view beacon.
 */
( function () {
	'use strict';
	var G = window.WLFP || { ajax: '', i18n: {} };
	var T = G.i18n || {};
	var $ = function ( s, c ) { return ( c || document ).querySelector( s ); };
	var $$ = function ( s, c ) { return Array.prototype.slice.call( ( c || document ).querySelectorAll( s ) ); };
	var fmt = function ( s ) { var a = arguments; var i = 1; return String( s ).replace( /%(\d\$)?s/g, function () { return a[ i++ ] !== undefined ? a[ i - 1 ] : ''; } ); };

	/* ---------- safe formula evaluator (mirrors PHP) ---------- */
	function calc( formula, vals ) {
		formula = String( formula || '' ).replace( /\{([a-z0-9_]+)\}/gi, function ( m, n ) {
			var v = vals[ n ];
			if ( Array.isArray( v ) ) { v = v.reduce( function ( a, b ) { return a + ( parseFloat( b ) || 0 ); }, 0 ); }
			v = parseFloat( v );
			return '(' + ( isFinite( v ) ? v : 0 ) + ')';
		} );
		var t = formula.match( /\d+\.?\d*(?:e[+-]?\d+)?|[a-z]+|[-+*\/%^(),]/gi ) || [];
		var i = 0;
		function peek() { return t[ i ]; }
		function next() { return t[ i++ ]; }
		function expr() { var v = term(); while ( peek() === '+' || peek() === '-' ) { var o = next(); var r = term(); v = o === '+' ? v + r : v - r; } return v; }
		function term() { var v = pow(); while ( peek() === '*' || peek() === '/' || peek() === '%' ) { var o = next(); var r = pow(); v = o === '*' ? v * r : ( r === 0 ? 0 : ( o === '/' ? v / r : v % r ) ); } return v; }
		function pow() { var b = unary(); if ( peek() === '^' ) { next(); return Math.pow( b, pow() ); } return b; }
		function unary() { if ( peek() === '-' ) { next(); return -unary(); } if ( peek() === '+' ) { next(); return unary(); } return atom(); }
		function atom() {
			var x = next();
			if ( x === undefined ) { throw 0; }
			if ( x === '(' ) { var v = expr(); if ( peek() === ')' ) { next(); } return v; }
			if ( /^[\d.]/.test( x ) ) { return parseFloat( x ); }
			if ( /^[a-z]+$/i.test( x ) ) {
				if ( peek() !== '(' ) { throw 0; }
				next();
				var args = [];
				if ( peek() !== ')' ) { args.push( expr() ); while ( peek() === ',' ) { next(); args.push( expr() ); } }
				if ( peek() === ')' ) { next(); }
				var a = args[ 0 ] || 0;
				switch ( x.toLowerCase() ) {
					case 'round': var p = Math.pow( 10, args[ 1 ] || 0 ); return Math.round( a * p ) / p;
					case 'floor': return Math.floor( a );
					case 'ceil': return Math.ceil( a );
					case 'abs': return Math.abs( a );
					case 'sqrt': return a < 0 ? 0 : Math.sqrt( a );
					case 'pow': return Math.pow( a, args.length > 1 ? args[ 1 ] : 1 );
					case 'min': return args.length ? Math.min.apply( null, args ) : 0;
					case 'max': return args.length ? Math.max.apply( null, args ) : 0;
				}
				throw 0;
			}
			throw 0;
		}
		try { var r = expr(); return isFinite( r ) ? r : 0; } catch ( e ) { return 0; }
	}

	/* ---------- conditional rule evaluation (mirrors PHP) ---------- */
	function rule( r, actual ) {
		var arr = Array.isArray( actual ) ? actual.map( String ) : [ String( actual == null ? '' : actual ) ];
		var exp = String( r.value == null ? '' : r.value );
		var joined = arr.join( ' ' ).toLowerCase();
		var e = exp.toLowerCase();
		var n = parseFloat( arr[ 0 ] );
		switch ( r.op ) {
			case 'eq': return arr.indexOf( exp ) !== -1;
			case 'neq': return arr.indexOf( exp ) === -1;
			case 'contains': return joined.indexOf( e ) !== -1;
			case 'not_contains': return joined.indexOf( e ) === -1;
			case 'starts': return joined.indexOf( e ) === 0;
			case 'ends': return e !== '' && joined.slice( -e.length ) === e;
			case 'gt': return isFinite( n ) && n > parseFloat( exp );
			case 'lt': return isFinite( n ) && n < parseFloat( exp );
			case 'gte': return isFinite( n ) && n >= parseFloat( exp );
			case 'lte': return isFinite( n ) && n <= parseFloat( exp );
			case 'empty': return arr.join( '' ).trim() === '';
			case 'not_empty': return arr.join( '' ).trim() !== '';
		}
		return false;
	}
	function passes( cond, vals ) {
		if ( ! cond || ! cond.enabled || ! cond.rules || ! cond.rules.length ) { return true; }
		var any = cond.match === 'any';
		for ( var i = 0; i < cond.rules.length; i++ ) {
			var r = cond.rules[ i ];
			if ( ! r.field ) { continue; }
			var ok = rule( r, vals[ r.field ] );
			if ( any && ok ) { return true; }
			if ( ! any && ! ok ) { return false; }
		}
		return ! any;
	}

	/* ---------- Form controller ---------- */
	function Form( form ) {
		this.f = form;
		this.wrap = form.closest( '.wlfp-wrap' );
		this.cfg = {};
		try { this.cfg = JSON.parse( form.getAttribute( 'data-config' ) || '{}' ); } catch ( e ) {}
		this.id = this.cfg.formId;
		this.conv = this.cfg.conv && this.wrap.classList.contains( 'wlfp-conv' ) ? this.cfg.conv : null;
		this.cslide = 0;
		this.steps = $$( '.wlfp-step', form );
		this.cur = 0;
		this.discount = null;
		this.busy = false;
		this.retried = false;
		this.init();
	}

	Form.prototype.values = function () {
		var v = {};
		var self = this;
		$$( '[data-name]', this.f ).forEach( function ( w ) {
			if ( w.hasAttribute( 'hidden' ) && w.classList.contains( 'wlfp-cond' ) ) { return; }
			v[ w.getAttribute( 'data-name' ) ] = self.valueOf( w );
		} );
		return v;
	};

	Form.prototype.valueOf = function ( w ) {
		var type = w.getAttribute( 'data-type' );
		var name = w.getAttribute( 'data-name' );
		var els = $$( '[name="' + name + '"],[name="' + name + '[]"],[name^="' + name + '["]', w ).filter( function ( e ) { return ! e.disabled; } );
		if ( ! els.length ) { return ''; }
		if ( type === 'slot_picker' ) {
			var sd = $( 'input[type=date]', w );
			var sr = els.filter( function ( e ) { return e.type === 'radio' && e.checked; } )[ 0 ];
			return ( sd && sd.value ? sd.value : '' ) + ( sr ? ' ' + sr.value : '' );
		}
		if ( type === 'toggle' ) { return els[ 0 ].checked ? 'yes' : 'no'; }
		if ( type === 'terms' ) { return els[ 0 ].checked ? 'yes' : ''; }
		if ( type === 'ranking' ) { return els.map( function ( e ) { return e.value; } ); }
		if ( type === 'image_choice' ) {
			var chosen = els.filter( function ( e ) { return e.checked; } ).map( function ( e ) { return e.value; } );
			return $( '.wlfp-imgchoices', w ).getAttribute( 'data-multiple' ) === '1' ? chosen : ( chosen[ 0 ] || '' );
		}
		if ( type === 'post_select' ) {
			var psel = $( 'select', w );
			if ( psel && psel.multiple ) { return $$( 'option', psel ).filter( function ( o ) { return o.selected; } ).map( function ( o ) { return o.value; } ); }
			return psel ? psel.value : '';
		}
		if ( type === 'checkbox' || type === 'multiselect' || ( type === 'payment_item' && w.querySelector( 'input[type=checkbox]' ) ) ) {
			if ( type === 'multiselect' ) { var s = $( 'select', w ); return s ? $$( 'option', s ).filter( function ( o ) { return o.selected; } ).map( function ( o ) { return o.value; } ) : []; }
			return els.filter( function ( e ) { return e.checked; } ).map( function ( e ) { return e.value; } );
		}
		if ( type === 'radio' || type === 'rating' || type === 'nps' || type === 'emoji_rating' || ( type === 'payment_item' && w.querySelector( 'input[type=radio]' ) ) ) {
			var c = els.filter( function ( e ) { return e.checked; } )[ 0 ];
			return c ? c.value : '';
		}
		if ( type === 'consent' ) { return els[ 0 ].checked ? 'yes' : ''; }
		if ( type === 'name' || type === 'address' || type === 'date_range' ) {
			var o = {};
			els.forEach( function ( e ) { var m = e.name.match( /\[(\w+)\]$/ ); if ( m ) { o[ m[ 1 ] ] = e.value; } } );
			return Object.keys( o ).map( function ( k ) { return o[ k ]; } ).join( ' ' ).trim();
		}
		if ( type === 'likert' ) { return els.filter( function ( e ) { return e.checked; } ).map( function ( e ) { return e.value; } ); }
		if ( type === 'repeater' || type === 'signature' || type === 'file' || type === 'image' ) { return els.map( function ( e ) { return e.value; } ).join( '' ) ? '1' : ''; }
		return els[ 0 ].value;
	};

	Form.prototype.init = function () {
		var self = this;
		this.wrap.classList.add( 'wlfp-js' );
		this.refreshHidden();
		if ( this.conv ) { this.convInit(); } else { this.buildProgress(); }
		this.bindMasks();
		this.bindCounters();
		this.bindRange();
		this.bindFiles();
		this.bindRepeaters();
		this.bindSignatures();
		this.bindCoupon();
		this.bindSlots();
		this.bindResume();
		this.bindRanking();
		this.bindTerms();
		this.initCaptcha();
		this.restoreDraft();
		this.evaluate();

		this.f.addEventListener( 'input', function ( e ) { self.onChange( e ); } );
		this.f.addEventListener( 'change', function ( e ) { self.onChange( e ); } );
		this.f.addEventListener( 'submit', function ( e ) { e.preventDefault(); self.submit(); } );
		$$( '.wlfp-btn-next', this.f ).forEach( function ( b ) { b.addEventListener( 'click', function () { self.next(); } ); } );
		$$( '.wlfp-btn-prev', this.f ).forEach( function ( b ) { b.addEventListener( 'click', function () { self.go( self.prevVisible( self.cur ) ); } ); } );
		this.f.addEventListener( 'keydown', function ( e ) {
			if ( self.conv ) {
				if ( e.key !== 'Enter' || e.isComposing ) { return; }
				var t = e.target;
				if ( t.tagName === 'BUTTON' || t.tagName === 'A' || ( t.tagName === 'TEXTAREA' && ! ( e.ctrlKey || e.metaKey ) ) || t.type === 'file' ) { return; }
				e.preventDefault();
				if ( self.cslide < 0 ) { self.convStart(); } else { self.convNext(); }
				return;
			}
			if ( e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'submit' && self.steps.length > 1 && self.cur < self.steps.length - 1 ) {
				e.preventDefault(); self.next();
			}
		} );
		this.beacon();
	};

	Form.prototype.refreshHidden = function () {
		// Server set `hidden` on conditional fields; make sure their inputs are disabled until shown.
		$$( '.wlfp-cond[hidden]', this.f ).forEach( function ( w ) { $$( 'input,select,textarea,button', w ).forEach( function ( e ) { e.disabled = true; } ); } );
	};

	Form.prototype.onChange = function ( e ) {
		if ( e.target && e.target.closest ) {
			var w = e.target.closest( '.wlfp-field' );
			if ( w ) { this.clearError( w ); }
		}
		this.evaluate();
		if ( this.conv ) { this.convAuto( e ); }
		if ( this.cfg.autosave ) { this.saveDraft(); }
	};

	/* conditional logic + calculations + totals */
	Form.prototype.evaluate = function () {
		var self = this;
		for ( var pass = 0; pass < 4; pass++ ) {
			var changed = false;
			var vals = this.values();
			$$( '.wlfp-cond', this.f ).forEach( function ( w ) {
				var cond;
				try { cond = JSON.parse( w.getAttribute( 'data-cond' ) ); } catch ( e ) { return; }
				var show = passes( cond, vals );
				if ( show === w.hasAttribute( 'hidden' ) ) {
					changed = true;
					if ( show ) { w.removeAttribute( 'hidden' ); } else { w.setAttribute( 'hidden', '' ); }
					$$( 'input,select,textarea,button', w ).forEach( function ( el ) { el.disabled = ! show; } );
				}
			} );
			if ( ! changed ) { break; }
		}
		this.calculations();
		this.totals();
		this.updateProgress();
	};

	Form.prototype.calculations = function () {
		var vals = this.values();
		$$( '.wlfp-calc', this.f ).forEach( function ( c ) {
			var r = calc( c.getAttribute( 'data-formula' ), vals );
			var d = parseInt( c.getAttribute( 'data-decimals' ), 10 );
			var s = r.toFixed( isNaN( d ) ? 2 : d );
			$( 'output', c ).textContent = ( c.getAttribute( 'data-prefix' ) || '' ) + s + ( c.getAttribute( 'data-suffix' ) || '' );
			var h = $( 'input[type=hidden]', c );
			if ( h ) { h.value = s; }
			vals[ h ? h.name : '' ] = s;
		} );
	};

	Form.prototype.money = function ( n ) {
		var p = this.cfg.payment || {};
		var s = ( n || 0 ).toFixed( p.zeroDec ? 0 : 2 );
		return ( p.symbol || '' ) + ( p.symbol && p.symbol.length > 1 ? ' ' : '' ) + s.replace( /\B(?=(\d{3})+(?!\d))/g, ',' );
	};

	Form.prototype.totals = function () {
		var p = this.cfg.payment;
		var box = $( '.wlfp-summary', this.f );
		if ( ! p ) { return; }
		var vals = this.values();
		var lines = [];
		p.items.forEach( function ( it ) {
			var w = $( '[data-name="' + it.name + '"]', this.f );
			if ( ! w || w.hasAttribute( 'hidden' ) ) { return; }
			var qf = p.qty[ it.name ];
			var q = qf && vals[ qf ] !== undefined && vals[ qf ] !== '' ? Math.max( 0, parseInt( vals[ qf ], 10 ) || 0 ) : 1;
			var v = vals[ it.name ];
			if ( it.kind === 'fixed' ) { lines.push( [ it.label, it.price, q ] ); }
			else if ( it.kind === 'custom' ) { var a = parseFloat( v ); if ( a > 0 ) { lines.push( [ it.label, a, q ] ); } }
			else {
				( Array.isArray( v ) ? v : [ v ] ).forEach( function ( sel ) {
					it.options.forEach( function ( o ) { if ( o.value === String( sel ) && o.price ) { lines.push( [ it.label + ' — ' + o.label, o.price, q ] ); } } );
				} );
			}
		}, this );
		var sub = lines.reduce( function ( a, l ) { return a + l[ 1 ] * l[ 2 ]; }, 0 );
		var disc = 0;
		if ( this.discount ) { disc = this.discount.type === 'percent' ? sub * Math.min( 100, this.discount.amount ) / 100 : Math.min( sub, this.discount.amount ); }
		var tax = Math.max( 0, sub - disc ) * ( p.tax || 0 ) / 100;
		this.total = Math.round( ( Math.max( 0, sub - disc ) + tax ) * 100 ) / 100;
		if ( box ) {
			var html = '<table><tbody>';
			lines.forEach( function ( l ) { html += '<tr><td></td><td>' + this.money( l[ 1 ] * l[ 2 ] ) + '</td></tr>'; }, this );
			html += '</tbody></table>';
			box.innerHTML = html;
			var rows = $$( 'tr', box );
			lines.forEach( function ( l, i ) { rows[ i ].firstChild.textContent = l[ 0 ] + ( l[ 2 ] > 1 ? ' × ' + l[ 2 ] : '' ); } );
			var tb = $( 'tbody', box );
			var add = function ( cls, label, val ) { var tr = document.createElement( 'tr' ); if ( cls ) { tr.className = cls; } tr.innerHTML = '<td></td><td></td>'; tr.children[ 0 ].textContent = label; tr.children[ 1 ].textContent = val; tb.appendChild( tr ); };
			if ( disc ) { add( '', T.discount || 'Discount', '-' + this.money( disc ) ); }
			if ( p.tax ) { add( '', ( T.tax || 'Tax' ) + ' (' + p.tax + '%)', this.money( tax ) ); }
			add( 'wlfp-sum-total', T.total || 'Total', this.money( this.total ) );
		}
	};

	/* ---------- steps ---------- */
	Form.prototype.stepHasFields = function ( i ) {
		var s = this.steps[ i ];
		if ( ! s ) { return false; }
		return $$( '.wlfp-field', s ).some( function ( w ) { return ! w.hasAttribute( 'hidden' ) && w.getAttribute( 'data-type' ) !== 'hidden'; } ) || $$( '.wlfp-field', s ).length === 0;
	};
	Form.prototype.nextVisible = function ( i ) { for ( var k = i + 1; k < this.steps.length; k++ ) { if ( this.stepHasFields( k ) || k === this.steps.length - 1 ) { return k; } } return i; };
	Form.prototype.prevVisible = function ( i ) { for ( var k = i - 1; k >= 0; k-- ) { if ( this.stepHasFields( k ) ) { return k; } } return 0; };
	Form.prototype.buildProgress = function () {
		if ( this.steps.length < 2 || this.cfg.progress === 'none' ) { return; }
		var p = document.createElement( 'div' );
		p.className = 'wlfp-progress';
		if ( this.cfg.progress === 'steps' ) {
			p.innerHTML = '<ol class="wlfp-progress-steps"></ol>';
			this.cfg.steps.forEach( function ( t, i ) { var li = document.createElement( 'li' ); li.textContent = t || ( i + 1 ); p.firstChild.appendChild( li ); } );
		} else {
			p.innerHTML = '<div class="wlfp-progress-text"><span class="wlfp-pt-step"></span><span class="wlfp-pt-title"></span></div><div class="wlfp-progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100"><i></i></div>';
		}
		this.f.insertBefore( p, this.steps[ 0 ] );
		this.prog = p;
	};
	Form.prototype.updateProgress = function () {
		if ( this.conv ) { if ( this.slides ) { this.convRefresh(); } return; }
		if ( ! this.prog ) { return; }
		var n = this.steps.length;
		if ( this.cfg.progress === 'steps' ) {
			$$( 'li', this.prog ).forEach( function ( li, i ) { li.classList.toggle( 'is-active', i === this.cur ); li.classList.toggle( 'is-done', i < this.cur ); li.style.display = this.stepHasFields( i ) || i === this.cur ? '' : 'none'; }, this );
		} else {
			$( '.wlfp-pt-step', this.prog ).textContent = fmt( T.step || 'Step %1$s of %2$s', this.cur + 1, n );
			$( '.wlfp-pt-title', this.prog ).textContent = this.cfg.steps[ this.cur ] || '';
			var pct = Math.round( ( this.cur + 1 ) / n * 100 );
			$( '.wlfp-progress-bar > i', this.prog ).style.width = pct + '%';
			$( '.wlfp-progress-bar', this.prog ).setAttribute( 'aria-valuenow', pct );
		}
	};
	Form.prototype.go = function ( i ) {
		if ( i === this.cur || ! this.steps[ i ] ) { return; }
		this.steps[ this.cur ].hidden = true;
		this.steps[ this.cur ].classList.remove( 'wlfp-step-active' );
		this.cur = i;
		this.steps[ i ].hidden = false;
		this.steps[ i ].classList.add( 'wlfp-step-active' );
		this.updateProgress();
		var top = this.wrap.getBoundingClientRect().top;
		if ( top < 0 ) { this.wrap.scrollIntoView( { behavior: 'smooth', block: 'start' } ); }
		var first = $( 'input:not([type=hidden]):not(:disabled),select:not(:disabled),textarea:not(:disabled)', this.steps[ i ] );
		if ( first ) { try { first.focus( { preventScroll: true } ); } catch ( e ) {} }
	};
	Form.prototype.next = function () {
		if ( ! this.validateStep( this.cur ) ) { return; }
		this.go( this.nextVisible( this.cur ) );
	};

	/* ---------- validation ---------- */
	Form.prototype.clearError = function ( w ) {
		var e = $( '.wlfp-error', w );
		if ( e ) { e.textContent = ''; }
		$$( '[aria-invalid]', w ).forEach( function ( i ) { i.removeAttribute( 'aria-invalid' ); } );
	};
	Form.prototype.setError = function ( w, msg ) {
		var e = $( '.wlfp-error', w );
		if ( e ) { e.textContent = msg; }
		$$( 'input:not([type=hidden]),select,textarea', w ).forEach( function ( i ) { i.setAttribute( 'aria-invalid', 'true' ); } );
	};
	Form.prototype.validateStep = function ( i ) {
		var self = this;
		var first = null;
		$$( '.wlfp-field', this.steps[ i ] ).forEach( function ( w ) {
			if ( w.hasAttribute( 'hidden' ) ) { return; }
			var err = self.checkField( w );
			if ( err ) { self.setError( w, err ); if ( ! first ) { first = w; } } else { self.clearError( w ); }
		} );
		if ( first ) {
			var inp = $( 'input:not([type=hidden]),select,textarea', first );
			if ( inp ) { inp.focus(); }
			return false;
		}
		return true;
	};
	Form.prototype.checkField = function ( w ) {
		var type = w.getAttribute( 'data-type' );
		var name = w.getAttribute( 'data-name' );
		if ( ! name ) { return ''; }
		var req = w.hasAttribute( 'data-required' );
		var v = this.valueOf( w );
		if ( type === 'slot_picker' ) {
			var sdv = $( 'input[type=date]', w ).value;
			var ssl = $( 'input[type=radio]:checked', w );
			if ( req && ( ! sdv || ! ssl ) ) { return w.getAttribute( 'data-req-msg' ) || T.required || 'Required'; }
			return sdv && ! ssl ? ( T.slotPick || 'Please choose a time.' ) : '';
		}
		if ( type === 'toggle' ) { return req && v !== 'yes' ? ( w.getAttribute( 'data-req-msg' ) || T.required || 'Required' ) : ''; }
		var empty = Array.isArray( v ) ? v.length === 0 : String( v ).trim() === '';
		if ( type === 'name' && req ) { var parts = $$( 'input', w ); if ( parts.some( function ( p ) { return p.name.match( /\[(first|last)\]/ ) && ! p.value.trim(); } ) ) { empty = true; } }
		if ( type === 'address' && req ) { if ( $$( 'input,select', w ).some( function ( p ) { return p.name.match( /\[(line1|city|zip|country)\]/ ) && ! p.value.trim(); } ) ) { empty = true; } }
		if ( type === 'likert' && req ) { var rows = {}; $$( 'input', w ).forEach( function ( r ) { rows[ r.name ] = rows[ r.name ] || r.checked; } ); empty = Object.keys( rows ).some( function ( k ) { return ! rows[ k ]; } ); }
		if ( req && empty && type !== 'hidden' ) { return w.getAttribute( 'data-req-msg' ) || T.required || 'Required'; }
		if ( empty ) { return ''; }
		var el = $( 'input:not([type=hidden]):not([type=checkbox]):not([type=radio]),select,textarea', w );
		if ( el && el.type !== 'file' && el.checkValidity && ! el.checkValidity() ) { return el.validationMessage; }
		var cf = $( '.wlfp-confirm', w );
		if ( cf && el && el !== cf ) {
			var a = type === 'email' ? el.value.trim().toLowerCase() : el.value;
			var b = type === 'email' ? cf.value.trim().toLowerCase() : cf.value;
			if ( a !== b ) { return T.mismatch || 'The two values do not match.'; }
		}
		if ( type === 'date_range' ) {
			var ds = $$( 'input[type=date]', w );
			if ( ds.length === 2 && ds[ 0 ].value && ds[ 1 ].value && ds[ 1 ].value < ds[ 0 ].value ) { return T.rangeBad || 'The end date must be on or after the start date.'; }
		}
		return '';
	};
	Form.prototype.validateAll = function () {
		var firstStep = -1;
		for ( var i = 0; i < this.steps.length; i++ ) {
			var self = this;
			var bad = false;
			$$( '.wlfp-field', this.steps[ i ] ).forEach( function ( w ) {
				if ( w.hasAttribute( 'hidden' ) ) { return; }
				var err = self.checkField( w );
				if ( err ) { self.setError( w, err ); bad = true; } else { self.clearError( w ); }
			} );
			if ( bad && firstStep < 0 ) { firstStep = i; }
		}
		if ( firstStep >= 0 && this.conv ) {
			var badEl = $( '.wlfp-field .wlfp-error:not(:empty)', this.f );
			if ( badEl ) { this.convShowFor( badEl.closest( '.wlfp-field' ) ); }
			return false;
		}
		if ( firstStep >= 0 ) {
			if ( firstStep !== this.cur ) { this.go( firstStep ); }
			var bw = $( '.wlfp-field .wlfp-error:not(:empty)', this.steps[ firstStep ] );
			if ( bw ) { var inp = $( 'input:not([type=hidden]),select,textarea', bw.closest( '.wlfp-field' ) ); if ( inp ) { inp.focus(); } }
			return false;
		}
		return true;
	};

	/* ---------- widgets ---------- */
	Form.prototype.bindMasks = function () {
		$$( 'input[data-mask]', this.f ).forEach( function ( inp ) {
			var mask = inp.getAttribute( 'data-mask' );
			inp.addEventListener( 'input', function () {
				var raw = inp.value.replace( /[^0-9a-zA-Z]/g, '' );
				var out = '';
				var ri = 0;
				for ( var i = 0; i < mask.length && ri < raw.length; i++ ) {
					var m = mask[ i ];
					if ( m === '9' ) { while ( ri < raw.length && ! /\d/.test( raw[ ri ] ) ) { ri++; } if ( ri < raw.length ) { out += raw[ ri++ ]; } }
					else if ( m === 'a' ) { while ( ri < raw.length && ! /[a-zA-Z]/.test( raw[ ri ] ) ) { ri++; } if ( ri < raw.length ) { out += raw[ ri++ ]; } }
					else if ( m === '*' ) { out += raw[ ri++ ]; }
					else { out += m; }
				}
				inp.value = out;
			} );
		} );
	};
	Form.prototype.bindCounters = function () {
		$$( '.wlfp-counter', this.f ).forEach( function ( c ) {
			var ta = document.getElementById( c.getAttribute( 'data-for' ) );
			if ( ! ta ) { return; }
			var max = parseInt( ta.getAttribute( 'maxlength' ), 10 );
			var up = function () { c.textContent = fmt( T.remaining || '%s left', Math.max( 0, max - ta.value.length ) ); };
			ta.addEventListener( 'input', up ); up();
		} );
	};
	Form.prototype.bindRange = function () {
		$$( '.wlfp-range', this.f ).forEach( function ( r ) {
			var o = r.parentNode.querySelector( '.wlfp-range-out' );
			r.addEventListener( 'input', function () { o.textContent = r.value; } );
		} );
	};
	Form.prototype.bindFiles = function () {
		var self = this;
		$$( '.wlfp-file-input', this.f ).forEach( function ( inp ) {
			inp.addEventListener( 'change', function () {
				var list = $( '.wlfp-file-list', inp.parentNode );
				var max = parseFloat( inp.getAttribute( 'data-max-size' ) ) || 5;
				var maxFiles = parseInt( inp.getAttribute( 'data-max-files' ), 10 ) || 1;
				var w = inp.closest( '.wlfp-field' );
				list.textContent = '';
				if ( inp.files.length > maxFiles ) { self.setError( w, fmt( T.tooMany || '', maxFiles ) ); inp.value = ''; return; }
				for ( var i = 0; i < inp.files.length; i++ ) {
					var f = inp.files[ i ];
					if ( f.size > max * 1048576 ) { self.setError( w, fmt( T.tooBig || '', f.name, max ) ); inp.value = ''; list.textContent = ''; return; }
					var d = document.createElement( 'div' );
					d.textContent = f.name + ' (' + Math.round( f.size / 1024 ) + ' KB)';
					list.appendChild( d );
				}
			} );
		} );
	};
	Form.prototype.bindRepeaters = function () {
		var self = this;
		$$( '.wlfp-repeater', this.f ).forEach( function ( rep ) {
			var rows = $( '.wlfp-rep-rows', rep );
			var tpl = $( '.wlfp-rep-tpl', rep );
			var max = parseInt( rep.getAttribute( 'data-max' ), 10 ) || 10;
			var min = parseInt( rep.getAttribute( 'data-min' ), 10 ) || 1;
			var idx = rows.children.length;
			var add = $( '.wlfp-rep-add', rep );
			var sync = function () { add.hidden = rows.children.length >= max; $$( '.wlfp-rep-del', rep ).forEach( function ( b ) { b.hidden = rows.children.length <= min; } ); };
			add.addEventListener( 'click', function () {
				if ( rows.children.length >= max ) { return; }
				var html = tpl.innerHTML.replace( /__i__/g, idx++ );
				var d = document.createElement( 'div' ); d.innerHTML = html;
				rows.appendChild( d.firstElementChild ); sync();
			} );
			rep.addEventListener( 'click', function ( e ) {
				if ( e.target.classList.contains( 'wlfp-rep-del' ) && rows.children.length > min ) { e.target.closest( '.wlfp-rep-row' ).remove(); sync(); }
			} );
			sync();
		} );
	};
	Form.prototype.bindSignatures = function () {
		$$( '.wlfp-signature', this.f ).forEach( function ( box ) {
			var cv = $( 'canvas', box );
			var out = $( 'input[type=hidden]', box );
			var ctx = cv.getContext( '2d' );
			var drawing = false;
			var dirty = false;
			var resize = function () {
				var r = cv.getBoundingClientRect();
				if ( ! r.width ) { return; }
				var ratio = Math.max( window.devicePixelRatio || 1, 1 );
				if ( cv.width !== Math.round( r.width * ratio ) ) { cv.width = Math.round( r.width * ratio ); cv.height = Math.round( r.height * ratio ); ctx.scale( ratio, ratio ); ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#111'; }
			};
			var pos = function ( e ) { var r = cv.getBoundingClientRect(); return [ e.clientX - r.left, e.clientY - r.top ]; };
			cv.addEventListener( 'pointerdown', function ( e ) { resize(); drawing = true; var p = pos( e ); ctx.beginPath(); ctx.moveTo( p[ 0 ], p[ 1 ] ); cv.setPointerCapture( e.pointerId ); e.preventDefault(); } );
			cv.addEventListener( 'pointermove', function ( e ) { if ( ! drawing ) { return; } var p = pos( e ); ctx.lineTo( p[ 0 ], p[ 1 ] ); ctx.stroke(); dirty = true; } );
			var end = function () { if ( ! drawing ) { return; } drawing = false; if ( dirty ) { out.value = cv.toDataURL( 'image/png' ); out.dispatchEvent( new Event( 'change', { bubbles: true } ) ); } };
			cv.addEventListener( 'pointerup', end ); cv.addEventListener( 'pointercancel', end );
			$( '.wlfp-sig-clear', box ).addEventListener( 'click', function () { ctx.clearRect( 0, 0, cv.width, cv.height ); out.value = ''; dirty = false; out.dispatchEvent( new Event( 'change', { bubbles: true } ) ); } );
			window.addEventListener( 'resize', function () { if ( ! dirty ) { resize(); } } );
		} );
	};
	/* ---------- conversational (one question at a time) ---------- */
	Form.prototype.convInit = function () {
		var self = this;
		var LAY = [ 'section', 'html', 'divider', 'image_block', 'embed', 'shortcode', 'payment_summary' ];
		var pre = [], tail = [], slides = [];
		$$( '.wlfp-field', this.f ).forEach( function ( w ) {
			var t = w.getAttribute( 'data-type' );
			if ( t === 'hidden' ) { return; }
			if ( t === 'captcha' ) { tail.push( w ); return; }
			if ( LAY.indexOf( t ) !== -1 ) { pre.push( w ); return; }
			slides.push( { els: pre.concat( [ w ] ), q: w } );
			pre = [];
		} );
		if ( ! slides.length ) { this.conv = null; this.wrap.classList.remove( 'wlfp-conv' ); this.buildProgress(); return; }
		var last = slides[ slides.length - 1 ];
		last.els = last.els.concat( pre, tail );
		this.slides = slides;
		this.steps.forEach( function ( st ) { st.hidden = false; } ); // every fieldset is "open"; slides decide what shows.

		var nav = document.createElement( 'div' );
		nav.className = 'wlfp-conv-nav';
		nav.innerHTML = '<div class="wlfp-conv-progress"><div class="wlfp-conv-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100"><i></i></div><span class="wlfp-conv-count"></span></div><div class="wlfp-conv-btns"><button type="button" class="wlfp-btn wlfp-conv-back"></button><button type="button" class="wlfp-btn wlfp-conv-next"></button><span class="wlfp-conv-hint"></span></div>';
		this.f.appendChild( nav );
		this.nav = nav;
		var back = $( '.wlfp-conv-back', nav );
		back.textContent = '←';
		back.setAttribute( 'aria-label', T.convBack || 'Back' );
		$( '.wlfp-conv-hint', nav ).textContent = T.convHint || '';
		$( '.wlfp-conv-next', nav ).addEventListener( 'click', function () { self.convNext(); } );
		back.addEventListener( 'click', function () { self.convBack(); } );

		var wl = this.conv.welcome;
		if ( wl ) {
			var panel = document.createElement( 'div' );
			panel.className = 'wlfp-conv-welcome';
			var h2 = document.createElement( 'h2' );
			h2.textContent = wl.title || '';
			var body = document.createElement( 'div' );
			body.innerHTML = wl.text || ''; // sanitised on the server with wp_kses
			var btn = document.createElement( 'button' );
			btn.type = 'button';
			btn.className = 'wlfp-btn wlfp-conv-start';
			btn.textContent = wl.start;
			btn.addEventListener( 'click', function () { self.convStart(); } );
			if ( wl.title ) { panel.appendChild( h2 ); }
			panel.appendChild( body );
			panel.appendChild( btn );
			this.f.insertBefore( panel, this.steps[ 0 ] );
			this.welcomeEl = panel;
			this.cslide = -1;
			nav.hidden = true;
		}
		if ( ! wl ) { this.convShow( this.convVisible()[ 0 ] || 0, 'fwd', true ); }
	};
	Form.prototype.convVisible = function () {
		var out = [];
		this.slides.forEach( function ( s, i ) { if ( ! s.q.hasAttribute( 'hidden' ) ) { out.push( i ); } } );
		return out;
	};
	Form.prototype.convShow = function ( i, dir, noFocus ) {
		if ( ! this.slides[ i ] ) { return; }
		this.slides.forEach( function ( s ) { s.els.forEach( function ( w ) { w.classList.remove( 'wlfp-slide-on', 'wlfp-dir-back' ); } ); } );
		var s = this.slides[ i ];
		this.cslide = i;
		s.els.forEach( function ( w ) { w.classList.add( 'wlfp-slide-on' ); if ( dir === 'back' ) { w.classList.add( 'wlfp-dir-back' ); } } );
		if ( this.welcomeEl ) { this.welcomeEl.hidden = true; }
		this.msg( '' );
		this.convRefresh();
		if ( noFocus ) { return; }
		setTimeout( function () {
			var f = $( 'input:not([type=hidden]):not(:disabled),select:not(:disabled),textarea:not(:disabled)', s.q );
			if ( f ) { try { f.focus( { preventScroll: true } ); } catch ( e ) {} }
		}, 60 );
	};
	Form.prototype.convRefresh = function () {
		if ( ! this.nav ) { return; }
		if ( this.cslide < 0 ) { this.nav.hidden = true; return; }
		this.nav.hidden = false;
		var vis = this.convVisible();
		var pos = Math.max( 0, vis.indexOf( this.cslide ) );
		var total = Math.max( 1, vis.length );
		var pct = Math.round( ( pos + 1 ) / total * 100 );
		$( '.wlfp-conv-count', this.nav ).textContent = fmt( T.convOf || '%1$s of %2$s', pos + 1, total );
		var bar = $( '.wlfp-conv-bar', this.nav );
		bar.setAttribute( 'aria-valuenow', pct );
		$( 'i', bar ).style.width = pct + '%';
		$( '.wlfp-conv-back', this.nav ).disabled = pos <= 0;
		if ( ! this.busy ) { $( '.wlfp-conv-next', this.nav ).textContent = pos >= vis.length - 1 ? this.conv.submit : this.conv.next; }
	};
	Form.prototype.convStart = function () {
		var vis = this.convVisible();
		this.convShow( vis[ 0 ] || 0, 'fwd' );
	};
	Form.prototype.convBack = function () {
		var vis = this.convVisible();
		var pos = vis.indexOf( this.cslide );
		if ( pos > 0 ) { this.convShow( vis[ pos - 1 ], 'back' ); }
	};
	Form.prototype.convNext = function () {
		if ( this.busy || this.cslide < 0 ) { return; }
		var self = this;
		var bad = null;
		this.slides[ this.cslide ].els.forEach( function ( w ) {
			if ( w.hasAttribute( 'hidden' ) ) { return; }
			var err = self.checkField( w );
			if ( err ) { self.setError( w, err ); if ( ! bad ) { bad = w; } } else { self.clearError( w ); }
		} );
		if ( bad ) { var inp = $( 'input:not([type=hidden]),select,textarea', bad ); if ( inp ) { inp.focus(); } return; }
		var vis = this.convVisible();
		var pos = vis.indexOf( this.cslide );
		if ( pos >= vis.length - 1 ) { this.submit(); return; }
		this.convShow( vis[ pos + 1 ], 'fwd' );
	};
	Form.prototype.convShowFor = function ( w ) {
		for ( var i = 0; i < this.slides.length; i++ ) {
			if ( this.slides[ i ].els.indexOf( w ) !== -1 ) { this.convShow( i, 'back', true ); return; }
		}
	};
	Form.prototype.convAuto = function ( e ) {
		if ( ! this.conv.auto || this.cslide < 0 || e.type !== 'change' || ! e.target.closest ) { return; }
		var w = e.target.closest( '.wlfp-field' );
		var s = this.slides[ this.cslide ];
		if ( ! w || ! s || w !== s.q ) { return; }
		var t = w.getAttribute( 'data-type' );
		var single = t === 'radio' || t === 'rating' || t === 'nps' || t === 'emoji_rating' || ( t === 'image_choice' && $( '.wlfp-imgchoices', w ).getAttribute( 'data-multiple' ) === '0' );
		if ( ! single || e.target.value === '__other__' || e.target.type === 'text' ) { return; }
		var vis = this.convVisible();
		if ( vis.indexOf( this.cslide ) >= vis.length - 1 ) { return; } // never auto-submit
		var self = this;
		clearTimeout( this.autoT );
		this.autoT = setTimeout( function () { self.convNext(); }, 320 );
	};
	Form.prototype.convReset = function () {
		if ( this.welcomeEl ) { this.welcomeEl.hidden = false; this.cslide = -1; this.slides.forEach( function ( s ) { s.els.forEach( function ( w ) { w.classList.remove( 'wlfp-slide-on' ); } ); } ); this.convRefresh(); }
		else { this.convShow( this.convVisible()[ 0 ] || 0, 'fwd', true ); }
	};

	/* ---------- appointment slots ---------- */
	Form.prototype.bindSlots = function () {
		var self = this;
		$$( '.wlfp-slots', this.f ).forEach( function ( box ) {
			var field = box.getAttribute( 'data-field' );
			var date = $( '.wlfp-slot-date', box );
			var grid = $( '.wlfp-slot-grid', box );
			var closed = [];
			var blocked = [];
			try { closed = JSON.parse( box.getAttribute( 'data-closed' ) || '[]' ); blocked = JSON.parse( box.getAttribute( 'data-blocked' ) || '[]' ); } catch ( e ) {}
			var init = $( '.wlfp-slot-init', box );
			var want = init ? init.value : '';
			var note = function ( t ) { grid.textContent = ''; var p = document.createElement( 'p' ); p.className = 'wlfp-slot-hint'; p.textContent = t; grid.appendChild( p ); };
			var token = 0;
			var load = function () {
				var d = date.value;
				if ( ! d ) { note( T.slotHint || '' ); return; }
				var dow = new Date( d + 'T12:00:00' ).getDay();
				if ( closed.indexOf( String( dow ) ) !== -1 || blocked.indexOf( d ) !== -1 ) { note( T.slotNone || '' ); return; }
				var me = ++token;
				var fd = new FormData();
				fd.append( 'action', 'wlfp_slots' ); fd.append( 'form_id', self.id ); fd.append( 'field', field ); fd.append( 'date', d );
				fetch( G.ajax, { method: 'POST', body: fd, credentials: 'same-origin' } ).then( function ( r ) { return r.json(); } ).then( function ( j ) {
					if ( me !== token ) { return; }
					if ( ! j || ! j.success || j.data.closed || ! j.data.slots.length ) { note( ( j && j.data && j.data.message ) || T.slotNone || '' ); return; }
					grid.textContent = '';
					j.data.slots.forEach( function ( s, i ) {
						var lab = document.createElement( 'label' );
						lab.className = 'wlfp-slot' + ( s.full ? ' is-full' : '' );
						var inp = document.createElement( 'input' );
						inp.type = 'radio'; inp.name = field + '[slot]'; inp.value = s.value; inp.disabled = s.full;
						inp.setAttribute( 'data-wlfp-field', field );
						if ( want && want === s.value && ! s.full ) { inp.checked = true; }
						var sp = document.createElement( 'span' );
						sp.appendChild( document.createTextNode( s.label ) );
						var note2 = s.full ? ( T.slotFull || 'full' ) : ( j.data.capacity > 1 && s.left <= 3 ? fmt( T.slotLeft || '%s left', s.left ) : '' );
						if ( note2 ) { var sm = document.createElement( 'small' ); sm.textContent = note2; sp.appendChild( sm ); }
						lab.appendChild( inp ); lab.appendChild( sp ); grid.appendChild( lab );
					} );
					want = '';
					self.evaluate();
				} ).catch( function () { note( T.error || '' ); } );
			};
			date.addEventListener( 'change', load );
			if ( date.value ) { load(); } else { note( T.slotHint || '' ); }
		} );
	};

	/* ---------- save & resume later ---------- */
	Form.prototype.bindResume = function () {
		var cfg = this.cfg.resume;
		if ( ! cfg ) { return; }
		var self = this;
		if ( cfg.step && this.steps[ cfg.step ] && ! this.conv ) { this.go( Math.min( cfg.step, this.steps.length - 1 ) ); }
		var panel = document.createElement( 'div' );
		panel.className = 'wlfp-resume-panel';
		panel.hidden = true;
		panel.innerHTML = '<p class="wlfp-resume-help"></p><div class="wlfp-resume-row"><input type="email" class="wlfp-input" autocomplete="email"><button type="button" class="wlfp-btn wlfp-resume-send"></button></div><p class="wlfp-resume-msg" role="status" aria-live="polite"></p>';
		$( '.wlfp-resume-help', panel ).textContent = T.resumeHelp || '';
		var em = $( 'input', panel );
		em.placeholder = T.resumeEmail || 'Email';
		em.setAttribute( 'aria-label', T.resumeEmail || 'Email' );
		var send = $( '.wlfp-resume-send', panel );
		send.textContent = T.resumeSend || 'Send';
		var msg = $( '.wlfp-resume-msg', panel );
		var trigger = document.createElement( 'button' );
		trigger.type = 'button';
		trigger.className = 'wlfp-resume-link';
		trigger.textContent = cfg.button || 'Save & continue later';
		trigger.addEventListener( 'click', function () { panel.hidden = ! panel.hidden; if ( ! panel.hidden ) { em.focus(); } } );
		if ( this.conv ) { this.f.appendChild( trigger ); } else { var last = this.steps[ this.steps.length - 1 ]; this.f.insertBefore( trigger, null ); }
		this.f.appendChild( panel );
		var post = function ( retry ) {
			var fd = new FormData();
			fd.append( 'action', 'wlfp_save_draft' );
			fd.append( 'wlfp_form_id', self.id );
			fd.append( 'wlfp_nonce', $( 'input[name=wlfp_nonce]', self.f ).value );
			fd.append( 'wlfp_source', $( 'input[name=wlfp_source]', self.f ).value );
			fd.append( 'wlfp_resume_email', em.value );
			fd.append( 'wlfp_resume_step', self.conv ? 0 : self.cur );
			$$( 'input,select,textarea', self.f ).forEach( function ( e ) {
				if ( ! e.name || e.disabled || e.name.indexOf( 'wlfp_' ) === 0 || e.closest( '.wlfp-resume-panel' ) || [ 'file', 'password', 'submit', 'button' ].indexOf( e.type ) !== -1 ) { return; }
				if ( ( e.type === 'checkbox' || e.type === 'radio' ) && ! e.checked ) { return; }
				if ( e.tagName === 'SELECT' && e.multiple ) { $$( 'option', e ).forEach( function ( o ) { if ( o.selected ) { fd.append( e.name, o.value ); } } ); return; }
				fd.append( e.name, e.value );
			} );
			send.disabled = true;
			fetch( G.ajax, { method: 'POST', body: fd, credentials: 'same-origin' } ).then( function ( r ) { return r.json(); } ).then( function ( j ) {
				send.disabled = false;
				if ( j && j.data && j.data.code === 'nonce' && ! retry ) { $( 'input[name=wlfp_nonce]', self.f ).value = j.data.nonce; return post( true ); }
				msg.textContent = ( j && j.data && j.data.message ) || ( T.resumeFail || '' );
				msg.className = 'wlfp-resume-msg ' + ( j && j.success ? 'is-ok' : 'is-err' );
			} ).catch( function () { send.disabled = false; msg.textContent = T.resumeFail || ''; msg.className = 'wlfp-resume-msg is-err'; } );
		};
		send.addEventListener( 'click', function () { if ( ! em.value || ! em.checkValidity() ) { em.focus(); msg.textContent = T.resumeEmail || ''; msg.className = 'wlfp-resume-msg is-err'; return; } post( false ); } );
		em.addEventListener( 'keydown', function ( e ) { if ( e.key === 'Enter' ) { e.preventDefault(); e.stopPropagation(); send.click(); } } );
	};

	Form.prototype.bindRanking = function () {
		$$( '.wlfp-rank', this.f ).forEach( function ( ol ) {
			ol.addEventListener( 'click', function ( e ) {
				var b = e.target.closest( 'button' );
				if ( ! b ) { return; }
				var li = b.closest( 'li' );
				if ( b.classList.contains( 'wlfp-rank-up' ) && li.previousElementSibling ) { ol.insertBefore( li, li.previousElementSibling ); }
				else if ( b.classList.contains( 'wlfp-rank-down' ) && li.nextElementSibling ) { ol.insertBefore( li.nextElementSibling, li ); }
				else { return; }
				b.focus();
				ol.dispatchEvent( new Event( 'change', { bubbles: true } ) );
			} );
		} );
	};
	Form.prototype.bindTerms = function () {
		$$( '.wlfp-terms-box[data-must-scroll]', this.f ).forEach( function ( box ) {
			var cb = box.parentNode.querySelector( 'input[type=checkbox]' );
			if ( ! cb ) { return; }
			var done = false;
			var check = function () {
				if ( done ) { return; }
				if ( box.scrollHeight - box.scrollTop - box.clientHeight < 6 ) { done = true; cb.disabled = false; box.classList.add( 'is-read' ); }
			};
			cb.disabled = true;
			box.addEventListener( 'scroll', check );
			setTimeout( check, 50 );
		} );
	};
	Form.prototype.bindCoupon = function () {
		var self = this;
		$$( '.wlfp-coupon', this.f ).forEach( function ( box ) {
			var btn = $( '.wlfp-coupon-apply', box );
			var inp = $( 'input', box );
			var msg = $( '.wlfp-coupon-msg', box );
			btn.addEventListener( 'click', function () {
				var fd = new FormData();
				fd.append( 'action', 'wlfp_coupon' ); fd.append( 'form_id', self.id ); fd.append( 'code', inp.value );
				fetch( G.ajax, { method: 'POST', body: fd, credentials: 'same-origin' } ).then( function ( r ) { return r.json(); } ).then( function ( j ) {
					if ( j.success ) { self.discount = j.data; msg.textContent = T.couponOk || 'OK'; } else { self.discount = null; msg.textContent = T.couponBad || 'Invalid'; }
					self.totals();
				} ).catch( function () {} );
			} );
		} );
	};

	/* ---------- captcha ---------- */
	Form.prototype.initCaptcha = function () {
		var c = this.cfg.captcha;
		if ( ! c || ! c.site ) { return; }
		var self = this;
		var box = $( '.wlfp-captcha', this.f );
		if ( ! box ) { return; }
		var tries = 0;
		var tick = function () {
			var api = c.provider === 'recaptcha' ? window.grecaptcha : ( c.provider === 'hcaptcha' ? window.hcaptcha : window.turnstile );
			if ( ! api || ( api.render === undefined && ! c.v3 ) ) { if ( tries++ < 100 ) { setTimeout( tick, 150 ); } return; }
			if ( c.v3 ) { return; }
			try {
				var render = function () { self.captchaId = api.render( box, { sitekey: c.site, theme: 'light' } ); };
				if ( api.ready ) { api.ready( render ); } else { render(); }
			} catch ( e ) {}
		};
		tick();
	};
	Form.prototype.captchaToken = function () {
		var c = this.cfg.captcha;
		var self = this;
		if ( ! c || ! c.site ) { return Promise.resolve(); }
		if ( c.v3 ) {
			return new Promise( function ( res ) {
				window.grecaptcha.ready( function () {
					window.grecaptcha.execute( c.site, { action: 'submit' } ).then( function ( t ) { res( [ 'g-recaptcha-response', t ] ); }, function () { res(); } );
				} );
			} );
		}
		return Promise.resolve();
	};

	/* ---------- drafts ---------- */
	Form.prototype.draftKey = function () { return 'wlfp_draft_' + this.id; };
	Form.prototype.saveDraft = function () {
		var d = {};
		$$( 'input,select,textarea', this.f ).forEach( function ( e ) {
			if ( ! e.name || e.disabled || [ 'password', 'file', 'hidden', 'submit', 'button' ].indexOf( e.type ) !== -1 || e.name.indexOf( 'wlfp_' ) === 0 ) { return; }
			if ( e.type === 'checkbox' || e.type === 'radio' ) { if ( e.checked ) { ( d[ e.name ] = d[ e.name ] || [] ).push( e.value ); } }
			else if ( e.tagName === 'SELECT' && e.multiple ) { d[ e.name ] = $$( 'option', e ).filter( function ( o ) { return o.selected; } ).map( function ( o ) { return o.value; } ); }
			else { d[ e.name ] = e.value; }
		} );
		try { localStorage.setItem( this.draftKey(), JSON.stringify( d ) ); } catch ( e ) {}
	};
	Form.prototype.restoreDraft = function () {
		if ( ! this.cfg.autosave ) { return; }
		var d;
		try { d = JSON.parse( localStorage.getItem( this.draftKey() ) || 'null' ); } catch ( e ) { return; }
		if ( ! d ) { return; }
		$$( 'input,select,textarea', this.f ).forEach( function ( e ) {
			if ( ! ( e.name in d ) ) { return; }
			var v = d[ e.name ];
			if ( e.type === 'checkbox' || e.type === 'radio' ) { e.checked = ( Array.isArray( v ) ? v : [ v ] ).indexOf( e.value ) !== -1; }
			else if ( e.tagName === 'SELECT' && e.multiple ) { $$( 'option', e ).forEach( function ( o ) { o.selected = v.indexOf( o.value ) !== -1; } ); }
			else if ( ! e.value || e.value === e.defaultValue ) { e.value = v; }
		} );
	};
	Form.prototype.clearDraft = function () { try { localStorage.removeItem( this.draftKey() ); } catch ( e ) {} };

	Form.prototype.beacon = function () {
		try {
			var k = 'wlfp_v_' + this.id;
			if ( sessionStorage.getItem( k ) ) { return; }
			sessionStorage.setItem( k, '1' );
		} catch ( e ) {}
		var fd = new FormData();
		fd.append( 'action', 'wlfp_view' ); fd.append( 'form_id', this.id );
		try { if ( navigator.sendBeacon ) { navigator.sendBeacon( G.ajax, fd ); } else { fetch( G.ajax, { method: 'POST', body: fd, credentials: 'same-origin', keepalive: true } ); } } catch ( e ) {}
	};

	/* ---------- submit ---------- */
	Form.prototype.msg = function ( text ) {
		var m = $( '.wlfp-messages', this.f );
		m.textContent = text || '';
		if ( text ) { m.scrollIntoView( { block: 'nearest', behavior: 'smooth' } ); }
	};
	Form.prototype.setBusy = function ( on ) {
		this.busy = on;
		var b = this.conv ? $( '.wlfp-conv-next', this.f ) : $( '.wlfp-btn-submit', this.f );
		if ( ! b ) { return; }
		if ( on ) { b.setAttribute( 'data-label', b.textContent ); b.textContent = this.cfg.btnLoad || T.sending || '…'; b.disabled = true; b.classList.add( 'is-loading' ); }
		else { b.textContent = b.getAttribute( 'data-label' ) || b.textContent; b.disabled = false; b.classList.remove( 'is-loading' ); }
	};
	Form.prototype.submit = function () {
		var self = this;
		if ( this.busy ) { return; }
		this.msg( '' );
		if ( ! this.validateAll() ) { this.msg( T.fixErrors || '' ); return; }
		var cap = this.cfg.captcha;
		this.setBusy( true );
		this.captchaToken().then( function ( tok ) {
			var fd = new FormData( self.f );
			fd.append( 'wlfp_ajax', '1' );
			if ( tok ) { fd.set( tok[ 0 ], tok[ 1 ] ); }
			self.post( fd );
		} );
	};
	Form.prototype.post = function ( fd ) {
		var self = this;
		fetch( G.ajax, { method: 'POST', body: fd, credentials: 'same-origin', headers: { 'X-Requested-With': 'XMLHttpRequest' } } )
			.then( function ( r ) { return r.json(); } )
			.then( function ( j ) {
				if ( j && j.success ) { return self.done( j.data ); }
				var d = ( j && j.data ) || {};
				if ( d.code === 'nonce' && ! self.retried ) {
					self.retried = true;
					fd.set( 'wlfp_nonce', d.nonce ); fd.set( 'wlfp_ts', d.ts );
					$( 'input[name=wlfp_nonce]', self.f ).value = d.nonce;
					return self.post( fd );
				}
				self.setBusy( false );
				self.retried = false;
				self.showErrors( d );
				self.resetCaptcha();
			} )
			.catch( function () { self.setBusy( false ); self.msg( T.error || 'Error' ); } );
	};
	Form.prototype.resetCaptcha = function () {
		try {
			var c = this.cfg.captcha;
			if ( ! c || c.v3 || this.captchaId === undefined ) { return; }
			( c.provider === 'recaptcha' ? window.grecaptcha : ( c.provider === 'hcaptcha' ? window.hcaptcha : window.turnstile ) ).reset( this.captchaId );
		} catch ( e ) {}
	};
	Form.prototype.showErrors = function ( d ) {
		var self = this;
		this.msg( d.message || T.error || '' );
		var errs = d.errors || {};
		var firstStep = -1;
		Object.keys( errs ).forEach( function ( name ) {
			var w = $( '.wlfp-field[data-name="' + name + '"]', self.f );
			if ( w ) { self.setError( w, errs[ name ] ); var s = w.closest( '.wlfp-step' ); var idx = self.steps.indexOf( s ); if ( firstStep < 0 || idx < firstStep ) { firstStep = idx; } }
		} );
		if ( this.conv ) {
			var fe = $( '.wlfp-field .wlfp-error:not(:empty)', this.f );
			if ( fe ) { this.convShowFor( fe.closest( '.wlfp-field' ) ); }
			return;
		}
		if ( firstStep >= 0 && firstStep !== this.cur ) { this.go( firstStep ); }
	};
	Form.prototype.done = function ( d ) {
		this.clearDraft();
		if ( d.type === 'redirect' && d.redirect ) { window.location.href = d.redirect; return; }
		var box = $( '.wlfp-confirmation', this.wrap );
		box.innerHTML = d.message || '';
		box.hidden = false;
		if ( this.cfg.confirm && this.cfg.confirm.hide ) { this.f.hidden = true; this.f.style.display = 'none'; }
		else { this.f.reset(); this.setBusy( false ); this.evaluate(); if ( this.conv ) { this.convReset(); } }
		if ( this.cfg.confirm && this.cfg.confirm.scroll ) { box.scrollIntoView( { behavior: 'smooth', block: 'center' } ); }
		box.focus( { preventScroll: true } );
		this.wrap.dispatchEvent( new CustomEvent( 'wlfp:submitted', { bubbles: true, detail: { formId: this.id, data: d } } ) );
	};

	function boot() { $$( '.wlfp-wrap .wlfp-form' ).forEach( function ( f ) { if ( ! f.__wlfp ) { f.__wlfp = new Form( f ); } } ); }
	if ( document.readyState === 'loading' ) { document.addEventListener( 'DOMContentLoaded', boot ); } else { boot(); }
	window.WLFPInit = boot; // re-init after AJAX-loaded content (popups, tabs, page builders).
} )();
