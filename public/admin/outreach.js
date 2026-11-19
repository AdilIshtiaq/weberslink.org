/* Outreach dashboard. Served from its own file so the page can use a strict Content-Security-Policy. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var state = { view: "overview", status: null, config: null, leadPage: 0, tpl: null, templates: [], fields: [] };
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
  var VIEWS = {
    overview: ["Overview", ""], replies: ["Inbox", "People who replied to you"], campaigns: ["Campaigns", "Group leads by place and business type"],
    templates: ["Campaigns", "The emails each campaign sends"], leads: ["Leads", "Everyone you can email"], reports: ["Reports", "What is working and what is not"],
    settings: ["Settings", "Sender, mailboxes and sending rules"]
  };
  var NAV_OF = { templates: "campaigns" };
  function go(view, tab) {
    if (view === "dashboard") view = "overview";
    if (!VIEWS[view]) view = "overview";
    state.view = view;
    Object.keys(VIEWS).forEach(function (v) { $("v-" + v).hidden = v !== view; });
    document.querySelectorAll(".nav-btn[data-view]").forEach(function (b) { b.classList.toggle("on", b.dataset.view === (NAV_OF[view] || view)); });
    $("title").textContent = VIEWS[view][0]; $("subtitle").textContent = VIEWS[view][1];
    if (history.replaceState) history.replaceState(null, "", "#" + view);
    window.scrollTo(0, 0);
    if (view === "campaigns") loadCampaigns();
    if (view === "leads") { loadFacets().then(loadLeads); }
    if (view === "templates") loadTemplates();
    if (view === "settings") { if (!state.dirty) loadSettings(); showDataInfo(); showSettingsTab(tab || state.stab || "sender"); }
    if (state.status) renderStatus();
  }
  document.querySelectorAll(".nav-btn[data-view]").forEach(function (b) { b.addEventListener("click", function () { go(b.dataset.view); }); });
  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-goview]"); if (t) return go(t.dataset.goview);
    var g = e.target.closest("[data-view-go]"); if (g) go(g.dataset.viewGo);
  });

  // ---------------------------------------------------------------- status polling + dashboard
  function refresh() {
    clearTimeout(pollTimer);
    return api("GET", "/api/outreach/status").then(function (s) {
      state.status = s; renderStatus();
      pollTimer = setTimeout(refresh, s.running ? 3000 : 20000);
    }).catch(function (e) { if (!$("app").hidden) { fail(e); pollTimer = setTimeout(refresh, 30000); } });
  }
  var fmtMin = function (m) { return Math.floor(m / 60) + "h " + (m % 60) + "m"; };
  function renderStatus() {
    var s = state.status; if (!s) return;
    var live = !s.dryRun;
    [].forEach.call($("modeSwitch").children, function (b) { b.className = (b.dataset.mode === "live") === live ? "on " + b.dataset.mode : ""; });
    $("runState").hidden = !s.running; $("runText").textContent = s.running ? "Running" + (s.runMode === "dry" ? " (test)" : "") : "";
    $("stopBtn").hidden = !s.running; $("runBtn").disabled = s.running; $("testBtn").disabled = s.running;
    $("runBtn").textContent = live ? "Run now" : "Run test"; $("testBtn").hidden = !live;
    var nr = (s.overview && s.overview.repliesWaiting) || 0;
    $("replyBadge").hidden = !nr; $("replyBadge").textContent = nr;
    if (state.view === "overview") {
      var w = s.window || {};
      $("subtitle").textContent = !live ? "Test mode: runs only plan emails, nothing is sent" : w.enabled ? "Live · sending window " + w.start + "–" + w.end + " (" + w.timezone + ") is " + (w.open ? "open, closes in " + fmtMin(w.minutesToClose) : "closed, opens in " + fmtMin(w.minutesToOpen)) : "Live · sending around the clock";
    }
    renderSetup(); renderAttention(); renderKpis(); renderBrief(); loadBrief(); renderChart(); renderCampaignCards(); renderMailboxCards(); fillCampaignSelects();
    $("heldBox").hidden = !s.held.length;
    $("heldList").innerHTML = s.held.map(function (x) {
      return '<div class="reply"><div><div class="who">' + esc(x.store || x.email) + '</div><div class="meta">' + esc(x.email) + " · email " + esc(x.step) + " · " + esc(x.mailbox || "") + '</div></div><div class="acts"><button class="btn sm" data-held="retry_held" data-email="' + esc(x.email) + '">It was NOT sent: allow retry</button><button class="btn sm danger" data-held="skip_held" data-email="' + esc(x.email) + '">It WAS sent: never email again</button></div></div>';
    }).join("");

    // reports
    renderResults(); renderObjections();
    var vs = Object.keys(s.byVariant || {}).sort();
    $("abBox").innerHTML = vs.length ? "<table><tr><th>Version</th><th>Started</th><th>Replied</th><th>Rate</th></tr>" + vs.map(function (v) {
      var x = s.byVariant[v]; return "<tr><td>Email 1 · " + esc(v.toUpperCase()) + "</td><td>" + x.started + "</td><td>" + x.replied + "</td><td>" + (x.started ? (100 * x.replied / x.started).toFixed(1) : "0.0") + "%</td></tr>";
    }).join("") + '</table><p class="hint" style="margin-top:10px">Wait for about 100 leads per version before judging a winner.</p>' : '<p class="empty">Results appear once emails go out.</p>';
    var fs = Object.keys(s.furthestStep || {}).sort();
    $("funnel").innerHTML = fs.length ? "<table>" + fs.map(function (k) { return "<tr><td>Reached " + esc(k) + "</td><td>" + s.furthestStep[k] + "</td></tr>"; }).join("") + "</table>" : '<p class="empty">Nothing sent yet.</p>';
    var lg = $("log"), atEnd = lg.scrollTop + lg.clientHeight >= lg.scrollHeight - 30;
    lg.innerHTML = s.log.length ? s.log.map(function (line) {
      var cls = /SENT|Notified/.test(line) ? "sent" : /REPLIED|OPT-OUT/.test(line) ? "rep" : /failed|REFUSED|Could not|NOT SENDING/i.test(line) ? "err" : /PAUSED|waiting/.test(line) ? "wrn" : "";
      return '<div class="' + cls + '">' + esc(line) + "</div>";
    }).join("") : "No activity yet.";
    if (atEnd) lg.scrollTop = lg.scrollHeight;
    renderClicks();
    if (state.view === "replies") renderReplies();
  }

  // ---- overview pieces
  function renderSetup() {
    var su = state.status.setup || { steps: [], complete: true };
    $("setupBox").hidden = su.complete;
    if (su.complete) return;
    $("setupSub").textContent = su.done + " of " + su.total + " done. Finish these and you are sending.";
    $("setupBar").style.width = Math.round(100 * su.done / su.total) + "%";
    $("setupSteps").innerHTML = su.steps.map(function (st) {
      return '<div class="step' + (st.done ? " done" : "") + '"><span class="tick">✓</span><div><div class="lbl">' + esc(st.label) + (st.optional ? ' <span class="chip">optional</span>' : "") + '</div><div class="hint">' + esc(st.hint) + "</div></div>" +
        (st.done ? "" : '<button class="btn sm go' + (st.action === "live" ? " primary" : "") + '" data-setup="' + esc(st.id) + '" data-view="' + esc(st.view || "") + '" data-tab="' + esc(st.tab || "") + '" data-action="' + esc(st.action || "") + '">' + (st.action === "live" ? "Go live" : "Do this") + "</button>") + "</div>";
    }).join("");
  }
  $("setupSteps").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-setup]"); if (!b) return;
    if (b.dataset.action === "live") return setMode("live");
    go(b.dataset.view, b.dataset.tab || undefined);
  });
  function attentionItems() {
    var s = state.status, out = [], d = s.data || {};
    var lr = s.lastRun;
    if (lr && (lr.status === "failed" || lr.status === "interrupted")) out.push({ level: "warn", text: (lr.status === "failed" ? "The last run failed: " : "The last run was cut off: ") + (lr.reason || "") });
    if (s.setup && s.setup.complete) (s.problems || []).forEach(function (p) { out.push({ level: "bad", text: p, go: "settings" }); });
    (s.insights || []).forEach(function (i) { out.push(i); });
    if (d.insideApp) out.push({ level: "bad", text: "Your data folder is inside the app's folder, so a redeploy can erase it. Set OUTREACH_DATA_DIR in Hostinger to a folder outside the app, restart, then restore a backup.", go: "settings:checks" });
    if (d.dir && !d.writable) out.push({ level: "bad", text: "The data folder (" + d.dir + ") can't be written to, so nothing you save will stick. Set OUTREACH_DATA_DIR to a folder you can write to." });
    var haveData = (s.total || 0) > 0 || (s.mailboxes || []).length > 0;
    if (haveData && (!s.lastBackup || Date.now() - Date.parse(s.lastBackup) > 7 * 864e5)) out.push({ level: "info", text: (s.lastBackup ? "Your last backup was over a week ago." : "You have never downloaded a backup.") + " A backup protects you from a redeploy or a mistake.", go: "settings:checks" });
    var rank = { bad: 0, warn: 1, info: 2 };
    if (s.setup && !s.setup.complete) out = out.filter(function (i) { return i.level !== "info"; }); // while setting up, only real problems compete with the guide
    return out.sort(function (a, b) { return rank[a.level] - rank[b.level]; });
  }
  function renderAttention() {
    var items = attentionItems(), show = state.attnAll ? items : items.slice(0, 5);
    $("attnBox").hidden = !items.length && Boolean(state.status.setup && !state.status.setup.complete);
    $("attnList").innerHTML = items.length ? show.map(function (i) {
      var g = (i.go || "").split(":");
      return '<div class="attn-item ' + esc(i.level) + '"><span class="dot"></span><div>' + esc(i.text) + "</div>" + (g[0] ? '<button class="btn sm go" data-attn="' + esc(g[0]) + '" data-tab="' + esc(g[1] || "") + '">Open</button>' : "") + "</div>";
    }).join("") + (items.length > 5 ? '<div class="attn-item"><button class="btn sm ghost" id="attnMore">' + (state.attnAll ? "Show fewer" : "Show " + (items.length - 5) + " more") + "</button></div>" : "") :
      '<div class="attn-ok"><span>✓</span> All clear. Nothing needs your attention.</div>';
  }
  $("attnBox").addEventListener("click", function (e) {
    if (e.target.id === "attnMore") { state.attnAll = !state.attnAll; return renderAttention(); }
    var b = e.target.closest("button[data-attn]"); if (b) go(b.dataset.attn, b.dataset.tab || undefined);
  });
  function renderBrief() {
    var on = aiOn(), b = state.brief;
    $("briefBtn").hidden = !on; $("briefBtn").textContent = b ? "Refresh" : "Write today's brief";
    $("briefAt").textContent = b && b.at ? ago(b.at) : "";
    $("briefBody").innerHTML = !on ? 'Connect Gemini (Settings, AI &amp; automation) and it will summarise your numbers and tell you the one thing to do next.' :
      b ? '<div style="color:var(--text);font-weight:600;margin-bottom:6px">' + esc(b.headline) + "</div><ul style=\"margin:0 0 8px 18px\">" + b.bullets.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" + (b.next_action ? '<div><span class="chip okc">Next</span> ' + esc(b.next_action) + "</div>" : "") : "Press the button for a short read on how things are going.";
  }
  function loadBrief() { if (state.briefLoaded || !aiOn()) return; state.briefLoaded = true; api("GET", "/api/outreach/ai/brief").then(function (r) { state.brief = r.brief; renderBrief(); }).catch(function () {}); }
  $("briefBtn").addEventListener("click", function () {
    var b = this; b.disabled = true; b.textContent = "Reading your numbers…";
    api("POST", "/api/outreach/ai/brief", { force: true }).then(function (r) { state.brief = r.brief; }).catch(fail).then(function () { b.disabled = false; renderBrief(); });
  });
  function renderKpis() {
    var s = state.status, o = s.overview || {}, pos = o.positive7 || 0;
    var tiles = [
      ["Sent today", o.sentToday || 0, "of " + (o.capToday || 0) + " possible today"],
      ["Sent, last 7 days", o.sent7 || 0, s.remaining ? s.remaining + " leads waiting" + (s.daysLeft ? " · about " + s.daysLeft + " day" + (s.daysLeft === 1 ? "" : "s") + " to finish" : "") : "no leads waiting"],
      ["Replies, last 7 days", o.replies7 || 0, pos + " positive"],
      ["Waiting for your answer", o.repliesWaiting || 0, o.repliesWaiting ? "open your Inbox" : "you are on top of it"],
      ["Meetings booked", o.meetings || 0, "all time"]
    ];
    $("kpis").innerHTML = tiles.map(function (t) { return '<div class="kpi"><div class="l">' + esc(t[0]) + '</div><div class="n">' + esc(t[1]) + '</div><div class="s">' + esc(t[2]) + "</div></div>"; }).join("");
  }
  function renderChart() {
    var s = state.status, ser = (s.overview && s.overview.series) || [], max = Math.max.apply(null, [1].concat(ser.map(function (d) { return Math.max(d.sent, d.replies); })));
    $("chart").innerHTML = ser.map(function (d) {
      return '<div class="col" title="' + esc(d.date + ": " + d.sent + " sent, " + d.replies + " replies") + '"><div class="bars"><div class="b" style="height:' + Math.round(100 * d.sent / max) + '%"></div><div class="r" style="height:' + Math.round(100 * d.replies / max) + '%"></div></div><div class="d">' + esc(d.date.slice(8)) + "</div></div>";
    }).join("");
    var lr = s.lastRun; $("lastRun").textContent = lr ? "last run " + ago(lr.at) : "";
    $("lastRunText").textContent = lr ? (lr.reason || "") : "Nothing has run yet.";
  }
  function renderMailboxCards() {
    var ms = state.status.mailboxes || [];
    $("mbCards").innerHTML = ms.length ? ms.map(function (m) {
      var st = !m.enabled ? ["Off", ""] : m.paused ? ["Paused", "badc"] : !m.passwordSet ? ["Password missing", "warnc"] : ["Ready", "okc"];
      var pct = m.todayLimit ? Math.min(100, Math.round(100 * m.sentToday / m.todayLimit)) : 0;
      return '<div class="mbcard"><div class="e">' + esc(m.email) + '</div><div class="row2"><span class="chip ' + st[1] + '">' + st[0] + "</span><span>Health " + healthChip(m.health) + '</span></div><div class="bar"><b style="width:' + pct + '%"></b></div><div class="row2"><span>' + m.sentToday + " of " + m.todayLimit + " today</span><span>" + m.bounceRate + "% bounced</span></div>" +
        (m.placement ? '<div class="row2"><span>Warm-up mail: ' + m.placement.inbox + " inbox · " + m.placement.spam + " spam</span></div>" : "") + "</div>";
    }).join("") : '<div class="mbcard empty-cta"><b>No mailbox yet</b><p>Add the mailbox you want to send from.</p><button class="btn primary sm" data-view-go="settings">Add a mailbox</button></div>';
  }

  function start(dry) {
    var s = state.status;
    var live = !dry && !s.dryRun;
    if (live && !confirm("Start a LIVE run? Real emails will be sent now, up to each mailbox's daily limit.")) return;
    api("POST", "/api/outreach/run", { dry: !!dry }).then(function () { toast(live ? "Live run started" : "Test run started"); refresh(); }).catch(fail);
  }
  $("runBtn").addEventListener("click", function () { start(state.status.dryRun); });
  $("testBtn").addEventListener("click", function () { start(true); });
  $("stopBtn").addEventListener("click", function () { api("POST", "/api/outreach/stop", {}).then(function () { toast("Stopping after the current email…"); refresh(); }).catch(fail); });
  function setMode(mode) {
    var s = state.status; if (!s || (mode === "live") === !s.dryRun) return;
    if (mode === "live") {
      if ((s.liveProblems || []).length) return alert("Before you go live, fix this:\n\n• " + s.liveProblems.join("\n• "));
      if (!confirm("Switch to LIVE?\n\nRuns will send real emails to your leads, up to each mailbox's daily limit.")) return;
    }
    api("GET", "/api/outreach/config").then(function (r) { r.config.sending.dry_run = mode !== "live"; return api("PUT", "/api/outreach/config", r.config); })
      .then(function () { toast(mode === "live" ? "Live: runs now send real emails" : "Test mode: nothing will be sent"); if (state.view === "settings") loadSettings(); return refresh(); }).catch(fail);
  }
  $("modeSwitch").addEventListener("click", function (e) { var b = e.target.closest("button[data-mode]"); if (b) setMode(b.dataset.mode); });

  $("heldList").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-held]"); if (!b) return;
    api("POST", "/api/outreach/leads/action", { email: b.dataset.email, action: b.dataset.held }).then(function () { toast("Updated"); refresh(); }).catch(fail);
  });

  // ---------------------------------------------------------------- link clicks
  function clickLine(c) {
    if (!c || !c.clicks) return "";
    var parts = Object.keys(c.links || {}).map(function (k) { return "“" + k + "”" + (c.links[k] > 1 ? " ×" + c.links[k] : ""); });
    return '<div class="clicked">Clicked ' + esc(parts.join(", ")) + " · last " + esc(ago(c.last)) + "</div>";
  }
  function renderClicks() {
    var s = state.status, cs = s.clicks || [], on = s.trackClicks !== false;
    $("clickList").innerHTML = cs.length ? cs.slice(0, 15).map(function (c) {
      return '<div class="click-row"><div><div class="who">' + esc(c.store || c.email) + '</div><div class="meta">' + esc(c.email) + " · clicked “" + esc(c.label || c.url) + "” in " + esc(c.source || "an email") + " · " + esc(c.url) + "</div></div>" +
        '<div class="meta">' + esc(ago(c.at)) + "</div></div>";
    }).join("") : '<p class="empty">' + (!on ? "Click tracking is off: tick Track link clicks and HTML emails in Settings." : !s.trackingBase ? "Click tracking needs your website address in Settings > signature (or OUTREACH_PUBLIC_URL on the server)." : "No clicks yet. Links in emails sent from now on are tracked.") + "</p>";
  }

  // ---------------------------------------------------------------- replies
  var LABEL = { interested: "interested", question: "has a question", not_now: "not now", not_interested: "not interested", out_of_office: "out of office", wrong_person: "wrong person", unsubscribe: "asked to stop", other: "other" };
  var POSITIVE = ["interested", "question"];
  var healthChip = function (h) { return typeof h === "number" ? '<span class="' + (h >= 80 ? "ok" : h >= 50 ? "warn" : "bad") + '">' + h + "/100</span>" : "–"; };
  function renderReplies() {
    var f = $("replyFilter").value;
    var rs = state.status.replied.filter(function (r) {
      return !f || (f === "positive" ? POSITIVE.indexOf(r.label) >= 0 : f === "unlabelled" ? !r.label : f === "other" ? r.label === "other" || r.label === "out_of_office" || r.label === "unsubscribe" : r.label === f);
    });
    $("replyCount").textContent = rs.length + " of " + state.status.replied.length;
    $("replyList").innerHTML = rs.length ? rs.map(function (r) {
      var late = !r.loomSent && r.repliedAt && Date.now() - new Date(r.repliedAt).getTime() > 24 * 36e5;
      var pos = POSITIVE.indexOf(r.label) >= 0 || r.label === "not_now" || r.label === "wrong_person";
      return '<div class="reply"><div><div class="who">' + esc(r.store || r.domain) + (r.label ? ' <span class="chip lab-' + esc(r.label) + '">' + esc(LABEL[r.label] || r.label) + "</span>" : "") + (r.outcome ? ' <span class="chip high">' + esc(r.outcome.replace("_", " ")) + "</span>" : "") + '</div><div class="meta">' + esc(r.email) + " · via " + esc(r.mailbox || "?") + (r.repliedAt ? " · " + esc(ago(r.repliedAt)) : "") + "</div>" +
        (r.summary || r.snippet ? '<div class="meta" style="color:var(--text);margin-top:4px">' + esc(r.summary || r.snippet) + "</div>" : "") +
        clickLine(r.clicks) +
        (r.draft ? '<div class="draft"><b>Suggested reply</b> (review it before sending)\n' + esc(r.draft) + "</div>" : "") +
        (late ? '<div class="bad" style="font-size:13px">Over 24 hours — send the video now</div>' : "") + '</div><div class="acts">' +
        '<button class="btn sm" data-reply="' + esc(r.email) + '">Reply</button>' +
        (r.draft ? '<button class="btn sm primary" data-usedraft="' + esc(r.email) + '">Use suggested reply</button>' : pos && state.status.ai && state.status.ai.configured ? '<button class="btn sm" data-draft="' + esc(r.email) + '">Suggest a reply</button>' : "") +
        '<select data-outcome="' + esc(r.email) + '" style="font-size:13px"><option value="">Outcome…</option><option value="meeting_booked"' + (r.outcome === "meeting_booked" ? " selected" : "") + '>Meeting booked</option><option value="won"' + (r.outcome === "won" ? " selected" : "") + '>Won</option><option value="lost"' + (r.outcome === "lost" ? " selected" : "") + '>Lost</option><option value="clear_outcome">Clear</option></select>' +
        '<label class="check" style="font-size:13px"><input type="checkbox" data-loom="' + esc(r.email) + '"' + (r.loomSent ? " checked" : "") + "> Video sent</label></div></div>";
    }).join("") : '<p class="empty">' + (state.status.replied.length ? "No replies match this filter." : "No replies yet. When someone answers, the sequence stops for them automatically.") + "</p>";
    renderScheduled();
  }
  $("replyFilter").addEventListener("change", renderReplies);
  $("replyList").addEventListener("click", function (e) {
    var u = e.target.closest("button[data-usedraft]"), d = e.target.closest("button[data-draft]");
    if (u) { var r = state.status.replied.filter(function (x) { return x.email === u.dataset.usedraft; })[0]; openReply(u.dataset.usedraft); if (r && r.draft) ed.innerHTML = textToHtml(r.draft); }
    if (d) { d.disabled = true; d.textContent = "Writing…"; api("POST", "/api/outreach/ai/draft", { email: d.dataset.draft }).then(function () { toast("Suggested reply ready"); return refresh(); }).catch(function (err) { fail(err); d.disabled = false; d.textContent = "Suggest a reply"; }); }
  });
  $("replyList").addEventListener("change", function (e) {
    var em = e.target.getAttribute("data-outcome"); if (!em || !e.target.value) return;
    api("POST", "/api/outreach/leads/action", { email: em, action: e.target.value }).then(function () { toast("Saved"); return refresh(); }).catch(fail);
  });
  // Reply window: sends from the mailbox that emailed them, in the same thread; or schedules it for later.
  var replyTo = null;
  var pad = function (n) { return (n < 10 ? "0" : "") + n; };
  var localInput = function (d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes()); };
  function syncLater() {
    var on = $("rmLater").checked; $("rmWhenField").hidden = !on; $("rmSend").textContent = on ? "Schedule" : "Send now";
    if (on && !$("rmWhen").value) { var d = new Date(Date.now() + 36e5); d.setMinutes(0, 0, 0); $("rmWhen").value = localInput(d); }
  }
  function openReply(email) {
    var r = state.status.replied.filter(function (x) { return x.email === email; })[0]; if (!r) return;
    replyTo = r.email;
    $("rmTo").value = r.email; $("rmFrom").value = r.mailbox || "";
    $("rmSubject").value = /^re:/i.test(r.subject || "") ? r.subject : "Re: " + (r.subject || "your free video for " + (r.domain || ""));
    ed.innerHTML = r.firstName ? "<div>Hi " + esc(r.firstName) + ",</div><div><br></div><div><br></div>" : "";
    rmFiles = []; renderFiles();
    $("rmLater").checked = false; $("rmWhen").value = ""; syncLater();
    $("replyModal").hidden = false; ed.focus();
    if (ed.lastChild) { var rg = document.createRange(); rg.selectNodeContents(ed.lastChild); rg.collapse(true); var sl = getSelection(); sl.removeAllRanges(); sl.addRange(rg); }
  }

  // ---- rich editor: pasted links/bold/lists/images survive; everything is cleaned here and again on the server.
  var ed = $("rmEditor"), rmFiles = [], savedRange = null;
  var MAX_BYTES = 10 * 1024 * 1024;
  try { document.execCommand("defaultParagraphSeparator", false, "div"); } catch (e) {}
  var KEEP = { A: 1, B: 1, STRONG: 1, I: 1, EM: 1, U: 1, S: 1, BR: 1, P: 1, DIV: 1, UL: 1, OL: 1, LI: 1, BLOCKQUOTE: 1, IMG: 1, H1: 1, H2: 1, H3: 1, HR: 1 };
  var DROP = { SCRIPT: 1, STYLE: 1, META: 1, LINK: 1, TITLE: 1, HEAD: 1, NOSCRIPT: 1, TEMPLATE: 1, IFRAME: 1, OBJECT: 1, SVG: 1 };
  var okHref = function (h) { h = String(h || "").trim(); if (/^www\./i.test(h)) h = "https://" + h; return /^(https?:|mailto:)/i.test(h) ? h : ""; };
  var okImg = function (src) { return /^data:image\/(png|jpeg|gif|webp);base64,/i.test(src || ""); };
  // Copies a pasted DOM into clean nodes. Styled spans (Google Docs, Word) become <b>/<i>/<u>.
  function cleanNode(n, doc) {
    if (n.nodeType === 3) return doc.createTextNode(n.nodeValue.replace(/\u00a0/g, " "));
    if (n.nodeType !== 1 || DROP[n.tagName]) return null;
    var tag = n.tagName, out, st = n.getAttribute("style") || "";
    if (tag === "A") { var h = okHref(n.getAttribute("href")); out = doc.createElement(h ? "a" : "span"); if (h) out.setAttribute("href", h); }
    else if (tag === "IMG") { if (!okImg(n.getAttribute("src"))) return null; out = doc.createElement("img"); out.setAttribute("src", n.getAttribute("src")); out.setAttribute("alt", n.getAttribute("alt") || ""); return out; }
    else if (KEEP[tag]) out = doc.createElement(tag === "P" ? "div" : tag.toLowerCase());
    else if (/^(H[4-6]|TR|TABLE|SECTION|ARTICLE|HEADER|FOOTER)$/.test(tag)) out = doc.createElement("div");
    else out = doc.createDocumentFragment();
    var inner = out;
    if (tag !== "B" && tag !== "STRONG" && /font-weight\s*:\s*(bold|[6-9]00)/i.test(st) && !/^H[1-3]$/.test(tag)) { var b = doc.createElement("b"); inner.appendChild(b); inner = b; }
    if (/font-style\s*:\s*italic/i.test(st)) { var i = doc.createElement("i"); inner.appendChild(i); inner = i; }
    if (/text-decoration[^;]*underline/i.test(st) && tag !== "A") { var u = doc.createElement("u"); inner.appendChild(u); inner = u; }
    for (var c = n.firstChild; c; c = c.nextSibling) { var k = cleanNode(c, doc); if (k) inner.appendChild(k); }
    return out;
  }
  function cleanHtml(html) {
    var src = new DOMParser().parseFromString(html, "text/html").body;
    var frag = document.createDocumentFragment();
    for (var c = src.firstChild; c; c = c.nextSibling) { var k = cleanNode(c, document); if (k) frag.appendChild(k); }
    return frag;
  }
  var URL_RE = /\b((?:https?:\/\/|www\.)[^\s<>"']+[^\s<>"'.,;:!?)\]])/gi;
  function textToHtml(t) {
    return t.split(/\r?\n/).map(function (line) {
      var h = esc(line).replace(URL_RE, function (u) { var d = u.replace(/&amp;/g, "&"); return '<a href="' + esc(okHref(d)) + '">' + u + "</a>"; });
      return "<div>" + (h || "<br>") + "</div>";
    }).join("");
  }
  // Bare URLs typed into the message become links when it is sent.
  function autoLink(root) {
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), list = [], n;
    while ((n = w.nextNode())) { URL_RE.lastIndex = 0; if (!(n.parentNode.closest && n.parentNode.closest("a")) && URL_RE.test(n.nodeValue)) list.push(n); }
    list.forEach(function (t) { URL_RE.lastIndex = 0; var span = document.createElement("span"); span.innerHTML = esc(t.nodeValue).replace(URL_RE, function (u) { return '<a href="' + esc(okHref(u.replace(/&amp;/g, "&"))) + '">' + u + "</a>"; }); t.parentNode.replaceChild(span, t); });
    URL_RE.lastIndex = 0;
  }
  function insertNode(frag) {
    var sel = getSelection(); if (!sel.rangeCount || !ed.contains(sel.anchorNode)) { ed.focus(); restoreRange(); sel = getSelection(); }
    if (!sel.rangeCount) { ed.appendChild(frag); return; }
    var r = sel.getRangeAt(0); r.deleteContents(); var last = frag.lastChild; r.insertNode(frag);
    if (last) { r.setStartAfter(last); r.collapse(true); sel.removeAllRanges(); sel.addRange(r); }
  }
  function readFile(f) { return new Promise(function (ok, no) { var fr = new FileReader(); fr.onload = function () { ok(fr.result); }; fr.onerror = function () { no(new Error("Could not read " + f.name)); }; fr.readAsDataURL(f); }); }
  function usedBytes() {
    var n = rmFiles.reduce(function (a, f) { return a + f.size; }, 0);
    ed.querySelectorAll("img").forEach(function (i) { n += Math.floor((i.getAttribute("src") || "").length * 0.75); });
    return n;
  }
  function addImage(f) {
    if (!/^image\/(png|jpeg|gif|webp)$/.test(f.type)) return fail(new Error("Images must be PNG, JPG, GIF or WebP."));
    if (usedBytes() + f.size > MAX_BYTES) return fail(new Error("Attachments and images can be 10 MB at most together."));
    readFile(f).then(function (url) { var img = document.createElement("img"); img.src = url; img.alt = f.name.replace(/\.[a-z0-9]+$/i, ""); var fr = document.createDocumentFragment(); fr.appendChild(img); insertNode(fr); }).catch(fail);
  }
  ed.addEventListener("paste", function (e) {
    var cd = e.clipboardData; if (!cd) return;
    var imgs = Array.prototype.filter.call(cd.files || [], function (f) { return /^image\//.test(f.type); });
    var html = cd.getData("text/html"), text = cd.getData("text/plain");
    e.preventDefault();
    if (html) insertNode(cleanHtml(html));
    else if (text) insertNode(cleanHtml(textToHtml(text)));
    else imgs.forEach(addImage);
  });
  ed.addEventListener("drop", function (e) {
    var fs = e.dataTransfer && e.dataTransfer.files; if (!fs || !fs.length) return;
    e.preventDefault(); Array.prototype.forEach.call(fs, function (f) { /^image\//.test(f.type) ? addImage(f) : addFile(f); });
  });
  function saveRange() { var s = getSelection(); if (s.rangeCount && ed.contains(s.anchorNode)) savedRange = s.getRangeAt(0).cloneRange(); }
  function restoreRange() { if (!savedRange) return; var s = getSelection(); s.removeAllRanges(); s.addRange(savedRange); }
  ed.addEventListener("keyup", saveRange); ed.addEventListener("mouseup", saveRange); ed.addEventListener("input", saveRange);
  function syncTools() { document.querySelectorAll(".rt[data-cmd]").forEach(function (b) { var on = false; try { on = /bold|italic|underline|List/.test(b.dataset.cmd) && document.queryCommandState(b.dataset.cmd); } catch (e) {} b.classList.toggle("on", on); }); }
  document.addEventListener("selectionchange", function () { if (!$("replyModal").hidden) syncTools(); });
  document.querySelector(".rt-tools").addEventListener("mousedown", function (e) { if (e.target.closest(".rt")) e.preventDefault(); }); // keep the selection in the editor
  document.querySelector(".rt-tools").addEventListener("click", function (e) {
    var b = e.target.closest(".rt[data-cmd]"); if (!b) return;
    ed.focus(); document.execCommand(b.dataset.cmd, false, null);
    if (b.dataset.cmd === "removeFormat") document.execCommand("unlink", false, null);
    syncTools();
  });
  function editLink() {
    ed.focus(); restoreRange();
    var sel = getSelection(), node = sel.anchorNode, a = node && (node.nodeType === 1 ? node : node.parentNode).closest("a");
    var url = prompt("Link address (https://…). Leave empty to remove the link.", a ? a.getAttribute("href") : "https://");
    if (url === null) return;
    url = url.trim();
    if (!url) { if (a) { var r = document.createRange(); r.selectNode(a); sel.removeAllRanges(); sel.addRange(r); } document.execCommand("unlink", false, null); return; }
    var h = okHref(url); if (!h) return fail(new Error("Links must start with https://, http:// or mailto:"));
    if (a) { a.setAttribute("href", h); return; }
    if (sel.isCollapsed) { var t = document.createElement("a"); t.href = h; t.textContent = url; var fr = document.createDocumentFragment(); fr.appendChild(t); insertNode(fr); }
    else document.execCommand("createLink", false, h);
  }
  $("rmLink").addEventListener("click", editLink);
  ed.addEventListener("keydown", function (e) { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); saveRange(); editLink(); } });
  // attachments
  function addFile(f) {
    if (rmFiles.length + ed.querySelectorAll("img").length >= 10) return fail(new Error("At most 10 attachments and images per message."));
    if (usedBytes() + f.size > MAX_BYTES) return fail(new Error("Attachments and images can be 10 MB at most together."));
    rmFiles.push({ name: f.name, type: f.type || "application/octet-stream", size: f.size, file: f }); renderFiles();
  }
  var kb = function (n) { return n < 1048576 ? Math.max(1, Math.round(n / 1024)) + " KB" : (n / 1048576).toFixed(1) + " MB"; };
  function renderFiles() {
    $("rmFiles").innerHTML = rmFiles.map(function (f, i) { return '<span class="chip">📎 ' + esc(f.name) + " · " + kb(f.size) + '<button type="button" data-rmfile="' + i + '" aria-label="Remove ' + esc(f.name) + '">✕</button></span>'; }).join("");
  }
  $("rmFiles").addEventListener("click", function (e) { var b = e.target.closest("button[data-rmfile]"); if (b) { rmFiles.splice(Number(b.dataset.rmfile), 1); renderFiles(); } });
  $("rmAttach").addEventListener("click", function () { saveRange(); $("rmFileInput").click(); });
  $("rmImage").addEventListener("click", function () { saveRange(); $("rmImageInput").click(); });
  $("rmFileInput").addEventListener("change", function () { Array.prototype.forEach.call(this.files, addFile); this.value = ""; });
  $("rmImageInput").addEventListener("change", function () { Array.prototype.forEach.call(this.files, addImage); this.value = ""; });
  function editorHtml() { var box = document.createElement("div"); box.innerHTML = ed.innerHTML; autoLink(box); return box.innerHTML; }
  function closeReply() { $("replyModal").hidden = true; replyTo = null; }
  $("replyList").addEventListener("click", function (e) { var b = e.target.closest("button[data-reply]"); if (b) openReply(b.dataset.reply); });
  $("rmLater").addEventListener("change", syncLater);
  $("rmCancel").addEventListener("click", closeReply);
  $("replyModal").addEventListener("mousedown", function (e) { if (e.target === $("replyModal")) closeReply(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("replyModal").hidden) closeReply(); });
  $("replyForm").addEventListener("submit", function (e) {
    e.preventDefault(); if (!replyTo) return;
    if (!ed.innerText.trim() && !ed.querySelector("img") && !rmFiles.length) return fail(new Error("Write a message first."));
    var body = { email: replyTo, subject: $("rmSubject").value, html: editorHtml(), text: ed.innerText }, later = $("rmLater").checked;
    if (later) {
      var d = new Date($("rmWhen").value); if (isNaN(d)) return fail(new Error("Pick a date and time to send."));
      if (d.getHours() === 0 && d.getMinutes() === 0 && !confirm("That is 12:00 AM (midnight) on " + d.toLocaleDateString() + ". Schedule it for midnight?")) return;
      body.sendAt = d.toISOString();
    }
    $("rmSend").disabled = true;
    Promise.all(rmFiles.map(function (f) { return readFile(f.file).then(function (u) { return { name: f.name, type: f.type, data: u.slice(u.indexOf(",") + 1) }; }); }))
      .then(function (files) { body.files = files; return api("POST", "/api/outreach/reply", body); }).then(function () { toast(later ? "Scheduled for " + new Date(body.sendAt).toLocaleString() : "Reply sent"); closeReply(); refresh(); })
      .catch(fail).then(function () { $("rmSend").disabled = false; });
  });
  function renderScheduled() {
    var items = state.status.scheduled || [];
    $("schedPanel").hidden = !items.length;
    $("schedList").innerHTML = items.map(function (i) {
      var st = i.status === "pending" ? "Waiting · " + new Date(i.sendAt).toLocaleString() : i.status === "sending" ? "Sending…" : i.status === "sent" ? "Sent " + ago(i.sentAt) : "Not sent";
      return '<div class="sched"><div><div class="who">' + esc(i.email) + ' <span class="chip ' + (i.status === "failed" ? "bounced" : i.status === "sent" ? "active" : "") + '">' + esc(st) + '</span></div>' +
        '<div class="meta">' + esc(i.subject) + ((i.files || []).length ? " · 📎 " + esc(i.files.join(", ")) : "") + (i.images ? " · " + i.images + " image" + (i.images > 1 ? "s" : "") : "") + '</div><div class="snip">' + esc(i.text.replace(/\s+/g, " ")) + "</div>" +
        (i.error ? '<div class="bad" style="font-size:13px">' + esc(i.error) + "</div>" : "") + '</div><div class="acts">' +
        (i.status === "pending" ? '<button class="btn sm danger" data-unsched="' + esc(i.id) + '">Cancel</button>' : "") + "</div></div>";
    }).join("");
  }
  $("schedList").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-unsched]"); if (!b || !confirm("Cancel this scheduled message?")) return;
    api("POST", "/api/outreach/scheduled/cancel", { id: b.dataset.unsched }).then(function () { toast("Cancelled"); refresh(); }).catch(fail);
  });
  $("replyList").addEventListener("change", function (e) {
    var em = e.target.getAttribute("data-loom"); if (!em) return;
    api("POST", "/api/outreach/leads/action", { email: em, action: e.target.checked ? "loom_sent" : "loom_unsent" }).then(refresh).catch(fail);
  });

  // ---------------------------------------------------------------- leads
  var STAGE_NAMES = { "": "All leads", waiting: "Waiting to be emailed", sequence: "In sequence", replied: "Replied", interested: "Interested", snoozed: "Out of office (paused)", finished: "Finished the sequence",
    stopped: "Bounced or opted out", aside: "Set aside by the cleaner", clicked: "Clicked a link", highfit: "High fit (7+ of 10)", nocampaign: "In no campaign", referral: "Referred by a reply", held: "Needs your check" };
  function fillSelect(el, groups, allLabel, keep) {
    var html = '<option value="">' + esc(allLabel) + "</option>" + groups.map(function (g) {
      var opts = g.items.map(function (o) { return '<option value="' + esc(g.prefix + o.value) + '">' + esc(o.label || o.value) + (o.count != null ? " (" + o.count + ")" : "") + "</option>"; }).join("");
      return g.label ? (opts ? '<optgroup label="' + esc(g.label) + '">' + opts + "</optgroup>" : "") : opts;
    }).join("");
    el.innerHTML = html; el.value = keep || ""; if (el.value !== (keep || "")) el.value = "";
  }
  function loadFacets() {
    return api("GET", "/api/outreach/leads/facets").then(function (f) {
      var o = f.options || {};
      fillSelect($("leadStage"), [{ label: "", prefix: "", items: Object.keys(STAGE_NAMES).filter(function (k) { return k && (f.stages[k] || k === $("leadStage").value) && (k !== "nocampaign" || f.campaigns); }).map(function (k) { return { value: k, label: STAGE_NAMES[k], count: f.stages[k] }; }) }], STAGE_NAMES[""] + " (" + f.total + ")", $("leadStage").value);
      fillSelect($("leadPlace"), [{ label: "Countries", prefix: "country:", items: o.countries || [] }, { label: "States", prefix: "state:", items: o.states || [] }, { label: "Cities", prefix: "city:", items: o.cities || [] }], "Anywhere", $("leadPlace").value);
      fillSelect($("leadType"), [{ label: "", prefix: "", items: o.types || [] }], "Any business type", $("leadType").value);
    }).catch(function () {});
  }
  function leadFilterActive() { return Boolean($("leadStage").value || $("leadPlace").value || $("leadType").value || $("leadCampaign").value || $("leadSort").value || state.minScore || $("leadQ").value.trim()); }
  function loadLeads() {
    var q = new URLSearchParams({ q: $("leadQ").value, stage: $("leadStage").value, campaign: $("leadCampaign").value, type: $("leadType").value, sort: $("leadSort").value, limit: PAGE, offset: state.leadPage * PAGE });
    var pl = $("leadPlace").value.split(":"); if (pl[0]) q.set(pl[0], pl.slice(1).join(":"));
    if (state.minScore) q.set("minScore", state.minScore);
    $("clearFilters").hidden = !leadFilterActive();
    api("GET", "/api/outreach/leads?" + q).then(function (r) {
      $("leadCount").textContent = r.total + " lead" + (r.total === 1 ? "" : "s") + (leadFilterActive() ? " match" : "") + (state.minScore ? " · fit " + state.minScore + "+" : "");
      $("leadTable").innerHTML = r.rows.length ? "<tr><th>Lead</th><th>Where</th><th>Status</th><th>Progress</th><th>Details</th></tr>" + r.rows.map(function (t) {
        var sent = Number(t.step) || 0, place = [t.city, t.state, t.country].filter(Boolean).join(", ");
        var cname = campName(t.campaign); cname = cname === "–" || cname === "none" ? "" : cname;
        return '<tr><td><div style="font-weight:600">' + esc(t.store || t.domain) + '</div><div class="hint">' + esc(t.email) + "</div></td>" +
          "<td>" + esc(place || "–") + (cname ? '<div class="hint">' + esc(cname) + "</div>" : "") + "</td>" +
          '<td><span class="chip ' + esc(t.status) + '">' + esc(t.status === "skipped-bad-address" ? "set aside" : t.status) + "</span>" + (t.reply_label ? ' <span class="chip lab-' + esc(t.reply_label) + '">' + esc(LABEL[t.reply_label] || t.reply_label) + "</span>" : "") + "</td>" +
          "<td>" + (sent ? "Email " + sent + " of 4" : "Not started") + '<div class="hint">' + esc(t.next || "") + (t.snooze_until && t.status === "active" ? ' <button class="btn sm ghost" data-unsnooze="' + esc(t.email) + '">Resume now</button>' : "") + (t.status === "skipped-bad-address" ? ' <button class="btn sm" data-restore="' + esc(t.email) + '">Restore</button>' : "") + "</div></td>" +
          '<td class="hint">' + [t.ai_score ? '<span title="' + esc(t.ai_score_reason || "") + '">Fit ' + esc(t.ai_score) + "/10</span>" : "", t.clicks ? '<span class="clicked">' + t.clicks + " click" + (t.clicks === 1 ? "" : "s") + "</span>" : "", t.smtp === "catch-all" ? '<span class="warn" title="This domain accepts any address, so the mailbox could not be verified">catch-all</span>' : "", t.mailbox ? esc(t.mailbox) : ""].filter(Boolean).join("<br>") + "</td></tr>";
      }).join("") : '<tr><td class="empty">No leads match.</td></tr>';
      var from = r.total ? state.leadPage * PAGE + 1 : 0;
      $("pgInfo").textContent = from + "–" + Math.min(r.total, (state.leadPage + 1) * PAGE) + " of " + r.total;
      $("prevPg").disabled = state.leadPage === 0; $("nextPg").disabled = (state.leadPage + 1) * PAGE >= r.total;
    }).catch(fail);
  }
  var qT; $("leadQ").addEventListener("input", function () { clearTimeout(qT); qT = setTimeout(function () { state.leadPage = 0; loadLeads(); }, 250); });
  $("leadCampaign").addEventListener("change", function () { state.leadPage = 0; loadLeads(); });
  ["leadStage", "leadPlace", "leadType", "leadSort"].forEach(function (id) { $(id).addEventListener("change", function () { state.leadPage = 0; loadLeads(); }); });
  $("clearFilters").addEventListener("click", function () {
    ["leadStage", "leadPlace", "leadType", "leadCampaign", "leadSort"].forEach(function (id) { $(id).value = ""; }); $("leadQ").value = ""; state.minScore = 0; state.leadPage = 0; loadLeads();
  });
  $("aiFilter").addEventListener("click", function () {
    var qs = $("leadQ").value.trim(); if (!qs) return toast("Type who you want first, for example: roofers in Texas we haven't emailed", true);
    var b = this; b.disabled = true; b.textContent = "Thinking…";
    api("POST", "/api/outreach/ai/filter", { query: qs }).then(function (r) {
      var f = r.filter;
      $("leadStage").value = f.stage; $("leadType").value = f.type; $("leadSort").value = f.sort; $("leadCampaign").value = ""; state.minScore = f.minScore || 0;
      $("leadPlace").value = f.city ? "city:" + f.city : f.state ? "state:" + f.state : f.country ? "country:" + f.country : "";
      $("leadQ").value = f.text || ""; state.leadPage = 0; loadLeads(); toast(f.summary || "Filters set");
    }).catch(fail).then(function () { b.disabled = false; b.textContent = "✨ Ask AI"; });
  });
  $("prevPg").addEventListener("click", function () { state.leadPage--; loadLeads(); });
  $("nextPg").addEventListener("click", function () { state.leadPage++; loadLeads(); });
  $("dncBtn").addEventListener("click", function () {
    var v = prompt("Email address or whole domain (like @example.com) that must never be emailed:");
    if (v) api("POST", "/api/outreach/dnc", { value: v }).then(function () { toast("Added to the never-contact list"); loadLeads(); refresh(); }).catch(fail);
  });
  $("clearAllBtn").addEventListener("click", function () {
    var n = state.status ? state.status.total : 0;
    if (!n) return toast("The lead list is already empty.");
    var typed = prompt("This deletes ALL " + n + " leads and starts you from zero.\n\nKept: your never-contact list, sent history, settings, mailboxes, campaigns and email wording.\nRemoved: every lead and its progress, replies and labels, link-click stats, waiting scheduled replies and search results.\n\nA backup file will download first, so you can undo this with Restore from backup.\n\nType DELETE to continue:");
    if (typed !== "DELETE") return typed === null ? null : toast("Not deleted: you did not type DELETE.", true);
    var btn = this; btn.disabled = true;
    fetch("/api/outreach/backup", { credentials: "same-origin" }).then(function (r) { if (!r.ok) throw new Error("Could not make the backup, so nothing was deleted."); return r.blob(); }).then(function (blob) {
      var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "outreach-backup-before-delete-" + new Date().toISOString().slice(0, 10) + ".json"; document.body.appendChild(a); a.click(); a.remove();
      return new Promise(function (ok) { setTimeout(ok, 600); });
    }).then(function () { return api("POST", "/api/outreach/leads/clear-all", { confirm: "DELETE" }); })
      .then(function (r) { toast("Deleted " + r.removed + " leads. The list is now empty and clean."); state.leadPage = 0; ["leadStage", "leadPlace", "leadType", "leadCampaign", "leadSort"].forEach(function (id) { $(id).value = ""; }); $("leadQ").value = ""; return loadFacets(); })
      .then(function () { loadLeads(); return refresh(); }).catch(fail).then(function () { btn.disabled = false; });
  });
  $("rmBouncedBtn").addEventListener("click", function () {
    if (!confirm("Delete every bounced lead from the list? Their addresses are added to the never-contact list so they can't be emailed again. This can't be undone.")) return;
    api("POST", "/api/outreach/leads/remove-bounced", {}).then(function (r) { toast("Removed " + r.removed + " bounced lead" + (r.removed === 1 ? "" : "s")); state.leadPage = 0; loadLeads(); refresh(); }).catch(fail);
  });
  $("importFile").addEventListener("change", function (e) {
    var f = e.target.files[0]; e.target.value = ""; if (!f) return;
    if (f.size > 8 * 1024 * 1024) return fail(new Error("That file is over 8 MB."));
    var rd = new FileReader();
    rd.onload = function () {
      var bytes = new Uint8Array(rd.result), bin = "", i;
      for (i = 0; i < bytes.length; i += 32768) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768));
      api("POST", "/api/outreach/leads/import-file", { name: f.name, data: btoa(bin) }).then(function (r) {
        toast("Imported " + r.added + " new leads (" + r.existing + " already there, " + r.invalid + " invalid" + (r.cleaned ? ", " + r.cleaned + " bad addresses set aside" : "") + ")"); state.leadPage = 0; loadLeads(); refresh();
      }).catch(fail);
    };
    rd.readAsArrayBuffer(f);
  });

  // ---------------------------------------------------------------- Gemini personalisation
  var aiTimer, aiRows = [];
  $("aiBtn").addEventListener("click", function () { $("aiBox").hidden = !$("aiBox").hidden; if (!$("aiBox").hidden) loadAi(); else clearTimeout(aiTimer); });
  // Never redraw the review table while you are typing in it: only the status area updates.
  function aiEditing() {
    var a = document.activeElement, dirty = false;
    $("aiBody").querySelectorAll("textarea.ai-line").forEach(function (t) { if (t.value !== t.defaultValue) dirty = true; });
    return dirty || Boolean(a && a.classList && a.classList.contains("ai-line"));
  }
  function loadAi() {
    clearTimeout(aiTimer);
    Promise.all([api("GET", "/api/outreach/leads/research/status"), api("GET", "/api/outreach/leads/research/pending?limit=50")]).then(function (r) {
      renderAi(r[0], r[1].rows, aiEditing());
      if (r[0].job.running && !$("aiBox").hidden) aiTimer = setTimeout(loadAi, 2500);
    }).catch(fail);
  }
  function renderAi(s, rows, keepTable) {
    var c = s.counts, j = s.job, html = "";
    if (!$("aiHead")) $("aiBody").innerHTML = '<div id="aiHead"></div><div id="aiTable"></div><p class="hint" style="margin-top:10px">Only approved lines go into emails (as <code>{custom_line_para}</code> in email 1; blank means the normal email). Check each against the store’s site: Gemini can be wrong. You can also add your own lines in a spreadsheet column named “first line”.</p>';
    if (!s.configured) {
      $("aiHead").innerHTML = '<p class="warn">Gemini is not set up yet.</p><p class="hint">Create a free key in Google AI Studio, then in Hostinger add an environment variable named <code>GEMINI_OUTREACH_KEY</code> with that key as its value, and restart the app. Never paste the key anywhere else.</p>';
      $("aiTable").innerHTML = ""; return;
    }
    if (s.sharedKey) html += '<p class="warn">This is using your website chat key, so research shares its daily quota. Add a separate <code>GEMINI_OUTREACH_KEY</code> to protect the chat widget.</p>';
    html += '<p class="hint">' + c.waiting + " waiting for research · " + c.pending + " to review · " + c.approved + " approved · " + c.rejected + " rejected · " + c.failed + " had no reliable detail · used today " + s.usedToday + " of " + s.dailyCap + "</p>";
    if (j.running) {
      html += '<p><b>Researching</b> “' + esc(j.current) + "” (" + j.done + " of " + j.total + ') <button class="btn sm danger" data-ai-stop="1">Stop</button></p>';
    } else {
      html += (j.message ? '<p class="hint">' + esc(j.message) + "</p>" : "") +
        '<div class="toolbar"><select id="aiLimit"><option>10</option><option selected>25</option><option>50</option><option>100</option></select><button class="btn primary sm" id="aiStart"' + (c.waiting || c.failed ? "" : " disabled") + '>Research next leads</button>' +
        '<label class="check" style="font-size:13px"><input type="checkbox" id="aiRetry"> also retry ones that found nothing</label></div>';
    }
    if (keepTable) html += '<p class="hint">You are editing a line, so the list below is paused. It refreshes when you approve or reject that line.</p>';
    $("aiHead").innerHTML = html;
    if (keepTable) return;
    aiRows = rows;
    var high = rows.filter(function (r) { return r.conf === "high"; }).length;
    $("aiTable").innerHTML = rows.length ? '<div class="toolbar" style="margin-top:6px"><b>' + c.pending + ' suggestions to review</b><span style="flex:1"></span>' + (high ? '<button class="btn sm" data-ai-all="1">Approve the ' + high + " high-confidence shown</button>" : "") + "</div>" +
      '<div class="scroll" style="max-height:420px;overflow:auto"><table><tr><th>Store</th><th>Suggested line (you can edit it)</th><th>Source</th><th>Confidence</th><th></th></tr>' + rows.map(function (r) {
        return "<tr><td>" + esc(r.store || r.domain) + '<div class="hint">' + esc(r.email) + "</div></td><td><textarea class='ai-line' rows='3' maxlength='240' data-line='" + esc(r.email) + "'>" + esc(r.line) + "</textarea></td><td>" +
          (r.source ? '<a href="' + esc(r.source) + '" target="_blank" rel="noopener noreferrer">page</a>' : "–") + '</td><td><span class="chip ' + esc(r.conf) + '">' + esc(r.conf) + '</span></td><td style="white-space:nowrap"><button class="btn primary sm" data-ai="approve" data-email="' + esc(r.email) + '">Approve</button> <button class="btn sm" data-ai="reject" data-email="' + esc(r.email) + '">Reject</button></td></tr>';
      }).join("") + "</table></div>" : "";
  }
  $("aiBody").addEventListener("click", function (e) {
    var t = e.target;
    if (t.id === "aiStart") {
      api("POST", "/api/outreach/leads/research/start", { limit: Number($("aiLimit").value), retryFailed: Boolean($("aiRetry") && $("aiRetry").checked) }).then(function () { toast("Research started"); loadAi(); }).catch(fail);
    } else if (t.getAttribute("data-ai-stop")) {
      api("POST", "/api/outreach/leads/research/stop", {}).then(function () { toast("Stopping after the current store…"); loadAi(); }).catch(fail);
    } else if (t.getAttribute("data-ai-all")) {
      // Only the high-confidence lines currently on screen, exactly as shown, and only the ones you have not edited.
      var items = aiRows.filter(function (r) {
        var box = $("aiBody").querySelector('textarea[data-line="' + CSS.escape(r.email) + '"]');
        return r.conf === "high" && box && box.value === r.line;
      }).map(function (r) { return { email: r.email, line: r.line }; });
      api("POST", "/api/outreach/leads/research/approve-shown", { items: items }).then(function (r) { toast("Approved " + r.approved + " lines"); loadAi(); }).catch(fail);
    } else if (t.getAttribute("data-ai")) {
      var email = t.dataset.email, box = $("aiBody").querySelector('textarea[data-line="' + CSS.escape(email) + '"]');
      api("POST", "/api/outreach/leads/research/review", { email: email, action: t.dataset.ai, line: box ? box.value : undefined }).then(function () { toast(t.dataset.ai === "approve" ? "Approved" : "Rejected"); var row = t.closest("tr"); if (row) row.remove(); aiRows = aiRows.filter(function (r) { return r.email !== email; }); loadAi(); }).catch(function (e2) { fail(e2); });
    }
  });

  // ---------------------------------------------------------------- list cleaner
  var KIND = { syntax: "invalid address", junk: "scraped junk", disposable: "throwaway domain", typo: "typo", system: "system address", placeholder: "placeholder", "no-mail-server": "domain can't receive mail", "smtp-invalid": "mailbox doesn't exist", role: "shared mailbox" };
  var cleanTimer;
  $("cleanBtn").addEventListener("click", function () {
    $("cleanBox").hidden = false; $("cleanBody").innerHTML = '<p class="hint">Starting…</p>';
    api("POST", "/api/outreach/leads/clean/start", { smtp: $("smtpChk").checked }).then(pollClean).catch(function (e) { if (/already/i.test(e.message)) pollClean(); else { fail(e); $("cleanBox").hidden = true; } });
  });
  function pollClean() {
    clearTimeout(cleanTimer);
    api("GET", "/api/outreach/leads/clean/status").then(function (s) {
      if (s.running) { $("cleanBody").innerHTML = '<p class="hint">' + esc(s.phase) + (s.total ? " (" + s.done + " of " + s.total + ")" : "") + "…</p>"; cleanTimer = setTimeout(pollClean, 1000); return; }
      if (s.error) { $("cleanBody").innerHTML = '<p class="bad">The scan failed: ' + esc(s.error) + "</p>"; return; }
      if (s.result) showClean(s.result);
    }).catch(fail);
  }
  function showClean(r) {
    var already = state.status && state.status.byStatus ? state.status.byStatus["skipped-bad-address"] || 0 : 0;
    var c = r.counts, kinds = Object.keys(c.byKind).map(function (k) { return c.byKind[k] + " " + (KIND[k] || k); }).join(", ");
    if (!c.total) { $("cleanBody").innerHTML = '<p class="hint">No leads are waiting to be emailed, so there is nothing to clean. Import leads first.</p><button class="btn sm" id="cleanClose">Close</button>'; return; }
    $("cleanBody").innerHTML = '<p><b>' + c.total + "</b> leads are waiting. <span class='ok'>" + c.ok + " look fine.</span></p>" +
      (c.smtpInvalid !== undefined ? '<p class="hint">SMTP check: ' + c.smtpInvalid + " mailbox" + (c.smtpInvalid === 1 ? "" : "es") + " do not exist; " + c.catchAll + " domain" + (c.catchAll === 1 ? " is a catch-all" : "s are catch-alls") + " (kept, marked). Mail servers that would not answer count as unknown and are left alone.</p>" : "") +
      (already ? '<p class="hint">' + already + " more were already set aside when you imported (filter the list by “skipped-bad-address” to see them).</p>" : "") +
      "<p>" + (c.remove ? '<span class="bad">' + c.remove + " will be skipped</span> (" + esc(kinds) + ")" : "<span class='ok'>No bad addresses found.</span>") + "</p>" +
      (c.role ? '<p><span class="warn">' + c.role + ' shared mailboxes</span> (info@, sales@ …) are kept unless you tick: <label class="check" style="display:inline-flex;margin-left:6px"><input type="checkbox" id="skipRoles"> skip these too</label></p>' : "") +
      (r.items.length ? '<div class="scroll" style="max-height:260px;overflow:auto"><table><tr><th>Email</th><th>Store</th><th>Finding</th><th>Result</th></tr>' + r.items.slice(0, 150).map(function (i) {
        return "<tr><td>" + esc(i.email) + "</td><td>" + esc(i.store) + "</td><td class='hint'>" + esc(i.reason) + "</td><td>" + (i.action === "remove" ? '<span class="bad">skip</span>' : '<span class="warn">keep (unless ticked)</span>') + "</td></tr>";
      }).join("") + "</table></div>" + (r.items.length > 150 ? '<p class="hint">Showing 150 of ' + r.items.length + ".</p>" : "") : "") +
      '<p class="hint" style="margin-top:10px">Nothing has changed yet. Skipped leads stay in the list and can be restored one by one. This catches typos, throwaway and junk addresses and dead domains; it cannot prove a particular inbox exists, so keep an eye on bounces.</p>' +
      '<div class="toolbar" style="margin:10px 0 0"><button class="btn primary sm" id="cleanApply"' + (c.remove || c.role ? "" : " disabled") + '>Apply cleaning</button><button class="btn sm" id="cleanClose">Close</button></div>';
  }
  $("cleanBody").addEventListener("click", function (e) {
    if (e.target.id === "cleanClose") $("cleanBox").hidden = true;
    if (e.target.id === "cleanApply") {
      e.target.disabled = true;
      api("POST", "/api/outreach/leads/clean/apply", { skipRoles: Boolean($("skipRoles") && $("skipRoles").checked) }).then(function (r) {
        toast("Done: " + (r.skipped + r.roleSkipped) + " leads skipped"); $("cleanBox").hidden = true; loadLeads(); refresh();
      }).catch(fail);
    }
  });
  $("leadTable").addEventListener("click", function (e) {
    var em = e.target.getAttribute("data-restore"); if (!em) return;
    api("POST", "/api/outreach/leads/action", { email: em, action: "restore" }).then(function () { toast("Restored"); loadLeads(); refresh(); }).catch(fail);
  });
  $("overnightPk").addEventListener("click", function () {
    $("x_tz").value = "Asia/Karachi"; $("x_win").checked = true; $("x_wstart").value = "19:00"; $("x_wend").value = "07:00";
    toast("Set to 7pm–7am Pakistan time. Click Save settings to keep it.");
  });
  // ---- sending presets (plain-language choices that fill the detailed fields)
  var PRESETS = {
    careful: { ramp: "5,10,15,20", limit: 20, days: "Mon,Tue,Wed,Thu,Fri", min: 600, max: 1200 },
    standard: { ramp: "10,20,30,40", limit: 40, days: "Mon,Tue,Wed,Thu,Fri", min: 600, max: 1200 },
    nonstop: { ramp: "25,50,75,100", limit: 100, days: "Mon,Tue,Wed,Thu,Fri,Sat,Sun", min: 900, max: 1200, noWindow: true }
  };
  var compact = function (v) { return String(v).replace(/\s+/g, "").toLowerCase(); };
  function currentPreset() {
    return Object.keys(PRESETS).filter(function (k) {
      var p = PRESETS[k];
      return compact($("x_ramp").value) === compact(p.ramp) && Number($("x_limit").value) === p.limit && compact($("x_days").value) === compact(p.days) &&
        Number($("x_min").value) === p.min && Number($("x_max").value) === p.max && (!p.noWindow || !$("x_win").checked);
    })[0] || "";
  }
  function markPreset() { var cur = currentPreset(); [].forEach.call($("presets").children, function (b) { b.classList.toggle("on", b.dataset.preset === cur); }); }
  $("presets").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-preset]"); if (!b) return;
    var p = PRESETS[b.dataset.preset];
    $("x_ramp").value = p.ramp; $("x_limit").value = p.limit; $("x_days").value = p.days; $("x_min").value = p.min; $("x_max").value = p.max; $("x_bounce").value = 3;
    if (p.noWindow) $("x_win").checked = false;
    markDirty();
  });
  function updateEstimate() {
    var n = [].filter.call($("mbList").querySelectorAll(".mb"), function (el) { return el.querySelector('[data-k="email"]').value.trim() && el.querySelector('[data-k="enabled"]').checked; }).length;
    var ramp = $("x_ramp").value.split(",").map(Number).filter(function (x) { return x > 0; }), lim = Number($("x_limit").value) || 0;
    var first = Math.min(ramp[0] || 0, lim), last = Math.min(ramp[ramp.length - 1] || 0, lim);
    var gaps = $("x_gaps").value.split(",").map(Number).filter(function (x) { return x > 0; }).reduce(function (a, b) { return a + b; }, 0);
    $("estimate").innerHTML = !n ? "Add a mailbox to start sending." : "With <b>" + n + " mailbox" + (n === 1 ? "" : "es") + "</b> you start at about <b>" + (first * n) + " emails a day</b> and reach up to <b>" + (last * n) + " a day</b> once warmed up. A lead's four emails are spread over about <b>" + (gaps + 1) + " days</b>.";
  }

  // ---------------------------------------------------------------- templates
  var FIELD_LABELS = [["greeting", "Hi Name,"], ["custom_line_para", "Personal line"], ["store", "Business name"], ["domain", "Website"], ["category", "Business type"], ["sender_first_name", "Your first name"], ["company", "Your company"]];
  function tplLabel(t) {
    var g = (state.gaps || [])[t.step - 2];
    return "Email " + t.step + (t.step === 1 ? " · first email" + (t.variant !== "a" ? " (version " + t.variant.toUpperCase() + ")" : "") : g ? " · " + g + " day" + (g === 1 ? "" : "s") + " later" : " · follow-up");
  }
  function loadTemplates() {
    $("tplCampaign").value = state.tplCampaign || "";
    return api("GET", "/api/outreach/templates" + (state.tplCampaign ? "?campaign=" + encodeURIComponent(state.tplCampaign) : "")).then(function (r) {
      state.templates = r.templates; state.fields = r.fields; state.gaps = r.gaps;
      if (!state.tpl || !r.templates.some(function (t) { return t.name === state.tpl; })) state.tpl = r.templates[0] && r.templates[0].name;
      $("fieldChips").innerHTML = '<span class="hint">Insert:</span>' + FIELD_LABELS.filter(function (f) { return r.fields.indexOf(f[0]) >= 0; }).map(function (f) { return '<span class="chip field-chip" data-f="' + f[0] + '" title="Inserts {' + f[0] + '}">' + f[1] + "</span>"; }).join("");
      renderTplList(); selectTpl(state.tpl); prefillWriter();
      if (state.openWriter) { state.openWriter = false; $("writerBox").open = true; }
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
  // ---- Gemini: improve one email, or write the whole sequence
  var aiOn = function () { return Boolean(state.status && state.status.ai && state.status.ai.configured); };
  $("tplImproveBtn").addEventListener("click", function () {
    if (!aiOn()) return fail(new Error("Connect Gemini first (Settings, AI & automation)."));
    var b = this, step = Number((state.tpl || "email1.txt")[5]) || 1; b.disabled = true; b.textContent = "Improving…";
    var before = $("tplText").value;
    api("POST", "/api/outreach/ai/rewrite", { text: before, instruction: $("tplImprove").value, step: step }).then(function (r) {
      state.prevText = before; $("tplText").value = r.text; $("tplUndo").hidden = false; previewTpl(); toast("Rewritten. Read it, then Save.");
    }).catch(fail).then(function () { b.disabled = false; b.textContent = "✨ Improve with AI"; });
  });
  $("tplUndo").addEventListener("click", function () { if (state.prevText != null) { $("tplText").value = state.prevText; state.prevText = null; $("tplUndo").hidden = true; previewTpl(); } });
  function prefillWriter() {
    var c = camps().filter(function (x) { return String(x.id) === String(state.tplCampaign); })[0];
    if (c && !$("wBrief").value.trim()) $("wBrief").value = (c.types.length ? c.types.join(", ") + " businesses" : c.name) + ([].concat(c.states, c.cities, c.countries).length ? " in " + [].concat(c.cities, c.states, c.countries).join(", ") : "") + ". We offer: ";
  }
  $("wGo").addEventListener("click", function () {
    if (!aiOn()) return fail(new Error("Connect Gemini first (Settings, AI & automation)."));
    var b = this, brief = $("wBrief").value.trim(); if (brief.length < 10) return fail(new Error("Describe who you are writing to and what you offer."));
    b.disabled = true; $("wMsg").textContent = "Writing… about 15 seconds."; $("wOut").innerHTML = "";
    api("POST", "/api/outreach/ai/templates", { brief: brief, tone: $("wTone").value, campaign: state.tplCampaign || undefined }).then(function (r) {
      state.drafts = r.emails; $("wMsg").textContent = r.errors.length ? "Some emails were rejected by the safety checks: " + r.errors.join("; ") : "";
      $("wOut").innerHTML = (r.emails.length ? '<div class="toolbar"><button class="btn primary sm" id="wSave" type="button">Save these ' + r.emails.length + " emails for " + esc(state.tplCampaign ? campName(state.tplCampaign) : "everyone") + '</button><span class="hint">Nothing is saved until you press this. You can also edit one first.</span></div>' : "") +
        r.emails.map(function (e) {
          var ck = e.check || { score: 0, issues: [] };
          return '<div class="panel" style="margin-bottom:10px"><h3>Email ' + e.step + " · " + esc(e.subject) + ' <span class="chip ' + (ck.score >= 8 ? "okc" : ck.score >= 5 ? "warnc" : "badc") + '">copy score ' + ck.score + '/10</span><small>' + e.words + ' words</small><button class="btn sm" data-wedit="' + e.step + '" type="button" style="margin-left:auto">Edit this one</button></h3><div class="hint" style="white-space:pre-wrap;color:var(--text)">' + esc(e.preview) + "</div>" +
            (ck.issues.length ? '<ul style="margin:8px 0 0 18px" class="hint">' + ck.issues.map(function (i) { return "<li>" + esc(i.text) + "</li>"; }).join("") + "</ul>" : "") + "</div>";
        }).join("");
    }).catch(fail).then(function () { b.disabled = false; });
  });
  $("wOut").addEventListener("click", function (e) {
    var ed = e.target.closest("[data-wedit]"), sv = e.target.closest("#wSave");
    if (ed) { var d = (state.drafts || []).filter(function (x) { return x.step === Number(ed.dataset.wedit); })[0]; if (d) { selectTpl("email" + d.step + ".txt"); $("tplText").value = d.text; previewTpl(); window.scrollTo(0, $("tplText").getBoundingClientRect().top + window.scrollY - 120); toast("Loaded into the editor. Press Save to keep it."); } }
    if (sv) {
      if (!confirm("Save these emails" + (state.tplCampaign ? " for " + campName(state.tplCampaign) : " as your default emails") + "? They replace the current wording for steps 1 to " + state.drafts.length + ".")) return;
      sv.disabled = true;
      state.drafts.reduce(function (p, d) { return p.then(function () { return api("PUT", "/api/outreach/templates", { name: "email" + d.step + ".txt", text: d.text, campaign: state.tplCampaign || undefined }); }); }, Promise.resolve())
        .then(function () { toast("Saved " + state.drafts.length + " emails"); $("wOut").innerHTML = ""; $("wMsg").textContent = ""; return loadTemplates(); }).then(refresh).catch(fail);
    }
  });
  $("pvDesk").addEventListener("click", function () { $("pvFrame").style.width = "100%"; $("pvDesk").className = "on"; $("pvPhone").className = ""; });
  $("pvPhone").addEventListener("click", function () { $("pvFrame").style.width = "375px"; $("pvFrame").style.display = "block"; $("pvFrame").style.margin = "0 auto"; $("pvPhone").className = "on"; $("pvDesk").className = ""; });
  $("tplCampaign").addEventListener("change", function () { state.tplCampaign = this.value; state.tpl = null; loadTemplates(); });
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
    api("PUT", "/api/outreach/templates", { name: state.tpl, text: $("tplText").value, campaign: state.tplCampaign || undefined }).then(function () { toast("Saved"); return loadTemplates(); }).catch(fail);
  });
  $("tplReset").addEventListener("click", function () {
    if (!confirm("Discard your edits and go back to the default text?")) return;
    api("DELETE", "/api/outreach/templates?name=" + encodeURIComponent(state.tpl) + (state.tplCampaign ? "&campaign=" + encodeURIComponent(state.tplCampaign) : ""), {}).then(function () { toast("Reset"); return loadTemplates(); }).catch(fail);
  });
  $("queueBtn").addEventListener("click", function () {
    api("GET", "/api/outreach/preview?n=3").then(function (r) {
      $("queuePv").innerHTML = r.emails.length ? r.emails.map(function (m) {
        return '<div style="margin-bottom:16px"><div class="hint">To ' + esc(m.to) + " · from " + esc(m.from) + " · email " + m.step + (m.step === 1 ? " version " + esc(m.variant.toUpperCase()) : "") + '</div><p style="font-weight:600;margin:4px 0">' + esc(m.subject) + '</p><iframe class="preview" style="height:300px" sandbox="" srcdoc="' + esc(m.html) + '"></iframe></div>';
      }).join("") : '<p class="empty">No emails waiting.</p>';
    }).catch(fail);
  });

  // ---------------------------------------------------------------- settings
  function mbBlock(m) {
    m = m || {};
    var live = ((state.status && state.status.mailboxes) || []).filter(function (x) { return x.id === m.id; })[0];
    var pw = m.id ? (live && live.passwordSet ? '<span class="chip okc">Password set</span>' : '<span class="chip warnc">Password missing</span> Set <code>OUTREACH_PASSWORD_' + esc(m.id) + "</code> in Hostinger.") : '<span class="hint">Save first: the password variable name will appear here.</span>';
    return '<div class="mb" data-id="' + esc(m.id || "") + '"><div class="mb-head"><span>' + esc(m.email || "New mailbox") + '</span><label class="check"><input type="checkbox" data-k="enabled"' + (m.enabled === false ? "" : " checked") + '> On</label><button type="button" class="btn sm danger" data-rm="1">Remove</button></div>' +
      '<div class="row"><div class="field"><label>Email address</label><input type="email" data-k="email" value="' + esc(m.email || "") + '" placeholder="name@yourdomain.com"></div>' +
      '<div class="field"><label>Sender name</label><input type="text" data-k="from_name" value="' + esc(m.from_name || "") + '"></div>' +
      '<div class="field"><label>Job title <span class="hint" style="display:inline">(optional)</span></label><input type="text" data-k="title" value="' + esc(m.title || "") + '" maxlength="100"></div></div>' +
      '<div class="hint" style="margin-bottom:8px">' + pw + "</div>" +
      '<details class="adv"><summary>Server settings</summary><div class="row" style="margin-top:10px"><div class="field"><label>SMTP host / port</label><div style="display:flex;gap:8px"><input type="text" data-k="smtp_host" value="' + esc(m.smtp_host || "smtp.hostinger.com") + '"><input type="number" data-k="smtp_port" value="' + esc(m.smtp_port || 465) + '" style="width:90px"></div></div>' +
      '<div class="field"><label>IMAP host / port</label><div style="display:flex;gap:8px"><input type="text" data-k="imap_host" value="' + esc(m.imap_host || "imap.hostinger.com") + '"><input type="number" data-k="imap_port" value="' + esc(m.imap_port || 993) + '" style="width:90px"></div></div></div></details></div>';
  }
  function loadSettings() {
    api("GET", "/api/outreach/config").then(function (r) {
      var c = state.config = r.config, g = c.signature, s = c.sending;
      $("s_name").value = g.name; $("s_title").value = g.title; $("s_company").value = g.company; $("s_website").value = g.website; $("s_postal").value = g.postal_address; $("s_accent").value = g.accent_color; $("s_logo").checked = g.logo !== false;
      $("x_notify").value = s.notify_email; $("x_days").value = s.send_days.join(","); $("x_tz").value = s.timezone; $("x_countries").value = s.countries.join(",");
      $("x_ramp").value = s.ramp.join(","); $("x_limit").value = s.daily_limit; $("x_gaps").value = s.followup_gaps_days.join(","); $("x_bounce").value = s.bounce_pause_percent;
      $("x_win").checked = s.window_enabled; $("x_wstart").value = s.window_start; $("x_wend").value = s.window_end; $("x_min").value = s.min_delay_seconds; $("x_max").value = s.max_delay_seconds; $("x_html").checked = s.html_emails; $("x_mx").checked = s.check_mx; $("x_auto").checked = s.auto_run !== false; $("x_track").checked = s.track_clicks !== false;
      $("mbList").innerHTML = c.mailboxes.map(mbBlock).join("");
      var a = c.ai || {}, w = c.warmup || {};
      $("a_icp").value = a.icp || ""; $("a_book").value = a.booking_link || ""; $("a_offer").value = a.offer || ""; $("a_min").value = a.min_score || 0; $("a_hook").value = a.webhook_url || "";
      $("a_classify").checked = a.classify_replies !== false; $("a_draft").checked = a.draft_replies !== false; $("a_prio").checked = a.prioritise_by_score !== false;
      $("w_on").checked = !!w.enabled; $("w_per").value = w.per_day || 4; $("w_reply").value = w.reply_percent == null ? 60 : w.reply_percent;
      state.dirty = false; $("saveBar").hidden = true; markPreset(); updateEstimate(); updateAiChip();
    }).catch(fail);
  }
  function updateAiChip() { var a = state.status && state.status.ai, on = a && a.configured; $("aiChip").textContent = on ? "Connected" : "Not connected"; $("aiChip").className = "chip " + (on ? "okc" : "warnc"); }

  // ---- settings tabs, unsaved changes
  function showSettingsTab(name) {
    state.stab = name;
    document.querySelectorAll("[data-spane]").forEach(function (el) { el.hidden = el.dataset.spane !== name; });
    document.querySelectorAll("#setTabs button").forEach(function (b) { b.classList.toggle("on", b.dataset.stab === name); });
    $("saveBar").hidden = !state.dirty || name === "checks";
  }
  $("setTabs").addEventListener("click", function (e) { var b = e.target.closest("button[data-stab]"); if (b) showSettingsTab(b.dataset.stab); });
  function markDirty() { state.dirty = true; $("saveBar").hidden = state.stab === "checks"; markPreset(); updateEstimate(); }
  $("settingsForm").addEventListener("input", markDirty);
  $("settingsForm").addEventListener("change", markDirty);
  $("discardBtn").addEventListener("click", function () { loadSettings(); toast("Changes discarded"); });
  $("addMb").addEventListener("click", function () { var n = $("mbList").children.length; if (n >= 10) return; $("mbList").insertAdjacentHTML("beforeend", mbBlock(null)); markDirty(); });
  $("mbList").addEventListener("click", function (e) { if (e.target.getAttribute("data-rm")) { e.target.closest(".mb").remove(); markDirty(); } }); // ids are permanent: never renumber
  $("settingsForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var boxes = [].map.call($("mbList").children, function (el) {
      var m = { id: el.dataset.id ? Number(el.dataset.id) : undefined }; el.querySelectorAll("[data-k]").forEach(function (i) { m[i.dataset.k] = i.type === "checkbox" ? i.checked : i.value; }); return m;
    }).filter(function (m) { return m.email.trim(); });
    var body = {
      signature: { name: $("s_name").value, title: $("s_title").value, company: $("s_company").value, website: $("s_website").value, postal_address: $("s_postal").value, accent_color: $("s_accent").value, logo: $("s_logo").checked },
      sending: { notify_email: $("x_notify").value, send_days: $("x_days").value, timezone: $("x_tz").value, countries: $("x_countries").value, ramp: $("x_ramp").value, daily_limit: $("x_limit").value,
        followup_gaps_days: $("x_gaps").value, bounce_pause_percent: $("x_bounce").value, min_delay_seconds: $("x_min").value, max_delay_seconds: $("x_max").value,
        window_enabled: $("x_win").checked, window_start: $("x_wstart").value, window_end: $("x_wend").value, html_emails: $("x_html").checked, check_mx: $("x_mx").checked, dry_run: state.config ? state.config.sending.dry_run : true, auto_run: $("x_auto").checked, track_clicks: $("x_track").checked, check_inbox_in_dry_run: state.config ? state.config.sending.check_inbox_in_dry_run : false },
      mailboxes: boxes,
      ai: { icp: $("a_icp").value, booking_link: $("a_book").value, offer: $("a_offer").value, min_score: $("a_min").value, webhook_url: $("a_hook").value, classify_replies: $("a_classify").checked, draft_replies: $("a_draft").checked, prioritise_by_score: $("a_prio").checked },
      warmup: { enabled: $("w_on").checked, per_day: $("w_per").value, reply_percent: $("w_reply").value }
    };
    api("PUT", "/api/outreach/config", body).then(function (r) { state.config = r.config; toast("Settings saved"); state.dirty = false; loadSettings(); refresh(); }).catch(fail);
  });

  // ---------------------------------------------------------------- lead finder (free map data + public websites)
  var fTimer;
  var safeHref = function (u) { return /^https?:\/\//i.test(u) ? u : /^[a-z0-9.-]+\.[a-z]{2,}/i.test(u) ? "https://" + u : ""; };
  $("findBtn").addEventListener("click", function () { $("finderBox").hidden = !$("finderBox").hidden; if (!$("finderBox").hidden) pollFinder(true); else clearTimeout(fTimer); });
  function pollFinder(first) {
    clearTimeout(fTimer);
    api("GET", "/api/outreach/finder/status").then(function (s) {
      if (first && !$("fTypes").children.length) $("fTypes").innerHTML = s.types.map(function (t) { return '<option value="' + esc(t) + '">'; }).join("") + (s.gemini ? "" : "");
      var j = s.job, u = s.usage;
      $("fGo").disabled = j.running; $("fStop").hidden = !j.running; $("fBar").hidden = !j.running;
      if (j.running) {
        $("fBarIn").style.width = (j.total ? Math.round(100 * j.done / j.total) : 8) + "%";
        $("fMsg").textContent = (j.phase || "Working") + (j.total ? " (" + j.done + " of " + j.total + ", " + j.withEmail + " emails so far)" : "…");
        fTimer = setTimeout(pollFinder, 1500); return;
      }
      $("fMsg").innerHTML = esc(j.message || "") + ' <span class="hint">Websites read today: ' + u.sites + " of " + u.sitesMax + " · searches: " + u.searches + " of " + u.searchesMax + (s.gemini ? "" : " · connect Gemini to search business types that are not in the list") + "</span>";
      if (s.results) loadFinderResults(); else if (first) $("fBody").innerHTML = "";
    }).catch(fail);
  }
  $("fGo").addEventListener("click", function () {
    var type = $("fType").value.trim(), place = $("fPlace").value.trim();
    if (!type || !place) return fail(new Error("Enter a business type and a place, for example roofing contractor in Austin, TX."));
    $("fBody").innerHTML = ""; $("fGo").disabled = true;
    api("POST", "/api/outreach/finder/search", { type: type, place: place, limit: Number($("fLimit").value) }).then(function () { pollFinder(); }).catch(function (e) { fail(e); $("fGo").disabled = false; });
  });
  $("fTest").addEventListener("click", function () {
    var b = this; b.disabled = true; $("fMsg").textContent = "Testing the connection from your server…";
    api("GET", "/api/outreach/finder/diagnose").then(function (r) {
      $("fBody").innerHTML = '<div class="panel" style="margin:10px 0 0"><h3>Connection test</h3><table>' + r.steps.map(function (s) {
        return "<tr><td style='width:28px'>" + (s.ok ? '<span class="ok">✓</span>' : '<span class="bad">✗</span>') + "</td><td>" + esc(s.step) + '</td><td class="' + (s.ok ? "hint" : "bad") + '">' + esc(s.detail) + "</td><td class='hint'>" + s.ms + " ms</td></tr>";
      }).join("") + "</table></div>";
      var bad = r.steps.filter(function (s) { return !s.ok; })[0];
      $("fMsg").textContent = bad ? "Problem found at: " + bad.step : "Everything works. You can search.";
    }).catch(fail).then(function () { b.disabled = false; });
  });
  $("fStop").addEventListener("click", function () { api("POST", "/api/outreach/finder/stop", {}).then(function () { toast("Stopping…"); pollFinder(); }).catch(fail); });
  function loadFinderResults() {
    api("GET", "/api/outreach/finder/results").then(function (r) {
      var res = r.results; if (!res) { $("fBody").innerHTML = ""; return; }
      var items = res.items, usable = items.filter(function (c) { return c.usable && !c.imported; });
      var rows = items.map(function (c) {
        var can = c.usable && !c.imported, site = safeHref(c.website);
        return "<tr" + (can ? "" : ' style="opacity:.6"') + '><td><input type="checkbox" data-fid="' + esc(c.id) + '"' + (can ? " checked" : " disabled") + '></td><td><div style="font-weight:600">' + esc(c.name) + '</div><div class="hint">' + esc(c.address || [c.city, c.state].filter(Boolean).join(", ")) + "</div></td><td>" +
          (c.email ? esc(c.email) + '<div class="hint">' + (c.emailSource === "website" ? "found on their website" : "listed on the map") + (c.role ? " · shared mailbox" : "") + (c.free ? " · free mail" : "") + "</div>" : '<span class="hint">no email</span>') + "</td><td>" +
          (site ? '<a href="' + esc(site) + '" target="_blank" rel="noopener noreferrer">' + esc(c.domain || "site") + "</a>" : "–") + '</td><td class="hint">' + (c.imported ? '<span class="ok">imported</span>' : esc(can ? "" : c.reason || "")) + "</td></tr>";
      }).join("");
      $("fBody").innerHTML = '<div class="hint" style="margin:8px 0">' + esc(res.query.type) + " in " + esc(res.query.place) + ": <b>" + items.length + "</b> businesses, <b>" + usable.length + "</b> with a usable email to import.</div>" +
        '<div class="scroll" style="max-height:420px;overflow:auto"><table><tr><th></th><th>Business</th><th>Email</th><th>Website</th><th>Note</th></tr>' + rows + "</table></div>" +
        '<div class="toolbar" style="margin:12px 0 0"><button class="btn primary sm" id="fImport"' + (usable.length ? "" : " disabled") + '>Import selected</button><button class="btn sm" id="fAll" type="button">Select all usable</button><button class="btn ghost sm" id="fNone" type="button">Select none</button><button class="btn ghost sm" id="fClear" type="button">Clear results</button><span class="hint">Imported leads go through the list cleaner and your country rules, then into the campaign that fits them.</span></div>';
    }).catch(fail);
  }
  $("fBody").addEventListener("click", function (e) {
    var boxes = function () { return $("fBody").querySelectorAll("input[data-fid]:not(:disabled)"); };
    if (e.target.id === "fAll") boxes().forEach(function (b) { b.checked = true; });
    if (e.target.id === "fNone") boxes().forEach(function (b) { b.checked = false; });
    if (e.target.id === "fClear") api("POST", "/api/outreach/finder/clear", {}).then(function () { $("fBody").innerHTML = ""; $("fMsg").textContent = ""; }).catch(fail);
    if (e.target.id === "fImport") {
      var ids = [].map.call($("fBody").querySelectorAll("input[data-fid]:checked"), function (b) { return b.dataset.fid; });
      if (!ids.length) return fail(new Error("Tick at least one business."));
      e.target.disabled = true;
      api("POST", "/api/outreach/finder/import", { ids: ids }).then(function (r) { toast("Added " + r.added + " lead" + (r.added === 1 ? "" : "s") + (r.cleaned ? " (" + r.cleaned + " set aside by the cleaner)" : "")); state.leadPage = 0; return loadFacets(); })
        .then(function () { loadLeads(); loadFinderResults(); refresh(); }).catch(function (err) { fail(err); e.target.disabled = false; });
    }
  });

  // ---------------------------------------------------------------- campaigns
  var camps = function () { return (state.status && state.status.campaigns) || []; };
  function campName(id) { if (!id) return camps().length ? "none" : "–"; var c = camps().filter(function (x) { return String(x.id) === String(id); })[0]; return c ? c.name : "(removed)"; }
  function fillCampaignSelects() {
    var opts = camps().map(function (c) { return '<option value="' + c.id + '">' + esc(c.name) + "</option>"; }).join("");
    var lc = $("leadCampaign"), cur = lc.value;
    lc.innerHTML = '<option value="">All campaigns</option>' + opts + (camps().length ? '<option value="none">No campaign</option>' : ""); lc.value = cur;
    var tc = $("tplCampaign"), tcur = state.tplCampaign || "";
    tc.innerHTML = '<option value="">Everyone (default)</option>' + opts; tc.value = tcur;
    $("tplCampBar").hidden = !camps().length;
  }
  function renderCampaignCards() {
    var cs = camps(); $("campEmpty").hidden = !!cs.length; $("campTable").parentNode.hidden = !cs.length;
    $("campTable").innerHTML = cs.length ? "<tr><th>Campaign</th><th>Waiting</th><th>In sequence</th><th>Today</th><th>Replies</th><th>Positive</th><th>Bounces</th><th>Finishes in</th></tr>" + cs.map(function (c) {
      var where = [].concat(c.countries, c.states, c.cities).join(", ") || "anywhere", what = c.types.join(", ") || "any business";
      return "<tr><td>" + esc(c.name) + (c.enabled ? "" : ' <span class="chip">paused</span>') + '<div class="hint">' + esc(where + " · " + what) + "</div></td><td>" + c.waiting + "</td><td>" + c.active + "</td><td>" + c.sentToday + (c.daily_limit ? " of " + c.daily_limit : "") + "</td><td>" + c.replied + " <span class='hint'>(" + c.replyRate + "%)</span></td><td>" + c.positive + "</td><td>" + c.bounceRate + "%</td><td>" + (c.daysLeft ? c.daysLeft + " day" + (c.daysLeft === 1 ? "" : "s") : "–") + "</td></tr>";
    }).join("") : "";
  }
  $("campBox").addEventListener("click", function (e) { var b = e.target.closest("[data-view-go]"); if (b) go(b.dataset.viewGo); });
  var campOpts = null, campMbs = [];
  var FILTERS = [["countries", "Countries", "US, UK"], ["states", "States / regions", "TX, Florida"], ["cities", "Cities", "Austin, Dallas"], ["types", "Business types", "roofing, hvac, dentist"]];
  function emailsRow(c) {
    var st = camps().filter(function (x) { return x.id === c.id; })[0], own = st && st.ownEmails;
    return '<div class="toolbar" style="margin:0"><span class="chip ' + (own ? "okc" : "warnc") + '">' + (own ? "Has its own emails" : "Sends the default emails") + '</span><button type="button" class="btn sm" data-emails="' + esc(c.id) + '">' + (own ? "Edit emails" : "Edit emails") + '</button><button type="button" class="btn sm" data-aiwrite="' + esc(c.id) + '">✨ Write with AI</button></div>';
  }
  function campBlock(c) {
    c = c || {};
    var f = FILTERS.map(function (k) {
      var sug = ((campOpts || {})[k[0]] || []).slice(0, 8).map(function (o) { return '<span class="chip field-chip" data-add="' + k[0] + '" data-v="' + esc(o.value) + '">' + esc(o.value) + " · " + o.count + "</span>"; }).join(" ");
      return '<div class="field"><label>' + k[1] + '</label><input type="text" data-f="' + k[0] + '" value="' + esc(Array.isArray(c[k[0]]) ? c[k[0]].join(", ") : c[k[0]] || "") + '" placeholder="' + k[2] + '"><div style="margin-top:6px;display:flex;gap:4px;flex-wrap:wrap">' + sug + "</div></div>";
    });
    var mbs = campMbs.map(function (m) { return '<label class="check" style="margin-right:14px"><input type="checkbox" data-mb="' + m.id + '"' + ((c.mailboxes || []).indexOf(m.id) >= 0 ? " checked" : "") + "> " + esc(m.email) + "</label>"; }).join("");
    return '<div class="mb camp" data-id="' + esc(c.id || "") + '"><div class="mb-head"><input type="text" data-n="name" value="' + esc(c.name || "") + '" placeholder="Campaign name, e.g. Texas roofers" maxlength="60" style="max-width:340px;font-weight:600">' +
      '<span style="flex:1"></span><label class="check"><input type="checkbox" data-n="enabled"' + (c.enabled === false ? "" : " checked") + '> On</label>' +
      '<button type="button" class="btn sm" data-mv="-1" title="Earlier: fits leads first">↑</button><button type="button" class="btn sm" data-mv="1" title="Later">↓</button><button type="button" class="btn sm danger" data-rmc="1">Remove</button></div>' +
      '<div class="row">' + f.slice(0, 2).join("") + '</div><div class="row">' + f.slice(2).join("") + "</div>" +
      '<div class="row"><div class="field"><label>Send from <span class="hint">(none ticked = every mailbox)</span></label><div>' + (mbs || '<span class="hint">Add mailboxes in Settings first.</span>') + '</div></div><div class="field"><label>Daily limit for this campaign <span class="hint">(0 = only the mailboxes\' limits)</span></label><input type="number" data-n="daily_limit" min="0" max="1000" value="' + esc(c.daily_limit || 0) + '"></div></div>' +
      '<p class="hint cp" style="margin:6px 0">Checking…</p>' + (c.id ? emailsRow(c) : '<span class="hint">Save the campaign to give it its own emails.</span>') + "</div>";
  }
  function collectCamps() {
    return [].map.call($("campList").querySelectorAll(".camp"), function (el) {
      var c = { id: el.dataset.id ? Number(el.dataset.id) : undefined, name: el.querySelector('[data-n="name"]').value, enabled: el.querySelector('[data-n="enabled"]').checked, daily_limit: el.querySelector('[data-n="daily_limit"]').value,
        mailboxes: [].map.call(el.querySelectorAll("[data-mb]:checked"), function (i) { return Number(i.dataset.mb); }) };
      el.querySelectorAll("[data-f]").forEach(function (i) { c[i.dataset.f] = i.value; });
      return c;
    });
  }
  function renderCamps(list) {
    $("campList").innerHTML = list.length ? list.map(campBlock).join("") : '<p class="empty">No campaigns yet. Add one to email a place or business type on its own.</p>';
    $("campIntro").textContent = campOpts && campOpts.total ? "Your " + campOpts.total + " leads: click a suggestion under a box to add it." : "Import leads first, then build campaigns from the places and business types in them.";
    [].forEach.call($("campList").querySelectorAll(".camp"), previewCamp);
  }
  function loadCampaigns() {
    aiCampState();
    api("GET", "/api/outreach/campaigns").then(function (r) { campOpts = r.options; campMbs = r.mailboxes; renderCamps(r.campaigns); }).catch(fail);
  }
  var cpT = {};
  function previewCamp(el) {
    var c = collectCamps()[[].indexOf.call($("campList").querySelectorAll(".camp"), el)], out = el.querySelector(".cp");
    api("POST", "/api/outreach/campaigns/preview", { filters: c, id: c.id }).then(function (r) {
      out.innerHTML = "<b>" + r.total + "</b> lead" + (r.total === 1 ? "" : "s") + " match, <b>" + r.waiting + "</b> still waiting to be emailed" + (r.claimed ? ' <span class="warn">(' + r.claimed + " already belong to a campaign above)</span>" : "") + (r.blocked ? ' <span class="warn">(' + r.blocked + " are in countries your Settings do not allow)</span>" : "") +
        (r.sample.length ? '<br><span class="hint">e.g. ' + r.sample.map(function (s) { return esc(s.store + (s.place ? " (" + s.place + ")" : "")); }).join(" · ") + "</span>" : "");
    }).catch(function () { out.textContent = ""; });
  }
  $("campList").addEventListener("input", function (e) {
    var el = e.target.closest(".camp"); if (!el || !e.target.dataset.f) return;
    clearTimeout(cpT[el.dataset.id || "new"]); cpT[el.dataset.id || "new"] = setTimeout(function () { previewCamp(el); }, 350);
  });
  $("campList").addEventListener("change", function (e) { var el = e.target.closest(".camp"); if (el && (e.target.dataset.mb || e.target.dataset.n)) previewCamp(el); });
  $("campList").addEventListener("click", function (e) {
    var el = e.target.closest(".camp"); if (!el) return;
    var add = e.target.closest("[data-add]"), mv = e.target.closest("[data-mv]"), rm = e.target.closest("[data-rmc]"), em = e.target.closest("[data-emails]");
    if (add) { var inp = el.querySelector('[data-f="' + add.dataset.add + '"]'), have = inp.value.split(",").map(function (x) { return x.trim().toLowerCase(); }); if (have.indexOf(add.dataset.v.toLowerCase()) < 0) inp.value = (inp.value.trim() ? inp.value.trim().replace(/,$/, "") + ", " : "") + add.dataset.v; previewCamp(el); }
    if (mv) { var list = collectCamps(), i = [].indexOf.call($("campList").querySelectorAll(".camp"), el), j = i + Number(mv.dataset.mv); if (j >= 0 && j < list.length) { var t = list[i]; list[i] = list[j]; list[j] = t; renderCamps(list); } }
    if (rm && confirm("Remove this campaign? Its leads that are still waiting stop being emailed unless another campaign fits them.")) { var l2 = collectCamps(); l2.splice([].indexOf.call($("campList").querySelectorAll(".camp"), el), 1); renderCamps(l2); }
    if (em) { state.tplCampaign = em.dataset.emails; state.tpl = null; go("templates"); }
    var aw = e.target.closest("[data-aiwrite]"); if (aw) { state.tplCampaign = aw.dataset.aiwrite; state.tpl = null; state.openWriter = true; go("templates"); }
  });
  function aiCampState() { var on = aiOn(); $("aiCampBtn").disabled = !on; $("aiCampChip").textContent = on ? "Gemini connected" : "Gemini not connected"; $("aiCampChip").className = "chip " + (on ? "okc" : "warnc"); }
  $("aiCampBtn").addEventListener("click", function () {
    var text = $("aiCampText").value.trim(); if (text.length < 5) return fail(new Error("Describe who you want to email, for example: roofing companies in Texas."));
    var b = this; b.disabled = true; b.textContent = "Building…";
    api("POST", "/api/outreach/ai/campaign", { description: text }).then(function (r) {
      var list = collectCamps(); if (list.length >= 20) throw new Error("You already have 20 campaigns.");
      var c = r.campaign; delete c.id; list.push(c); renderCamps(list);
      $("aiCampNote").textContent = (r.note ? r.note + " " : "") + "Matches " + r.preview.total + " of your leads. Check it below, then Save campaigns.";
      var last = $("campList").lastElementChild; if (last) last.scrollIntoView({ behavior: "smooth", block: "center" });
    }).catch(fail).then(function () { b.textContent = "Build with AI"; aiCampState(); });
  });
  $("addCamp").addEventListener("click", function () { var l = collectCamps(); if (l.length >= 20) return; l.push({ name: "", enabled: true }); renderCamps(l); });
  $("saveCamps").addEventListener("click", function () {
    api("PUT", "/api/outreach/campaigns", { campaigns: collectCamps() }).then(function (r) { toast("Campaigns saved"); $("campMsg").textContent = ""; renderCamps(r.campaigns); refresh(); }).catch(fail);
  });

  // ---------------------------------------------------------------- results, objections, scoring, warm-up, copy check
  function renderResults() {
    var an = state.status.analytics || {}, labs = an.labels || {}, steps = an.byStep || {};
    var cards = [["Positive replies", an.positive || 0], ["Meetings booked", an.meetings || 0], ["Won", an.won || 0], ["Referrals added", an.referrals || 0], ["Paused (out of office)", an.snoozed || 0], ["Leads scored", an.scored || 0]]
      .map(function (x) { return '<div class="kpi"><div class="n">' + x[1] + '</div><div class="l">' + esc(x[0]) + "</div></div>"; }).join("");
    var lt = Object.keys(labs).length ? "<table><tr><th>What they said</th><th>Replies</th></tr>" + Object.keys(labs).sort(function (a, b) { return labs[b] - labs[a]; }).map(function (k) { return '<tr><td><span class="chip lab-' + esc(k) + '">' + esc(LABEL[k] || k) + "</span></td><td>" + labs[k] + "</td></tr>"; }).join("") + "</table>" : '<p class="empty">Replies are labelled once Gemini is set up and someone answers.</p>';
    var st = Object.keys(steps).some(function (k) { return steps[k].reached; }) ? "<table><tr><th>Email</th><th>Reached</th><th>Replies</th><th>Positive</th><th>Reply rate</th></tr>" + Object.keys(steps).map(function (k) { var x = steps[k]; return "<tr><td>Email " + k + "</td><td>" + x.reached + "</td><td>" + x.replied + "</td><td>" + x.positive + "</td><td>" + (x.reached ? (100 * x.replied / x.reached).toFixed(1) : "0.0") + "%</td></tr>"; }).join("") + "</table>" : "";
    var mb = Object.keys(state.status.byMailbox || {}).filter(function (k) { return k !== "?"; });
    var mt = mb.length ? "<table><tr><th>Mailbox</th><th>Started</th><th>Replies</th><th>Positive</th><th>Bounced</th></tr>" + mb.map(function (k) { var x = state.status.byMailbox[k]; return "<tr><td>" + esc(k) + "</td><td>" + x.started + "</td><td>" + x.replied + "</td><td>" + (x.positive || 0) + "</td><td>" + x.bounced + "</td></tr>"; }).join("") + "</table>" : "";
    $("resultsBody").innerHTML = '<div class="kpis" style="margin-bottom:14px">' + cards + '</div><div class="grid2"><div>' + lt + "</div><div>" + st + "</div></div>" + (mt ? '<div style="margin-top:14px">' + mt + "</div>" : "");
  }
  function renderObjections() {
    var o = state.status.ai && state.status.ai.objections;
    $("objBody").innerHTML = o && o.themes && o.themes.length ? "<p>" + esc(o.summary) + '</p><table><tr><th>Theme</th><th>Replies</th><th>What to change</th></tr>' + o.themes.map(function (t) { return "<tr><td>" + esc(t.theme) + "</td><td>" + t.count + "</td><td class='hint'>" + esc(t.advice) + "</td></tr>"; }).join("") + '</table><p class="hint" style="margin-top:8px">From ' + o.replies + " replies · " + esc(ago(o.at)) + "</p>" : '<p class="empty">Needs at least 3 labelled “no” or “not now” replies.</p>';
  }
  $("objBtn").addEventListener("click", function () {
    var b = this; b.disabled = true; b.textContent = "Reading replies…";
    api("POST", "/api/outreach/ai/objections", {}).then(function () { return refresh(); }).catch(fail).then(function () { b.disabled = false; b.textContent = "Summarise objections"; });
  });
  var scoreTimer;
  function pollScore() {
    clearTimeout(scoreTimer);
    api("GET", "/api/outreach/ai/status").then(function (s) {
      var j = s.job || {};
      $("scoreInfo").textContent = j.running ? "Scoring " + j.done + " of " + j.total + "…" : (j.kind === "score" && j.message ? j.message + " (" + j.ok + " scored" + (j.failed ? ", " + j.failed + " failed" : "") + ")" : "");
      if (j.running) scoreTimer = setTimeout(pollScore, 2000); else loadLeads();
    }).catch(function () {});
  }
  $("leadTools").addEventListener("click", function (e) { if (e.target.closest("button, a")) $("leadTools").parentNode.open = false; });
  $("scoreBtn").addEventListener("click", function () {
    api("POST", "/api/outreach/ai/score/start", { limit: 50 }).then(function () { toast("Scoring started"); pollScore(); }).catch(function (e) { if (/already/i.test(e.message)) pollScore(); else fail(e); });
  });
  $("leadTable").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-unsnooze]"); if (!b) return;
    api("POST", "/api/outreach/leads/action", { email: b.dataset.unsnooze, action: "clear_snooze" }).then(function () { toast("Follow-ups resume on the next run"); loadLeads(); }).catch(fail);
  });
  $("wuRun").addEventListener("click", function () {
    var b = this; b.disabled = true; $("wuInfo").textContent = "Running… this takes a few minutes (messages are spaced out like a person's).";
    api("POST", "/api/outreach/warmup/run", {}).then(function (r) {
      $("wuInfo").textContent = r.skipped ? "Skipped: " + r.skipped : "Sent " + r.sent + ", answered " + r.replied + "; landed in inbox " + r.inbox + ", in spam " + r.spam + ".";
    }).catch(function (e) { $("wuInfo").textContent = ""; fail(e); }).then(function () { b.disabled = false; });
  });
  $("tplCheck").addEventListener("click", function () {
    var b = this; b.disabled = true;
    api("POST", "/api/outreach/templates/check", { text: $("tplText").value, step: Number((state.tpl || "email1.txt")[5]) || 1, ai: $("tplCheckAi").checked }).then(function (r) {
      var iss = r.issues.map(function (i) { return '<li class="' + (i.level === "bad" ? "bad" : "warn") + '">' + esc(i.text) + "</li>"; }).join("");
      $("copyCheckOut").innerHTML = '<p><b class="' + (r.score >= 8 ? "ok" : r.score >= 5 ? "warn" : "bad") + '">Score ' + r.score + "/10</b> · " + r.stats.words + " words · " + r.stats.links + " link" + (r.stats.links === 1 ? "" : "s") + "</p>" + (iss ? "<ul>" + iss + "</ul>" : '<p class="ok">No problems found.</p>') +
        (r.ai ? "<p><b>Gemini: " + r.ai.score + "/10</b></p>" + (r.ai.issues.length ? "<ul>" + r.ai.issues.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" : "") + (r.ai.suggestions.length ? '<p class="hint">Suggestions</p><ul>' + r.ai.suggestions.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" : "") : "") + (r.aiError ? '<p class="warn">Gemini review unavailable: ' + esc(r.aiError) + "</p>" : "");
    }).catch(fail).then(function () { b.disabled = false; });
  });

  // ---------------------------------------------------------------- data + backup
  function showDataInfo() {
    var d = (state.status && state.status.data) || {}, lb = state.status && state.status.lastBackup;
    $("dataInfo").textContent = d.dir ? "Saved in " + d.dir + " (" + (d.explicit ? "set by OUTREACH_DATA_DIR" : "default location; set OUTREACH_DATA_DIR in Hostinger to choose it yourself") + "). " + (lb ? "Last backup downloaded " + ago(lb) + "." : "No backup downloaded yet.") : "";
  }
  $("bkDownload").addEventListener("click", function () { setTimeout(function () { refresh().then(showDataInfo); }, 1500); });
  $("bkRestore").addEventListener("change", function (e) {
    var f = e.target.files[0]; e.target.value = ""; if (!f) return;
    if (f.size > 50 * 1024 * 1024) return fail(new Error("That file is too large to be an outreach backup."));
    var rd = new FileReader();
    rd.onload = function () {
      var bundle; try { bundle = JSON.parse(rd.result); } catch (err) { return fail(new Error("That isn't a valid backup file.")); }
      if (!bundle || bundle.format !== "weberslink-outreach-backup") return fail(new Error("That isn't an outreach backup file."));
      var n = Object.keys(bundle.files || {}).length;
      if (!confirm("Restore this backup (made " + String(bundle.createdAt || "").slice(0, 10) + ", " + n + " files)?\n\nIt REPLACES your current settings and leads. A safety copy of the current data is saved first.")) return;
      api("POST", "/api/outreach/backup/restore", { backup: bundle }).then(function (r) { toast("Restored " + r.restored.length + " files"); loadSettings(); refresh().then(showDataInfo); }).catch(fail);
    };
    rd.readAsText(f);
  });

  // ---------------------------------------------------------------- go-live checks
  $("testSend").addEventListener("click", function () {
    var to = $("testTo").value.trim(); if (!to) return fail(new Error("Enter your own email address first."));
    $("testSend").disabled = true;
    api("POST", "/api/outreach/test-email", { to: to }).then(function (r) {
      $("goLive").innerHTML = r.problems ? '<ul class="bad" style="margin-left:18px">' + r.problems.map(function (p) { return "<li>" + esc(p) + "</li>"; }).join("") + "</ul>" :
        "<table>" + r.results.map(function (x) { return "<tr><td>" + esc(x.mailbox) + "</td><td>" + (x.ok ? '<span class="ok">sent: check inbox and spam</span>' : '<span class="bad">' + esc(x.error) + "</span>") + "</td></tr>"; }).join("") + "</table>";
    refresh(); }).catch(fail).finally(function () { $("testSend").disabled = false; });
  });
  $("dnsBtn").addEventListener("click", function () {
    $("dnsBtn").disabled = true; $("goLive").innerHTML = '<p class="hint">Checking…</p>';
    api("GET", "/api/outreach/dns").then(function (r) {
      $("goLive").innerHTML = r.domains.length ? r.domains.map(function (d) {
        return "<h3 style='margin:14px 0 6px'>" + esc(d.domain) + "</h3><table>" + d.checks.map(function (c) {
          return "<tr><td style='width:70px'>" + esc(c.name) + '</td><td class="' + (c.status === "ok" ? "ok" : c.status === "bad" ? "bad" : "warn") + '" style="width:60px">' + (c.status === "ok" ? "OK" : c.status === "bad" ? "Fix" : "Check") + "</td><td class='hint'>" + esc(c.detail) + "</td></tr>";
        }).join("") + "</table>";
      }).join("") : '<p class="hint">Add a mailbox and save first.</p>';
      refresh();
    }).catch(fail).finally(function () { $("dnsBtn").disabled = false; });
  });

  // ---------------------------------------------------------------- boot
  api("GET", "/api/outreach/session").then(function (r) {
    state.needUser = Boolean(r.usernameRequired);
    if (!r.authed) return showLogin();
    var v = location.hash.slice(1); if (v === "dashboard") v = "overview"; if (VIEWS[v]) state.view = v;
    showApp(); go(state.view);
  }).catch(function (e) {
    document.body.innerHTML = '<div class="login"><form><h1>Outreach is off</h1><p style="margin-top:10px">' + esc(e.message) + "</p></form></div>";
  });
})();
