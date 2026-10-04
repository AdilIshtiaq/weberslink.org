/* WebersLink AI assistant widget. Only appears when the server reports chat is enabled. */
(function () {
  var SS_KEY = 'wl_chat';
  var store = {
    get: function () { try { return JSON.parse(sessionStorage.getItem(SS_KEY) || 'null'); } catch (e) { return null; } },
    set: function (v) { try { sessionStorage.setItem(SS_KEY, JSON.stringify(v)); } catch (e) {} }
  };
  function track(name) {
    try {
      if (window.plausible) window.plausible(name);
      if (window.gtag) window.gtag('event', name.replace(/\s+/g, '_').toLowerCase());
    } catch (e) {}
  }

  fetch('/api/chat/status').then(function (r) { return r.json(); }).then(function (s) { if (s && s.enabled) init(); }).catch(function () {});

  function init() {
    var state = store.get() || { sessionId: '', log: [], teased: false };
    document.documentElement.classList.add('has-chat');

    var launcher = el('button', { class: 'chat-launch', type: 'button', 'aria-label': 'Chat with the WebersLink AI assistant', 'aria-expanded': 'false', 'aria-controls': 'chatPanel' });
    launcher.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12Z"/><path d="M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01"/></svg><span>Ask AI</span>';

    var teaser = el('div', { class: 'chat-teaser', role: 'status' });
    teaser.innerHTML = '<button type="button" class="chat-teaser-x" aria-label="Dismiss">×</button><p><b>Questions about pricing or how it works?</b> Ask me — I reply in seconds.</p>';

    var panel = el('div', { class: 'chat-panel', id: 'chatPanel', role: 'dialog', 'aria-label': 'WebersLink AI assistant', 'aria-modal': 'false', hidden: '' });
    panel.innerHTML =
      '<div class="chat-head">' +
        '<div class="chat-id"><span class="chat-av" aria-hidden="true">W</span><div><strong>WebersLink AI</strong><small><i class="chat-dot" aria-hidden="true"></i>Replies instantly</small></div></div>' +
        '<button type="button" class="chat-close" aria-label="Close chat">×</button>' +
      '</div>' +
      '<div class="chat-log" aria-live="polite"></div>' +
      '<div class="chat-chips"></div>' +
      '<form class="chat-form" novalidate>' +
        '<label for="chatInput" class="hp">Your message</label>' +
        '<textarea id="chatInput" rows="1" maxlength="1000" placeholder="Ask about pricing, how it works…" autocomplete="off"></textarea>' +
        '<button type="submit" aria-label="Send message"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>' +
      '</form>' +
      '<p class="chat-foot">AI assistant · can make mistakes · <a href="/privacy">privacy</a></p>';

    document.body.appendChild(teaser);
    document.body.appendChild(panel);
    document.body.appendChild(launcher);

    var log = panel.querySelector('.chat-log');
    var chips = panel.querySelector('.chat-chips');
    var form = panel.querySelector('.chat-form');
    var input = panel.querySelector('#chatInput');
    var sendBtn = form.querySelector('button');
    var busy = false;

    var GREETING = "Hi! I'm WebersLink's AI assistant. I can explain how the Lead System works, what it costs, or help you book a free call. What kind of business do you run?";
    var CHIPS = ['How much does it cost?', 'How does the Lead System work?', "Why not just use AI tools myself?", 'Book a free call'];

    function el(tag, attrs) {
      var n = document.createElement(tag);
      for (var k in attrs || {}) n.setAttribute(k, attrs[k]);
      return n;
    }
    // Render plain text safely: escape, then turn #anchors/URLs into links and keep line breaks.
    function render(node, text) {
      node.textContent = '';
      var parts = String(text).split(/(https?:\/\/[^\s)]+|#book|#audit|#pricing|hassan@weberslink\.org)/g);
      parts.forEach(function (part) {
        if (!part) return;
        if (/^(https?:\/\/|#)/.test(part)) {
          var a = el('a', { href: part });
          a.textContent = part === '#book' ? 'booking form' : part === '#audit' ? 'free audit' : part === '#pricing' ? 'pricing' : part;
          if (part.charAt(0) === '#') a.addEventListener('click', function () { if (window.innerWidth < 600) close(); });
          else { a.target = '_blank'; a.rel = 'noopener'; }
          node.appendChild(a);
        } else if (part === 'hassan@weberslink.org') {
          var m = el('a', { href: 'mailto:' + part }); m.textContent = part; node.appendChild(m);
        } else {
          node.appendChild(document.createTextNode(part.replace(/\*\*(.+?)\*\*/g, '$1')));
        }
      });
    }
    function addMsg(role, text) {
      var b = el('div', { class: 'chat-msg ' + (role === 'user' ? 'me' : 'ai') });
      render(b, text);
      log.appendChild(b);
      log.scrollTop = log.scrollHeight;
      return b;
    }
    function save() { store.set(state); }
    function renderChips() {
      chips.textContent = '';
      if (state.log.length > 1) return;
      CHIPS.forEach(function (c) {
        var b = el('button', { type: 'button', class: 'chat-chip' });
        b.textContent = c;
        b.addEventListener('click', function () {
          if (c === 'Book a free call') { close(); location.hash = '#book'; track('Chat book chip'); return; }
          send(c);
        });
        chips.appendChild(b);
      });
    }

    // Restore conversation
    if (!state.log.length) state.log.push({ role: 'ai', text: GREETING });
    state.log.forEach(function (m) { addMsg(m.role, m.text); });
    renderChips();

    function open() {
      panel.hidden = false;
      launcher.setAttribute('aria-expanded', 'true');
      document.documentElement.classList.add('chat-open');
      hideTeaser();
      setTimeout(function () { input.focus(); }, 50);
      log.scrollTop = log.scrollHeight;
      track('Chat open');
    }
    function close() {
      panel.hidden = true;
      launcher.setAttribute('aria-expanded', 'false');
      document.documentElement.classList.remove('chat-open');
      launcher.focus();
    }
    function hideTeaser() { teaser.classList.remove('show'); state.teased = true; save(); }

    launcher.addEventListener('click', function () { panel.hidden ? open() : close(); });
    panel.querySelector('.chat-close').addEventListener('click', close);
    panel.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    teaser.querySelector('.chat-teaser-x').addEventListener('click', hideTeaser);
    teaser.querySelector('p').addEventListener('click', open);
    if (!state.teased) setTimeout(function () { if (panel.hidden) teaser.classList.add('show'); }, 25000);

    input.addEventListener('input', function () {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit')); }
    });
    form.addEventListener('submit', function (e) { e.preventDefault(); send(input.value); });

    function send(text) {
      text = (text || '').trim();
      if (!text || busy) return;
      busy = true; sendBtn.disabled = true;
      input.value = ''; input.style.height = 'auto';
      addMsg('user', text);
      state.log.push({ role: 'user', text: text });
      renderChips(); save();

      var bubble = addMsg('ai', '');
      bubble.classList.add('typing');
      bubble.innerHTML = '<span></span><span></span><span></span>';
      var reply = '';

      fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: state.sessionId, message: text })
      }).then(function (res) {
        var ct = res.headers.get('content-type') || '';
        if (!res.ok || ct.indexOf('text/event-stream') === -1) {
          return res.json().catch(function () { return {}; }).then(function (j) { throw new Error(j.error || 'Something went wrong. Please try again.'); });
        }
        var reader = res.body.getReader(), decoder = new TextDecoder(), buf = '';
        function pump() {
          return reader.read().then(function (r) {
            if (r.done) return;
            buf += decoder.decode(r.value, { stream: true });
            var events = buf.split('\n\n'); buf = events.pop();
            events.forEach(function (raw) {
              var line = raw.replace(/^data: /, '');
              var ev; try { ev = JSON.parse(line); } catch (e) { return; }
              if (ev.type === 'session') { state.sessionId = ev.sessionId; }
              else if (ev.type === 'text') {
                reply += ev.text; bubble.classList.remove('typing'); render(bubble, reply);
                log.scrollTop = log.scrollHeight;
              } else if (ev.type === 'lead_saved') { track('Chat lead'); }
              else if (ev.type === 'error') { reply += (reply ? '\n\n' : '') + ev.error; bubble.classList.remove('typing'); render(bubble, reply); }
            });
            return pump();
          });
        }
        return pump();
      }).catch(function (err) {
        reply = err.message || 'Something went wrong. Please try again.';
        bubble.classList.remove('typing'); render(bubble, reply);
      }).then(function () {
        if (!reply) { reply = 'Sorry, I lost my train of thought — please try again.'; bubble.classList.remove('typing'); render(bubble, reply); }
        state.log.push({ role: 'ai', text: reply });
        save();
        busy = false; sendBtn.disabled = false;
        if (!panel.hidden) input.focus();
      });
    }
  }
})();
