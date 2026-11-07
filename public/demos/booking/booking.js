/*
 * Weberslink online booking.
 *
 * Two modes, one page:
 *  - Demo (/demos/booking/): three sample businesses, everything stored in this browser only.
 *  - Live (/book/<slug> and /book/<slug>/admin): a real business. Times come from the server in the business's time
 *    zone, bookings are saved on the server (which re-checks every time), customers get e-mails, the owner signs in.
 */
(function () {
  "use strict";

  var SLUG = document.documentElement.getAttribute("data-slug");
  var LIVE = SLUG !== null;
  var ADMIN_PATH = /\/admin\/?$/.test(location.pathname);

  // ------------------------------------------------------------------ demo presets
  var PRESETS = {
    salon: {
      name: "Studio Nova", tag: "Hair & beauty · 214 Market Street", accent: "#b0457a", currency: "$", who: "stylist", needAddress: false,
      policy: "Free cancellation up to 24 hours before. Late cancellations may be charged 50%.",
      services: [
        { id: "s1", name: "Women's cut & style", mins: 60, price: 65, desc: "Consultation, wash, cut and blow-dry." },
        { id: "s2", name: "Men's cut", mins: 30, price: 35, desc: "Classic or fade, with a hot towel finish." },
        { id: "s3", name: "Full colour", mins: 120, price: 140, desc: "Root-to-tip colour, toner and style." },
        { id: "s4", name: "Blow-dry", mins: 45, price: 45, desc: "Wash and a long-lasting blow-dry." },
      ],
      staff: [
        { id: "p1", name: "Maya Brooks", role: "Senior stylist", services: ["s1", "s3", "s4"], days: [2, 3, 4, 5, 6] },
        { id: "p2", name: "Leo Grant", role: "Barber", services: ["s2", "s4"], days: [1, 2, 3, 4, 5] },
        { id: "p3", name: "Priya Shah", role: "Colour specialist", services: ["s1", "s3"], days: [1, 3, 4, 5, 6] },
      ],
      hours: { 0: null, 1: ["10:00", "18:00"], 2: ["09:00", "19:00"], 3: ["09:00", "19:00"], 4: ["09:00", "20:00"], 5: ["09:00", "19:00"], 6: ["09:00", "16:00"] },
      buffer: 10, notice: 120,
    },
    clinic: {
      name: "Brightside Dental", tag: "Family dentistry · 48 Elm Avenue", accent: "#1f7a8c", currency: "$", who: "dentist", needAddress: false,
      policy: "Please arrive 10 minutes early. Cancel at least 24 hours ahead so we can offer the time to someone else.",
      services: [
        { id: "s1", name: "Check-up & clean", mins: 45, price: 120, desc: "Exam, scale and polish, and advice." },
        { id: "s2", name: "New patient consultation", mins: 30, price: 60, desc: "Meet the dentist and plan your care." },
        { id: "s3", name: "Teeth whitening", mins: 90, price: 350, desc: "In-chair whitening session." },
        { id: "s4", name: "Emergency appointment", mins: 30, price: 150, desc: "Pain, swelling or a broken tooth." },
      ],
      staff: [
        { id: "p1", name: "Dr. Amelia Chen", role: "Dentist", services: ["s2", "s3", "s4"], days: [1, 2, 3, 4, 5] },
        { id: "p2", name: "Dr. Omar Haddad", role: "Dentist", services: ["s2", "s3", "s4"], days: [1, 2, 4, 5, 6] },
        { id: "p3", name: "Sara Lind", role: "Hygienist", services: ["s1"], days: [1, 2, 3, 4, 5] },
      ],
      hours: { 0: null, 1: ["08:00", "17:00"], 2: ["08:00", "17:00"], 3: ["08:00", "19:00"], 4: ["08:00", "17:00"], 5: ["08:00", "15:00"], 6: ["09:00", "13:00"] },
      buffer: 15, notice: 240,
    },
    home: {
      name: "Northline Home Services", tag: "Plumbing · electrical · heating", accent: "#2f6fdb", currency: "$", who: "technician", needAddress: true,
      policy: "Arrival window is 30 minutes either side of your time. We'll text when the technician is on the way.",
      services: [
        { id: "s1", name: "Free estimate visit", mins: 60, price: 0, desc: "We look at the job and give a written quote." },
        { id: "s2", name: "Plumbing repair", mins: 90, price: 180, desc: "Leaks, taps, toilets, blocked drains." },
        { id: "s3", name: "Electrical safety check", mins: 60, price: 140, desc: "Full check with a written report." },
        { id: "s4", name: "Furnace / AC service", mins: 120, price: 220, desc: "Clean, test and tune-up." },
      ],
      staff: [
        { id: "p1", name: "Mike Torres", role: "Plumber", services: ["s1", "s2"], days: [1, 2, 3, 4, 5, 6] },
        { id: "p2", name: "Ana Petrova", role: "Electrician", services: ["s1", "s3"], days: [1, 2, 3, 4, 5] },
        { id: "p3", name: "Sam Okafor", role: "HVAC technician", services: ["s1", "s4"], days: [1, 2, 3, 4, 5] },
      ],
      hours: { 0: null, 1: ["08:00", "18:00"], 2: ["08:00", "18:00"], 3: ["08:00", "18:00"], 4: ["08:00", "18:00"], 5: ["08:00", "18:00"], 6: ["09:00", "14:00"] },
      buffer: 30, notice: 180,
    },
  };
  var DEMO_DEFAULTS = { step: 15, daysAhead: 28, cancelHours: 24, reminderHours: 24, phone: "", notifyEmail: "" };
  var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var DAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var ORDER = [1, 2, 3, 4, 5, 6, 0];
  var FIRST = ["Emma", "Noah", "Olivia", "Liam", "Ava", "James", "Sophia", "Lucas", "Mia", "Ethan", "Grace", "Daniel", "Chloe", "Ryan", "Zoe", "Adam"];
  var LAST = ["Walker", "Reed", "Patel", "Kim", "Lopez", "Hughes", "Bennett", "Rossi", "Nguyen", "Foster", "Ali", "Moreno"];
  var ZONES = ["America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu", "America/Toronto", "America/Vancouver",
    "Europe/London", "Europe/Dublin", "Europe/Paris", "Europe/Berlin", "Europe/Madrid", "Europe/Amsterdam", "Asia/Dubai", "Asia/Karachi", "Asia/Kolkata", "Asia/Singapore", "Australia/Sydney", "Pacific/Auckland", "UTC"];

  // ------------------------------------------------------------------ helpers
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var pad = function (n) { return (n < 10 ? "0" : "") + n; };
  var TZ; // live: the business's zone; demo: the browser's own
  var fmt = function (d, o) { o = Object.assign({}, o); if (TZ) o.timeZone = TZ; return new Intl.DateTimeFormat("en-US", o).format(d); };
  var fmtTime = function (d) { return fmt(d, { hour: "numeric", minute: "2-digit" }).replace(" AM", " am").replace(" PM", " pm"); };
  var fmtDate = function (d) { return fmt(d, { weekday: "long", month: "short", day: "numeric" }); };
  var fmtShort = function (d) { return fmt(d, { weekday: "short", month: "short", day: "numeric" }); };
  var dayKey = function (d) { var o = { year: "numeric", month: "2-digit", day: "2-digit" }; if (TZ) o.timeZone = TZ; return new Intl.DateTimeFormat("en-CA", o).format(d); };
  var hourOf = function (d) { var o = { hour: "numeric", hourCycle: "h23" }; if (TZ) o.timeZone = TZ; return +new Intl.DateTimeFormat("en-US", o).format(d) % 24; };
  var keyDate = function (k) { var p = k.split("-"); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2], 12)); };
  var keyFmt = function (k, o) { return new Intl.DateTimeFormat("en-US", Object.assign({ timeZone: "UTC" }, o)).format(keyDate(k)); };
  var wdOf = function (k) { return keyDate(k).getUTCDay(); };
  var addKey = function (k, n) { var d = keyDate(k); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  var todayKey = function () { return dayKey(new Date()); };
  var toMin = function (hhmm) { var p = hhmm.split(":"); return +p[0] * 60 + +p[1]; };
  var mins = function (n) { return n >= 60 ? Math.floor(n / 60) + " h" + (n % 60 ? " " + (n % 60) + " min" : "") : n + " min"; };
  var initials = function (name) { return String(name).replace(/^Dr\.\s*/, "").split(/\s+/).map(function (w) { return w[0] || ""; }).join("").slice(0, 2).toUpperCase(); };
  var uid = function () { return Math.random().toString(36).slice(2, 10); };
  function toast(msg, bad) { document.querySelectorAll(".toast").forEach(function (x) { x.remove(); }); var t = document.createElement("div"); t.className = "toast"; if (bad) t.style.background = "#c23b32"; t.setAttribute("role", "status"); t.textContent = msg; document.body.appendChild(t); setTimeout(function () { t.remove(); }, bad ? 4500 : 2600); }
  var store = {
    get: function (k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private window */ } },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} },
  };
  function http(method, url, body) {
    return fetch(url, { method: method, credentials: "same-origin", headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok || j.ok === false) { var e = new Error(j.error || "Something went wrong (" + r.status + ")."); e.status = r.status; throw e; } return j; }); },
        function () { throw new Error("No connection. Check your internet and try again."); });
  }

  // ------------------------------------------------------------------ state
  var niche = "salon", biz = null, view = LIVE && ADMIN_PATH ? "admin" : "book";
  var flow = null, adminTab = "agenda", adminDay = null, dirty = false, owner = { signedIn: false, mailOn: false, email: "" };
  var wiz = { step: 0, done: false };
  var API = "/api/booking/" + SLUG + "/";
  var KEY = function () { return "wl-booking-demo-v3-" + niche; };
  function money(n) { return n ? biz.currency + Number(n).toLocaleString("en-US") : "Free"; }
  function service(id) { return biz.services.filter(function (s) { return s.id === id; })[0]; }
  function person(id) { return biz.staff.filter(function (s) { return s.id === id; })[0] || { id: id, name: "(removed)", role: "", days: [], services: [] }; }
  function live(b) { return b.status !== "cancelled"; }
  var ROLE = function () { return LIVE ? (owner.me && owner.me.role) || "owner" : "owner"; };
  var MY_STAFF = function () { return ROLE() === "staff" ? owner.me.staffId : ""; };
  function eligible(serviceId) { return biz.staff.filter(function (s) { return s.services.indexOf(serviceId) >= 0; }); }
  function bookingById(id) { return (biz.bookings || []).filter(function (x) { return x.id === id; })[0]; }

  // ------------------------------------------------------------------ demo data (browser only)
  var E = window.BookingCore; // the same scheduling engine the server runs
  function seeded(seed) { return function () { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }; }
  var rand = function (arr, r) { return arr[Math.floor(r() * arr.length)]; };
  var atMin = function (key, m) { return new Date(E.zonedToUtc(key, m, biz && biz.tz || BROWSER_TZ)); };
  var BROWSER_TZ = (function () { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch (e) { return "UTC"; } })();
  function demoCode(p) { var a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", s = ""; for (var i = 0; i < 6; i++) s += a[Math.floor(Math.random() * a.length)]; return p.name.replace(/[^A-Za-z]/g, "").slice(0, 4).toUpperCase() + "-" + s; }
  function fresh(n) {
    var p = Object.assign(JSON.parse(JSON.stringify(PRESETS[n])), DEMO_DEFAULTS, { tz: BROWSER_TZ, blocks: [], clients: {}, questions: n === "clinic" ? [{ id: "q1", label: "Is this your first visit?", type: "yesno", options: [], required: true }] : [] });
    p.bookings = [];
    var r = seeded(n.length * 7919 + 17), today = E.keyOf(BROWSER_TZ, Date.now());
    for (var d = -6; d < 14; d++) {
      var key = addKey(today, d), wd = wdOf(key), hrs = p.hours[wd];
      if (!hrs) continue;
      p.staff.forEach(function (st) {
        if (st.days.indexOf(wd) < 0) return;
        var count = d < 0 ? 3 : Math.max(0, 3 - Math.floor(d / 4)) + (r() < 0.5 ? 1 : 0);
        for (var i = 0; i < count; i++) {
          var s = rand(p.services.filter(function (x) { return st.services.indexOf(x.id) >= 0; }), r), open = toMin(hrs[0]), close = toMin(hrs[1]);
          var start = open + Math.floor(r() * ((close - open - s.mins) / 30 + 1)) * 30, name = rand(FIRST, r) + " " + rand(LAST, r);
          var t0 = E.zonedToUtc(key, start, BROWSER_TZ);
          var b = { id: uid(), code: demoCode(p), serviceId: s.id, staffId: st.id, start: new Date(t0).toISOString(), end: new Date(t0 + s.mins * 60000).toISOString(),
            name: name, email: name.toLowerCase().replace(/[^a-z]+/g, ".") + "@example.com", phone: "(555) 01" + Math.floor(r() * 90 + 10), address: "", notes: "",
            source: r() < 0.7 ? "online" : "phone", status: "booked", createdAt: new Date(t0 - (1 + Math.floor(r() * 6)) * 864e5 - Math.floor(r() * 24) * 36e5).toISOString() };
          if (E.clashes(p, p.bookings, st.id, t0, t0 + s.mins * 60000, null, s)) continue;
          if (d < 0) b.status = r() < 0.12 ? "no-show" : "done";
          p.bookings.push(b);
        }
      });
    }
    var vip = p.bookings[0]; if (vip) p.clients[E.clientKey(vip.email)] = { name: vip.name, email: vip.email, phone: vip.phone, notes: "Prefers mornings. Pays by card.", tags: ["VIP"], blocked: false, source: "booking" };
    return p;
  }
  function demoSave() { store.set(KEY(), biz); }
  function occ() { return E.busy(biz.bookings, biz.blocks || [], biz.staff); }
  function run(fn) { try { return Promise.resolve(fn()); } catch (e) { return Promise.reject(e); } }
  function newBookingFrom(p, slot, source) {
    var b = { id: uid(), code: demoCode(biz), serviceId: p.serviceId, staffId: slot.staffId, start: slot.start, end: slot.end, name: p.name, email: (p.email || "").toLowerCase(), phone: p.phone,
      address: p.address || "", notes: p.notes || "", answers: p.answers || {}, source: source, status: "booked", createdAt: new Date().toISOString(), isNew: source === "online" };
    biz.bookings.push(b); demoSave(); return b;
  }

  // ------------------------------------------------------------------ data layer: same calls in demo and live
  var data = {
    slots: function (serviceId, staffId, ignoreId, ownerView) {
      if (LIVE) return http("GET", API + (ownerView ? "admin/slots" : "slots") + "?service=" + encodeURIComponent(serviceId) + "&staff=" + encodeURIComponent(staffId) + "&days=" + Math.min(biz.daysAhead, 62)).then(function (j) { return j.days; });
      return run(function () { return E.availability(biz, occ(), { serviceId: serviceId, staffId: staffId, days: Math.min(biz.daysAhead, 62), ignoreId: ignoreId, owner: ownerView }); });
    },
    book: function (p) {
      if (LIVE) return http("POST", API + "book", p).then(function (j) { return { booking: j.booking, payUrl: j.payUrl }; });
      return run(function () {
        p.answers = E.cleanAnswers(biz, p.answers);
        var rec = (biz.clients || {})[E.clientKey(p.email)];
        if (rec && rec.blocked) throw new Error("Online booking isn't available for you. Please contact us.");
        var b = newBookingFrom(p, E.resolveSlot(biz, occ(), p), "online"), dep = E.depositFor(service(p.serviceId));
        if (dep) { b.status = "pending"; b.holdUntil = new Date(Date.now() + 35 * 60000).toISOString(); b.payment = { amount: dep, currency: biz.currencyCode || "usd", status: "pending" }; demoSave(); }
        return { booking: b };
      });
    },
    lookup: function (code, email) {
      if (LIVE) return http("POST", API + "lookup", { code: code, email: email });
      var b = biz.bookings.filter(function (x) { return x.code === code.trim().toUpperCase() && x.email === email.trim().toLowerCase(); })[0];
      if (!b) return Promise.reject(new Error("We couldn't find a booking with that code and email."));
      var ok = b.status === "booked" && Date.parse(b.start) - Date.now() > biz.cancelHours * 3600e3;
      return Promise.resolve({ booking: b, changeable: ok, lockedMsg: ok ? "" : "Online changes close " + biz.cancelHours + " hours before the appointment. Please call us." });
    },
    cancel: function (code, email) {
      if (LIVE) return http("POST", API + "cancel", { code: code, email: email }).then(function (j) { return j.booking; });
      return data.lookup(code, email).then(function (r) { r.booking.status = "cancelled"; r.booking.isNew = true; demoSave(); return r.booking; });
    },
    reschedule: function (code, email, start, staffId) {
      if (LIVE) return http("POST", API + "reschedule", { code: code, email: email, start: start, staffId: staffId }).then(function (j) { return j.booking; });
      return data.lookup(code, email).then(function (r) {
        var b = r.booking;
        Object.assign(b, E.resolveSlot(biz, occ(), { serviceId: b.serviceId, staffId: staffId || b.staffId, start: start }, { ignoreId: b.id }), { rescheduled: true, isNew: true }); demoSave();
        return b;
      });
    },
    // owner
    load: function () {
      if (!LIVE) return Promise.resolve();
      return http("GET", API + "admin/data").then(function (j) {
        setSettings(j.settings); biz.bookings = j.bookings; biz.blocks = j.blocks || [];
        owner.signedIn = true; owner.mailOn = j.mailOn; try { localStorage.setItem("wl_booking_slug", SLUG); } catch (e) {} owner.email = j.ownerEmail || ""; owner.plan = j.plan; owner.plans = j.plans; owner.services = j.services; owner.requests = j.requests || []; owner.feedUrl = j.feedUrl;
        owner.me = j.me || { role: "owner" }; owner.team = j.team || []; owner.payments = j.payments || {};
      });
    },
    status: function (id, status, refund) {
      var b = bookingById(id);
      if (!LIVE) return run(function () {
        if (status === "cancelled" && refund && b.payment && b.payment.status === "paid") b.payment.status = "refunded";
        if (b.status === "cancelled" && status !== "cancelled") E.resolveSlot(biz, occ(), { serviceId: b.serviceId, staffId: b.staffId, start: b.start }, { owner: true, ignoreId: b.id });
        b.status = status; b.isNew = false; demoSave();
      }).catch(function () { throw new Error("That time has been booked by someone else since, so it can't be restored."); });
      return http("POST", API + "admin/status", { id: id, status: status, refund: refund !== false }).then(function () { b.status = status; b.isNew = false; if (status === "cancelled" && refund !== false && b.payment && b.payment.status === "paid") b.payment.status = "refunded"; });
    },
    saveSettings: function () {
      if (!LIVE) { demoSave(); return Promise.resolve(); }
      var s = Object.assign({}, biz); delete s.bookings; delete s.blocks; delete s.clients;
      return http("PUT", API + "admin/settings", { settings: s }).then(function (j) { setSettings(j.settings); });
    },
    ownerBook: function (p) {
      if (LIVE) return http("POST", API + "admin/book", p).then(function (j) { biz.bookings.push(j.booking); return j.booking; });
      return run(function () { return newBookingFrom(p, E.resolveSlot(biz, occ(), p, { owner: true }), p.source); });
    },
    update: function (p) {
      if (LIVE) return http("POST", API + "admin/update", p).then(function (j) { var b = bookingById(p.id); Object.assign(b, j.booking); return b; });
      return run(function () {
        var b = bookingById(p.id), next = { serviceId: p.serviceId || b.serviceId, staffId: p.staffId || b.staffId, start: p.start || b.start };
        if (next.start !== b.start || next.staffId !== b.staffId || next.serviceId !== b.serviceId) {
          try { Object.assign(b, E.resolveSlot(biz, occ(), next, { owner: true, ignoreId: b.id }), { serviceId: next.serviceId, rescheduled: true }); }
          catch (e) { throw new Error("That time isn't free for this person (another booking, time off, a break or outside their hours)."); }
        }
        ["name", "phone", "email", "notes"].forEach(function (k) { if (p[k] !== undefined) b[k] = p[k]; });
        demoSave(); return b;
      });
    },
    addBlock: function (p) {
      if (LIVE) return http("POST", API + "admin/blocks/add", p).then(function (j) { biz.blocks.push(j.block); return j; });
      return run(function () {
        var blk = E.cleanBlock(biz, p); biz.blocks = (biz.blocks || []).concat(blk); demoSave();
        return { block: blk, conflicts: biz.bookings.filter(function (b) { return b.status === "booked" && (blk.staffId === "all" || b.staffId === blk.staffId) && Date.parse(b.start) < Date.parse(blk.end) && Date.parse(blk.start) < Date.parse(b.end); }) };
      });
    },
    removeBlock: function (id) {
      var drop = function () { biz.blocks = (biz.blocks || []).filter(function (b) { return b.id !== id; }); };
      if (LIVE) return http("POST", API + "admin/blocks/remove", { id: id }).then(drop);
      drop(); demoSave(); return Promise.resolve();
    },
    clients: function () {
      if (LIVE) return http("GET", API + "admin/clients").then(function (j) { return j.clients; });
      return run(function () { return E.clientList({ settings: biz, bookings: biz.bookings, clients: biz.clients || {} }); });
    },
    saveClient: function (p) {
      if (LIVE) return http("POST", API + "admin/client", p);
      return run(function () {
        biz.clients = biz.clients || {};
        var r = biz.clients[p.key] || {};
        biz.clients[p.key] = Object.assign({}, r, { name: p.name !== undefined ? p.name : r.name, email: p.email !== undefined ? p.email : r.email, phone: p.phone !== undefined ? p.phone : r.phone, notes: p.notes !== undefined ? p.notes : r.notes || "",
          tags: (p.tags || r.tags || []).filter(function (t, i, a) { return t && a.indexOf(t) === i; }).slice(0, 10), blocked: p.blocked !== undefined ? Boolean(p.blocked) : Boolean(r.blocked), source: r.source || "added" });
        demoSave(); return { key: p.key };
      });
    },
    importClients: function (rows) {
      if (LIVE) return http("POST", API + "admin/clients/import", { rows: rows });
      return run(function () {
        var added = 0, updated = 0, skipped = 0; biz.clients = biz.clients || {};
        rows.slice(0, 5000).forEach(function (row) {
          var em = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email || "") ? row.email.trim().toLowerCase() : "", key = E.clientKey(em, row.phone);
          if (!key || !String(row.name || "").trim()) { skipped++; return; }
          var r = biz.clients[key]; biz.clients[key] = Object.assign({}, r || {}, { name: row.name.trim(), email: em || (r && r.email) || "", phone: row.phone || (r && r.phone) || "", notes: row.notes || (r && r.notes) || "",
            tags: String(row.tags || "").split(/[,;|]/).map(function (t) { return t.trim(); }).filter(Boolean).slice(0, 10), blocked: Boolean(r && r.blocked), source: (r && r.source) || "import" });
          r ? updated++ : added++;
        });
        demoSave(); return { added: added, updated: updated, skipped: skipped };
      });
    },
    request: function (p) {
      if (LIVE) return http("POST", API + "admin/request", p).then(function (j) { owner.requests.push(j.request); return j.request; });
      return Promise.reject(new Error("This is the demo, so nothing is sent. Create your own booking page to send requests to WebersLink."));
    },
  };
  function setSettings(s) { var keep = biz || {}; biz = Object.assign({}, s); biz.bookings = keep.bookings || []; biz.blocks = keep.blocks || []; biz.clients = keep.clients || {}; TZ = s.tz; applyBrand(); }

  function applyBrand() {
    document.documentElement.style.setProperty("--accent", biz.accent);
    $("logo").textContent = initials(biz.name).slice(0, 1) || "B"; $("bizName").textContent = biz.name; $("bizTag").textContent = biz.tag || "";
    document.title = (view === "admin" ? "Dashboard · " : "Book online · ") + biz.name;
    document.querySelectorAll("[data-niche]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.niche === niche)); });
    document.querySelector('meta[name="theme-color"]').setAttribute("content", biz.accent);
  }

  // ------------------------------------------------------------------ customer: booking flow
  var STEPS = ["Service", "Who", "Date & time", "Your details"];
  function startFlow(prefill) { flow = Object.assign({ step: 0, serviceId: "", staffId: "", date: "", t: null, days: null, loading: false }, prefill || {}); }

  function renderBook() {
    if (LIVE && biz.setupDone === false) { $("main").innerHTML = '<div class="panel done"><h1>Online booking opens soon</h1><p class="hint">' + esc(biz.name) + " is still setting up this page." + (biz.phone ? ' To book now, call <a href="tel:' + esc(biz.phone.replace(/[^\d+]/g, "")) + '">' + esc(biz.phone) + "</a>." : "") + "</p></div>"; return; }
    if (!flow) startFlow();
    if (flow.step === 4) return renderDone();
    if (flow.step === "pay") return renderDemoPay();
    if (flow.step === "unpaid") { $("main").innerHTML = '<div class="panel done"><h1 tabindex="-1">Payment not finished</h1><p class="hint">Your booking isn\'t confirmed because the payment wasn\'t completed. Nothing was charged. The time is held for a few minutes; you can book again.</p><button type="button" class="btn primary" data-act="again">Book again</button></div>'; return; }
    if (flow.step === "manage") return renderManage();
    var html = '<div class="flow"><div class="panel">' +
      '<ol class="steps">' + STEPS.map(function (s, i) { return '<li class="' + (i === flow.step ? "on" : i < flow.step ? "done" : "") + '"' + (i === flow.step ? ' aria-current="step"' : "") + '><span class="n">' + (i < flow.step ? "✓" : i + 1) + "</span>" + s + "</li>"; }).join("") + "</ol>";
    html += flow.step === 0 ? stepService() : flow.step === 1 ? stepWho() : flow.step === 2 ? stepWhen() : stepDetails();
    $("main").innerHTML = html + "</div>" + summary() + "</div>";
    if (flow.step === 2 && !flow.days && !flow.loading) loadSlots();
  }
  function stepService() {
    return "<h1>" + (flow.moving ? "Pick a new time" : "Book an appointment") + '</h1><p class="hint">Choose a service. You can book any time, day or night.' + (flow.moving ? "" : ' Already booked? <a href="#" data-act="manage">Change or cancel it</a>.') + "</p>" +
      (function () {
        var shown = biz.services.filter(function (s) { return eligible(s.id).length && s.online !== false; }), cats = [];
        shown.forEach(function (s) { var c = s.category || ""; if (cats.indexOf(c) < 0) cats.push(c); });
        var cardOf = function (s) {
        return '<button type="button" class="card" data-act="svc" data-id="' + esc(s.id) + '" aria-pressed="' + (flow.serviceId === s.id) + '"><b>' + esc(s.name) + "</b>" + (s.desc ? '<span class="hint">' + esc(s.desc) + "</span>" : "") + '<span class="meta"><span>' + mins(s.mins) + '</span><span class="price">' + money(s.price) + "</span></span></button>";
        };
        return cats.map(function (c) { return (cats.length > 1 || c ? '<h2 class="cat">' + esc(c || "Other") + "</h2>" : "") + '<div class="cards">' + shown.filter(function (s) { return (s.category || "") === c; }).map(cardOf).join("") + "</div>"; }).join("");
      })();
  }
  function stepWho() {
    var list = eligible(flow.serviceId);
    return '<h1>Who would you like?</h1><p class="hint">Pick a ' + esc(biz.who) + ", or choose “Anyone” to see the most times.</p>" +
      '<div class="cards"><button type="button" class="card" data-act="who" data-id="any" aria-pressed="' + (flow.staffId === "any") + '"><span class="avatar" aria-hidden="true">★</span><b>Anyone available</b><span class="hint">Most choice of times</span></button>' +
      list.map(function (s) {
        return '<button type="button" class="card" data-act="who" data-id="' + esc(s.id) + '" aria-pressed="' + (flow.staffId === s.id) + '"><span class="avatar" aria-hidden="true">' + esc(initials(s.name)) + "</span><b>" + esc(s.name) + '</b><span class="hint">' + esc(s.role ? s.role + " · " : "") + "works " + ORDER.filter(function (d) { return s.days.indexOf(d) >= 0; }).map(function (d) { return DAYS[d]; }).join(", ") + "</span></button>";
      }).join("") + "</div>" + back();
  }
  function loadSlots() {
    flow.loading = true; var ask = flow.serviceId + "|" + flow.staffId;
    data.slots(flow.serviceId, flow.staffId, flow.moving && flow.moving.id).then(function (days) {
      if (!flow || flow.serviceId + "|" + flow.staffId !== ask) return;
      flow.days = days; flow.loading = false;
      if (!flow.date || !days.some(function (d) { return d.date === flow.date && d.slots.length; })) { var f = days.filter(function (d) { return d.slots.length; })[0]; flow.date = f ? f.date : ""; flow.t = null; }
      render();
    }).catch(function (e) { flow.loading = false; flow.days = []; flow.error = e.message; render(); });
  }
  function stepWhen() {
    if (!flow.days) return "<h1>Pick a date and time</h1>" + '<p class="hint" role="status">Finding free times…</p>' + back();
    var tzNote = LIVE ? "Times are in " + esc(biz.tz.replace(/_/g, " ").split("/").pop()) + " time." : "Times shown in your local time.";
    var html = '<h1>Pick a date and time</h1><p class="hint">' + tzNote + " Green dot = times available.</p>" + (flow.error ? '<p class="err" role="alert">' + esc(flow.error) + "</p>" : "") + '<div class="dates" role="group" aria-label="Dates">' +
      flow.days.map(function (x) { var n = x.slots.length; return '<button type="button" class="date" data-act="date" data-k="' + x.date + '" aria-pressed="' + (flow.date === x.date) + '"' + (n ? "" : " disabled") + ' aria-label="' + keyFmt(x.date, { weekday: "long", month: "long", day: "numeric" }) + (n ? ", " + n + " times" : ", no times") + '"><small>' + DAYS[wdOf(x.date)] + "</small><b>" + +x.date.slice(8) + "</b><small>" + keyFmt(x.date, { month: "short" }) + '</small><span class="dot"></span></button>'; }).join("") + "</div>";
    if (!flow.date) return html + '<p class="empty">No free times in the coming weeks. Try another ' + esc(biz.who) + (biz.phone ? " or call " + esc(biz.phone) : "") + ".</p>" + back();
    var day = flow.days.filter(function (d) { return d.date === flow.date; })[0], parts = [["Morning", 0, 12], ["Afternoon", 12, 17], ["Evening", 17, 24]];
    html += '<h2 style="margin-top:8px">' + keyFmt(flow.date, { weekday: "long", month: "long", day: "numeric" }) + "</h2>";
    parts.forEach(function (p) {
      var inPart = day.slots.filter(function (s) { var h = hourOf(new Date(s.t)); return h >= p[1] && h < p[2]; });
      if (!inPart.length) return;
      html += '<div class="part">' + p[0] + '</div><div class="slots" role="group" aria-label="' + p[0] + ' times">' + inPart.map(function (s) {
        return '<button type="button" class="slot" data-act="time" data-t="' + s.t + '" aria-pressed="' + (flow.t === s.t) + '">' + fmtTime(new Date(s.t)) + "</button>";
      }).join("") + "</div>";
    });
    return html + back('<button type="button" class="btn primary" data-act="next"' + (flow.t == null ? " disabled" : "") + ">" + (flow.moving ? "Move to this time" : "Continue") + "</button>");
  }
  function stepDetails() {
    var f = flow.form || {};
    var fld = function (id, label, type, extra, full) { return '<div class="field' + (full ? " full" : "") + '"><label for="' + id + '">' + label + '</label><input type="' + type + '" id="' + id + '" value="' + esc(f[id] || "") + '" ' + (extra || "") + "></div>"; };
    return "<h1>Your details</h1><p class=\"hint\">We'll email your confirmation" + (biz.reminderHours ? " and a reminder before your appointment" : "") + ".</p>" +
      '<form class="details" id="detailsForm" novalidate>' +
      fld("fname", "Full name", "text", 'autocomplete="name" required maxlength="80"') +
      fld("fphone", "Mobile number", "tel", 'autocomplete="tel" required maxlength="30"') +
      fld("femail", "Email", "email", 'autocomplete="email" required maxlength="120"', true) +
      (biz.needAddress ? fld("faddr", "Address of the job", "text", 'autocomplete="street-address" required maxlength="160"', true) : "") +
      '<div class="field full"><label for="fnotes">' + (biz.needAddress ? "What's the problem? (optional)" : "Anything we should know? (optional)") + '</label><textarea id="fnotes" maxlength="500">' + esc(f.fnotes || "") + "</textarea></div>" +
      (biz.questions || []).map(function (q) {
        var v = (f.answers || {})[q.id] || "", id = "fq_" + q.id, lab = '<label for="' + id + '">' + esc(q.label) + (q.required ? "" : ' <span class="hint">(optional)</span>') + "</label>";
        if (q.type === "long") return '<div class="field full">' + lab + '<textarea id="' + id + '" data-q="' + esc(q.id) + '" maxlength="1000">' + esc(v) + "</textarea></div>";
        if (q.type === "select") return '<div class="field full">' + lab + '<select id="' + id + '" data-q="' + esc(q.id) + '"><option value="">Choose…</option>' + q.options.map(function (o) { return '<option' + (o === v ? " selected" : "") + ">" + esc(o) + "</option>"; }).join("") + "</select></div>";
        if (q.type === "yesno") return '<div class="field full">' + lab + '<select id="' + id + '" data-q="' + esc(q.id) + '"><option value="">Choose…</option><option value="yes"' + (v === "yes" ? " selected" : "") + '>Yes</option><option value="no"' + (v === "no" ? " selected" : "") + ">No</option></select></div>";
        return '<div class="field full">' + lab + '<input type="text" id="' + id + '" data-q="' + esc(q.id) + '" maxlength="200" value="' + esc(v) + '"></div>';
      }).join("") +
      '<div class="sr" aria-hidden="true"><label for="fweb">Leave this empty</label><input type="text" id="fweb" tabindex="-1" autocomplete="off"></div>' +
      '<p class="err full" id="formErr" role="alert" hidden></p>' +
      '<div class="row full"><button type="button" class="btn ghost" data-act="back">← Back</button><span class="spacer"></span><button type="submit" class="btn primary" id="confirmBtn">' + (depositOf(service(flow.serviceId)) ? "Continue to payment" : "Confirm booking") + "</button></div></form>";
  }
  function back(extra) { return '<div class="row" style="margin-top:18px"><button type="button" class="btn ghost" data-act="back">← Back</button><span class="spacer"></span>' + (extra || "") + "</div>"; }
  // Deposit a customer pays online for a service (0 = nothing). Live: only when the business has Stripe connected.
  function depositOf(s) { return s && (LIVE ? biz.payments : true) ? E.depositFor(s) : 0; }
  function summary() {
    var dep = depositOf(service(flow.serviceId));
    var s = service(flow.serviceId), who = flow.staffId === "any" ? "Anyone available" : flow.staffId ? person(flow.staffId).name : "";
    var when = flow.t ? fmtDate(new Date(flow.t)) + ", " + fmtTime(new Date(flow.t)) : "";
    return '<aside class="panel summary" aria-label="Your booking"><h3>Your booking</h3>' +
      (s ? "<dl><dt>Service</dt><dd>" + esc(s.name) + "</dd><dt>Length</dt><dd>" + mins(s.mins) + "</dd>" + (who ? "<dt>With</dt><dd>" + esc(who) + "</dd>" : "") + (when ? "<dt>When</dt><dd>" + esc(when) + "</dd>" : "") + "</dl>" +
        '<div class="total"><span>Price</span><span>' + money(s.price) + "</span></div>" +
        (dep ? '<dl style="margin-top:10px"><dt>Pay online now</dt><dd>' + money(dep) + "</dd>" + (dep < s.price ? "<dt>Pay at your appointment</dt><dd>" + money(Math.round((s.price - dep) * 100) / 100) + "</dd>" : "") + '</dl><p class="hint" style="margin-top:6px">Secure card payment by Stripe. Refunded if you cancel in time.</p>' : "") : '<p class="empty">Choose a service to start.</p>') +
      (biz.policy ? '<p class="hint policy">' + esc(biz.policy) + "</p>" : "") + (biz.phone ? '<p class="hint">Questions? Call <a href="tel:' + esc(biz.phone.replace(/[^\d+]/g, "")) + '">' + esc(biz.phone) + "</a></p>" : "") + "</aside>";
  }

  function submitDetails() {
    var get = function (id) { var el = $(id); return el ? el.value.trim() : ""; };
    var answers = {}; document.querySelectorAll("[data-q]").forEach(function (el) { if (el.value.trim()) answers[el.dataset.q] = el.value.trim(); });
    flow.form = { fname: get("fname"), fphone: get("fphone"), femail: get("femail"), faddr: get("faddr"), fnotes: get("fnotes"), answers: answers };
    var missing = (biz.questions || []).filter(function (q) { return q.required && !answers[q.id]; })[0];
    if (missing) { var me = $("formErr"); me.textContent = "Please answer: " + missing.label; me.hidden = false; return; }
    var err = !flow.form.fname ? "Please enter your name." : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(flow.form.femail) ? "Please enter a valid email." : flow.form.fphone.replace(/\D/g, "").length < 7 ? "Please enter a phone number." : biz.needAddress && !flow.form.faddr ? "Please enter the address of the job." : "";
    if (err) { var e = $("formErr"); e.textContent = err; e.hidden = false; return; }
    $("confirmBtn").disabled = true; $("confirmBtn").textContent = "Booking…";
    data.book({ serviceId: flow.serviceId, staffId: flow.staffId, start: flow.t, name: flow.form.fname, email: flow.form.femail, phone: flow.form.fphone, address: flow.form.faddr, notes: flow.form.fnotes, answers: flow.form.answers, website: get("fweb") })
      .then(function (r) {
        if (r.payUrl) { $("confirmBtn").textContent = "Opening secure payment…"; location.href = r.payUrl; return; }
        if (r.booking.status === "pending") { flow = { step: "pay", booking: r.booking }; return render(); } // demo: simulated payment
        flow = { step: 4, booking: r.booking }; render();
      })
      .catch(function (e) {
        if (/taken/.test(e.message)) { toast(e.message, true); flow.step = 2; flow.t = null; flow.days = null; return render(); }
        var el = $("formErr"); el.textContent = e.message; el.hidden = false; $("confirmBtn").disabled = false; $("confirmBtn").textContent = depositOf(service(flow.serviceId)) ? "Continue to payment" : "Confirm booking";
      });
  }
  function moveTo() {
    var m = flow.moving;
    data.reschedule(m.code, m.email, flow.t, flow.staffId).then(function (b) { flow = { step: 4, booking: b, moved: true }; render(); })
      .catch(function (e) { toast(e.message, true); flow.days = null; flow.t = null; render(); });
  }

  function renderDemoPay() {
    var b = flow.booking, s = service(b.serviceId) || { name: "" };
    $("main").innerHTML = '<div class="panel" style="max-width:460px;margin:0 auto"><p class="hint" style="margin:0 0 6px"><span class="pill">Demo</span> This stands in for Stripe\'s secure payment page. No card is charged.</p><h1 tabindex="-1">Pay ' + money(b.payment.amount) + "</h1>" +
      '<p class="hint">' + (b.payment.amount < (s.price || 0) ? "Deposit for " : "") + esc(s.name) + ", " + esc(fmtDate(new Date(b.start))) + " " + esc(fmtTime(new Date(b.start))) + "</p>" +
      '<form class="details" id="demoPayForm" style="grid-template-columns:1fr" novalidate><div class="field"><label for="dpCard">Card number</label><input type="text" id="dpCard" value="4242 4242 4242 4242" inputmode="numeric"></div>' +
      '<div class="row"><button type="button" class="btn ghost" data-act="demopaycancel">Cancel</button><span class="spacer"></span><button type="submit" class="btn primary">Pay ' + money(b.payment.amount) + "</button></div></form></div>";
    $("main").querySelector("h1").focus();
  }
  function renderDone() {
    var b = flow.booking, s = service(b.serviceId) || { name: "", mins: 0 }, st = person(b.staffId), start = new Date(b.start);
    $("main").innerHTML = '<div class="panel done"><div class="tick" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>' +
      '<h1 tabindex="-1">' + (flow.moved ? "Your booking has moved" : "You're booked in!") + "</h1>" +
      '<p class="hint">' + esc(s.name) + " with " + esc(st.name) + "<br><b>" + esc(fmtDate(start)) + " at " + esc(fmtTime(start)) + "</b> · " + mins(s.mins) + "</p>" +
      (b.payment && b.payment.status === "paid" ? '<p class="hint"><span class="pill paid">Paid ' + money(b.payment.amount) + "</span>" + (b.payment.amount < s.price ? " · " + money(Math.round((s.price - b.payment.amount) * 100) / 100) + " to pay at your appointment" : "") + "</p>" : "") +
      '<p class="hint" style="margin-bottom:0">Your booking code</p><div class="code">' + esc(b.code) + "</div>" +
      '<div class="row" style="justify-content:center"><button type="button" class="btn" data-act="ics">Add to calendar (.ics)</button><a class="btn" target="_blank" rel="noopener" href="' + esc(gcal(b)) + '">Google Calendar</a></div>' +
      (LIVE ? '<p class="hint" style="margin-top:16px">A confirmation is on its way to <b>' + esc(b.email) + "</b>. Keep your code to change or cancel online.</p>"
        : '<div class="notice"><b>What a real install sends now</b> (shown here instead of sending)<pre>' + esc(messages(b).confirm) + "</pre></div>") +
      '<div class="row" style="justify-content:center;margin-top:18px"><button type="button" class="btn primary" data-act="again">Book another</button>' + (LIVE ? "" : '<button type="button" class="btn" data-act="toadmin">See it in the business dashboard →</button>') + "</div></div>";
    $("main").querySelector("h1").focus();
  }

  function renderManage() {
    var m = flow.manage || {};
    var html = '<div class="panel" style="max-width:560px;margin:0 auto"><h1 tabindex="-1">Change or cancel a booking</h1><p class="hint">Enter the code from your confirmation and the email you booked with.</p>' +
      '<form class="details" id="manageForm" novalidate><div class="field"><label for="mcode">Booking code</label><input type="text" id="mcode" value="' + esc(m.code || "") + '" autocomplete="off" maxlength="20" placeholder="ABCD-XXXXXX"></div>' +
      '<div class="field"><label for="memail">Email</label><input type="email" id="memail" value="' + esc(m.email || "") + '" maxlength="120" autocomplete="email"></div>' +
      '<p class="err full" id="manageErr" role="alert" hidden></p><div class="row full"><button type="button" class="btn ghost" data-act="again">← Back</button><span class="spacer"></span><button type="submit" class="btn primary">Find my booking</button></div></form>';
    var b = m.found;
    if (b) {
      var start = new Date(b.start), s = service(b.serviceId) || { name: "Appointment" };
      html += '<div class="notice"><b>' + esc(s.name) + "</b> with " + esc(person(b.staffId).name) + "<br>" + esc(fmtDate(start)) + " at " + esc(fmtTime(start)) +
        (b.status === "cancelled" ? '<br><span class="err">This booking is cancelled.</span>' : !m.changeable ? '<br><span class="hint">' + esc(m.lockedMsg || "This booking can't be changed online.") + "</span>" :
          '<div class="row" style="margin-top:10px"><button type="button" class="btn" data-act="resched">Pick a new time</button><button type="button" class="btn danger" data-act="cancelmine">Cancel booking</button></div>') + "</div>";
    }
    $("main").innerHTML = html + "</div>";
    if (!b) $("main").querySelector("h1").focus();
  }
  function findBooking() {
    var c = $("mcode").value.trim(), e = $("memail").value.trim();
    flow.manage = { code: c, email: e };
    data.lookup(c, e).then(function (r) { flow.manage = { code: c, email: e, found: r.booking, changeable: r.changeable, lockedMsg: r.lockedMsg }; renderManage(); })
      .catch(function (err) { var el = $("manageErr"); el.textContent = err.message; el.hidden = false; });
  }

  // ------------------------------------------------------------------ calendar files + messages
  function icsDate(d) { return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); }
  function downloadIcs(b) {
    var s = service(b.serviceId) || { name: "Appointment" }, clean = function (v) { return String(v || "").replace(/[\r\n]+/g, " ").replace(/([,;\\])/g, "\\$1"); };
    var text = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Weberslink//Booking//EN", "METHOD:PUBLISH", "BEGIN:VEVENT", "UID:" + b.code + "@booking.weberslink", "DTSTAMP:" + icsDate(new Date()),
      "DTSTART:" + icsDate(new Date(b.start)), "DTEND:" + icsDate(new Date(b.end)), "SUMMARY:" + clean(s.name + " – " + biz.name), "DESCRIPTION:" + clean("With " + person(b.staffId).name + ". Booking code " + b.code + "."),
      "LOCATION:" + clean(b.address || biz.tag), "BEGIN:VALARM", "TRIGGER:-PT2H", "ACTION:DISPLAY", "DESCRIPTION:Reminder", "END:VALARM", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    var url = URL.createObjectURL(new Blob([text], { type: "text/calendar" })), a = document.createElement("a");
    a.href = url; a.download = "booking-" + b.code + ".ics"; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }
  function gcal(b) {
    var s = service(b.serviceId) || { name: "Appointment" };
    return "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + encodeURIComponent(s.name + " – " + biz.name) +
      "&dates=" + icsDate(new Date(b.start)) + "/" + icsDate(new Date(b.end)) + "&details=" + encodeURIComponent("With " + person(b.staffId).name + ". Booking code " + b.code + ".");
  }
  function messages(b) {
    var s = service(b.serviceId) || { name: "appointment" }, st = person(b.staffId), d = new Date(b.start), first = String(b.name).split(" ")[0];
    return {
      confirm: "Email to " + b.email + "\nSubject: Confirmed: " + s.name + " on " + fmtShort(d) + "\n\nHi " + first + ", you're booked in with " + st.name + " on " + fmtDate(d) + " at " + fmtTime(d) + ".\nBooking code: " + b.code + "\nNeed to change it? Use the link in this email.\n\n" + biz.policy,
      reminder: "Email to " + b.email + " (" + biz.reminderHours + " hours before)\nSubject: Reminder: " + s.name + " " + fmtShort(d) + "\n\nHi " + first + ", a reminder of your " + s.name.toLowerCase() + " at " + fmtTime(d) + " with " + st.name + ". Can't make it? Change or cancel with the link in this email.",
      owner: "Email to the business\nSubject: New booking: " + b.name + " – " + s.name + "\n\n" + b.name + ", " + fmtShort(d) + " " + fmtTime(d) + " with " + st.name + ". Phone " + b.phone + ", " + b.email + ".",
    };
  }

  // ------------------------------------------------------------------ business dashboard
  function renderLogin(msg) {
    $("main").innerHTML = '<div class="panel" style="max-width:420px;margin:30px auto"><h1 tabindex="-1">Business sign in</h1><p class="hint">' + esc(biz ? biz.name : "") + ' dashboard (owner). <a href="/book/forgot">Forgot your password?</a></p><p class="hint">Team member? <a href="/book/login">Sign in with your email</a>.</p>' +
      '<form class="details" id="loginForm" style="grid-template-columns:1fr"><div class="field"><label for="lpw">Password</label><input type="password" id="lpw" autocomplete="current-password" required></div>' +
      '<p class="err" id="loginErr" role="alert"' + (msg ? "" : " hidden") + ">" + esc(msg || "") + '</p><button type="submit" class="btn primary">Sign in</button></form></div>';
    $("lpw").focus();
  }
  function renderAdmin() {
    if (LIVE && !owner.signedIn) return renderLogin();
    if (LIVE && (biz.setupDone === false || wiz.done)) return renderWizard();
    var all = [["agenda", "Calendar"], ["newbk", "Add booking"], ["clients", "Clients"], ["timeoff", "Time off"], ["numbers", "Reports"], ["setup", "Settings"], ["messages", LIVE ? "Share" : "Messages"], ["plan", "Plan & help"]];
    var role = ROLE(), tabs = role === "staff" ? all.filter(function (t) { return ["agenda", "newbk", "clients", "timeoff", "setup"].indexOf(t[0]) >= 0; }).map(function (t) { return t[0] === "setup" ? ["setup", "My account"] : t; }) : all;
    if (!tabs.some(function (t) { return t[0] === adminTab; })) adminTab = "agenda";
    var html = '<div class="tabs" role="tablist">' + tabs.map(function (t) { return '<button type="button" role="tab" data-tab="' + t[0] + '" aria-selected="' + (adminTab === t[0]) + '">' + t[1] + "</button>"; }).join("") + "</div>";
    if (LIVE) html += '<div class="row" style="margin:-8px 0 12px"><span class="hint">Signed in as <b>' + esc((owner.me && owner.me.name) || "Owner") + "</b> · " + esc(ROLE()) + '</span><span class="spacer"></span><a class="btn sm ghost" href="/book/' + esc(SLUG) + '" target="_blank" rel="noopener">Open booking page ↗</a><button type="button" class="btn sm ghost" data-act="logout">Sign out</button></div>';
    html += '<div role="tabpanel">' + ({ agenda: agenda, newbk: newBooking, clients: clientsTab, timeoff: timeOffTab, numbers: numbers, setup: setup, messages: shareTab, plan: planTab }[adminTab] || agenda)() + "</div>";
    $("main").innerHTML = html;
    if (adminTab === "newbk") nbLoad();
    if (adminTab === "clients" && !cl.list && !cl.loading) loadClients();
  }
  function dayBookings(key) { return (biz.bookings || []).filter(function (b) { return dayKey(new Date(b.start)) === key; }).sort(function (a, b) { return a.start.localeCompare(b.start); }); }
  function agenda() {
    if (!adminDay) adminDay = todayKey();
    var wd = wdOf(adminDay), mon = addKey(adminDay, -((wd + 6) % 7)), newOnes = (biz.bookings || []).filter(function (b) { return b.isNew; }).length;
    var html = '<div class="row"><h1 style="flex:1">' + keyFmt(adminDay, { weekday: "long", month: "long", day: "numeric" }) + '</h1><button type="button" class="btn sm" data-act="wk" data-n="-7" aria-label="Previous week">←</button><button type="button" class="btn sm" data-act="today">Today</button><button type="button" class="btn sm" data-act="wk" data-n="7" aria-label="Next week">→</button></div>';
    if (newOnes) html += '<p class="hint" style="margin:6px 0 0"><span class="pill new" style="margin:0">' + newOnes + " new or changed</span> since you last looked" + (LIVE ? ' · <a href="#" data-act="seen">mark all as seen</a>' : "") + "</p>";
    html += '<div class="week" role="group" aria-label="Week">';
    for (var i = 0; i < 7; i++) {
      var k = addKey(mon, i), n = dayBookings(k).filter(live).length, closed = !biz.hours[wdOf(k)];
      html += '<button type="button" data-act="day" data-k="' + k + '" aria-pressed="' + (k === adminDay) + '">' + DAYS[wdOf(k)] + "<b>" + +k.slice(8) + "</b><i>" + (closed ? "closed" : n ? n + " booked" : "") + "</i></button>";
    }
    html += "</div>";
    var list = dayBookings(adminDay);
    if (!biz.hours[wd] && !list.length) return html + '<p class="empty">Closed on ' + DAYS_LONG[wd] + "s. Change it in Settings.</p>";
    list = list.filter(function (b) { return b.status !== "expired"; });
    return html + '<div class="cols">' + biz.staff.filter(function (st) { return !MY_STAFF() || st.id === MY_STAFF(); }).map(function (st) {
      var mine = list.filter(function (b) { return b.staffId === st.id; }), off = st.days.indexOf(wd) < 0;
      return '<section class="col"><h3><span class="avatar" aria-hidden="true">' + esc(initials(st.name)) + "</span>" + esc(st.name) + '<span class="hint" style="font-weight:400">' + (off ? "day off" : mine.filter(live).length + " appts") + "</span></h3>" +
        (mine.length ? mine.map(appt).join("") : '<p class="empty">' + (off ? "Not working today." : "Nothing booked yet.") + "</p>") + "</section>";
    }).join("") + "</div>";
  }
  function appt(b) {
    var s = service(b.serviceId), start = new Date(b.start), past = start.getTime() < Date.now();
    var label = { done: "Done", "no-show": "No-show", cancelled: "Cancelled" }[b.status];
    var act = function (st, txt, cls) { return '<button type="button" class="btn sm' + (cls ? " " + cls : "") + '" data-act="st" data-id="' + esc(b.id) + '" data-s="' + st + '">' + txt + "</button>"; };
    return '<div class="appt ' + esc(b.status) + '"><div class="t">' + fmtTime(start) + " – " + fmtTime(new Date(b.end)) + (b.isNew ? '<span class="pill new">New</span>' : "") + (b.source && b.source !== "online" ? '<span class="pill">' + esc(b.source) + "</span>" : "") + (label ? '<span class="pill">' + label + "</span>" : "") + (b.rescheduled ? '<span class="pill">moved</span>' : "") + "</div>" +
      '<div class="who">' + esc(b.name) + " · " + esc(s ? s.name : "") + '</div><div class="meta"><a href="tel:' + esc(String(b.phone).replace(/[^\d+]/g, "")) + '">' + esc(b.phone) + "</a>" + (b.email ? " · " + esc(b.email) : "") + (b.address ? " · " + esc(b.address) : "") + (b.notes ? " · “" + esc(b.notes) + "”" : "") + " · " + esc(b.code) + "</div>" +
      (b.answers && Object.keys(b.answers).length ? '<div class="meta">' + (biz.questions || []).filter(function (q) { return b.answers[q.id]; }).map(function (q) { return esc(q.label) + ": <b>" + esc(b.answers[q.id]) + "</b>"; }).join(" · ") + "</div>" : "") +
      (b.payment ? '<div class="meta">' + (b.payment.status === "paid" ? '<span class="pill paid">Deposit paid ' + money(b.payment.amount) + "</span>" + (b.status !== "booked" && b.status !== "done" ? ' <button type="button" class="btn sm ghost" data-act="refund" data-id="' + esc(b.id) + '">Refund</button>' : "") : b.payment.status === "refunded" ? '<span class="pill">Refunded ' + money(b.payment.amount) + "</span>" : b.payment.status === "pending" ? '<span class="pill new">Waiting for ' + money(b.payment.amount) + " deposit</span>" : "") + (b.payment.refundError ? ' <span class="err">Refund failed: ' + esc(b.payment.refundError) + "</span>" : "") + "</div>" : "") +
      (b.status === "pending" ? '<p class="hint" style="margin:6px 0 0">The customer is paying now. The time is held until ' + esc(fmtTime(new Date(b.holdUntil))) + ".</p>" :
      editId === b.id ? editPanel(b) : b.status === "booked" ? '<div class="acts"><button type="button" class="btn sm" data-act="edit" data-id="' + esc(b.id) + '">Edit / move</button>' + (past ? act("done", "Done") + act("no-show", "No-show") : "") + act("cancelled", "Cancel", "danger") + "</div>" : '<div class="acts">' + act("booked", "Undo", "ghost") + "</div>") + "</div>";
  }
  // Move or edit a booking (owner)
  var editId = null;
  function editPanel(b) {
    var d = new Date(b.start), opt = function (v, t, sel) { return '<option value="' + esc(v) + '"' + (sel ? " selected" : "") + ">" + esc(t) + "</option>"; };
    var hh = fmt(d, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    return '<form class="details edit-bk" id="editForm" data-id="' + esc(b.id) + '" novalidate style="grid-template-columns:1fr 1fr;margin-top:10px">' +
      '<div class="field"><label for="edDate">Date</label><input type="date" id="edDate" value="' + dayKey(d) + '"></div><div class="field"><label for="edTime">Time</label><input type="time" id="edTime" step="300" value="' + esc(hh) + '"></div>' +
      '<div class="field"><label for="edSvc">Service</label><select id="edSvc">' + biz.services.map(function (s) { return opt(s.id, s.name, s.id === b.serviceId); }).join("") + "</select></div>" +
      '<div class="field"><label for="edWho">With</label><select id="edWho">' + biz.staff.map(function (p) { return opt(p.id, p.name, p.id === b.staffId); }).join("") + "</select></div>" +
      '<div class="field"><label for="edName">Name</label><input type="text" id="edName" maxlength="80" value="' + esc(b.name) + '"></div><div class="field"><label for="edPhone">Phone</label><input type="tel" id="edPhone" maxlength="30" value="' + esc(b.phone) + '"></div>' +
      '<div class="field full"><label for="edNotes">Notes</label><input type="text" id="edNotes" maxlength="500" value="' + esc(b.notes || "") + '"></div>' +
      (b.email ? '<label class="check full"><input type="checkbox" id="edNotify" checked> Email ' + esc(b.email) + " if the time changes</label>" : "") +
      '<p class="err full" id="edErr" role="alert" hidden></p><div class="row full"><button type="button" class="btn sm ghost" data-act="editcancel">Cancel</button><span class="spacer"></span><button type="submit" class="btn sm primary">Save</button></div></form>';
  }
  function editSave(form) {
    var v = function (id) { var el = $(id); return el ? el.value.trim() : ""; }, err = $("edErr");
    var tm = v("edTime").split(":"), start = new Date(E.zonedToUtc(v("edDate"), +tm[0] * 60 + +tm[1], biz.tz)).toISOString();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v("edDate")) || tm.length < 2) { err.textContent = "Choose a date and time."; err.hidden = false; return; }
    data.update({ id: form.dataset.id, start: start, serviceId: v("edSvc"), staffId: v("edWho"), name: v("edName"), phone: v("edPhone"), notes: v("edNotes"), notify: $("edNotify") ? $("edNotify").checked : false })
      .then(function (b) { editId = null; adminDay = dayKey(new Date(b.start)); toast("Booking updated"); renderAdmin(); })
      .catch(function (e) { err.textContent = e.message; err.hidden = false; });
  }

  // ------------------------------------------------------------------ clients (CRM)
  var cl = { list: null, loading: false, q: "", open: null };
  function loadClients() { cl.loading = true; data.clients().then(function (list) { cl.list = list; cl.loading = false; if (view === "admin" && adminTab === "clients") renderAdmin(); }).catch(function (e) { cl.loading = false; toast(e.message, true); }); }
  function clientsTab() {
    var head = '<div class="row" style="margin-bottom:12px"><h1 style="flex:1">Clients</h1><label class="btn sm" for="clImport" style="cursor:pointer">Import CSV</label><input type="file" id="clImport" accept=".csv,text/csv" hidden>' +
      (LIVE ? '<a class="btn sm" href="' + API + 'admin/clients.csv">Export CSV</a>' : '<button type="button" class="btn sm" data-act="clexport">Export CSV</button>') + "</div>";
    if (!cl.list) return head + '<p class="hint" role="status">Loading clients…</p>';
    var q = cl.q.toLowerCase(), rows = cl.list.filter(function (c) { return !q || (c.name + " " + c.email + " " + c.phone + " " + c.tags.join(" ")).toLowerCase().indexOf(q) >= 0; });
    var html = head + '<p class="hint" style="margin:-4px 0 10px">' + cl.list.length + " clients. Everyone who books is added automatically. Import columns: name, email, phone, notes, tags.</p>" +
      '<input type="search" id="clSearch" placeholder="Search name, email, phone or tag" value="' + esc(cl.q) + '" style="margin-bottom:10px">';
    if (cl.open) {
      var c = cl.list.filter(function (x) { return x.key === cl.open; })[0];
      if (c) {
        var hist = (biz.bookings || []).filter(function (b) { return E.clientKey(b.email, b.phone) === c.key || (b.email && b.email === c.email); }).sort(function (a, b) { return b.start.localeCompare(a.start); });
        html += '<div class="panel" style="margin-bottom:12px"><div class="row"><h2 style="flex:1">' + esc(c.name || c.email || c.phone) + '</h2><button type="button" class="btn sm ghost" data-act="clclose">Close</button></div>' +
          '<p class="hint">' + esc([c.email, c.phone].filter(Boolean).join(" · ")) + " · " + c.visits + " visits · " + c.upcoming + " upcoming · " + c.noShows + " no-shows · spent " + money(c.spent) + "</p>" +
          '<form class="details" id="clForm" data-key="' + esc(c.key) + '" novalidate><div class="field full"><label for="clNotes">Private notes</label><textarea id="clNotes" maxlength="2000">' + esc(c.notes) + "</textarea></div>" +
          '<div class="field"><label for="clTags">Tags (comma separated)</label><input type="text" id="clTags" value="' + esc(c.tags.join(", ")) + '" placeholder="VIP, colour, regular"></div>' +
          '<label class="check" style="align-self:end"><input type="checkbox" id="clBlocked"' + (c.blocked ? " checked" : "") + "> Block online booking for this client</label>" +
          '<div class="row full"><span class="spacer"></span><button type="submit" class="btn sm primary">Save client</button></div></form>' +
          '<h3 style="margin:14px 0 6px">History</h3>' + (hist.length ? "<table><tbody>" + hist.slice(0, 30).map(function (b) { var s = service(b.serviceId); return "<tr><td>" + esc(fmtShort(new Date(b.start))) + " " + esc(fmtTime(new Date(b.start))) + "</td><td>" + esc(s ? s.name : "") + "</td><td>" + esc(person(b.staffId).name) + "</td><td>" + esc(b.status) + "</td></tr>"; }).join("") + "</tbody></table>" : '<p class="empty">No bookings in the last 90 days.</p>') + "</div>";
      }
    }
    html += rows.length ? '<div class="scroll"><table><thead><tr><th>Client</th><th>Contact</th><th>Visits</th><th>Upcoming</th><th>No-shows</th><th>Spent</th><th>Last visit</th><th>Tags</th></tr></thead><tbody>' + rows.slice(0, 300).map(function (c) {
      return '<tr class="click" data-client="' + esc(c.key) + '" tabindex="0"><td><b>' + esc(c.name || "—") + "</b>" + (c.blocked ? ' <span class="pill">blocked</span>' : "") + (c.notes ? ' <span class="pill" title="Has notes">notes</span>' : "") + "</td><td>" + esc(c.email || c.phone) + "</td><td>" + c.visits + "</td><td>" + c.upcoming + "</td><td>" + (c.noShows ? '<b style="color:var(--warn)">' + c.noShows + "</b>" : 0) + "</td><td>" + money(c.spent) + "</td><td>" + (c.last ? esc(fmtShort(new Date(c.last))) : "—") + "</td><td>" + c.tags.map(function (t) { return '<span class="pill">' + esc(t) + "</span>"; }).join("") + "</td></tr>";
    }).join("") + "</tbody></table></div>" + (rows.length > 300 ? '<p class="hint">Showing 300 of ' + rows.length + ". Search to narrow down.</p>" : "") : '<p class="empty">No clients match.</p>';
    return html;
  }
  function parseCsv(text) {
    var rows = [], row = [], cell = "", q = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch === '"') q = true; else if (ch === ",") { row.push(cell); cell = ""; } else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; } else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    var head = (rows.shift() || []).map(function (h) { return h.replace(/^\ufeff/, "").trim().toLowerCase(); });
    var col = function (names) { for (var k = 0; k < names.length; k++) { var ix = head.indexOf(names[k]); if (ix >= 0) return ix; } return -1; };
    var ix = { name: col(["name", "full name", "client", "customer"]), email: col(["email", "e-mail", "email address"]), phone: col(["phone", "mobile", "phone number", "tel"]), notes: col(["notes", "note"]), tags: col(["tags", "tag"]) };
    if (ix.name < 0) throw new Error("The file needs a 'name' column (and email or phone).");
    return rows.filter(function (r) { return r.some(function (x) { return x.trim(); }); }).map(function (r) { var o = {}; Object.keys(ix).forEach(function (k) { o[k] = ix[k] >= 0 ? (r[ix[k]] || "").trim() : ""; }); return o; });
  }
  function downloadText(name, text, type) { var url = URL.createObjectURL(new Blob([text], { type: type })), a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 2000); }

  // ------------------------------------------------------------------ time off
  function timeOffTab() {
    var opt = function (v, t) { return '<option value="' + esc(v) + '">' + esc(t) + "</option>"; }, today = todayKey();
    var list = (biz.blocks || []).filter(function (b) { return Date.parse(b.end) > Date.now(); }).sort(function (a, b) { return a.start.localeCompare(b.start); });
    var when = function (b) { var s = new Date(b.start), e = new Date(b.end); var whole = fmt(s, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) === "00:00" && fmt(e, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) === "00:00";
      return whole ? (dayKey(s) === dayKey(new Date(e - 1)) ? fmtDate(s) : fmtShort(s) + " – " + fmtShort(new Date(e - 1))) : fmtShort(s) + " " + fmtTime(s) + " – " + (dayKey(s) === dayKey(e) ? "" : fmtShort(e) + " ") + fmtTime(e); };
    return '<h1>Time off &amp; closures</h1><p class="hint" style="margin:6px 0 14px">Holidays, days off, appointments of your own. Nobody can book these times. Existing bookings are not cancelled; you\'ll see which ones clash.</p>' +
      '<div class="grid2" style="align-items:start"><div class="panel"><h2>Add time off</h2><form class="details" id="toForm" novalidate style="grid-template-columns:1fr 1fr;margin-top:8px">' +
      '<div class="field full"><label for="toWho">Who</label><select id="toWho">' + (MY_STAFF() ? "" : opt("all", "Everyone (business closed)")) + biz.staff.filter(function (p) { return !MY_STAFF() || p.id === MY_STAFF(); }).map(function (p) { return opt(p.id, p.name); }).join("") + "</select></div>" +
      '<div class="field full"><label for="toKind">How long</label><select id="toKind"><option value="days">Whole day(s)</option><option value="time">Part of a day</option></select></div>' +
      '<div class="field"><label for="toFrom">From</label><input type="date" id="toFrom" value="' + today + '"></div><div class="field" id="toToWrap"><label for="toTo">To (incl.)</label><input type="date" id="toTo" value="' + today + '"></div>' +
      '<div class="field to-time" hidden><label for="toT1">Start</label><input type="time" id="toT1" value="12:00" step="300"></div><div class="field to-time" hidden><label for="toT2">End</label><input type="time" id="toT2" value="14:00" step="300"></div>' +
      '<div class="field full"><label for="toNote">Note (only you see it)</label><input type="text" id="toNote" maxlength="120" placeholder="Public holiday, training, dentist…"></div>' +
      '<p class="err full" id="toErr" role="alert" hidden></p><div class="row full"><span class="spacer"></span><button type="submit" class="btn primary">Add time off</button></div></form></div>' +
      '<div class="panel"><h2>Coming up</h2>' + (list.length ? "<table><tbody>" + list.map(function (b) {
        return "<tr><td><b>" + esc(b.staffId === "all" ? "Everyone" : person(b.staffId).name) + "</b><br><span class=\"hint\">" + esc(when(b)) + (b.note ? " · " + esc(b.note) : "") + '</span></td><td style="text-align:right"><button type="button" class="btn sm ghost" data-act="toremove" data-id="' + esc(b.id) + '">Remove</button></td></tr>';
      }).join("") + "</tbody></table>" : '<p class="empty">No time off planned.</p>') + "</div></div>";
  }
  function toSubmit() {
    var v = function (id) { return $(id).value.trim(); }, err = $("toErr"), p = { staffId: v("toWho"), note: v("toNote") };
    if (v("toKind") === "days") { p.fromDate = v("toFrom"); p.toDate = v("toTo") || v("toFrom"); }
    else { var a = v("toT1").split(":"), b = v("toT2").split(":"); p.start = new Date(E.zonedToUtc(v("toFrom"), +a[0] * 60 + +a[1], biz.tz)).toISOString(); p.end = new Date(E.zonedToUtc(v("toFrom"), +b[0] * 60 + +b[1], biz.tz)).toISOString(); }
    data.addBlock(p).then(function (r) {
      toast("Time off added"); renderAdmin();
      if (r.conflicts && r.conflicts.length) window.alert(r.conflicts.length + " existing booking" + (r.conflicts.length > 1 ? "s are" : " is") + " during this time:\n\n" + r.conflicts.map(function (b) { return "• " + b.name + ", " + fmtShort(new Date(b.start)) + " " + fmtTime(new Date(b.start)); }).join("\n") + "\n\nThey are still booked. Move or cancel them from the calendar.");
    }).catch(function (e) { err.textContent = e.message; err.hidden = false; });
  }

  // ------------------------------------------------------------------ plan & help
  function planTab() {
    if (!LIVE) return '<h1>Plans</h1><p class="hint" style="margin:6px 0 16px">This is the demo. Your own booking page starts on the Free plan.</p><div class="panel done" style="max-width:560px;margin:0"><h2>Ready to use it for your business?</h2><p class="hint" style="margin:8px 0 14px">Sign up, confirm your email and follow 5 short steps. Or let us set it all up for you.</p><div class="row" style="justify-content:center"><a class="btn primary" href="/book/new">Create your booking page</a><a class="btn" href="/#book">Talk to us</a></div></div>';
    var pl = owner.plan || {}, u = pl.usage || {}, P = owner.plans || {}, SV = owner.services || {};
    var card = function (key, p) { var cur = pl.key === key; return '<div class="panel plan' + (cur ? " cur" : "") + '"><div class="kick">' + (cur ? "Your plan" : "Plan") + "</div><h2>" + esc(p.name) + '</h2><p class="price">' + esc(p.price) + '</p><p class="hint">' + esc(p.note) + '</p><ul class="perks">' + p.perks.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" + (cur ? "" : '<button type="button" class="btn primary" data-act="req" data-kind="upgrade">Ask to upgrade</button>') + "</div>"; };
    var svc = function (kind, x) { return '<div class="panel plan"><div class="kick">Service</div><h2>' + esc(x.name) + '</h2><p class="price">' + esc(x.price) + '</p><p class="hint">' + esc(x.text) + '</p><button type="button" class="btn" data-act="req" data-kind="' + kind + '">Ask about this</button></div>'; };
    var meter = function (label, used, cap) { var pct = cap ? Math.min(100, Math.round(100 * used / cap)) : 0; return '<div class="kpi"><small>' + label + "</small><b>" + used + (cap ? " / " + cap : "") + "</b>" + (cap ? '<div class="meter"><i style="width:' + pct + '%"></i></div>' : "<span>unlimited</span>") + "</div>"; };
    return '<h1>Plan &amp; help</h1><div class="kpis" style="margin-top:14px">' + meter("Online bookings this month", u.bookingsThisMonth || 0, pl.bookingsPerMonth) + meter("Team members", u.staff || 0, pl.staff) + "</div>" +
      '<div class="plans">' + (P.free ? card("free", P.free) : "") + (P.pro ? card("pro", P.pro) : "") + (SV.setup ? svc("setup", SV.setup) : "") + (SV.custom ? svc("custom", SV.custom) : "") + "</div>" +
      (planReq ? '<div class="panel" id="reqPanel" style="margin-top:16px;max-width:640px"><h2>' + esc({ upgrade: "Upgrade to Pro", setup: "Done-for-you setup", custom: "Custom features" }[planReq]) + '</h2><p class="hint">We\'ll reply by email within one working day' + (planReq === "upgrade" ? " with how to pay. Your plan switches as soon as it's paid." : ".") + '</p><form class="details" id="reqForm" novalidate style="grid-template-columns:1fr"><div class="field"><label for="reqMsg">' + (planReq === "custom" ? "What do you need?" : "Anything we should know? (optional)") + '</label><textarea id="reqMsg" maxlength="3000"></textarea></div><div class="field"><label for="reqPhone">Phone or WhatsApp (optional)</label><input type="tel" id="reqPhone" maxlength="30"></div><p class="err" id="reqErr" role="alert" hidden></p><div class="row"><button type="button" class="btn ghost" data-act="reqcancel">Cancel</button><span class="spacer"></span><button type="submit" class="btn primary">Send to WebersLink</button></div></form></div>' : "") +
      ((owner.requests || []).length ? '<div class="panel" style="margin-top:16px"><h2>Your requests</h2><table><tbody>' + owner.requests.slice().reverse().map(function (r) { return "<tr><td>" + esc(fmtShort(new Date(r.createdAt))) + "</td><td>" + esc({ upgrade: "Upgrade", setup: "Done-for-you setup", custom: "Custom features" }[r.kind] || r.kind) + "</td><td>" + esc(r.message || "") + '</td><td><span class="pill' + (r.status === "done" ? "" : " new") + '">' + (r.status === "done" ? "done" : "sent") + "</span></td></tr>"; }).join("") + "</tbody></table></div>" : "");
  }
  var planReq = null;

  // Add a phone / walk-in booking
  var nb = { serviceId: "", staffId: "", date: "", t: "", days: null };
  function newBooking() {
    if (!nb.serviceId) nb.serviceId = biz.services[0].id;
    var people = eligible(nb.serviceId).filter(function (p) { return !MY_STAFF() || p.id === MY_STAFF(); });
    if (!people.some(function (p) { return p.id === nb.staffId; })) nb.staffId = people[0] ? people[0].id : "";
    var opt = function (v, t, sel) { return '<option value="' + esc(v) + '"' + (sel ? " selected" : "") + ">" + esc(t) + "</option>"; };
    var day = nb.days && nb.days.filter(function (d) { return d.date === nb.date; })[0];
    return '<div class="panel" style="max-width:720px"><h1>Add a booking</h1><p class="hint">For phone calls and walk-ins. Only free times are offered.</p><form class="details" id="nbForm" novalidate>' +
      '<div class="field"><label for="nbSvc">Service</label><select id="nbSvc">' + biz.services.map(function (s) { return opt(s.id, s.name + " (" + mins(s.mins) + ")", s.id === nb.serviceId); }).join("") + "</select></div>" +
      '<div class="field"><label for="nbWho">With</label><select id="nbWho">' + people.map(function (p) { return opt(p.id, p.name, p.id === nb.staffId); }).join("") + "</select></div>" +
      '<div class="field"><label for="nbDate">Date</label><select id="nbDate">' + (nb.days ? nb.days.filter(function (d) { return d.slots.length; }).map(function (d) { return opt(d.date, keyFmt(d.date, { weekday: "short", month: "short", day: "numeric" }) + " (" + d.slots.length + " free)", d.date === nb.date); }).join("") : opt("", "Loading…")) + "</select></div>" +
      '<div class="field"><label for="nbTime">Time</label><select id="nbTime">' + (day ? day.slots.map(function (s) { return opt(s.t, fmtTime(new Date(s.t)), s.t === nb.t); }).join("") : opt("", "—")) + "</select></div>" +
      '<div class="field"><label for="nbName">Customer name</label><input type="text" id="nbName" maxlength="80"></div>' +
      '<div class="field"><label for="nbPhone">Phone</label><input type="tel" id="nbPhone" maxlength="30"></div>' +
      '<div class="field"><label for="nbEmail">Email (optional: sends a confirmation)</label><input type="email" id="nbEmail" maxlength="120"></div>' +
      '<div class="field"><label for="nbSrc">How they booked</label><select id="nbSrc">' + opt("phone", "Phone call", true) + opt("walk-in", "Walk-in") + "</select></div>" +
      '<div class="field full"><label for="nbNotes">Notes</label><input type="text" id="nbNotes" maxlength="500"></div>' +
      '<p class="err full" id="nbErr" role="alert" hidden></p><div class="row full"><span class="spacer"></span><button type="submit" class="btn primary">Add booking</button></div></form></div>';
  }
  function nbLoad() {
    if (nb.days || !nb.staffId) return;
    nb.days = []; // loading marker
    data.slots(nb.serviceId, nb.staffId, null, true).then(function (days) {
      nb.days = days; var f = days.filter(function (d) { return d.slots.length; })[0];
      if (!days.some(function (d) { return d.date === nb.date && d.slots.length; })) nb.date = f ? f.date : "";
      var day = days.filter(function (d) { return d.date === nb.date; })[0]; nb.t = day && day.slots[0] ? day.slots[0].t : "";
      if (view === "admin" && adminTab === "newbk") renderAdmin();
    }).catch(function (e) { toast(e.message, true); });
  }
  function nbSubmit() {
    var v = function (id) { return $(id).value.trim(); }, err = $("nbErr");
    var p = { serviceId: v("nbSvc"), staffId: v("nbWho"), start: v("nbTime"), name: v("nbName"), phone: v("nbPhone"), email: v("nbEmail"), source: v("nbSrc"), notes: v("nbNotes") };
    var msg = !p.start ? "Pick a time." : !p.name ? "Enter the customer's name." : p.phone.replace(/\D/g, "").length < 7 ? "Enter a phone number." : p.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email) ? "That email doesn't look right." : "";
    if (msg) { err.textContent = msg; err.hidden = false; return; }
    data.ownerBook(p).then(function (b) { toast("Booking added for " + b.name); adminDay = dayKey(new Date(b.start)); adminTab = "agenda"; nb.days = null; render(); })
      .catch(function (e) { err.textContent = e.message; err.hidden = false; });
  }
  function reportsMore() {
    var now = Date.now(), from = now - 30 * 864e5, all = biz.bookings || [];
    var done = all.filter(function (b) { var t = Date.parse(b.start); return t < now && t > from && (b.status === "done" || b.status === "booked"); });
    var price = function (b) { var s = service(b.serviceId); return s ? s.price : 0; };
    var byPerson = biz.staff.map(function (p) { var mine = done.filter(function (b) { return b.staffId === p.id; }); return { n: p.name, c: mine.length, v: mine.reduce(function (a, b) { return a + price(b); }, 0) }; });
    var firstSeen = {}; all.slice().sort(function (a, b) { return a.start.localeCompare(b.start); }).forEach(function (b) { var k = E.clientKey(b.email, b.phone); if (k && !firstSeen[k]) firstSeen[k] = b.start; });
    var newC = 0, retC = 0, seen = {}; done.forEach(function (b) { var k = E.clientKey(b.email, b.phone); if (!k || seen[k]) return; seen[k] = 1; if (Date.parse(firstSeen[k]) > from) newC++; else retC++; });
    return '<div class="grid2" style="margin-bottom:16px"><div class="panel"><h2 style="margin-bottom:10px">Last 30 days by person</h2><table><thead><tr><th>Person</th><th>Appointments</th><th>Value</th></tr></thead><tbody>' + byPerson.map(function (x) { return "<tr><td>" + esc(x.n) + "</td><td>" + x.c + "</td><td>" + money(x.v) + "</td></tr>"; }).join("") +
      '<tr><td><b>Total</b></td><td><b>' + done.length + "</b></td><td><b>" + money(done.reduce(function (a, b) { return a + price(b); }, 0)) + "</b></td></tr></tbody></table></div>" +
      '<div class="panel"><h2 style="margin-bottom:10px">Clients, last 30 days</h2><div class="kpis" style="margin:0"><div class="kpi"><small>New clients</small><b>' + newC + '</b><span>first visit in this period</span></div><div class="kpi"><small>Returning</small><b>' + retC + "</b><span>came back</span></div></div></div></div>";
  }
  function numbers() {
    var now = Date.now(), wk = now + 7 * 864e5, monthAgo = now - 30 * 864e5, all = biz.bookings || [];
    var upcoming = all.filter(function (b) { var t = Date.parse(b.start); return live(b) && t >= now && t < wk; });
    var past = all.filter(function (b) { var t = Date.parse(b.start); return t < now && t > monthAgo && b.status !== "cancelled"; });
    var noShow = past.filter(function (b) { return b.status === "no-show"; }).length;
    var online = all.filter(function (b) { return b.source === "online"; });
    var after = online.filter(function (b) { var h = hourOf(new Date(b.createdAt)); return h < 9 || h >= 18; }).length;
    var cancelled = all.filter(function (b) { return b.status === "cancelled" && Date.parse(b.start) > monthAgo; }).length;
    var sum = function (arr) { return arr.reduce(function (a, b) { var s = service(b.serviceId); return a + (s ? s.price : 0); }, 0); };
    var kpi = function (label, val, sub) { return '<div class="kpi"><small>' + label + "</small><b>" + val + "</b><span>" + sub + "</span></div>"; };
    var bySvc = biz.services.map(function (s) { return { s: s, n: all.filter(function (b) { return live(b) && b.serviceId === s.id; }).length }; }).sort(function (a, b) { return b.n - a.n; });
    var max = Math.max.apply(null, bySvc.map(function (x) { return x.n; }).concat(1));
    return '<div class="row" style="margin-bottom:14px"><h1 style="flex:1">How bookings are going</h1>' + (LIVE ? '<a class="btn sm" href="' + API + 'admin/export.csv">Download all bookings (CSV)</a>' : "") + '</div><div class="kpis">' +
      kpi("Next 7 days", upcoming.length, "appointments booked") +
      kpi("Booked value", money(sum(upcoming)), "next 7 days") +
      kpi("Booked online", Math.round(100 * online.length / Math.max(1, all.length)) + "%", "no phone call needed") +
      kpi("Outside opening hours", after, "online bookings made after hours") +
      kpi("No-show rate", Math.round(100 * noShow / Math.max(1, past.length)) + "%", "last 30 days") +
      kpi("Cancelled", cancelled, "last 30 days and upcoming") + "</div>" +
      reportsMore() + '<div class="panel"><h2 style="margin-bottom:10px">Most booked services</h2><table><tbody>' + bySvc.map(function (x) {
        return "<tr><td>" + esc(x.s.name) + '</td><td style="width:50%"><div style="height:8px;border-radius:4px;background:var(--accent);width:' + Math.round(100 * x.n / max) + '%" aria-hidden="true"></div></td><td style="text-align:right">' + x.n + "</td></tr>";
      }).join("") + "</tbody></table></div>";
  }
  function setup() {
    var x = sections();
    var saveBar = LIVE ? '<div class="row" style="position:sticky;top:0;z-index:5;background:var(--bg);padding:8px 0;margin-bottom:8px"><h1 style="flex:1">Settings</h1><span class="hint" id="dirtyNote">' + (dirty ? "Unsaved changes" : "All changes saved") + '</span><button type="button" class="btn primary" data-act="savesettings"' + (dirty ? "" : " disabled") + ">Save changes</button></div>" : '<h1 style="margin-bottom:12px">Settings <span class="hint" style="font-weight:400">(demo: changes apply straight away)</span></h1>';
    var role = ROLE();
    if (role === "staff") return '<h1>My account</h1><p class="hint" style="margin:6px 0 14px">Signed in as ' + esc(owner.me.name) + " (" + esc(owner.me.email) + "). You see your own calendar, clients and time off. The owner or a manager changes the business settings.</p>" + x.pw;
    return saveBar + payPanel() + '<div class="grid2">' + x.general + x.hours + "</div>" + x.svcs + x.team + (role === "owner" ? loginsPanel() : "") + x.questions + x.pw + (role === "owner" ? x.danger : "");
  }
  function sections() {
    var f = function (id, label, val, type, extra) { return '<div class="field"><label for="' + id + '">' + label + '</label><input type="' + (type || "text") + '" id="' + id + '" data-set="' + id + '" value="' + esc(val) + '" ' + (extra || "") + "></div>"; };
    var zones = ZONES.indexOf(biz.tz) < 0 && biz.tz ? [biz.tz].concat(ZONES) : ZONES;
    var general = '<div class="panel"><h2>Business</h2><form class="details" onsubmit="return false" style="margin-top:8px">' +
      f("name", "Business name", biz.name, "text", 'maxlength="80"') + f("tag", "Tagline / address", biz.tag || "", "text", 'maxlength="120"') +
      f("phone", "Phone (shown to customers)", biz.phone || "", "tel", 'maxlength="30"') +
      (LIVE ? f("notifyEmail", "Send new-booking alerts to", biz.notifyEmail || "", "email", 'maxlength="160"') : "") +
      '<div class="field"><label for="tz">Time zone</label><select id="tz" data-set="tz"' + (LIVE ? "" : " disabled") + ">" + (LIVE ? zones.map(function (z) { return '<option value="' + z + '"' + (z === biz.tz ? " selected" : "") + ">" + z.replace(/_/g, " ") + "</option>"; }).join("") : "<option>Your browser's time zone</option>") + "</select></div>" +
      f("currency", "Currency symbol", biz.currency, "text", 'maxlength="4"') +
      f("accent", "Brand colour", biz.accent, "color") + f("who", "Word for your staff", biz.who, "text", 'maxlength="30" placeholder="stylist, dentist, technician…"') +
      '<label class="check full"><input type="checkbox" data-set="needAddress"' + (biz.needAddress ? " checked" : "") + "> Ask for the customer's address (you go to them)</label>" +
      '<div class="field full"><label for="policy">Booking policy (shown before booking and in emails)</label><textarea id="policy" data-set="policy" maxlength="400">' + esc(biz.policy || "") + "</textarea></div></form></div>";
    var hours = '<div class="panel"><h2>Opening hours</h2><p class="hint">Customers can only book inside these hours.</p><table class="hours"><tbody>' +
      ORDER.map(function (d) {
        var h = biz.hours[d];
        return "<tr><td>" + DAYS[d] + '</td><td><label class="check"><input type="checkbox" data-hopen="' + d + '"' + (h ? " checked" : "") + "> Open</label></td>" +
          '<td><input type="time" aria-label="' + DAYS_LONG[d] + ' opens" data-hfrom="' + d + '" value="' + (h ? h[0] : "09:00") + '"' + (h ? "" : " disabled") + '></td><td><input type="time" aria-label="' + DAYS_LONG[d] + ' closes" data-hto="' + d + '" value="' + (h ? h[1] : "17:00") + '"' + (h ? "" : " disabled") + "></td></tr>";
      }).join("") + "</tbody></table>" +
      [["buffer", "Gap between appointments (min)", biz.buffer, 0, 240], ["noticeH", "Minimum notice (hours)", Math.round(biz.notice / 60), 0, 336], ["daysAhead", "Book up to (days ahead)", biz.daysAhead, 1, 365],
        ["cancelHours", "Online changes allowed until (hours before)", biz.cancelHours, 0, 336], ["reminderHours", "Reminder email (hours before, 0 = off)", biz.reminderHours, 0, 168]].map(function (x) {
        return '<div class="row" style="margin-top:8px"><label for="' + x[0] + '" style="flex:1">' + x[1] + '</label><input type="number" id="' + x[0] + '" data-set="' + x[0] + '" min="' + x[3] + '" max="' + x[4] + '" value="' + x[2] + '" style="width:90px"></div>';
      }).join("") +
      '<div class="row" style="margin-top:8px"><label for="step" style="flex:1">Start times every</label><select id="step" data-set="step" style="width:110px">' + [5, 10, 15, 20, 30, 60].map(function (n) { return '<option value="' + n + '"' + (n === biz.step ? " selected" : "") + ">" + n + " min</option>"; }).join("") + "</select></div></div>";
    var svcs = '<div class="panel" style="margin-top:16px"><h2>Services</h2><p class="hint">Name, category, length and price. “Gap after” is clean-up time (blank = the default gap). Untick “Online” for services only you can book (phone only). Who offers each one is set under Team.</p><div class="scroll"><table><thead><tr><th>Service</th><th>Category</th><th>Description</th><th>Min</th><th>Price</th><th>Deposit online</th><th>Gap after</th><th>Online</th><th></th></tr></thead><tbody>' +
      biz.services.map(function (s) {
        return '<tr><td><input type="text" aria-label="Service name" data-sname="' + esc(s.id) + '" value="' + esc(s.name) + '" maxlength="60" style="min-width:150px"></td><td><input type="text" aria-label="Category" data-scat="' + esc(s.id) + '" value="' + esc(s.category || "") + '" maxlength="40" placeholder="e.g. Hair" style="min-width:100px"></td><td><input type="text" aria-label="Description" data-sdesc="' + esc(s.id) + '" value="' + esc(s.desc || "") + '" maxlength="200"></td><td><input type="number" aria-label="Minutes" data-smins="' + esc(s.id) + '" value="' + s.mins + '" min="5" max="720" step="5" style="width:76px"></td>' +
          '<td><input type="number" aria-label="Price" data-sprice="' + esc(s.id) + '" value="' + s.price + '" min="0" max="1000000" style="width:90px"></td>' +
          '<td style="white-space:nowrap"><select aria-label="Deposit for ' + esc(s.name) + '" data-sdep="' + esc(s.id) + '">' + [["none", "None"], ["fixed", "Amount"], ["percent", "% of price"], ["full", "Full price"]].map(function (o) { return '<option value="' + o[0] + '"' + (((s.deposit || {}).type || "none") === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select>" +
            (["fixed", "percent"].indexOf((s.deposit || {}).type) >= 0 ? ' <input type="number" aria-label="Deposit amount" data-sdepv="' + esc(s.id) + '" value="' + s.deposit.value + '" min="0" step="' + (s.deposit.type === "percent" ? 5 : 1) + '" style="width:70px">' : "") + "</td>" +
          '<td><input type="number" aria-label="Gap after (minutes, blank = default)" data-sbuf="' + esc(s.id) + '" value="' + (s.buffer === null || s.buffer === undefined ? "" : s.buffer) + '" min="0" max="240" step="5" placeholder="' + biz.buffer + '" style="width:72px"></td>' +
          '<td><input type="checkbox" aria-label="Customers can book ' + esc(s.name) + ' online" data-sonline="' + esc(s.id) + '"' + (s.online === false ? "" : " checked") + '></td><td><button type="button" class="btn sm ghost" data-act="delsvc" data-id="' + esc(s.id) + '" aria-label="Remove ' + esc(s.name) + '">✕</button></td></tr>';
      }).join("") + '</tbody></table></div><button type="button" class="btn sm" data-act="addsvc" style="margin-top:10px">+ Add service</button></div>';
    var team = '<div class="panel" style="margin-top:16px"><h2>Team</h2><p class="hint">Days each person works, their own hours if different from the opening hours (blank = opening hours), a daily break, and what they offer.</p><div class="scroll"><table><thead><tr><th>Name</th><th>Role</th><th>Works</th><th>Own hours</th><th>Break</th><th>Offers</th><th></th></tr></thead><tbody>' +
      biz.staff.map(function (st) {
        return '<tr><td><input type="text" aria-label="Name" data-pname="' + esc(st.id) + '" value="' + esc(/^your name$/i.test(st.name) ? "" : st.name) + '" placeholder="Name" maxlength="50" style="min-width:130px"></td><td><input type="text" aria-label="Role" data-prole="' + esc(st.id) + '" value="' + esc(st.role || "") + '" maxlength="50" style="min-width:110px"></td><td>' +
          ORDER.map(function (d) { return '<label class="check" style="display:inline-flex;margin-right:6px;font-size:13px"><input type="checkbox" data-pday="' + esc(st.id) + '" value="' + d + '"' + (st.days.indexOf(d) >= 0 ? " checked" : "") + ">" + DAYS[d].slice(0, 2) + "</label>"; }).join("") + "</td><td>" +
          (function () { var h = st.hours && Object.keys(st.hours).map(function (k) { return st.hours[k]; }).filter(Boolean)[0]; return '<input type="time" aria-label="' + esc(st.name) + ' starts" data-phfrom="' + esc(st.id) + '" value="' + (h ? h[0] : "") + '" style="width:104px"> – <input type="time" aria-label="' + esc(st.name) + ' finishes" data-phto="' + esc(st.id) + '" value="' + (h ? h[1] : "") + '" style="width:104px">'; })() + "</td><td>" +
          (function () { var b = (st.breaks || [])[0]; return '<input type="time" aria-label="' + esc(st.name) + ' break starts" data-pbfrom="' + esc(st.id) + '" value="' + (b ? b.from : "") + '" style="width:104px"> – <input type="time" aria-label="' + esc(st.name) + ' break ends" data-pbto="' + esc(st.id) + '" value="' + (b ? b.to : "") + '" style="width:104px">'; })() + "</td><td>" +
          biz.services.map(function (s) { return '<label class="check" style="display:inline-flex;margin-right:8px;font-size:13px"><input type="checkbox" data-psvc="' + esc(st.id) + '" value="' + esc(s.id) + '"' + (st.services.indexOf(s.id) >= 0 ? " checked" : "") + ">" + esc(s.name) + "</label>"; }).join("") +
          '</td><td><button type="button" class="btn sm ghost" data-act="delstaff" data-id="' + esc(st.id) + '" aria-label="Remove ' + esc(st.name) + '">✕</button></td></tr>';
      }).join("") + '</tbody></table></div><button type="button" class="btn sm" data-act="addstaff" style="margin-top:10px">+ Add person</button></div>';
    var pw = LIVE ? '<div class="panel" style="margin-top:16px;max-width:520px"><h2>Password</h2><form class="details" id="pwForm" novalidate style="grid-template-columns:1fr"><div class="field"><label for="pwOld">Current password</label><input type="password" id="pwOld" autocomplete="current-password"></div><div class="field"><label for="pwNew">New password (10+ characters)</label><input type="password" id="pwNew" autocomplete="new-password" minlength="10"></div><p class="err" id="pwErr" role="alert" hidden></p><div><button type="submit" class="btn">Change password</button></div></form></div>' : "";
    var danger = LIVE ? '<div class="panel" style="margin-top:16px;max-width:520px;border-color:#c23b32"><h2>Delete your booking page</h2><p class="hint">Closes your page for good and deletes your settings and all bookings. Download your bookings first (Numbers tab) if you want to keep them. This can\'t be undone.</p><form class="details" id="delForm" novalidate style="grid-template-columns:1fr"><div class="field"><label for="delPw">Your password</label><input type="password" id="delPw" autocomplete="current-password"></div><p class="err" id="delErr" role="alert" hidden></p><div><button type="submit" class="btn danger">Delete my booking page</button></div></form></div>' : "";
    var QT = { text: "Short answer", long: "Long answer", select: "Choose one", yesno: "Yes / No" };
    var questions = '<div class="panel" style="margin-top:16px"><h2>Booking questions</h2><p class="hint">Ask customers something when they book (e.g. “First visit?”, “Car registration”, “Any allergies?”). Answers show on the booking and in the calendar feed.' + (owner.plan && owner.plan.questions !== null && owner.plan.questions !== undefined ? " Your plan includes " + owner.plan.questions + "." : "") + '</p>' +
      ((biz.questions || []).length ? '<div class="scroll"><table><thead><tr><th>Question</th><th>Type</th><th>Choices (comma separated)</th><th>Required</th><th></th></tr></thead><tbody>' + biz.questions.map(function (q) {
        return '<tr><td><input type="text" aria-label="Question" data-qlabel="' + esc(q.id) + '" value="' + esc(q.label) + '" maxlength="120" style="min-width:200px"></td><td><select aria-label="Type" data-qtype="' + esc(q.id) + '">' + Object.keys(QT).map(function (k) { return '<option value="' + k + '"' + (q.type === k ? " selected" : "") + ">" + QT[k] + "</option>"; }).join("") + "</select></td>" +
          '<td><input type="text" aria-label="Choices" data-qopts="' + esc(q.id) + '" value="' + esc((q.options || []).join(", ")) + '"' + (q.type === "select" ? "" : " disabled") + ' placeholder="Short, Medium, Long"></td><td><input type="checkbox" aria-label="Required" data-qreq="' + esc(q.id) + '"' + (q.required ? " checked" : "") + '></td><td><button type="button" class="btn sm ghost" data-act="delq" data-id="' + esc(q.id) + '" aria-label="Remove question">✕</button></td></tr>';
      }).join("") + "</tbody></table></div>" : '<p class="empty">No questions yet.</p>') + '<button type="button" class="btn sm" data-act="addq" style="margin-top:10px">+ Add question</button></div>';
    return { general: general, hours: hours, svcs: svcs, team: team, pw: pw, danger: danger, questions: questions };
  }
  // ------------------------------------------------------------------ first-time setup (live only)
  var WIZ = [["business", "Your business"], ["services", "Services"], ["team", "Who takes bookings"], ["hours", "Opening hours"], ["review", "Go live"]];
  function renderWizard() {
    if (wiz.done) return renderLaunched();
    var x = sections(), st = WIZ[wiz.step][0];
    var intro = {
      business: "Welcome! A few quick steps and your booking page is ready. You can change everything later in Settings.",
      services: "What can customers book? Change the examples to your real services, lengths and prices. Remove the ones you don't offer.",
      team: "Who do customers book with? Add yourself and anyone else, the days they work and what they do. Customers can pick a person or “anyone”.",
      hours: "When can customers book? Untick the days you're closed. The gap gives you time between appointments; minimum notice stops last-minute surprises.",
      review: "Check everything looks right, then go live. Your page only takes bookings after this step.",
    }[st];
    var body = st === "business" ? x.general : st === "services" ? x.svcs : st === "team" ? x.team : st === "hours" ? x.hours : review();
    $("main").innerHTML = '<div style="max-width:900px;margin:0 auto"><ol class="steps">' + WIZ.map(function (w, i) { return '<li class="' + (i === wiz.step ? "on" : i < wiz.step ? "done" : "") + '"' + (i === wiz.step ? ' aria-current="step"' : "") + '><span class="n">' + (i < wiz.step ? "✓" : i + 1) + "</span>" + w[1] + "</li>"; }).join("") + "</ol>" +
      '<h1 tabindex="-1">' + WIZ[wiz.step][1] + '</h1><p class="hint" style="margin:6px 0 14px">' + intro + "</p>" + body.replace('style="margin-top:16px"', "") +
      '<p class="err" id="wizErr" role="alert" hidden></p><div class="row" style="margin-top:16px">' + (wiz.step ? '<button type="button" class="btn ghost" data-act="wizback">← Back</button>' : '<button type="button" class="btn ghost" data-act="logout">Sign out</button>') +
      '<span class="spacer"></span><button type="button" class="btn primary" data-act="wiznext">' + (st === "review" ? "Go live" : "Save and continue →") + "</button></div></div>";
    $("main").querySelector("h1").focus();
  }
  function review() {
    var openDays = ORDER.filter(function (d) { return biz.hours[d]; });
    var li = function (k, v) { return "<dt>" + k + "</dt><dd>" + v + "</dd>"; };
    return '<div class="panel summary"><dl>' + li("Business", esc(biz.name)) + li("Time zone", esc(biz.tz.replace(/_/g, " "))) + li("Services", biz.services.map(function (s) { return esc(s.name) + " (" + mins(s.mins) + ", " + money(s.price) + ")"; }).join("<br>")) +
      li("Team", biz.staff.map(function (p) { return esc(p.name); }).join(", ")) + li("Open", openDays.map(function (d) { return DAYS[d] + " " + biz.hours[d][0] + "–" + biz.hours[d][1]; }).join("<br>")) +
      li("New bookings go to", esc(biz.notifyEmail || owner.email)) + "</dl></div>";
  }
  function wizCheck(st) {
    if (st === "business") { if (!String(biz.name).trim()) return "Enter your business name."; if (biz.notifyEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(biz.notifyEmail)) return "The alert email doesn't look right."; }
    if (st === "services") { if (!biz.services.length) return "Add at least one service."; if (biz.services.some(function (s) { return !String(s.name).trim() || s.name === "New service"; })) return "Give every service a name (or remove it)."; }
    if (st === "team") {
      if (biz.staff.some(function (p) { return !String(p.name).trim() || /^(your name|new person)$/i.test(p.name); })) return "Enter a real name for every person (customers see it).";
      if (biz.staff.some(function (p) { return !p.days.length; })) return "Tick at least one working day for every person.";
      if (biz.staff.some(function (p) { return !p.services.length; })) return "Tick at least one service for every person.";
      var orphan = biz.services.filter(function (s) { return !eligible(s.id).length; })[0];
      if (orphan) return "Nobody offers “" + orphan.name + "”. Tick it for someone, or remove it under Services.";
    }
    if (st === "hours") {
      var open = ORDER.filter(function (d) { return biz.hours[d]; });
      if (!open.length) return "Open at least one day.";
      if (!biz.staff.some(function (p) { return p.days.some(function (d) { return biz.hours[d]; }); })) return "Nobody works on your open days. Check the days under the team step.";
      var longest = Math.max.apply(null, open.map(function (d) { return toMin(biz.hours[d][1]) - toMin(biz.hours[d][0]); }));
      var tooLong = biz.services.filter(function (s) { return s.mins > longest; })[0];
      if (tooLong) return "“" + tooLong.name + "” (" + mins(tooLong.mins) + ") is longer than any opening day, so it could never be booked.";
    }
    return "";
  }
  function wizNext() {
    var st = WIZ[wiz.step][0], problem = wizCheck(st);
    if (problem) { var e = $("wizErr"); e.textContent = problem; e.hidden = false; return; }
    if (st === "review") biz.setupDone = true;
    var btn = document.querySelector('[data-act="wiznext"]'); btn.disabled = true; btn.textContent = "Saving…";
    data.saveSettings().then(function () {
      dirty = false;
      if (st === "review") { wiz.done = true; } else wiz.step++;
      renderAdmin(); window.scrollTo(0, 0);
    }).catch(function (err) { if (st === "review") biz.setupDone = false; btn.disabled = false; btn.textContent = st === "review" ? "Go live" : "Save and continue →"; var e = $("wizErr"); e.textContent = err.message; e.hidden = false; });
  }
  function renderLaunched() {
    var url = location.origin + "/book/" + SLUG;
    $("main").innerHTML = '<div class="panel done" style="max-width:640px"><div class="tick" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div><h1 tabindex="-1">Your booking page is live!</h1>' +
      '<p class="hint">Share this link with your customers:</p><div class="row" style="justify-content:center;margin:8px 0 16px"><input type="text" readonly id="shareUrl" value="' + esc(url) + '" style="max-width:380px"><button type="button" class="btn sm" data-act="copy" data-src="shareUrl">Copy</button></div>' +
      '<div class="notice"><b>Next steps</b><ol style="margin:8px 0 0;padding-left:20px"><li>Make a test booking with your own email, to see what customers see and get.</li><li>Add the link to your Google Business Profile, Instagram bio and Facebook page.</li><li>Put it on your website: <b>Share &amp; emails</b> in your dashboard has the code to paste.</li></ol></div>' +
      '<div class="row" style="justify-content:center;margin-top:18px"><a class="btn" href="' + esc(url) + '" target="_blank" rel="noopener">Open my booking page ↗</a><button type="button" class="btn primary" data-act="todash">Go to my dashboard</button></div></div>';
    $("main").querySelector("h1").focus();
  }

  // ------------------------------------------------------------------ online payments + team logins (settings)
  function payPanel() {
    var p = owner.payments || {}, anyDeposit = biz.services.some(function (s) { return s.deposit && s.deposit.type !== "none"; });
    var body;
    if (!LIVE) body = '<p class="hint">Customers pay a deposit (or the full price) when they book, by card, Apple Pay or Google Pay through Stripe. The money goes straight to your own Stripe account. In this demo, set a deposit on a service below, then book it as a customer: the payment step is simulated and no card is charged.</p>';
    else if (!p.available) body = '<p class="hint">Card payments aren\'t switched on for this website yet. Ask WebersLink to enable them.</p>';
    else if (!p.connected || !p.chargesEnabled) body = '<p class="hint">Take deposits when customers book (card, Apple Pay, Google Pay). Connect your own Stripe account: Stripe asks for your business and bank details and verifies your identity. Takes about 5 minutes. Money goes straight to you.' + (p.feePercent ? " WebersLink keeps " + p.feePercent + "% of each payment." : "") + "</p>" +
      (p.connected ? '<p class="err">Stripe still needs some details before you can take payments.</p>' : "") + (ROLE() === "owner" ? '<button type="button" class="btn primary" data-act="stripeconnect">' + (p.connected ? "Finish Stripe setup" : "Connect Stripe") + "</button>" : '<p class="hint">The owner can connect Stripe.</p>');
    else body = '<p class="hint"><span class="pill paid">Connected</span> ' + (p.test ? '<span class="pill">test mode</span> ' : "") + "Deposits are taken for services where you set one below. Customers who cancel in time are refunded automatically; no-shows keep the deposit.</p>" + (ROLE() === "owner" ? '<button type="button" class="btn" data-act="stripedash">Open your Stripe dashboard ↗</button>' : "");
    return '<div class="panel" style="margin-bottom:16px"><h2>Online payments</h2>' + body + (anyDeposit && LIVE && !(p.connected && p.chargesEnabled) ? '<p class="hint" style="margin-top:8px">You\'ve set deposits on some services; until Stripe is connected, those are booked without payment.</p>' : "") + "</div>";
  }
  function loginsPanel() {
    if (!LIVE) return "";
    var plan = owner.plan || {}, team = owner.team || [], opt = function (v, t, sel) { return '<option value="' + esc(v) + '"' + (sel ? " selected" : "") + ">" + esc(t) + "</option>"; };
    var staffOpts = function (sel) { return opt("", "(not linked)", !sel) + biz.staff.map(function (p) { return opt(p.id, p.name, p.id === sel); }).join(""); };
    var head = '<div class="panel" style="margin-top:16px"><h2>Team logins</h2><p class="hint"><b>Managers</b> run the business (calendar, clients, settings, reports) but can\'t manage logins, payments or delete the page. <b>Staff</b> see and manage only their own calendar, clients and time off.</p>';
    if (plan.logins === 0) return head + '<p class="hint" style="margin-top:8px">Team logins are part of Pro. <a href="#" data-act="gotoplan">See plans</a></p></div>';
    return head + (team.length ? '<div class="scroll"><table><thead><tr><th>Name</th><th>Role</th><th>Calendar</th><th>Status</th><th></th></tr></thead><tbody>' + team.map(function (u) {
      return "<tr><td><b>" + esc(u.name) + '</b><br><span class="hint">' + esc(u.email) + '</span></td><td><select aria-label="Role" data-urole="' + esc(u.id) + '">' + opt("manager", "Manager", u.role === "manager") + opt("staff", "Staff", u.role === "staff") + '</select></td><td><select aria-label="Calendar" data-ustaff="' + esc(u.id) + '">' + staffOpts(u.staffId) + "</select></td><td>" +
        (u.status === "active" ? '<span class="pill paid">active</span>' : '<span class="pill new">invited</span> <button type="button" class="btn sm ghost" data-act="uresend" data-id="' + esc(u.id) + '">Resend</button>') + '</td><td><button type="button" class="btn sm ghost danger" data-act="uremove" data-id="' + esc(u.id) + '" data-name="' + esc(u.name) + '">Remove</button></td></tr>';
    }).join("") + "</tbody></table></div>" : '<p class="empty">No team logins yet.</p>') +
      '<form class="details" id="inviteForm" novalidate style="grid-template-columns:2fr 1.4fr 1fr 1.2fr auto;align-items:end;margin-top:10px"><div class="field"><label for="ivEmail">Email</label><input type="email" id="ivEmail" maxlength="160"></div><div class="field"><label for="ivName">Name</label><input type="text" id="ivName" maxlength="60"></div>' +
      '<div class="field"><label for="ivRole">Role</label><select id="ivRole">' + opt("staff", "Staff", true) + opt("manager", "Manager") + '</select></div><div class="field"><label for="ivStaff">Their calendar</label><select id="ivStaff">' + biz.staff.map(function (p) { return opt(p.id, p.name); }).join("") + '</select></div><button type="submit" class="btn primary">Send invite</button><p class="err full" id="ivErr" role="alert" hidden></p></form></div>';
  }

  function shareTab() {
    var next = (biz.bookings || []).filter(function (b) { return b.status === "booked" && Date.parse(b.start) > Date.now(); }).sort(function (a, b) { return a.start.localeCompare(b.start); })[0];
    var box = function (title, text) { return '<div class="panel"><h3>' + title + '</h3><div class="notice" style="margin-top:8px"><pre>' + esc(text) + "</pre></div></div>"; };
    var html = "";
    if (LIVE) {
      var url = location.origin + "/book/" + SLUG;
      var embed = '<iframe src="' + url + '" title="Book online with ' + biz.name.replace(/"/g, "") + '" style="width:100%;min-height:900px;border:0"></iframe>';
      html += '<h1>Share your booking page</h1><div class="grid2" style="margin:14px 0 20px"><div class="panel"><h3>Your link</h3><p class="hint">Put it on Google Business Profile, Instagram bio, Facebook “Book” button, email signature.</p><div class="row"><input type="text" readonly id="shareUrl" value="' + esc(url) + '"><button type="button" class="btn sm" data-act="copy" data-src="shareUrl">Copy</button></div></div>' +
        '<div class="panel"><h3>Add it to your own website</h3><p class="hint">Paste this where the booking form should appear (WordPress: a Custom HTML block).</p><div class="row"><textarea readonly id="shareEmbed" style="min-height:70px;font:12px/1.4 ui-monospace,monospace">' + esc(embed) + '</textarea><button type="button" class="btn sm" data-act="copy" data-src="shareEmbed">Copy</button></div></div></div>' +
        '<div class="panel" style="margin-bottom:20px"><h3>See bookings in your own calendar</h3><p class="hint">Subscribe to this private link in Google Calendar (Other calendars → From URL), Outlook (Add calendar → Subscribe from web) or Apple Calendar (File → New Calendar Subscription). New bookings appear within a few hours. Keep the link private.</p><div class="row"><input type="text" readonly id="feedUrl" value="' + esc(owner.feedUrl || "") + '"><button type="button" class="btn sm" data-act="copy" data-src="feedUrl">Copy</button><button type="button" class="btn sm ghost" data-act="resetfeed">Make a new link</button></div></div>' +
        '<p class="hint" style="margin-bottom:12px">Emails: ' + (owner.mailOn ? "<b>on</b>. Customers get a confirmation (with a calendar file), a reminder, and notices when a booking moves or is cancelled. You get an alert for each new, moved or cancelled booking." : "<b>not set up on the server yet</b> (SMTP). Bookings still work; ask Weberslink to switch emails on.") + "</p>";
    } else html += '<h1>Automatic messages</h1><p class="hint" style="margin-bottom:14px">A real install sends these by itself, so nobody has to call to confirm.' + (next ? " Shown for the next booking: " + esc(next.name) + "." : "") + "</p>";
    if (!next) return html + '<p class="empty">No upcoming bookings to preview messages for.</p>';
    var m = messages(next);
    return html + '<div class="grid2">' + box("Booking confirmation", m.confirm) + box("Reminder", m.reminder) + "</div><div style=\"margin-top:16px\">" + box("Alert to the business", m.owner) + "</div>";
  }
  function markDirty() {
    if (!LIVE) { demoSave(); return; }
    dirty = true; var n = $("dirtyNote"); if (n) n.textContent = "Unsaved changes";
    var b = document.querySelector('[data-act="savesettings"]'); if (b) b.disabled = false;
  }
  function onSetupChange(e) {
    var t = e.target, ds = t.dataset, id, d;
    if (ds.set) {
      var k = ds.set, v = t.type === "checkbox" ? t.checked : t.value;
      if (k === "noticeH") { biz.notice = Math.max(0, Math.min(336, +v || 0)) * 60; }
      else if (["buffer", "daysAhead", "cancelHours", "reminderHours", "step"].indexOf(k) >= 0) biz[k] = Math.min(k === "daysAhead" ? 365 : k === "buffer" ? 240 : 336, Math.max(k === "daysAhead" ? 1 : k === "step" ? 5 : 0, Math.round(+v || 0)));
      else biz[k] = v;
      if (k === "accent" || k === "name" || k === "tag") applyBrand();
      return markDirty();
    }
    if (ds.hopen) { d = +ds.hopen; biz.hours[d] = t.checked ? [document.querySelector('[data-hfrom="' + d + '"]').value || "09:00", document.querySelector('[data-hto="' + d + '"]').value || "17:00"] : null; markDirty(); return renderAdmin(); }
    if (ds.hfrom || ds.hto) {
      d = +(ds.hfrom || ds.hto); var from = document.querySelector('[data-hfrom="' + d + '"]').value, to = document.querySelector('[data-hto="' + d + '"]').value;
      if (from && to && toMin(from) < toMin(to)) { biz.hours[d] = [from, to]; markDirty(); } else toast("Closing time must be after opening time.", true);
      return;
    }
    if ((id = ds.sname)) { if (t.value.trim()) service(id).name = t.value.trim(); return markDirty(); }
    if ((id = ds.scat)) { service(id).category = t.value.trim(); return markDirty(); }
    if ((id = ds.sbuf)) { service(id).buffer = t.value === "" ? null : Math.max(0, Math.min(240, Math.round(+t.value || 0))); return markDirty(); }
    if ((id = ds.sonline)) { service(id).online = t.checked; return markDirty(); }
    if ((id = ds.sdep)) { var sv = service(id); sv.deposit = { type: t.value, value: t.value === "percent" ? 20 : t.value === "fixed" ? Math.max(1, Math.round(sv.price / 4)) : 0 }; markDirty(); return renderAdmin(); }
    if ((id = ds.sdepv)) { var sd = service(id).deposit; sd.value = Math.max(sd.type === "percent" ? 1 : 0, Math.min(sd.type === "percent" ? 100 : 1e6, +t.value || 0)); return markDirty(); }
    if (ds.phfrom || ds.phto) {
      id = ds.phfrom || ds.phto; var pp = person(id), f = document.querySelector('[data-phfrom="' + id + '"]').value, to = document.querySelector('[data-phto="' + id + '"]').value;
      if (!f && !to) { pp.hours = {}; return markDirty(); }
      if (!f || !to || toMin(f) >= toMin(to)) return toast("Enter a start and a finish time (finish after start), or clear both.", true);
      pp.hours = {}; [0, 1, 2, 3, 4, 5, 6].forEach(function (d) { pp.hours[d] = [f, to]; }); return markDirty();
    }
    if (ds.pbfrom || ds.pbto) {
      id = ds.pbfrom || ds.pbto; var pb = person(id), bf = document.querySelector('[data-pbfrom="' + id + '"]').value, bt = document.querySelector('[data-pbto="' + id + '"]').value;
      if (!bf && !bt) { pb.breaks = []; return markDirty(); }
      if (!bf || !bt || toMin(bf) >= toMin(bt)) return toast("Enter when the break starts and ends, or clear both.", true);
      pb.breaks = [{ from: bf, to: bt }]; return markDirty();
    }
    var qq = function (qid) { return (biz.questions || []).filter(function (x) { return x.id === qid; })[0]; };
    if ((id = ds.qlabel)) { qq(id).label = t.value.trim(); return markDirty(); }
    if ((id = ds.qtype)) { qq(id).type = t.value; markDirty(); return renderAdmin(); }
    if ((id = ds.qopts)) { qq(id).options = t.value.split(",").map(function (o) { return o.trim(); }).filter(Boolean).slice(0, 20); return markDirty(); }
    if ((id = ds.qreq)) { qq(id).required = t.checked; return markDirty(); }
    if ((id = ds.sdesc)) { service(id).desc = t.value.trim(); return markDirty(); }
    if ((id = ds.smins)) { service(id).mins = Math.max(5, Math.min(720, Math.round((+t.value || 5) / 5) * 5)); return markDirty(); }
    if ((id = ds.sprice)) { service(id).price = Math.max(0, Math.min(1e6, Math.round(+t.value || 0))); return markDirty(); }
    if ((id = ds.pname)) { if (t.value.trim()) person(id).name = t.value.trim(); return markDirty(); }
    if ((id = ds.prole)) { person(id).role = t.value.trim(); return markDirty(); }
    if ((id = ds.pday)) { var p = person(id), v2 = +t.value; p.days = t.checked ? p.days.concat(v2) : p.days.filter(function (x) { return x !== v2; }); return markDirty(); }
    if ((id = ds.psvc)) { var q = person(id); q.services = t.checked ? q.services.concat(t.value) : q.services.filter(function (x) { return x !== t.value; }); return markDirty(); }
  }

  // ------------------------------------------------------------------ events
  function render() {
    document.body.classList.toggle("owner", view === "admin");
    document.querySelectorAll("[data-view]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.view === view)); });
    if (biz) applyBrand();
    if (view === "admin") renderAdmin(); else renderBook();
  }
  function goStaffStep() {
    flow.staffId = ""; flow.date = ""; flow.t = null; flow.days = null; flow.step = 1;
    var e = eligible(flow.serviceId); if (e.length === 1) { flow.staffId = e[0].id; flow.step = 2; }
  }
  $("main").addEventListener("click", function (e) {
    var tab = e.target.closest("[data-tab]");
    if (tab) { if (dirty && adminTab === "setup" && !window.confirm("You have unsaved settings. Leave without saving?")) return; if (adminTab === "setup" && dirty) { dirty = false; reloadOwner(); } adminTab = tab.dataset.tab; return renderAdmin(); }
    var crow = e.target.closest("tr[data-client]");
    if (crow) { cl.open = crow.dataset.client; renderAdmin(); window.scrollTo(0, 0); return; }
    var el = e.target.closest("[data-act]"); if (!el) return;
    var a = el.dataset.act;
    if (el.tagName === "A") e.preventDefault();
    if (a === "svc") { flow.serviceId = el.dataset.id; goStaffStep(); }
    else if (a === "who") { flow.staffId = el.dataset.id; flow.date = ""; flow.t = null; flow.days = null; flow.step = 2; }
    else if (a === "date") { flow.date = el.dataset.k; flow.t = null; }
    else if (a === "time") { flow.t = el.dataset.t; }
    else if (a === "next") { if (flow.t == null) return; if (flow.moving) return moveTo(); flow.step = 3; }
    else if (a === "back") {
      if (flow.moving && flow.step <= 2) { flow = { step: "manage", manage: flow.manage }; return render(); }
      flow.step = Math.max(0, flow.step - 1); if (flow.step === 1 && eligible(flow.serviceId).length === 1) flow.step = 0; if (flow.step === 2) flow.days = flow.days;
    }
    else if (a === "again") startFlow();
    else if (a === "manage") flow = { step: "manage" };
    else if (a === "ics") return downloadIcs(flow.booking);
    else if (a === "toadmin") { adminDay = dayKey(new Date(flow.booking.start)); view = "admin"; adminTab = "agenda"; startFlow(); }
    else if (a === "resched") { var mb = flow.manage.found; startFlow({ step: 2, serviceId: mb.serviceId, staffId: "any", moving: { id: mb.id, code: flow.manage.code, email: flow.manage.email }, manage: flow.manage }); }
    else if (a === "cancelmine") {
      if (!window.confirm("Cancel this booking?")) return;
      return data.cancel(flow.manage.code, flow.manage.email).then(function (b) { flow.manage.found = b; flow.manage.changeable = false; toast("Booking cancelled."); renderManage(); }).catch(function (err) { toast(err.message, true); });
    }
    else if (a === "day") adminDay = el.dataset.k;
    else if (a === "today") adminDay = todayKey();
    else if (a === "wk") adminDay = addKey(adminDay, +el.dataset.n);
    else if (a === "seen") { http("POST", API + "admin/seen").then(function () { biz.bookings.forEach(function (b) { b.isNew = false; }); render(); }).catch(function (err) { toast(err.message, true); }); return; }
    else if (a === "st") {
      var sb = bookingById(el.dataset.id);
      if (el.dataset.s === "cancelled" && !window.confirm("Cancel " + sb.name + "'s appointment?" + (LIVE && sb.email ? " They will get an email." : ""))) return;
      var giveBack = el.dataset.s === "cancelled" && sb.payment && sb.payment.status === "paid" ? window.confirm("Refund their " + money(sb.payment.amount) + " deposit?\n\nOK = refund · Cancel = keep it (e.g. late cancellation)") : false;
      return data.status(sb.id, el.dataset.s, giveBack).then(render).catch(function (err) { toast(err.message, true); });
    }
    else if (a === "addsvc") { biz.services.push({ id: "s" + uid(), name: "New service", desc: "", mins: 30, price: 50 }); markDirty(); }
    else if (a === "delsvc") {
      if (biz.services.length < 2) return toast("Keep at least one service.", true);
      if ((biz.bookings || []).some(function (x) { return x.serviceId === el.dataset.id && x.status === "booked" && Date.parse(x.start) > Date.now(); })) return toast("This service has upcoming bookings. Cancel or move them first.", true);
      biz.services = biz.services.filter(function (s) { return s.id !== el.dataset.id; }); biz.staff.forEach(function (p) { p.services = p.services.filter(function (x) { return x !== el.dataset.id; }); }); markDirty();
    }
    else if (a === "addstaff") { biz.staff.push({ id: "p" + uid(), name: "New person", role: "", days: [1, 2, 3, 4, 5], services: biz.services.map(function (s) { return s.id; }) }); markDirty(); }
    else if (a === "delstaff") {
      if (biz.staff.length < 2) return toast("Keep at least one person.", true);
      if ((biz.bookings || []).some(function (x) { return x.staffId === el.dataset.id && x.status === "booked" && Date.parse(x.start) > Date.now(); })) return toast("This person has upcoming bookings. Cancel or move them first.", true);
      biz.staff = biz.staff.filter(function (p) { return p.id !== el.dataset.id; }); markDirty();
    }
    else if (a === "savesettings") {
      el.disabled = true;
      return data.saveSettings().then(function () { dirty = false; toast("Settings saved"); renderAdmin(); }).catch(function (err) { el.disabled = false; toast(err.message, true); });
    }
    else if (a === "copy") { var src = $(el.dataset.src); src.select(); try { navigator.clipboard.writeText(src.value).then(function () { toast("Copied"); }, function () { document.execCommand("copy"); toast("Copied"); }); } catch (err) { document.execCommand("copy"); toast("Copied"); } return; }
    else if (a === "demopaycancel") { var cb2 = bookingById(flow.booking.id); cb2.status = "expired"; cb2.payment.status = "unpaid"; demoSave(); flow = { step: "unpaid" }; }
    else if (a === "stripeconnect") { el.disabled = true; return http("POST", API + "admin/stripe/connect").then(function (j) { location.href = j.url; }).catch(function (e) { el.disabled = false; toast(e.message, true); }); }
    else if (a === "stripedash") { return http("POST", API + "admin/stripe/dashboard").then(function (j) { window.open(j.url, "_blank", "noopener"); }).catch(function (e) { toast(e.message, true); }); }
    else if (a === "refund") {
      var rb = bookingById(el.dataset.id); if (!window.confirm("Refund " + money(rb.payment.amount) + " to " + rb.name + "?")) return;
      if (!LIVE) { rb.payment.status = "refunded"; demoSave(); return renderAdmin(); }
      return http("POST", API + "admin/refund", { id: rb.id }).then(function () { rb.payment.status = "refunded"; toast("Refunded"); renderAdmin(); }).catch(function (e) { toast(e.message, true); });
    }
    else if (a === "uresend") { return http("POST", API + "admin/team/resend", { id: el.dataset.id }).then(function (j) { toast(j.emailed ? "Invite sent again" : "Invite renewed, but the email couldn't be sent"); }).catch(function (e) { toast(e.message, true); }); }
    else if (a === "uremove") { if (!window.confirm("Remove " + el.dataset.name + "'s login? They're signed out straight away.")) return; return http("POST", API + "admin/team/remove", { id: el.dataset.id }).then(function () { owner.team = owner.team.filter(function (u) { return u.id !== el.dataset.id; }); toast("Login removed"); renderAdmin(); }).catch(function (e) { toast(e.message, true); }); }
    else if (a === "gotoplan") { adminTab = "plan"; }
    else if (a === "edit") { editId = el.dataset.id; }
    else if (a === "editcancel") { editId = null; }
    else if (a === "clclose") { cl.open = null; }
    else if (a === "clexport") { return data.clients().then(function (list) { var q = function (v) { return '"' + String(v == null ? "" : v).replace(/"/g, '""').replace(/^([=+\-@])/, "'$1") + '"'; }; downloadText("clients.csv", "\ufeff" + [["Name", "Email", "Phone", "Visits", "Upcoming", "No-shows", "Spent", "Tags", "Notes"]].concat(list.map(function (c) { return [c.name, c.email, c.phone, c.visits, c.upcoming, c.noShows, c.spent, c.tags.join(", "), c.notes]; })).map(function (r) { return r.map(q).join(","); }).join("\r\n"), "text/csv"); }); }
    else if (a === "toremove") { if (!window.confirm("Remove this time off? Customers can book these times again.")) return; return data.removeBlock(el.dataset.id).then(function () { toast("Removed"); renderAdmin(); }).catch(function (e) { toast(e.message, true); }); }
    else if (a === "req") { planReq = el.dataset.kind; renderAdmin(); var rp = $("reqPanel"); if (rp) { rp.scrollIntoView({ behavior: "smooth" }); $("reqMsg").focus(); } return; }
    else if (a === "reqcancel") { planReq = null; }
    else if (a === "addq") {
      var cap = owner.plan && owner.plan.questions; if (LIVE && cap !== null && cap !== undefined && (biz.questions || []).length >= cap) return toast("Your plan includes " + cap + " questions. Upgrade under Plan & help for more.", true);
      biz.questions = (biz.questions || []).concat({ id: "q" + uid(), label: "", type: "text", options: [], required: false }); markDirty();
    }
    else if (a === "delq") { biz.questions = biz.questions.filter(function (q) { return q.id !== el.dataset.id; }); markDirty(); }
    else if (a === "resetfeed") { if (!window.confirm("Make a new calendar link? The old link stops working, so re-add it in your calendar app.")) return; return http("POST", API + "admin/feed/reset").then(function (j) { owner.feedUrl = j.feedUrl; toast("New calendar link made"); renderAdmin(); }).catch(function (e) { toast(e.message, true); }); }
    else if (a === "wiznext") return wizNext();
    else if (a === "wizback") { wiz.step = Math.max(0, wiz.step - 1); }
    else if (a === "todash") { wiz.done = false; adminTab = "messages"; }
    else if (a === "logout") { http("POST", API + "logout").then(function () { owner.signedIn = false; try { localStorage.removeItem("wl_booking_slug"); } catch (e) {} render(); }); return; }
    render();
  });
  function reloadOwner() { if (LIVE) data.load().then(render).catch(function () {}); }
  $("main").addEventListener("submit", function (e) {
    e.preventDefault();
    var id = e.target.id;
    if (id === "detailsForm") submitDetails();
    else if (id === "manageForm") findBooking();
    else if (id === "nbForm") nbSubmit();
    else if (id === "loginForm") {
      http("POST", API + "login", { password: $("lpw").value }).then(function () { return data.load(); }).then(function () { adminTab = "agenda"; render(); })
        .catch(function (err) { renderLogin(err.message); });
    } else if (id === "demoPayForm") {
      var pb = bookingById(flow.booking.id); pb.status = "booked"; pb.payment.status = "paid"; pb.payment.paidAt = new Date().toISOString(); pb.isNew = true; demoSave();
      flow = { step: 4, booking: pb }; render();
    } else if (id === "inviteForm") {
      var iv = { email: $("ivEmail").value.trim(), name: $("ivName").value.trim(), role: $("ivRole").value, staffId: $("ivStaff").value };
      if (iv.role === "manager") iv.staffId = "";
      http("POST", API + "admin/team/invite", iv).then(function (j) { owner.team.push(j.user); toast(j.emailed ? "Invite sent to " + iv.email : "Login created, but the invite email couldn't be sent", !j.emailed); renderAdmin(); })
        .catch(function (err) { var x = $("ivErr"); x.textContent = err.message; x.hidden = false; });
    } else if (id === "editForm") editSave(e.target);
    else if (id === "toForm") toSubmit();
    else if (id === "clForm") {
      data.saveClient({ key: e.target.dataset.key, notes: $("clNotes").value, tags: $("clTags").value.split(",").map(function (t) { return t.trim(); }).filter(Boolean), blocked: $("clBlocked").checked })
        .then(function () { toast("Client saved"); cl.list = null; loadClients(); }).catch(function (err) { toast(err.message, true); });
    }
    else if (id === "reqForm") {
      data.request({ kind: planReq, message: $("reqMsg").value, phone: $("reqPhone").value }).then(function () { planReq = null; toast("Sent. We'll be in touch soon."); renderAdmin(); })
        .catch(function (err) { var el2 = $("reqErr"); el2.textContent = err.message; el2.hidden = false; });
    }
    else if (id === "delForm") {
      if (!window.confirm("Delete your booking page and all its bookings for good?")) return;
      http("POST", API + "admin/delete", { password: $("delPw").value }).then(function () { location.href = "/book/new?deleted=1"; })
        .catch(function (err) { var el = $("delErr"); el.textContent = err.message; el.hidden = false; });
    } else if (id === "pwForm") {
      http("POST", API + "admin/password", { current: $("pwOld").value, next: $("pwNew").value }).then(function () { toast("Password changed"); $("pwOld").value = ""; $("pwNew").value = ""; })
        .catch(function (err) { var el = $("pwErr"); el.textContent = err.message; el.hidden = false; });
    }
  });
  $("main").addEventListener("change", function (e) {
    if (view !== "admin") return;
    if (e.target.id === "clImport" && e.target.files[0]) {
      var file = e.target.files[0]; e.target.value = "";
      if (file.size > 3 * 1024 * 1024) return toast("That file is over 3 MB. Split it into smaller files.", true);
      return file.text().then(function (txt) { var rows = parseCsv(txt); if (!rows.length) throw new Error("No rows found in that file."); return data.importClients(rows); })
        .then(function (r) { toast(r.added + " added, " + r.updated + " updated" + (r.skipped ? ", " + r.skipped + " skipped (no name, or no email/phone)" : "")); cl.list = null; loadClients(); })
        .catch(function (err) { toast(err.message, true); });
    }
    if (e.target.dataset.urole || e.target.dataset.ustaff) {
      var uid2 = e.target.dataset.urole || e.target.dataset.ustaff, u = owner.team.filter(function (x) { return x.id === uid2; })[0];
      var nr = document.querySelector('[data-urole="' + uid2 + '"]').value, ns = document.querySelector('[data-ustaff="' + uid2 + '"]').value;
      if (nr === "staff" && !ns) { toast("Staff logins need a calendar (team member).", true); return renderAdmin(); }
      return http("POST", API + "admin/team/update", { id: uid2, role: nr, staffId: ns }).then(function (j) { Object.assign(u, j.user); toast("Updated. " + u.name + " signs in again."); }).catch(function (err) { toast(err.message, true); renderAdmin(); });
    }
    if (e.target.id === "toKind") { var part = e.target.value === "time"; document.querySelectorAll(".to-time").forEach(function (x) { x.hidden = !part; }); $("toToWrap").hidden = part; return; }
    if (adminTab === "setup" || (LIVE && biz.setupDone === false)) return onSetupChange(e);
    if (adminTab === "newbk") {
      var t = e.target.id;
      if (t === "nbSvc") { nb.serviceId = e.target.value; nb.staffId = ""; nb.days = null; renderAdmin(); }
      else if (t === "nbWho") { nb.staffId = e.target.value; nb.days = null; renderAdmin(); }
      else if (t === "nbDate") { nb.date = e.target.value; var day = nb.days.filter(function (d) { return d.date === nb.date; })[0]; nb.t = day && day.slots[0] ? day.slots[0].t : ""; renderAdmin(); }
      else if (t === "nbTime") nb.t = e.target.value;
    }
  });
  $("main").addEventListener("input", function (e) {
    if (e.target.id === "clSearch") { cl.q = e.target.value; var pos = e.target.selectionStart; renderAdmin(); var s2 = $("clSearch"); s2.focus(); s2.setSelectionRange(pos, pos); }
  });
  $("main").addEventListener("keydown", function (e) { var r = e.target.closest && e.target.closest("tr[data-client]"); if (r && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); r.click(); } });
  window.addEventListener("beforeunload", function (e) { if (dirty) { e.preventDefault(); e.returnValue = ""; } });
  document.querySelectorAll("[data-view]").forEach(function (b) { b.addEventListener("click", function () { view = b.dataset.view; if (view === "book" && flow && flow.step === 4) startFlow(); render(); window.scrollTo(0, 0); }); });
  document.querySelectorAll("[data-niche]").forEach(function (b) { b.addEventListener("click", function () { loadDemo(b.dataset.niche); store.set("wl-booking-demo-niche", niche); startFlow(); adminDay = null; nb = { serviceId: "", staffId: "", date: "", t: "", days: null }; render(); }); });
  $("resetDemo").addEventListener("click", function () { if (!window.confirm("Reset this demo's bookings and settings?")) return; store.del(KEY()); loadDemo(niche); startFlow(); render(); toast("Demo reset"); });

  // ------------------------------------------------------------------ boot
  function loadDemo(n) { niche = n; biz = store.get(KEY()) || fresh(n); biz.tz = BROWSER_TZ; biz.blocks = biz.blocks || []; biz.clients = biz.clients || {}; TZ = biz.tz; demoSave(); applyBrand(); }
  var params = new URLSearchParams(location.search);
  if (!LIVE) {
    var start = params.get("type") || store.get("wl-booking-demo-niche") || "salon";
    loadDemo(PRESETS[start] ? start : "salon");
    if (params.get("view") === "admin") view = "admin";
    render();
    return;
  }
  // live
  document.body.classList.add("live");
  document.querySelector(".demobar").hidden = true;
  document.querySelector(".switch").hidden = true;
  $("resetDemo").hidden = true;
  $("footNote").innerHTML = 'Online booking by <a href="https://weberslink.org/" target="_blank" rel="noopener">WebersLink</a>';
  if (!SLUG) { $("main").innerHTML = '<div class="panel done"><h1>Booking page not found</h1><p class="hint">Check the link, or contact the business directly.</p></div>'; return; }
  http("GET", API + "config").then(function (j) {
    setSettings(j.settings); biz.bookings = [];
    if (j.settings.poweredBy === false && view !== "admin") $("footNote").hidden = true; // Pro plans: no WebersLink branding on the customer page
    if (view === "admin") return data.load().then(function () {
      if (params.get("stripe")) { history.replaceState(null, "", location.pathname); adminTab = "setup"; return http("POST", API + "admin/stripe/status").then(function (j) { Object.assign(owner.payments, j.payments); toast(j.payments.chargesEnabled ? "Stripe is connected. You can take deposits now." : "Stripe still needs a few details. Use “Finish Stripe setup”."); }).catch(function () {}); }
    }).catch(function (e) { if (e.status !== 401) throw e; });
    if (params.get("code")) flow = { step: "manage", manage: { code: params.get("code") } };
    if (params.get("paid")) { // back from Stripe Checkout
      var code = params.get("paid"), sid = params.get("session_id") || "";
      history.replaceState(null, "", location.pathname);
      return http("POST", API + "payment", { code: code, sessionId: sid }).then(function (j) { flow = j.paid ? { step: 4, booking: j.booking } : { step: "unpaid" }; })
        .catch(function () { flow = { step: "unpaid" }; });
    }
    if (params.get("unpaid")) { history.replaceState(null, "", location.pathname); flow = { step: "unpaid" }; }
  }).then(render).catch(function (e) { $("main").innerHTML = '<div class="panel done"><h1>Something went wrong</h1><p class="hint">' + esc(e.message) + "</p></div>"; });
})();
