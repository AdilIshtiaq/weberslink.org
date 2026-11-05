/* Booking clients admin: create businesses, reset passwords, switch pages off. Uses the Outreach admin session. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var ZONES = ["America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu", "America/Toronto", "America/Vancouver",
    "Europe/London", "Europe/Dublin", "Europe/Paris", "Europe/Berlin", "Europe/Madrid", "Europe/Amsterdam", "Asia/Dubai", "Asia/Karachi", "Asia/Kolkata", "Asia/Singapore", "Australia/Sydney", "Pacific/Auckland", "UTC"];
  var base = location.origin;
  function api(method, url, body) {
    return fetch(url, { method: method, credentials: "same-origin", headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok || j.ok === false) { var e = new Error(j.error || "Error " + r.status); e.status = r.status; throw e; } return j; }); });
  }
  function toast(msg, bad) { var t = document.createElement("div"); t.className = "toast"; if (bad) t.style.background = "#c23b32"; t.textContent = msg; document.body.appendChild(t); setTimeout(function () { t.remove(); }, 3500); }
  var slugify = function (s) { return String(s).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40); };

  function showSecret(title, b, password) {
    var url = base + "/book/" + b;
    var msg = "Your online booking page is ready.\n\nBooking page (share with customers): " + url + "\nYour dashboard: " + url + "/admin\nPassword: " + password + "\n\nPlease change the password after you sign in (Settings > Password).";
    $("created").hidden = false;
    $("created").innerHTML = "<h2>" + esc(title) + '</h2><p class="hint">Copy this now: the password is not shown again (you can always reset it).</p>' +
      '<p>Booking page: <a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(url) + '</a><br>Dashboard: <a href="' + esc(url) + '/admin" target="_blank" rel="noopener">' + esc(url) + "/admin</a><br>Password: <span class=\"secret\">" + esc(password) + "</span></p>" +
      '<div class="field"><label for="msgOut">Message to send the owner</label><textarea id="msgOut" readonly style="min-height:150px">' + esc(msg) + '</textarea></div><div class="row" style="margin-top:8px"><button type="button" class="btn sm" id="copyMsg">Copy message</button><button type="button" class="btn sm ghost" id="closeSecret">Done</button></div>';
    $("copyMsg").onclick = function () { $("msgOut").select(); (navigator.clipboard ? navigator.clipboard.writeText($("msgOut").value) : Promise.reject()).then(function () { toast("Copied"); }, function () { document.execCommand("copy"); toast("Copied"); }); };
    $("closeSecret").onclick = function () { $("created").hidden = true; $("created").innerHTML = ""; };
    $("created").scrollIntoView({ behavior: "smooth" });
  }

  function load() {
    api("GET", "/api/booking-admin/list").then(function (j) {
      $("signin").hidden = true; $("app").hidden = false;
      $("mailNote").innerHTML = j.mailOn ? "Emails are <b>on</b>: customers get confirmations and reminders, owners get alerts." : "Emails are <b>off</b>: set SMTP_USER and SMTP_PASS on the server so customers get confirmations and reminders. Bookings work without them.";
      $("list").innerHTML = j.businesses.length ? j.businesses.map(function (b) {
        var url = base + "/book/" + b.slug;
        return '<div class="biz' + (b.disabled ? " off" : "") + '"><div><b>' + esc(b.name) + "</b>" + (b.disabled ? ' <span class="pill">switched off</span>' : "") + '<div class="meta"><a href="' + esc(url) + '" target="_blank" rel="noopener">/book/' + esc(b.slug) + "</a> · " + esc(b.ownerEmail) + "</div>" +
          '<div class="meta">' + b.upcoming + " upcoming · " + b.total + " bookings in total · since " + esc((b.createdAt || "").slice(0, 10)) + "</div></div>" +
          '<div class="acts"><a class="btn sm" href="' + esc(url) + '/admin" target="_blank" rel="noopener">Dashboard ↗</a><button type="button" class="btn sm" data-reset="' + esc(b.slug) + '" data-name="' + esc(b.name) + '">New password</button>' +
          '<button type="button" class="btn sm ' + (b.disabled ? "" : "danger") + '" data-toggle="' + esc(b.slug) + '" data-off="' + (b.disabled ? "0" : "1") + '">' + (b.disabled ? "Switch on" : "Switch off") + "</button></div></div>";
      }).join("") : '<p class="empty">No businesses yet. Add the first one on the right.</p>';
    }).catch(function (e) { if (e.status === 401) { $("signin").hidden = false; $("app").hidden = true; } else toast(e.message, true); });
  }

  $("cTz").innerHTML = ZONES.map(function (z) { return '<option value="' + z + '"' + (z === "America/New_York" ? " selected" : "") + ">" + z.replace(/_/g, " ") + "</option>"; }).join("");
  var slugTouched = false;
  $("cName").addEventListener("input", function () { if (!slugTouched) $("cSlug").value = slugify(this.value); $("slugPrev").textContent = base + "/book/" + ($("cSlug").value || "…"); });
  $("cSlug").addEventListener("input", function () { slugTouched = true; this.value = slugify(this.value); $("slugPrev").textContent = base + "/book/" + (this.value || "…"); });
  $("createForm").addEventListener("submit", function (e) {
    e.preventDefault(); $("cErr").hidden = true;
    var body = { name: $("cName").value.trim(), slug: $("cSlug").value.trim(), ownerEmail: $("cEmail").value.trim(), phone: $("cPhone").value.trim(), preset: $("cType").value, tz: $("cTz").value, currency: $("cCur").value.trim() || "$" };
    if (!body.name) { $("cErr").textContent = "Enter the business name."; $("cErr").hidden = false; return; }
    api("POST", "/api/booking-admin/create", body).then(function (j) {
      showSecret(body.name + " is ready", j.slug, j.password);
      $("createForm").reset(); slugTouched = false; $("slugPrev").textContent = ""; $("cTz").value = "America/New_York"; load();
    }).catch(function (err) { $("cErr").textContent = err.message; $("cErr").hidden = false; });
  });
  $("list").addEventListener("click", function (e) {
    var r = e.target.closest("[data-reset]"), t = e.target.closest("[data-toggle]");
    if (r) {
      if (!confirm("Make a new password for " + r.dataset.name + "? The old one stops working and they are signed out.")) return;
      api("POST", "/api/booking-admin/reset-password", { slug: r.dataset.reset }).then(function (j) { showSecret("New password for " + r.dataset.name, r.dataset.reset, j.password); }).catch(function (err) { toast(err.message, true); });
    }
    if (t) {
      var off = t.dataset.off === "1";
      if (off && !confirm("Switch this booking page off? Customers won't be able to book or open it until you switch it back on. No data is deleted.")) return;
      api("POST", "/api/booking-admin/disable", { slug: t.dataset.toggle, disabled: off }).then(load).catch(function (err) { toast(err.message, true); });
    }
  });
  load();
})();
