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
    if (view === "settings") { loadSettings(); showDataInfo(); }
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

    var c = s.byStatus || {}, started = (s.total || 0) - (c["new"] || 0) - (c["skipped-country"] || 0) - (c["skipped-no-mailserver"] || 0) - (c["do-not-contact"] || 0) - (c["skipped-bad-address"] || 0);
    $("cards").innerHTML = [
      ["Leads", s.total], ["Not yet contacted", s.remaining], ["In sequence", c.active || 0], ["Replied", c.replied || 0],
      ["Bounced", c.bounced || 0], ["Days to finish", s.daysLeft || "–"]
    ].map(function (x) { return '<div class="card"><div class="n">' + esc(x[1]) + '</div><div class="l">' + esc(x[0]) + "</div></div>"; }).join("");

    var d = s.data || {}, warns = [];
    if (d.insideApp) warns.push("Your data folder (" + d.dir + ") is inside the app's folder, so a redeploy can erase it. Set OUTREACH_DATA_DIR in Hostinger to a folder outside the app, restart, then restore a backup.");
    if (d.dir && !d.writable) warns.push("The data folder (" + d.dir + ") can't be written to, so nothing you save will stick. Set OUTREACH_DATA_DIR to a folder you can write to.");
    var haveData = (s.total || 0) > 0 || (s.mailboxes || []).length > 0;
    if (haveData && (!s.lastBackup || Date.now() - Date.parse(s.lastBackup) > 7 * 864e5)) warns.push((s.lastBackup ? "Your last backup was over a week ago." : "You have never downloaded a backup.") + " Download one in Settings → Your data and backup, so a redeploy or mistake can't cost you your work.");
    $("dataWarn").hidden = !warns.length;
    $("dataWarnList").innerHTML = warns.map(function (w) { return "<li>" + esc(w) + "</li>"; }).join("");
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
  var STATUSES = ["new", "active", "finished", "replied", "unsubscribed", "bounced", "do-not-contact", "skipped-bad-address", "skipped-country", "skipped-no-mailserver"];
  $("leadStatus").innerHTML += STATUSES.map(function (s) { return '<option value="' + s + '">' + s + "</option>"; }).join("");
  function loadLeads() {
    var q = new URLSearchParams({ q: $("leadQ").value, status: $("leadStatus").value, limit: PAGE, offset: state.leadPage * PAGE });
    api("GET", "/api/outreach/leads?" + q).then(function (r) {
      $("leadTable").innerHTML = r.rows.length ? "<tr><th>Store</th><th>Email</th><th>Country</th><th>Status</th><th>Emails sent</th><th>Last sent</th><th>Next</th><th>Mailbox</th><th>Ver.</th></tr>" + r.rows.map(function (t) {
        var sent = Number(t.step) || 0;
        return "<tr><td>" + esc(t.store || t.domain) + "</td><td>" + esc(t.email) + "</td><td>" + esc(t.country) + '</td><td><span class="chip ' + esc(t.status) + '">' + esc(t.status === "skipped-bad-address" ? "set aside" : t.status) + "</span></td><td>" + (sent ? sent + " of 4" : "–") + "</td><td>" + esc((t.last_sent || "").slice(0, 10) || "–") + "</td><td class='hint'>" + esc(t.next || "") + (t.status === "skipped-bad-address" ? ' <button class="btn sm" data-restore="' + esc(t.email) + '">Restore</button>' : "") + "</td><td>" + esc(t.mailbox) + "</td><td>" + esc((t.variant || "").toUpperCase()) + "</td></tr>";
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
  var KIND = { syntax: "invalid address", junk: "scraped junk", disposable: "throwaway domain", typo: "typo", system: "system address", placeholder: "placeholder", "no-mail-server": "domain can't receive mail", role: "shared mailbox" };
  var cleanTimer;
  $("cleanBtn").addEventListener("click", function () {
    $("cleanBox").hidden = false; $("cleanBody").innerHTML = '<p class="hint">Starting…</p>';
    api("POST", "/api/outreach/leads/clean/start", {}).then(pollClean).catch(function (e) { if (/already/i.test(e.message)) pollClean(); else { fail(e); $("cleanBox").hidden = true; } });
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
  $("cautious").addEventListener("click", function () {
    $("x_ramp").value = "5,10,15,20"; $("x_limit").value = 20; $("x_bounce").value = 3;
    toast("Cautious settings filled in. Click Save settings to keep them.");
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
