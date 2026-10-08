(function () {
  var C = window.WL_CONFIG || {};
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = window.matchMedia('(pointer:fine)').matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var yr = $('#yr'); if (yr) yr.textContent = new Date().getFullYear();

  // ---------- Analytics ----------
  function loadScript(src, attrs) {
    var s = document.createElement('script'); s.src = src; s.defer = true;
    for (var k in attrs || {}) s.setAttribute(k, attrs[k]);
    document.head.appendChild(s); return s;
  }
  if (C.plausibleDomain) {
    window.plausible = window.plausible || function () { (window.plausible.q = window.plausible.q || []).push(arguments); };
    loadScript('https://plausible.io/js/script.js', { 'data-domain': C.plausibleDomain });
  }
  if (C.gaId) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { dataLayer.push(arguments); };
    gtag('js', new Date()); gtag('config', C.gaId);
    loadScript('https://www.googletagmanager.com/gtag/js?id=' + C.gaId);
  }
  function track(name, props) {
    try {
      if (window.plausible) window.plausible(name, { props: props || {} });
      if (window.gtag) window.gtag('event', name.replace(/\s+/g, '_').toLowerCase(), props || {});
    } catch (e) {}
  }
  $$('[data-track]').forEach(function (el) {
    el.addEventListener('click', function () { track(el.dataset.track, { location: el.dataset.loc || '' }); });
  });

  // ---------- Contact links from config ----------
  $$('[data-wa]').forEach(function (a) { if (C.whatsapp) a.href = C.whatsapp; });

  // ---------- Nav ----------
  var nav = $('#nav'), menuBtn = $('#menuBtn');
  var sticky = $('#stickyCta'), wa = $('#waFloat'), hero = $('.hero'), book = $('#book');
  function onScroll() {
    var y = window.scrollY;
    if (nav) nav.classList.toggle('scrolled', y > 20);
    var past = hero ? y > hero.offsetHeight * 0.6 : y > 400;
    var atBook = false;
    if (book) { var r = book.getBoundingClientRect(); atBook = r.top < window.innerHeight * 0.6 && r.bottom > 0; }
    if (sticky) sticky.classList.toggle('show', past && !atBook);
    if (wa) wa.classList.toggle('show', past);
  }
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
  if (menuBtn) {
    menuBtn.addEventListener('click', function () {
      var open = nav.classList.toggle('open'); menuBtn.setAttribute('aria-expanded', open);
    });
    $$('#navLinks a').forEach(function (a) { a.addEventListener('click', function () { nav.classList.remove('open'); menuBtn.setAttribute('aria-expanded', false); }); });
  }

  // Login link: goes to the sign-in page for the outreach dashboard. It reads "Dashboard" in a browser
  // where the owner is already signed in (the dashboard sets that local flag; it is not a credential).
  try {
    var navLinks = $('#navLinks');
    if (navLinks) {
      var ol = document.createElement('a'); ol.href = '/admin/outreach'; ol.rel = 'nofollow';
      ol.textContent = localStorage.getItem('wl_owner') === '1' ? 'Dashboard' : 'Login';
      navLinks.appendChild(ol);
    }
  } catch (e) {}

  // ---------- Reveal ----------
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: .12, rootMargin: '0px 0px -40px 0px' });
    $$('.rv').forEach(function (el) { io.observe(el); });
  } else { $$('.rv').forEach(function (el) { el.classList.add('in'); }); }

  // ---------- 3D tilt ----------
  function tilt(sel, max) {
    if (reduce || !fine) return;
    $$(sel).forEach(function (el) {
      el.addEventListener('mousemove', function (e) {
        var r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        el.style.transform = 'rotateY(' + ((x - .5) * max) + 'deg) rotateX(' + ((.5 - y) * max) + 'deg)';
        el.style.setProperty('--mx', x * 100 + '%'); el.style.setProperty('--my', y * 100 + '%');
      });
      el.addEventListener('mouseleave', function () { el.style.transform = ''; });
    });
  }
  tilt('.tilt', 14); tilt('.tilt-soft', 6);

  // ---------- Work gallery ----------
  var showAll = $('#showAll'), allWork = $('#allWork');
  if (showAll && allWork) showAll.addEventListener('click', function () {
    var open = allWork.hidden; allWork.hidden = !open;
    showAll.setAttribute('aria-expanded', open);
    showAll.firstChild.textContent = open ? 'Hide projects ' : 'See all 10 projects ';
    if (open) { $$('.rv', allWork).forEach(function (el) { el.classList.add('in'); }); track('Show all work'); }
  });
  var tabs = $$('.db-tab'), cards = $$('#workGrid .card');
  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      tabs.forEach(function (t) { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
      tab.classList.add('active'); tab.setAttribute('aria-selected', 'true');
      var f = tab.dataset.filter;
      cards.forEach(function (c) { c.classList.toggle('hide', f !== 'all' && c.dataset.cat.split(' ').indexOf(f) === -1); });
    });
  });

  // ---------- Package buttons preselect the form ----------
  $$('[data-package]').forEach(function (b) {
    b.addEventListener('click', function () {
      var sel = $('#f-package'); if (sel) sel.value = b.dataset.package;
      track('Package click', { package: b.dataset.package });
    });
  });

  // ---------- Booking: embed calendar if configured ----------
  var tz = '';
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
  var embed = $('#bookingEmbed'), callForm = $('#callForm');
  if (C.bookingUrl && embed) {
    var src = C.bookingUrl + (C.bookingUrl.indexOf('?') > -1 ? '&' : '?') + (C.bookingUrl.indexOf('calendly') > -1 ? 'hide_gdpr_banner=1' : 'embed=true');
    embed.innerHTML = '<iframe title="Book a strategy call with WebersLink" loading="lazy" src="' + src + '"></iframe>';
    embed.hidden = false;
    if (callForm) callForm.hidden = true;
  }
  var tzOut = $('#tzOut'); if (tzOut && tz) tzOut.textContent = tz.replace(/_/g, ' ');

  // ---------- Lead forms ----------
  function submitLead(form, type) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var msg = $('.form-msg', form), btn = $('button[type=submit]', form);
      var data = { type: type, timezone: tz, page: location.pathname + location.hash };
      $$('input,select,textarea', form).forEach(function (el) { if (el.name && el.type !== 'checkbox') data[el.name] = el.value; });
      if (msg) { msg.textContent = ''; msg.classList.remove('err'); }
      var consent = $('.consent input', form);
      if (consent && !consent.checked) { if (msg) { msg.classList.add('err'); msg.textContent = 'Please tick the box to agree to be contacted.'; } consent.focus(); return; }
      btn.disabled = true; var label = btn.textContent; btn.textContent = 'Sending…';
      fetch('/api/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
        .then(function (res) {
          if (!res.ok) throw new Error(res.error || 'Something went wrong.');
          form.classList.add('sent');
          var ok = $('.success', form); if (ok) ok.classList.add('show');
          track(type === 'audit' ? 'Audit request' : 'Call request', { service: data.service || '', budget: data.budget || '' });
        })
        .catch(function (err) {
          if (msg) {
            msg.classList.add('err');
            msg.innerHTML = (err.message || 'Something went wrong.') + ' You can also email <a href="mailto:' + C.email + '">' + C.email + '</a>.';
          }
        })
        .then(function () { btn.disabled = false; btn.textContent = label; });
    });
  }
  if (callForm) submitLead(callForm, 'call');
  var auditForm = $('#auditForm'); if (auditForm) submitLead(auditForm, 'audit');

  // ---------- Lazy-load the 3D hero after the page has painted ----------
  var canvas = $('#scene');
  var lite = window.innerWidth < 860 || (navigator.connection && navigator.connection.saveData) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2);
  if (lite) document.documentElement.classList.add('lite-3d');
  if (canvas && !reduce && !lite) {
    var start = function () {
      var s = document.createElement('script'); s.src = '/vendor/three.min.js';
      s.onload = function () { var h = document.createElement('script'); h.src = '/assets/hero3d.js'; document.body.appendChild(h); };
      document.body.appendChild(s);
    };
    var idle = function () { ('requestIdleCallback' in window) ? requestIdleCallback(start, { timeout: 2500 }) : setTimeout(start, 1200); };
    if (document.readyState === 'complete') idle(); else window.addEventListener('load', idle);
  }
})();
