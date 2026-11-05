/* Business owner accounts: sign up, confirm email, sign in, forgot / reset password. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var page = (location.pathname.match(/^\/book\/([a-z]+)/) || [])[1] || "login";
  var q = new URLSearchParams(location.search);
  var ZONES = ["America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu", "America/Toronto", "America/Vancouver",
    "Europe/London", "Europe/Dublin", "Europe/Paris", "Europe/Berlin", "Europe/Madrid", "Europe/Amsterdam", "Asia/Dubai", "Asia/Karachi", "Asia/Kolkata", "Asia/Singapore", "Australia/Sydney", "Pacific/Auckland", "UTC"];
  var myTz = (function () { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York"; } catch (e) { return "America/New_York"; } })();
  var slugify = function (s) { return String(s).toLowerCase().replace(/['’`]/g, "").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 36).replace(/-+$/, ""); };

  function api(what, body) {
    return fetch("/api/booking-account/" + what, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok || j.ok === false) { var e = new Error(j.error || "Something went wrong (" + r.status + ")."); e.status = r.status; throw e; } return j; }); },
        function () { throw new Error("No connection. Check your internet and try again."); });
  }
  function show(html) { $("main").innerHTML = '<div class="panel acct">' + html + "</div>"; var h = $("main").querySelector("h1"); if (h) { h.setAttribute("tabindex", "-1"); h.focus(); } }
  function err(msg) { var e = $("err"); e.textContent = msg; e.hidden = false; }
  function busy(on, label) { var b = $("main").querySelector("button[type=submit]"); if (b) { b.disabled = on; if (label) b.textContent = label; } }
  var field = function (id, label, type, extra, hint) { return '<div class="field"><label for="' + id + '">' + label + '</label><input type="' + type + '" id="' + id + '" ' + (extra || "") + ">" + (hint ? '<span class="hint">' + hint + "</span>" : "") + "</div>"; };
  var goDashboard = function (slug) { location.href = "/book/" + encodeURIComponent(slug) + "/admin"; };

  // ---------------------------------------------------------------- sign up
  function signup() {
    document.title = "Create your booking page | WebersLink";
    $("topLogin").hidden = false;
    var zones = ZONES.indexOf(myTz) < 0 ? [myTz].concat(ZONES) : ZONES;
    show("<h1>Create your booking page</h1>" + (q.get("deleted") ? '<div class="ok" style="margin:8px 0">Your booking page and its bookings have been deleted.</div>' : "") + "<p class=\"hint\">Your customers book online, day or night. Set up takes about 5 minutes.</p>" +
      '<form id="f" novalidate>' +
      field("name", "Business name", "text", 'maxlength="80" autocomplete="organization" required') +
      '<p class="addr" id="addr"></p>' +
      '<div class="field"><label for="type">Type of business</label><select id="type"><option value="salon">Salon, barber or beauty</option><option value="clinic">Clinic, dentist or therapist</option><option value="home">Home services or trades (you go to them)</option><option value="other" selected>Something else</option></select><span class="hint">We start you with example services you can change.</span></div>' +
      '<div class="field"><label for="tz">Time zone</label><select id="tz">' + zones.map(function (z) { return '<option value="' + esc(z) + '"' + (z === myTz ? " selected" : "") + ">" + esc(z.replace(/_/g, " ")) + "</option>"; }).join("") + "</select></div>" +
      '<div class="field"><label for="cur">Currency</label><select id="cur">' + ["$", "£", "€", "A$", "C$", "Rs", "AED", "₹"].map(function (c) { return '<option>' + esc(c) + "</option>"; }).join("") + "</select></div>" +
      field("email", "Your email", "email", 'maxlength="160" autocomplete="email" required', "You'll sign in with this, and new bookings are sent here.") +
      field("pw", "Password", "password", 'minlength="10" maxlength="200" autocomplete="new-password" required', "At least 10 characters.") +
      '<div class="sr" aria-hidden="true"><label for="web">Leave this empty</label><input type="text" id="web" tabindex="-1" autocomplete="off"></div>' +
      '<p class="err" id="err" role="alert" hidden></p><button type="submit" class="btn primary">Create my booking page</button></form>' +
      '<p class="alt">Already have one? <a href="/book/login">Sign in</a></p>');
    var cur = { "Europe/London": "£", "Europe/Dublin": "€", "Europe/Paris": "€", "Europe/Berlin": "€", "Europe/Madrid": "€", "Europe/Amsterdam": "€", "Asia/Karachi": "Rs", "Asia/Kolkata": "₹", "Asia/Dubai": "AED", "Australia/Sydney": "A$", "America/Toronto": "C$", "America/Vancouver": "C$" }[myTz];
    if (cur) $("cur").value = cur;
    $("name").addEventListener("input", function () { var s = slugify(this.value); $("addr").textContent = s ? "Your booking page will be at " + location.host + "/book/" + s + " (or close to it)" : ""; });
    $("f").addEventListener("submit", function (e) {
      e.preventDefault();
      var body = { name: $("name").value.trim(), type: $("type").value, tz: $("tz").value, currency: $("cur").value, email: $("email").value.trim(), password: $("pw").value, website: $("web").value };
      if (body.name.length < 2) return err("Enter your business name.");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) return err("Enter a valid email address.");
      if (body.password.length < 10) return err("Choose a password of at least 10 characters.");
      busy(true, "Creating…");
      api("signup", body).then(function (j) { sentVerify(j.email || body.email); }).catch(function (x) { busy(false, "Create my booking page"); err(x.message); });
    });
  }
  function sentVerify(email) {
    show('<h1>Check your email</h1><div class="ok">We sent a link to <b>' + esc(email) + "</b>. Click it to confirm your email and set up your booking page.</div>" +
      '<p class="hint" style="margin-top:14px">Nothing after a few minutes? Check your spam folder, or <a href="#" id="resend">send it again</a>.</p>');
    $("resend").addEventListener("click", function (e) { e.preventDefault(); api("resend", { email: email }).then(function () { $("resend").outerHTML = "<b>sent again</b>"; }).catch(function (x) { alert(x.message); }); });
  }

  // ---------------------------------------------------------------- confirm email
  function verify() {
    document.title = "Confirming your email | WebersLink";
    var token = q.get("token") || "";
    show("<h1>Confirming your email…</h1>");
    if (!token) return show('<h1>Link not valid</h1><p class="hint">Open the link from your email again, or <a href="/book/login">sign in</a>.</p>');
    history.replaceState(null, "", "/book/verify"); // keep the token out of history
    api("verify", { token: token }).then(function (j) { goDashboard(j.slug); })
      .catch(function (x) { show('<h1>We couldn\'t confirm that link</h1><p class="hint">' + esc(x.message) + '</p><p><a class="btn" href="/book/login">Sign in</a> <a class="btn ghost" href="/book/new">Sign up again</a></p>'); });
  }

  // ---------------------------------------------------------------- sign in
  function login() {
    document.title = "Sign in | Online booking | WebersLink";
    $("topLogin").hidden = true;
    show("<h1>Sign in</h1><p class=\"hint\">To your booking dashboard.</p><form id=\"f\" novalidate>" +
      field("email", "Email", "email", 'maxlength="160" autocomplete="email" required') +
      field("pw", "Password", "password", 'maxlength="200" autocomplete="current-password" required') +
      '<p class="err" id="err" role="alert" hidden></p><button type="submit" class="btn primary">Sign in</button></form>' +
      '<p class="alt"><a href="/book/forgot">Forgot your password?</a> · <a href="/book/new">Create a booking page</a></p>');
    $("f").addEventListener("submit", function (e) {
      e.preventDefault();
      var email = $("email").value.trim();
      busy(true, "Signing in…");
      api("login", { email: email, password: $("pw").value }).then(function (j) { goDashboard(j.slug); })
        .catch(function (x) {
          busy(false, "Sign in"); err(x.message);
          if (x.status === 403) { var a = document.createElement("a"); a.href = "#"; a.textContent = " Send the link again"; a.onclick = function (ev) { ev.preventDefault(); api("resend", { email: email }).then(function () { a.textContent = " Sent."; }); }; $("err").appendChild(a); }
        });
    });
  }

  // ---------------------------------------------------------------- forgot / reset
  function forgot() {
    document.title = "Forgot password | WebersLink";
    show("<h1>Forgot your password?</h1><p class=\"hint\">Enter your email and we'll send you a link to choose a new one.</p><form id=\"f\" novalidate>" +
      field("email", "Email", "email", 'maxlength="160" autocomplete="email" required') +
      '<p class="err" id="err" role="alert" hidden></p><button type="submit" class="btn primary">Send reset link</button></form><p class="alt"><a href="/book/login">Back to sign in</a></p>');
    $("f").addEventListener("submit", function (e) {
      e.preventDefault(); var email = $("email").value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err("Enter a valid email address.");
      busy(true, "Sending…");
      api("forgot", { email: email }).then(function () { show('<h1>Check your email</h1><div class="ok">If <b>' + esc(email) + "</b> has a booking page, a reset link is on its way. It works for 1 hour.</div><p class=\"alt\"><a href=\"/book/login\">Back to sign in</a></p>"); })
        .catch(function (x) { busy(false, "Send reset link"); err(x.message); });
    });
  }
  function reset() {
    document.title = "Choose a new password | WebersLink";
    var token = q.get("token") || "";
    if (token) history.replaceState(null, "", "/book/reset");
    if (!token) return show('<h1>Link not valid</h1><p class="hint"><a href="/book/forgot">Ask for a new reset link</a>.</p>');
    show("<h1>Choose a new password</h1><form id=\"f\" novalidate>" + field("pw", "New password", "password", 'minlength="10" maxlength="200" autocomplete="new-password" required', "At least 10 characters.") +
      field("pw2", "Type it again", "password", 'maxlength="200" autocomplete="new-password" required') +
      '<p class="err" id="err" role="alert" hidden></p><button type="submit" class="btn primary">Save and sign in</button></form>');
    $("f").addEventListener("submit", function (e) {
      e.preventDefault();
      if ($("pw").value.length < 10) return err("Use at least 10 characters.");
      if ($("pw").value !== $("pw2").value) return err("The two passwords don't match.");
      busy(true, "Saving…");
      api("reset", { token: token, password: $("pw").value }).then(function (j) { goDashboard(j.slug); }).catch(function (x) { busy(false, "Save and sign in"); err(x.message); });
    });
  }

  ({ new: signup, verify: verify, login: login, forgot: forgot, reset: reset }[page] || login)();
})();
