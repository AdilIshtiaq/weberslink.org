/* Homepage: service tabs (#svc-<id> opens a service) and Motion animations.
   Motion (motion.dev, MIT) is loaded from /vendor/motion.min.js as window.Motion. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var M = window.Motion;

  // ---------- Service tabs ----------
  var tabs = $$('.x-tabs [role=tab]');
  function select(id, opts) {
    opts = opts || {};
    var tab = $('#tab-' + id), panel = $('#svc-' + id);
    if (!tab || !panel) return false;
    tabs.forEach(function (t) {
      var on = t === tab;
      t.setAttribute('aria-selected', on);
      t.tabIndex = on ? 0 : -1;
      $('#' + t.getAttribute('aria-controls')).hidden = !on;
    });
    if (opts.focus) tab.focus();
    tab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (M && !reduce) {
      M.animate(panel, { opacity: [0, 1], y: [16, 0] }, { duration: 0.5, ease: [0.16, 1, 0.3, 1] });
      M.animate($$('.x-check li, .x-node, .x-say, .x-task, .x-block, .x-kpi3 > div, .x-bars i', panel),
        { opacity: [0, 1], x: [-10, 0] }, { delay: M.stagger(0.06, { startDelay: 0.15 }), duration: 0.45 });
    }
    if (opts.scroll) $('#services').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    return true;
  }
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () {
      select(t.dataset.svc);
      if (history.replaceState) history.replaceState(null, '', '#svc-' + t.dataset.svc);
    });
    t.addEventListener('keydown', function (e) {
      var n = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (e.key === 'Home') n = -i; else if (e.key === 'End') n = tabs.length - 1 - i;
      if (n === undefined) return;
      e.preventDefault();
      select(tabs[(i + n + tabs.length) % tabs.length].dataset.svc, { focus: true });
    });
  });
  // Hero "What do you need?" buttons and header menu links (/#svc-voice etc.)
  function fromHash(scroll) {
    var m = /^#svc-([a-z]+)$/.exec(location.hash);
    if (m) select(m[1], { scroll: scroll });
  }
  $$('[data-svc]').forEach(function (a) {
    if (a.tagName !== 'A') return;
    a.addEventListener('click', function (e) {
      e.preventDefault();
      select(a.dataset.svc, { scroll: true });
      if (history.replaceState) history.replaceState(null, '', '#svc-' + a.dataset.svc);
    });
  });
  window.addEventListener('hashchange', function () { fromHash(true); });
  fromHash(true);

  // ---------- Motion: entrance and scroll reveals ----------
  if (!M || reduce) return;
  document.documentElement.classList.add('m-ready');
  var ease = [0.16, 1, 0.3, 1];

  // Hero: staggered blur-in, like a product launch page
  var heroItems = $$('.x-hero [data-m]');
  M.animate(heroItems, { opacity: [0, 1], y: [24, 0], filter: ['blur(10px)', 'blur(0px)'] },
    { delay: M.stagger(0.1, { startDelay: 0.1 }), duration: 0.9, ease: ease });
  M.animate('.x-need-row a', { opacity: [0, 1], scale: [0.9, 1] }, { delay: M.stagger(0.06, { startDelay: 0.7 }), duration: 0.5, ease: ease });

  // Everything else: reveal when scrolled into view, staggered within a section
  $$('section:not(.x-hero)').forEach(function (sec) {
    var items = $$('[data-m]', sec);
    if (!items.length) return;
    M.inView(sec, function () {
      M.animate(items, { opacity: [0, 1], y: [28, 0], filter: ['blur(6px)', 'blur(0px)'] },
        { delay: M.stagger(0.08), duration: 0.8, ease: ease });
    }, { amount: 0.12 });
  });

  // Scroll-linked: hero content drifts up and fades as you scroll past
  var heroIn = $('.x-hero-in');
  if (heroIn && M.scroll) {
    M.scroll(M.animate(heroIn, { y: [0, -80], opacity: [1, 0.2] }, { ease: 'linear' }),
      { target: $('.x-hero'), offset: ['start start', 'end start'] });
  }
}());
