/* Outreach dashboard. Served from its own file so the page can use a strict Content-Security-Policy. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var state = { view: "dashboard", status: null, config: null, leadPage: 0, tpl: null, templates: [], fields: [] };
  var PAGE = 50, pollTimer = null;

  function toast(msg, err) {
    var t = document.createElement("div"); t.className = "toast" + (err ? " err" : ""); t.textContent = msg; document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, err ? 5000 : 2600);
  }
  function api(method, url, body) {
    var opt = { method: method, credentials: "same-origin", headers: { "Content-Type": "application/json" } };
    if (body !== undefined) opt.body = JSON.stringify(body);
    return fetch(url, opt).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401 && url.indexOf("/login") < 0) { showLogin(); throw new Error("Please sign in."); }
        if (!r.ok || j.ok === false) throw new Error(j.error || "Something went wrong (" + r.status + ")");
        return j;
      });
    });
  }
  function fail(e) { toast(e.message || String(e), true); }
  var ago = function (iso) {
    if (!iso) return "";
    var h = (Date.now() - new Date(iso).getTime()) / 36e5;
    return h < 1 ? Math.max(1, Math.round(h * 60)) + " min ago" : h < 48 ? Math.round(h) + " h ago" : Math.round(h / 24) + " days ago";
  };

  // ---------------------------------------------------------------- auth
  function showLogin() { $("app").hidden = true; $("login").hidden = false; clearTimeout(pollTimer); $("userField").hidden = !state.needUser; $(state.needUser ? "un" : "pw").focus(); }
  function showApp() { $("login").hidden = true; $("app").hidden = false; try { localStorage.setItem("wl_owner", "1"); } catch (e) {} refresh(); }
  $("loginForm").addEventListener("submit", function (e) {
    e.preventDefault(); $("loginErr").hidden = true;
    api("POST", "/api/outreach/login", { username: $("un").value, password: $("pw").value }).then(function () { $("pw").value = ""; showApp(); })
      .catch(function (err) { $("loginErr").textContent = err.message; $("loginErr").hidden = false; });
  });
  $("logout").addEventListener("click", function () { try { localStorage.removeItem("wl_owner"); } catch (e) {} api("POST", "/api/outreach/logout", {}).finally(showLogin); });

  // ---------------------------------------------------------------- navigation
  var TITLES = { dashboard: "Dashboard", replies: "Replies", leads: "Leads", templates: "Emails", settings: "Settings" };
  function go(view) {
    state.view = view;
    ["dashboard", "replies", "leads", "templates", "settings"].forEach(function (v) { $("v-" + v).hidden = v !== view; });
    document.querySelectorAll(".nav-btn[data-view]").forEach(function (b) { b.classList.toggle("on", b.dataset.view === view); });
    $("title").textContent = TITLES[view];
    if (history.replaceState) history.replaceState(null, "", "#" + view);
    if (view === "leads") loadLeads();
    if (view === "templates") loadTemplates();
    if (view === "settings") loadSettings();
    if (view === "replies" || view === "dashboard") renderStatus();
  }
  document.querySelectorAll(".nav-btn[data-view]").forEach(function (b) { b.addEventListener("click", function () { go(b.dataset.view); }); });

  // ---------------------------------------------------------------- status polling + dashboard
  function refresh() {
    clearTimeout(pollTimer);
    return api("GET", "/api/outreach/status").then(function (s) {
      state.status = s; renderStatus();
      pollTimer = setTimeout(refresh, s.running ? 3000 : 20000);
    }).catch(function (e) { if (!$("app").hidden) { fail(e); pollTimer = setTimeout(refresh, 30000); } });
  }
  function renderStatus() {
    var s = state.status; if (!s) return;
    var pill = $("modePill");
    pill.className = "pill " + (s.running ? "busy" : s.dryRun ? "dry" : "live");
    pill.innerHTML = "<i></i>" + (s.running ? "Running (" + esc(s.runMode) + ")" : s.dryRun ? "Dry run mode" : "Live");
    $("stopBtn").hidden = !s.running;
    $("runBtn").disabled = s.running; $("testBtn").disabled = s.running;
    $("runBtn").textContent = s.dryRun ? "Run (dry)" : "Run live now";
    $("testBtn").hidden = s.dryRun;
    var nr = s.replied.filter(function (r) { return !r.loomSent; }).length;
    $("replyBadge").hidden = !nr; $("replyBadge").textContent = nr;

    var c = s.byStatus || {}, started = (s.total || 0) - (c["new"] || 0) - (c["skipped-country"] || 0) - (c["skipped-no-mailserver"] || 0) - (c["do-not-contact"] || 0);
    $("cards").innerHTML = [
      ["Leads", s.total], ["Not yet contacted", s.remaining], ["In sequence", c.active || 0], ["Replied", c.replied || 0],
      ["Bounced", c.bounced || 0], ["Days to finish", s.daysLeft || "–"]
    ].map(function (x) { return '<div class="card"><div class="n">' + esc(x[1]) + '</div><div class="l">' + esc(x[0]) + "</div></div>"; }).join("");

    $("heldBox").hidden = !s.held.length;
    $("heldList").innerHTML = s.held.map(function (x) {
      return '<div class="reply"><div><div class="who">' + esc(x.store || x.email) + '</div><div class="meta">' + esc(x.email) + " · email " + esc(x.step) + " · " + esc(x.mailbox || "") + '</div></div><div class="acts"><button class="btn sm" data-held="retry_held" data-email="' + esc(x.email) + '">It was NOT sent: allow retry</button><button class="btn sm danger" data-held="skip_held" data-email="' + esc(x.email) + '">It was sent: never email again</button></div></div>';
    }).join("");
    $("problems").hidden = !s.problems.length;
    $("problemList").innerHTML = s.problems.map(function (p) { return "<li>" + esc(p) + "</li>"; }).join("");

    $("mbTable").innerHTML = s.mailboxes.length ? "<tr><th>Mailbox</th><th>Today</th><th>First live send</th><th>Bounces</th><th>Password</th></tr>" + s.mailboxes.map(function (m) {
      var pct = m.todayLimit ? Math.min(100, Math.round(100 * m.sentToday / m.todayLimit)) : 0;
      return "<tr><td>" + esc(m.email) + (m.enabled ? "" : ' <span class="chip">off</span>') + (m.paused ? ' <span class="chip bounced">paused</span>' : "") + '</td><td><div class="bar"><b style="width:' + pct + '%"></b></div><span class="hint">' + m.sentToday + " of " + m.todayLimit + "</span></td><td>" +
        esc(m.firstLiveSend || "not started") + "</td><td>" + m.bounceRate + "%</td><td>" + (m.passwordSet ? '<span class="ok">set</span>' : '<span class="warn">not set</span>') + "</td></tr>";
    }).join("") : '<tr><td class="empty">No mailbox yet. Add one in Settings.</td></tr>';

    var vs = Object.keys(s.byVariant || {}).sort();
    $("abBox").innerHTML = vs.length ? "<table><tr><th>Version</th><th>Started</th><th>Replied</th><th>Rate</th></tr>" + vs.map(function (v) {
      var x = s.byVariant[v]; return "<tr><td>Email 1 · " + esc(v.toUpperCase()) + "</td><td>" + x.started + "</td><td>" + x.replied + "</td><td>" + (x.started ? (100 * x.replied / x.started).toFixed(1) : "0.0") + "%</td></tr>";
    }).join("") + '</table><p class="hint" style="margin-top:10px">Wait for about 100 leads per version before judging a winner.</p>' : '<p class="empty">Results appear once emails go out.</p>';

    var fs = Object.keys(s.furthestStep || {}).sort();
    $("funnel").innerHTML = fs.length ? "<table>" + fs.map(function (k) { return "<tr><td>Reached " + esc(k) + "</td><td>" + s.furthestStep[k] + "</td></tr>"; }).join("") + "</table>" : '<p class="empty">Nothing sent yet.</p>';

    var l = s.last; $("lastRun").textContent = l ? (l.error ? "last run failed " : "last run " + (l.sent || 0) + (l.mode === "dry" ? " planned " : " sent ")) + ago(l.at) : "";
    var lg = $("log"), atEnd = lg.scrollTop + lg.clientHeight >= lg.scrollHeight - 30;
    lg.innerHTML = s.log.length ? s.log.map(function (line) {
      var cls = /SENT|Notified/.test(line) ? "sent" : /REPLIED|OPT-OUT/.test(line) ? "rep" : /failed|REFUSED|Could not|NOT SENDING/i.test(line) ? "err" : /PAUSED|waiting/.test(line) ? "wrn" : "";
      return '<div class="' + cls + '">' + esc(line) + "</div>";
    }).join("") : "No activity yet.";
    if (atEnd) lg.scrollTop = lg.scrollHeight;
    if (state.view === "replies") renderReplies();
  }

  function start(dry) {
    var s = state.status;
    var live = !dry && !s.dryRun;
    if (live && !confirm("Start a LIVE run? Real emails will be sent now, up to each mailbox's daily limit.")) return;
    api("POST", "/api/outreach/run", { dry: !!dry }).then(function () { toast(live ? "Live run started" : "Dry run started"); refresh(); }).catch(fail);
  }
  $("runBtn").addEventListener("click", function () { start(state.status.dryRun); });
  $("testBtn").addEventListener("click", function () { start(true); });
  $("stopBtn").addEventListener("click", function () { api("POST", "/api/outreach/stop", {}).then(function () { toast("Stopping after the current email…"); refresh(); }).catch(fail); });

  $("heldList").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-held]"); if (!b) return;
    api("POST", "/api/outreach/leads/action", { email: b.dataset.email, action: b.dataset.held }).then(function () { toast("Updated"); refresh(); }).catch(fail);
  });

  // ---------------------------------------------------------------- replies
  function renderReplies() {
    var rs = state.status.replied;
    $("replyList").innerHTML = rs.length ? rs.map(function (r) {
      var late = !r.loomSent && r.repliedAt && Date.now() - new Date(r.repliedAt).getTime() > 24 * 36e5;
      return '<div class="reply"><div><div class="who">' + esc(r.store || r.domain) + '</div><div class="meta">' + esc(r.email) + " · via " + esc(r.mailbox || "?") + (r.repliedAt ? " · " + esc(ago(r.repliedAt)) : "") + "</div>" +
        (late ? '<div class="bad" style="font-size:13px">Over 24 hours — send the video now</div>' : "") + '</div><div class="acts">' +
        '<a class="btn sm" href="mailto:' + esc(r.email) + '?subject=' + encodeURIComponent("Re: your free video for " + (r.domain || "")) + '">Reply</a>' +
        '<label class="check" style="font-size:13px"><input type="checkbox" data-loom="' + esc(r.email) + '"' + (r.loomSent ? " checked" : "") + "> Video sent</label></div></div>";
    }).join("") : '<p class="empty">No replies yet. When someone answers, the sequence stops for them automatically.</p>';
  }
  $("replyList").addEventListener("change", function (e) {
    var em = e.target.getAttribute("data-loom"); if (!em) return;
    api("POST", "/api/outreach/leads/action", { email: em, action: e.target.checked ? "loom_sent" : "loom_unsent" }).then(refresh).catch(fail);
  });

  // ---------------------------------------------------------------- leads
  var STATUSES = ["new", "active", "finished", "replied", "unsubscribed", "bounced", "do-not-contact", "skipped-country", "skipped-no-mailserver"];
  $("leadStatus").innerHTML += STATUSES.map(function (s) { return '<option value="' + s + '">' + s + "</option>"; }).join("");
  function loadLeads() {
    var q = new URLSearchParams({ q: $("leadQ").value, status: $("leadStatus").value, limit: PAGE, offset: state.leadPage * PAGE });
    api("GET", "/api/outreach/leads?" + q).then(function (r) {
      $("leadTable").innerHTML = r.rows.length ? "<tr><th>Store</th><th>Email</th><th>Country</th><th>Status</th><th>Step</th><th>Mailbox</th><th>Ver.</th></tr>" + r.rows.map(function (t) {
        return "<tr><td>" + esc(t.store || t.domain) + "</td><td>" + esc(t.email) + "</td><td>" + esc(t.country) + '</td><td><span class="chip ' + esc(t.status) + '">' + esc(t.status) + "</span></td><td>" + esc(t.step) + "</td><td>" + esc(t.mailbox) + "</td><td>" + esc((t.variant || "").toUpperCase()) + "</td></tr>";
      }).join("") : '<tr><td class="empty">No leads match.</td></tr>';
      var from = r.total ? state.leadPage * PAGE + 1 : 0;
      $("pgInfo").textContent = from + "–" + Math.min(r.total, (state.leadPage + 1) * PAGE) + " of " + r.total;
      $("prevPg").disabled = state.leadPage === 0; $("nextPg").disabled = (state.leadPage + 1) * PAGE >= r.total;
    }).catch(fail);
  }
  var qT; $("leadQ").addEventListener("input", function () { clearTimeout(qT); qT = setTimeout(function () { state.leadPage = 0; loadLeads(); }, 250); });
  $("leadStatus").addEventListener("change", function () { state.leadPage = 0; loadLeads(); });
  $("prevPg").addEventListener("click", function () { state.leadPage--; loadLeads(); });
  $("nextPg").addEventListener("click", function () { state.leadPage++; loadLeads(); });
  $("dncBtn").addEventListener("click", function () {
    var v = prompt("Email address or whole domain (like @example.com) that must never be emailed:");
    if (v) api("POST", "/api/outreach/dnc", { value: v }).then(function () { toast("Added to the never-contact list"); loadLeads(); refresh(); }).catch(fail);
  });
  $("importFile").addEventListener("change", function (e) {
    var f = e.target.files[0]; e.target.value = ""; if (!f) return;
    if (f.size > 8 * 1024 * 1024) return fail(new Error("That file is over 8 MB."));
    var rd = new FileReader();
    rd.onload = function () {
      var bytes = new Uint8Array(rd.result), bin = "", i;
      for (i = 0; i < bytes.length; i += 32768) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768));
      api("POST", "/api/outreach/leads/import-file", { name: f.name, data: btoa(bin) }).then(function (r) {
        toast("Imported " + r.added + " new leads (" + r.existing + " already there, " + r.invalid + " skipped)"); state.leadPage = 0; loadLeads(); refresh();
      }).catch(fail);
    };
    rd.readAsArrayBuffer(f);
  });

  // ---------------------------------------------------------------- templates
  function tplLabel(t) { return "Email " + t.step + (t.step === 1 ? " · version " + t.variant.toUpperCase() : ""); }
  function loadTemplates() {
    return api("GET", "/api/outreach/templates").then(function (r) {
      state.templates = r.templates; state.fields = r.fields;
      if (!state.tpl || !r.templates.some(function (t) { return t.name === state.tpl; })) state.tpl = r.templates[0] && r.templates[0].name;
      $("fieldChips").innerHTML = '<span class="hint">Insert:</span>' + r.fields.filter(function (f) { return ["psi", "lcp", "speed_line", "sender_name", "niche", "country", "first_name"].indexOf(f) < 0; }).map(function (f) { return '<span class="chip field-chip" data-f="' + f + '">{' + f + "}</span>"; }).join("");
      renderTplList(); selectTpl(state.tpl);
    }).catch(fail);
  }
  function renderTplList() {
    $("tplList").innerHTML = state.templates.map(function (t) {
      var sub = (t.text.split("\n")[0] || "").replace(/^subject:\s*/i, "");
      return '<button data-t="' + esc(t.name) + '" class="' + (t.name === state.tpl ? "on" : "") + '">' + esc(tplLabel(t)) + (t.edited ? " ✎" : "") + "<small>" + esc(sub.slice(0, 34)) + "</small></button>";
    }).join("");
  }
  function selectTpl(name) {
    state.tpl = name; var t = state.templates.filter(function (x) { return x.name === name; })[0]; if (!t) return;
    $("tplText").value = t.text; $("tplReset").hidden = !t.edited; renderTplList(); previewTpl();
  }
  $("tplList").addEventListener("click", function (e) { var b = e.target.closest("button[data-t]"); if (b) selectTpl(b.dataset.t); });
  $("fieldChips").addEventListener("click", function (e) {
    var f = e.target.getAttribute("data-f"); if (!f) return; var ta = $("tplText"), s = ta.selectionStart, en = ta.selectionEnd;
    ta.value = ta.value.slice(0, s) + "{" + f + "}" + ta.value.slice(en); ta.focus(); ta.selectionStart = ta.selectionEnd = s + f.length + 2; previewTpl();
  });
  var pvT; $("tplText").addEventListener("input", function () { clearTimeout(pvT); pvT = setTimeout(previewTpl, 300); });
  function previewTpl() {
    var text = $("tplText").value;
    api("POST", "/api/outreach/templates/preview", { text: text }).then(function (r) {
      $("pvSubject").textContent = "Subject: " + r.subject; $("pvFrame").srcdoc = r.html;
      var body = r.text.split("\n--\n")[0], words = body.trim().split(/\s+/).length, sw = r.subject.trim().split(/\s+/).length;
      $("tplStats").innerHTML = "Subject " + sw + " words" + (sw > 7 ? ' <span class="warn">(shorter usually gets opened more)</span>' : "") + " · body " + words + " words" + (words > 125 ? ' <span class="warn">(aim for under about 100)</span>' : "");
    }).catch(function (e) { $("pvSubject").textContent = ""; $("pvFrame").srcdoc = ""; $("tplStats").innerHTML = '<span class="bad">' + esc(e.message) + "</span>"; });
  }
  $("tplSave").addEventListener("click", function () {
    api("PUT", "/api/outreach/templates", { name: state.tpl, text: $("tplText").value }).then(function () { toast("Saved"); return loadTemplates(); }).catch(fail);
  });
  $("tplReset").addEventListener("click", function () {
    if (!confirm("Discard your edits and go back to the default text?")) return;
    api("DELETE", "/api/outreach/templates?name=" + encodeURIComponent(state.tpl), {}).then(function () { toast("Reset"); return loadTemplates(); }).catch(fail);
  });
  $("queueBtn").addEventListener("click", function () {
    api("GET", "/api/outreach/preview?n=3").then(function (r) {
      $("queuePv").innerHTML = r.emails.length ? r.emails.map(function (m) {
        return '<div style="margin-bottom:16px"><div class="hint">To ' + esc(m.to) + " · from " + esc(m.from) + " · email " + m.step + (m.step === 1 ? " version " + esc(m.variant.toUpperCase()) : "") + '</div><p style="font-weight:600;margin:4px 0">' + esc(m.subject) + '</p><iframe class="preview" style="height:300px" sandbox="" srcdoc="' + esc(m.html) + '"></iframe></div>';
      }).join("") : '<p class="empty">No emails waiting.</p>';
    }).catch(fail);
  });

  // ---------------------------------------------------------------- settings
  function mbBlock(m, i) {
    m = m || {};
    return '<div class="mb" data-id="' + esc(m.id || "") + '"><div class="mb-head"><span class="mb-title">' + (m.id ? "Mailbox " + esc(m.id) : "New mailbox") + '</span><button type="button" class="btn sm danger" data-rm="1">Remove</button></div><div class="row">' +
      '<div class="field"><label>Email address</label><input type="email" data-k="email" value="' + esc(m.email || "") + '" placeholder="hassan@getweberslink.com"></div>' +
      '<div class="field"><label>Sender name</label><input type="text" data-k="from_name" value="' + esc(m.from_name || "") + '"></div></div>' +
      '<div class="row"><div class="field"><label>SMTP host / port</label><div style="display:flex;gap:8px"><input type="text" data-k="smtp_host" value="' + esc(m.smtp_host || "smtp.hostinger.com") + '"><input type="number" data-k="smtp_port" value="' + esc(m.smtp_port || 465) + '" style="width:90px"></div></div>' +
      '<div class="field"><label>IMAP host / port</label><div style="display:flex;gap:8px"><input type="text" data-k="imap_host" value="' + esc(m.imap_host || "imap.hostinger.com") + '"><input type="number" data-k="imap_port" value="' + esc(m.imap_port || 993) + '" style="width:90px"></div></div></div>' +
      '<label class="check"><input type="checkbox" data-k="enabled"' + (m.enabled === false ? "" : " checked") + '> Use this mailbox</label><p class="hint" style="margin-top:8px">Password variable on the server: <code>' + (m.id ? "OUTREACH_PASSWORD_" + esc(m.id) : "OUTREACH_PASSWORD_(number shown after saving)") + "</code></p></div>";
  }
  function loadSettings() {
    api("GET", "/api/outreach/config").then(function (r) {
      var c = state.config = r.config, g = c.signature, s = c.sending;
      $("s_name").value = g.name; $("s_title").value = g.title; $("s_company").value = g.company; $("s_website").value = g.website; $("s_postal").value = g.postal_address; $("s_accent").value = g.accent_color;
      $("x_notify").value = s.notify_email; $("x_days").value = s.send_days.join(","); $("x_tz").value = s.timezone; $("x_countries").value = s.countries.join(",");
      $("x_ramp").value = s.ramp.join(","); $("x_limit").value = s.daily_limit; $("x_gaps").value = s.followup_gaps_days.join(","); $("x_bounce").value = s.bounce_pause_percent;
      $("x_min").value = s.min_delay_seconds; $("x_max").value = s.max_delay_seconds; $("x_html").checked = s.html_emails; $("x_mx").checked = s.check_mx; $("x_live").checked = !s.dry_run;
      $("mbList").innerHTML = c.mailboxes.map(mbBlock).join("");
    }).catch(fail);
  }
  $("addMb").addEventListener("click", function () { var n = $("mbList").children.length; if (n >= 10) return; $("mbList").insertAdjacentHTML("beforeend", mbBlock(null, n)); });
  $("mbList").addEventListener("click", function (e) { if (e.target.getAttribute("data-rm")) e.target.closest(".mb").remove(); }); // ids are permanent: never renumber
  $("settingsForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var wasDry = state.config ? state.config.sending.dry_run : true, live = $("x_live").checked;
    if (live && wasDry && !confirm("Turn on LIVE sending? Runs will send real emails to your leads.")) return;
    var boxes = [].map.call($("mbList").children, function (el) {
      var m = { id: el.dataset.id ? Number(el.dataset.id) : undefined }; el.querySelectorAll("[data-k]").forEach(function (i) { m[i.dataset.k] = i.type === "checkbox" ? i.checked : i.value; }); return m;
    }).filter(function (m) { return m.email.trim(); });
    var body = {
      signature: { name: $("s_name").value, title: $("s_title").value, company: $("s_company").value, website: $("s_website").value, postal_address: $("s_postal").value, accent_color: $("s_accent").value },
      sending: { notify_email: $("x_notify").value, send_days: $("x_days").value, timezone: $("x_tz").value, countries: $("x_countries").value, ramp: $("x_ramp").value, daily_limit: $("x_limit").value,
        followup_gaps_days: $("x_gaps").value, bounce_pause_percent: $("x_bounce").value, min_delay_seconds: $("x_min").value, max_delay_seconds: $("x_max").value,
        html_emails: $("x_html").checked, check_mx: $("x_mx").checked, dry_run: !live, check_inbox_in_dry_run: state.config ? state.config.sending.check_inbox_in_dry_run : false },
      mailboxes: boxes
    };
    api("PUT", "/api/outreach/config", body).then(function (r) { state.config = r.config; toast("Settings saved"); loadSettings(); refresh(); }).catch(fail);
  });

  // ---------------------------------------------------------------- go-live checks
  $("testSend").addEventListener("click", function () {
    var to = $("testTo").value.trim(); if (!to) return fail(new Error("Enter your own email address first."));
    $("testSend").disabled = true;
    api("POST", "/api/outreach/test-email", { to: to }).then(function (r) {
      $("goLive").innerHTML = r.problems ? '<ul class="bad" style="margin-left:18px">' + r.problems.map(function (p) { return "<li>" + esc(p) + "</li>"; }).join("") + "</ul>" :
        "<table>" + r.results.map(function (x) { return "<tr><td>" + esc(x.mailbox) + "</td><td>" + (x.ok ? '<span class="ok">sent: check inbox and spam</span>' : '<span class="bad">' + esc(x.error) + "</span>") + "</td></tr>"; }).join("") + "</table>";
    }).catch(fail).finally(function () { $("testSend").disabled = false; });
  });
  $("dnsBtn").addEventListener("click", function () {
    $("dnsBtn").disabled = true; $("goLive").innerHTML = '<p class="hint">Checking…</p>';
    api("GET", "/api/outreach/dns").then(function (r) {
      $("goLive").innerHTML = r.domains.length ? r.domains.map(function (d) {
        return "<h3 style='margin:14px 0 6px'>" + esc(d.domain) + "</h3><table>" + d.checks.map(function (c) {
          return "<tr><td style='width:70px'>" + esc(c.name) + '</td><td class="' + (c.status === "ok" ? "ok" : c.status === "bad" ? "bad" : "warn") + '" style="width:60px">' + (c.status === "ok" ? "OK" : c.status === "bad" ? "Fix" : "Check") + "</td><td class='hint'>" + esc(c.detail) + "</td></tr>";
        }).join("") + "</table>";
      }).join("") : '<p class="hint">Add a mailbox and save first.</p>';
    }).catch(fail).finally(function () { $("dnsBtn").disabled = false; });
  });

  // ---------------------------------------------------------------- boot
  api("GET", "/api/outreach/session").then(function (r) {
    state.needUser = Boolean(r.usernameRequired);
    if (!r.authed) return showLogin();
    var v = location.hash.slice(1); if (TITLES[v]) state.view = v;
    showApp(); go(state.view);
  }).catch(function (e) {
    document.body.innerHTML = '<div class="login"><form><h1>Outreach is off</h1><p style="margin-top:10px">' + esc(e.message) + "</p></form></div>";
  });
})();
