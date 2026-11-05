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
  function toast(msg, bad) { var t = document.createElement("div"); t.className = "toast"; if (bad) t.style.background = "#c23b32"; t.setAttribute("role", "status"); t.textContent = msg; document.body.appendChild(t); setTimeout(function () { t.remove(); }, bad ? 4500 : 2600); }
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
  var flow = null, adminTab = "agenda", adminDay = null, dirty = false, owner = { signedIn: false, mailOn: false };
  var API = "/api/booking/" + SLUG + "/";
  var KEY = function () { return "wl-booking-demo-v2-" + niche; };
  function money(n) { return n ? biz.currency + Number(n).toLocaleString("en-US") : "Free"; }
  function service(id) { return biz.services.filter(function (s) { return s.id === id; })[0]; }
  function person(id) { return biz.staff.filter(function (s) { return s.id === id; })[0] || { id: id, name: "(removed)", role: "", days: [], services: [] }; }
  function live(b) { return b.status !== "cancelled"; }
  function eligible(serviceId) { return biz.staff.filter(function (s) { return s.services.indexOf(serviceId) >= 0; }); }
  function bookingById(id) { return (biz.bookings || []).filter(function (x) { return x.id === id; })[0]; }

  // ------------------------------------------------------------------ demo data (browser only)
  function seeded(seed) { return function () { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }; }
  var rand = function (arr, r) { return arr[Math.floor(r() * arr.length)]; };
  var atMin = function (key, m) { var p = key.split("-"); return new Date(+p[0], +p[1] - 1, +p[2], 0, m); };
  function demoCode(p) { var a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", s = ""; for (var i = 0; i < 6; i++) s += a[Math.floor(Math.random() * a.length)]; return p.name.replace(/[^A-Za-z]/g, "").slice(0, 4).toUpperCase() + "-" + s; }
  function clash(p, b, ignoreId) {
    var s = Date.parse(b.start), e = Date.parse(b.end) + p.buffer * 60000;
    return p.bookings.some(function (x) { return live(x) && x.staffId === b.staffId && x.id !== ignoreId && s < Date.parse(x.end) + p.buffer * 60000 && Date.parse(x.start) < e; });
  }
  function fresh(n) {
    var p = Object.assign(JSON.parse(JSON.stringify(PRESETS[n])), DEMO_DEFAULTS);
    p.bookings = [];
    var r = seeded(n.length * 7919 + 17), today = todayKey();
    for (var d = -6; d < 14; d++) {
      var key = addKey(today, d), wd = wdOf(key), hrs = p.hours[wd];
      if (!hrs) continue;
      p.staff.forEach(function (st) {
        if (st.days.indexOf(wd) < 0) return;
        var count = d < 0 ? 3 : Math.max(0, 3 - Math.floor(d / 4)) + (r() < 0.5 ? 1 : 0);
        for (var i = 0; i < count; i++) {
          var s = rand(p.services.filter(function (x) { return st.services.indexOf(x.id) >= 0; }), r), open = toMin(hrs[0]), close = toMin(hrs[1]);
          var start = open + Math.floor(r() * ((close - open - s.mins) / 30 + 1)) * 30, name = rand(FIRST, r) + " " + rand(LAST, r);
          var b = { id: uid(), code: demoCode(p), serviceId: s.id, staffId: st.id, start: atMin(key, start).toISOString(), end: atMin(key, start + s.mins).toISOString(),
            name: name, email: name.toLowerCase().replace(/[^a-z]+/g, ".") + "@example.com", phone: "(555) 01" + Math.floor(r() * 90 + 10), address: "", notes: "",
            source: r() < 0.7 ? "online" : "phone", status: "booked", createdAt: new Date(atMin(addKey(key, -1 - Math.floor(r() * 6)), Math.floor(r() * 24) * 60)).toISOString() };
          if (clash(p, b)) continue;
          if (d < 0) b.status = r() < 0.12 ? "no-show" : "done";
          p.bookings.push(b);
        }
      });
    }
    return p;
  }
  function demoSave() { store.set(KEY(), biz); }
  function demoFree(st, svc, key, ignoreId) {
    var wd = wdOf(key), hrs = biz.hours[wd], out = [];
    if (!hrs || st.days.indexOf(wd) < 0) return out;
    var earliest = Date.now() + biz.notice * 60000;
    for (var m = toMin(hrs[0]); m + svc.mins <= toMin(hrs[1]); m += biz.step) {
      var t = atMin(key, m);
      if (t.getTime() < earliest) continue;
      if (!clash(biz, { staffId: st.id, start: t.toISOString(), end: atMin(key, m + svc.mins).toISOString() }, ignoreId)) out.push(t.toISOString());
    }
    return out;
  }
  function pickPerson(ids, key) {
    var load = function (id) { return biz.bookings.filter(function (b) { return live(b) && b.staffId === id && dayKey(new Date(b.start)) === key; }).length; };
    return ids.slice().sort(function (a, b) { return load(a) - load(b); })[0];
  }

  // ------------------------------------------------------------------ data layer: same calls in demo and live
  var data = {
    slots: function (serviceId, staffId, ignoreId) {
      if (LIVE) return http("GET", API + "slots?service=" + encodeURIComponent(serviceId) + "&staff=" + encodeURIComponent(staffId) + "&days=" + Math.min(biz.daysAhead, 62)).then(function (j) { return j.days; });
      var svc = service(serviceId), people = staffId === "any" ? eligible(serviceId) : [person(staffId)], out = [], k = todayKey();
      for (var i = 0; i < biz.daysAhead; i++, k = addKey(k, 1)) {
        var map = {};
        people.forEach(function (st) { demoFree(st, svc, k, ignoreId).forEach(function (t) { (map[t] = map[t] || []).push(st.id); }); });
        out.push({ date: k, slots: Object.keys(map).sort().map(function (t) { return { t: t, staff: map[t] }; }) });
      }
      return Promise.resolve(out);
    },
    book: function (p) {
      if (LIVE) return http("POST", API + "book", p).then(function (j) { return j.booking; });
      var svc = service(p.serviceId), key = dayKey(new Date(p.start));
      var free = eligible(p.serviceId).filter(function (st) { return (p.staffId === "any" || st.id === p.staffId) && demoFree(st, svc, key).indexOf(p.start) >= 0; }).map(function (st) { return st.id; });
      if (!free.length) return Promise.reject(new Error("Sorry, that time was just taken. Please pick another time."));
      var b = { id: uid(), code: demoCode(biz), serviceId: svc.id, staffId: p.staffId === "any" ? pickPerson(free, key) : p.staffId, start: p.start, end: new Date(Date.parse(p.start) + svc.mins * 60000).toISOString(),
        name: p.name, email: p.email.toLowerCase(), phone: p.phone, address: p.address || "", notes: p.notes || "", source: "online", status: "booked", createdAt: new Date().toISOString(), isNew: true };
      biz.bookings.push(b); demoSave();
      return Promise.resolve(b);
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
        var b = r.booking, svc = service(b.serviceId), key = dayKey(new Date(start));
        var free = eligible(b.serviceId).filter(function (st) { return (!staffId || staffId === "any" || st.id === staffId) && demoFree(st, svc, key, b.id).indexOf(start) >= 0; }).map(function (st) { return st.id; });
        if (!free.length) throw new Error("Sorry, that time was just taken. Please pick another time.");
        b.staffId = free.indexOf(b.staffId) >= 0 ? b.staffId : free[0]; b.start = start; b.end = new Date(Date.parse(start) + svc.mins * 60000).toISOString(); b.rescheduled = true; b.isNew = true; demoSave();
        return b;
      });
    },
    // owner
    load: function () {
      if (!LIVE) return Promise.resolve();
      return http("GET", API + "admin/data").then(function (j) { setSettings(j.settings); biz.bookings = j.bookings; owner.signedIn = true; owner.mailOn = j.mailOn; });
    },
    status: function (id, status) {
      var b = bookingById(id);
      if (!LIVE) { b.status = status; b.isNew = false; demoSave(); return Promise.resolve(); }
      return http("POST", API + "admin/status", { id: id, status: status }).then(function () { b.status = status; b.isNew = false; });
    },
    saveSettings: function () {
      if (!LIVE) { demoSave(); return Promise.resolve(); }
      var s = Object.assign({}, biz); delete s.bookings;
      return http("PUT", API + "admin/settings", { settings: s }).then(function (j) { setSettings(j.settings); });
    },
    ownerBook: function (p) {
      if (LIVE) return http("POST", API + "admin/book", p).then(function (j) { biz.bookings.push(j.booking); return j.booking; });
      var svc = service(p.serviceId), t = Date.parse(p.start);
      var b = { id: uid(), code: demoCode(biz), serviceId: svc.id, staffId: p.staffId, start: p.start, end: new Date(t + svc.mins * 60000).toISOString(), name: p.name, email: p.email || "", phone: p.phone, address: "", notes: p.notes || "", source: p.source, status: "booked", createdAt: new Date().toISOString() };
      if (clash(biz, b)) return Promise.reject(new Error("That time clashes with another booking for " + person(p.staffId).name + "."));
      biz.bookings.push(b); demoSave(); return Promise.resolve(b);
    },
  };
  function setSettings(s) { var bk = biz && biz.bookings; biz = Object.assign({}, s); biz.bookings = bk || []; TZ = LIVE ? s.tz : undefined; applyBrand(); }

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
    if (!flow) startFlow();
    if (flow.step === 4) return renderDone();
    if (flow.step === "manage") return renderManage();
    var html = '<div class="flow"><div class="panel">' +
      '<ol class="steps">' + STEPS.map(function (s, i) { return '<li class="' + (i === flow.step ? "on" : i < flow.step ? "done" : "") + '"' + (i === flow.step ? ' aria-current="step"' : "") + '><span class="n">' + (i < flow.step ? "✓" : i + 1) + "</span>" + s + "</li>"; }).join("") + "</ol>";
    html += flow.step === 0 ? stepService() : flow.step === 1 ? stepWho() : flow.step === 2 ? stepWhen() : stepDetails();
    $("main").innerHTML = html + "</div>" + summary() + "</div>";
    if (flow.step === 2 && !flow.days && !flow.loading) loadSlots();
  }
  function stepService() {
    return "<h1>" + (flow.moving ? "Pick a new time" : "Book an appointment") + '</h1><p class="hint">Choose a service. You can book any time, day or night.' + (flow.moving ? "" : ' Already booked? <a href="#" data-act="manage">Change or cancel it</a>.') + "</p>" +
      '<div class="cards">' + biz.services.map(function (s) {
        return '<button type="button" class="card" data-act="svc" data-id="' + esc(s.id) + '" aria-pressed="' + (flow.serviceId === s.id) + '"><b>' + esc(s.name) + "</b>" + (s.desc ? '<span class="hint">' + esc(s.desc) + "</span>" : "") + '<span class="meta"><span>' + mins(s.mins) + '</span><span class="price">' + money(s.price) + "</span></span></button>";
      }).join("") + "</div>";
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
      '<div class="sr" aria-hidden="true"><label for="fweb">Leave this empty</label><input type="text" id="fweb" tabindex="-1" autocomplete="off"></div>' +
      '<p class="err full" id="formErr" role="alert" hidden></p>' +
      '<div class="row full"><button type="button" class="btn ghost" data-act="back">← Back</button><span class="spacer"></span><button type="submit" class="btn primary" id="confirmBtn">Confirm booking</button></div></form>';
  }
  function back(extra) { return '<div class="row" style="margin-top:18px"><button type="button" class="btn ghost" data-act="back">← Back</button><span class="spacer"></span>' + (extra || "") + "</div>"; }
  function summary() {
    var s = service(flow.serviceId), who = flow.staffId === "any" ? "Anyone available" : flow.staffId ? person(flow.staffId).name : "";
    var when = flow.t ? fmtDate(new Date(flow.t)) + ", " + fmtTime(new Date(flow.t)) : "";
    return '<aside class="panel summary" aria-label="Your booking"><h3>Your booking</h3>' +
      (s ? "<dl><dt>Service</dt><dd>" + esc(s.name) + "</dd><dt>Length</dt><dd>" + mins(s.mins) + "</dd>" + (who ? "<dt>With</dt><dd>" + esc(who) + "</dd>" : "") + (when ? "<dt>When</dt><dd>" + esc(when) + "</dd>" : "") + "</dl>" +
        '<div class="total"><span>Price</span><span>' + money(s.price) + "</span></div>" : '<p class="empty">Choose a service to start.</p>') +
      (biz.policy ? '<p class="hint policy">' + esc(biz.policy) + "</p>" : "") + (biz.phone ? '<p class="hint">Questions? Call <a href="tel:' + esc(biz.phone.replace(/[^\d+]/g, "")) + '">' + esc(biz.phone) + "</a></p>" : "") + "</aside>";
  }

  function submitDetails() {
    var get = function (id) { var el = $(id); return el ? el.value.trim() : ""; };
    flow.form = { fname: get("fname"), fphone: get("fphone"), femail: get("femail"), faddr: get("faddr"), fnotes: get("fnotes") };
    var err = !flow.form.fname ? "Please enter your name." : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(flow.form.femail) ? "Please enter a valid email." : flow.form.fphone.replace(/\D/g, "").length < 7 ? "Please enter a phone number." : biz.needAddress && !flow.form.faddr ? "Please enter the address of the job." : "";
    if (err) { var e = $("formErr"); e.textContent = err; e.hidden = false; return; }
    $("confirmBtn").disabled = true; $("confirmBtn").textContent = "Booking…";
    data.book({ serviceId: flow.serviceId, staffId: flow.staffId, start: flow.t, name: flow.form.fname, email: flow.form.femail, phone: flow.form.fphone, address: flow.form.faddr, notes: flow.form.fnotes, website: get("fweb") })
      .then(function (b) { flow = { step: 4, booking: b }; render(); })
      .catch(function (e) {
        if (/taken/.test(e.message)) { toast(e.message, true); flow.step = 2; flow.t = null; flow.days = null; return render(); }
        var el = $("formErr"); el.textContent = e.message; el.hidden = false; $("confirmBtn").disabled = false; $("confirmBtn").textContent = "Confirm booking";
      });
  }
  function moveTo() {
    var m = flow.moving;
    data.reschedule(m.code, m.email, flow.t, flow.staffId).then(function (b) { flow = { step: 4, booking: b, moved: true }; render(); })
      .catch(function (e) { toast(e.message, true); flow.days = null; flow.t = null; render(); });
  }

  function renderDone() {
    var b = flow.booking, s = service(b.serviceId) || { name: "", mins: 0 }, st = person(b.staffId), start = new Date(b.start);
    $("main").innerHTML = '<div class="panel done"><div class="tick" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>' +
      '<h1 tabindex="-1">' + (flow.moved ? "Your booking has moved" : "You're booked in!") + "</h1>" +
      '<p class="hint">' + esc(s.name) + " with " + esc(st.name) + "<br><b>" + esc(fmtDate(start)) + " at " + esc(fmtTime(start)) + "</b> · " + mins(s.mins) + "</p>" +
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
    $("main").innerHTML = '<div class="panel" style="max-width:420px;margin:30px auto"><h1 tabindex="-1">Business sign in</h1><p class="hint">' + esc(biz ? biz.name : "") + ' dashboard. Forgot your password? Ask Weberslink to reset it.</p>' +
      '<form class="details" id="loginForm" style="grid-template-columns:1fr"><div class="field"><label for="lpw">Password</label><input type="password" id="lpw" autocomplete="current-password" required></div>' +
      '<p class="err" id="loginErr" role="alert"' + (msg ? "" : " hidden") + ">" + esc(msg || "") + '</p><button type="submit" class="btn primary">Sign in</button></form></div>';
    $("lpw").focus();
  }
  function renderAdmin() {
    if (LIVE && !owner.signedIn) return renderLogin();
    var tabs = [["agenda", "Appointments"], ["newbk", "Add booking"], ["numbers", "Numbers"], ["setup", "Settings"], ["messages", LIVE ? "Share & emails" : "Reminders"]];
    var html = '<div class="tabs" role="tablist">' + tabs.map(function (t) { return '<button type="button" role="tab" data-tab="' + t[0] + '" aria-selected="' + (adminTab === t[0]) + '">' + t[1] + "</button>"; }).join("") + "</div>";
    if (LIVE) html += '<div class="row" style="margin:-8px 0 12px"><span class="hint">Signed in</span><span class="spacer"></span><a class="btn sm ghost" href="/book/' + esc(SLUG) + '" target="_blank" rel="noopener">Open booking page ↗</a><button type="button" class="btn sm ghost" data-act="logout">Sign out</button></div>';
    html += '<div role="tabpanel">' + (adminTab === "agenda" ? agenda() : adminTab === "newbk" ? newBooking() : adminTab === "numbers" ? numbers() : adminTab === "setup" ? setup() : shareTab()) + "</div>";
    $("main").innerHTML = html;
    if (adminTab === "newbk") nbLoad();
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
    return html + '<div class="cols">' + biz.staff.map(function (st) {
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
      (b.status === "booked" ? '<div class="acts">' + (past ? act("done", "Done") + act("no-show", "No-show") : "") + act("cancelled", "Cancel", "danger") + "</div>" : '<div class="acts">' + act("booked", "Undo", "ghost") + "</div>") + "</div>";
  }
  // Add a phone / walk-in booking
  var nb = { serviceId: "", staffId: "", date: "", t: "", days: null };
  function newBooking() {
    if (!nb.serviceId) nb.serviceId = biz.services[0].id;
    var people = eligible(nb.serviceId);
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
    data.slots(nb.serviceId, nb.staffId).then(function (days) {
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
      '<div class="panel"><h2 style="margin-bottom:10px">Most booked services</h2><table><tbody>' + bySvc.map(function (x) {
        return "<tr><td>" + esc(x.s.name) + '</td><td style="width:50%"><div style="height:8px;border-radius:4px;background:var(--accent);width:' + Math.round(100 * x.n / max) + '%" aria-hidden="true"></div></td><td style="text-align:right">' + x.n + "</td></tr>";
      }).join("") + "</tbody></table></div>";
  }
  function setup() {
    var saveBar = LIVE ? '<div class="row" style="position:sticky;top:0;z-index:5;background:var(--bg);padding:8px 0;margin-bottom:8px"><h1 style="flex:1">Settings</h1><span class="hint" id="dirtyNote">' + (dirty ? "Unsaved changes" : "All changes saved") + '</span><button type="button" class="btn primary" data-act="savesettings"' + (dirty ? "" : " disabled") + ">Save changes</button></div>" : '<h1 style="margin-bottom:12px">Settings <span class="hint" style="font-weight:400">(demo: changes apply straight away)</span></h1>';
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
    var svcs = '<div class="panel" style="margin-top:16px"><h2>Services</h2><p class="hint">Name, description, length and price. Who offers each one is set under Team.</p><div class="scroll"><table><thead><tr><th>Service</th><th>Description</th><th>Min</th><th>Price</th><th></th></tr></thead><tbody>' +
      biz.services.map(function (s) {
        return '<tr><td><input type="text" aria-label="Service name" data-sname="' + esc(s.id) + '" value="' + esc(s.name) + '" maxlength="60"></td><td><input type="text" aria-label="Description" data-sdesc="' + esc(s.id) + '" value="' + esc(s.desc || "") + '" maxlength="200"></td><td><input type="number" aria-label="Minutes" data-smins="' + esc(s.id) + '" value="' + s.mins + '" min="5" max="720" step="5" style="width:76px"></td>' +
          '<td><input type="number" aria-label="Price" data-sprice="' + esc(s.id) + '" value="' + s.price + '" min="0" max="1000000" style="width:90px"></td><td><button type="button" class="btn sm ghost" data-act="delsvc" data-id="' + esc(s.id) + '" aria-label="Remove ' + esc(s.name) + '">✕</button></td></tr>';
      }).join("") + '</tbody></table></div><button type="button" class="btn sm" data-act="addsvc" style="margin-top:10px">+ Add service</button></div>';
    var team = '<div class="panel" style="margin-top:16px"><h2>Team</h2><p class="hint">Which days each person works and which services they offer.</p><div class="scroll"><table><thead><tr><th>Name</th><th>Role</th><th>Works</th><th>Offers</th><th></th></tr></thead><tbody>' +
      biz.staff.map(function (st) {
        return '<tr><td><input type="text" aria-label="Name" data-pname="' + esc(st.id) + '" value="' + esc(st.name) + '" maxlength="50" style="min-width:130px"></td><td><input type="text" aria-label="Role" data-prole="' + esc(st.id) + '" value="' + esc(st.role || "") + '" maxlength="50" style="min-width:110px"></td><td>' +
          ORDER.map(function (d) { return '<label class="check" style="display:inline-flex;margin-right:6px;font-size:13px"><input type="checkbox" data-pday="' + esc(st.id) + '" value="' + d + '"' + (st.days.indexOf(d) >= 0 ? " checked" : "") + ">" + DAYS[d].slice(0, 2) + "</label>"; }).join("") + "</td><td>" +
          biz.services.map(function (s) { return '<label class="check" style="display:inline-flex;margin-right:8px;font-size:13px"><input type="checkbox" data-psvc="' + esc(st.id) + '" value="' + esc(s.id) + '"' + (st.services.indexOf(s.id) >= 0 ? " checked" : "") + ">" + esc(s.name) + "</label>"; }).join("") +
          '</td><td><button type="button" class="btn sm ghost" data-act="delstaff" data-id="' + esc(st.id) + '" aria-label="Remove ' + esc(st.name) + '">✕</button></td></tr>';
      }).join("") + '</tbody></table></div><button type="button" class="btn sm" data-act="addstaff" style="margin-top:10px">+ Add person</button></div>';
    var pw = LIVE ? '<div class="panel" style="margin-top:16px;max-width:520px"><h2>Password</h2><form class="details" id="pwForm" novalidate style="grid-template-columns:1fr"><div class="field"><label for="pwOld">Current password</label><input type="password" id="pwOld" autocomplete="current-password"></div><div class="field"><label for="pwNew">New password (10+ characters)</label><input type="password" id="pwNew" autocomplete="new-password" minlength="10"></div><p class="err" id="pwErr" role="alert" hidden></p><div><button type="submit" class="btn">Change password</button></div></form></div>' : "";
    return saveBar + '<div class="grid2">' + general + hours + "</div>" + svcs + team + pw;
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
      else if (["buffer", "daysAhead", "cancelHours", "reminderHours", "step"].indexOf(k) >= 0) biz[k] = Math.max(0, Math.round(+v || 0));
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
      return data.status(sb.id, el.dataset.s).then(render).catch(function (err) { toast(err.message, true); });
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
    else if (a === "logout") { http("POST", API + "logout").then(function () { owner.signedIn = false; render(); }); return; }
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
    } else if (id === "pwForm") {
      http("POST", API + "admin/password", { current: $("pwOld").value, next: $("pwNew").value }).then(function () { toast("Password changed"); $("pwOld").value = ""; $("pwNew").value = ""; })
        .catch(function (err) { var el = $("pwErr"); el.textContent = err.message; el.hidden = false; });
    }
  });
  $("main").addEventListener("change", function (e) {
    if (view !== "admin") return;
    if (adminTab === "setup") return onSetupChange(e);
    if (adminTab === "newbk") {
      var t = e.target.id;
      if (t === "nbSvc") { nb.serviceId = e.target.value; nb.staffId = ""; nb.days = null; renderAdmin(); }
      else if (t === "nbWho") { nb.staffId = e.target.value; nb.days = null; renderAdmin(); }
      else if (t === "nbDate") { nb.date = e.target.value; var day = nb.days.filter(function (d) { return d.date === nb.date; })[0]; nb.t = day && day.slots[0] ? day.slots[0].t : ""; renderAdmin(); }
      else if (t === "nbTime") nb.t = e.target.value;
    }
  });
  window.addEventListener("beforeunload", function (e) { if (dirty) { e.preventDefault(); e.returnValue = ""; } });
  document.querySelectorAll("[data-view]").forEach(function (b) { b.addEventListener("click", function () { view = b.dataset.view; if (view === "book" && flow && flow.step === 4) startFlow(); render(); window.scrollTo(0, 0); }); });
  document.querySelectorAll("[data-niche]").forEach(function (b) { b.addEventListener("click", function () { loadDemo(b.dataset.niche); store.set("wl-booking-demo-niche", niche); startFlow(); adminDay = null; nb = { serviceId: "", staffId: "", date: "", t: "", days: null }; render(); }); });
  $("resetDemo").addEventListener("click", function () { if (!window.confirm("Reset this demo's bookings and settings?")) return; store.del(KEY()); loadDemo(niche); startFlow(); render(); toast("Demo reset"); });

  // ------------------------------------------------------------------ boot
  function loadDemo(n) { niche = n; biz = store.get(KEY()) || fresh(n); TZ = undefined; demoSave(); applyBrand(); }
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
  $("footNote").innerHTML = 'Online booking by <a href="https://weberslink.org/" target="_blank" rel="noopener">Weberslink</a>';
  if (!SLUG) { $("main").innerHTML = '<div class="panel done"><h1>Booking page not found</h1><p class="hint">Check the link, or contact the business directly.</p></div>'; return; }
  http("GET", API + "config").then(function (j) {
    setSettings(j.settings); biz.bookings = [];
    if (view === "admin") return data.load().catch(function (e) { if (e.status !== 401) throw e; });
    if (params.get("code")) flow = { step: "manage", manage: { code: params.get("code") } };
  }).then(render).catch(function (e) { $("main").innerHTML = '<div class="panel done"><h1>Something went wrong</h1><p class="hint">' + esc(e.message) + "</p></div>"; });
})();
