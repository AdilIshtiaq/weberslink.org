/*
 * Booking core: pure functions (no I/O) for settings validation, time zones and availability.
 * All opening hours are in the business's own time zone; bookings are stored as UTC instants (ISO strings).
 */
const crypto = require("crypto");

const DAYS = [0, 1, 2, 3, 4, 5, 6];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const ID = /^[a-z0-9]{1,16}$/i;
const STATUSES = ["booked", "done", "no-show", "cancelled"];

// ------------------------------------------------------------------ time zones
const fmtCache = new Map();
function partsIn(tz, ms) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short" });
    fmtCache.set(tz, f);
  }
  const o = {};
  for (const p of f.formatToParts(new Date(ms))) o[p.type] = p.value;
  return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, key: `${o.year}-${o.month}-${o.day}` };
}
function validTz(tz) { try { new Intl.DateTimeFormat("en-US", { timeZone: String(tz) }); return Boolean(tz); } catch (e) { return false; } }
/** Minutes the zone is ahead of UTC at instant ms. */
function offsetMin(tz, ms) { const p = partsIn(tz, ms); return (Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi) - Math.floor(ms / 60000) * 60000) / 60000; }
/** UTC ms of local wall time `minute` (minutes after midnight) on date key YYYY-MM-DD in tz. DST-safe. */
function zonedToUtc(key, minute, tz) {
  const [y, m, d] = key.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, minute);
  let t = guess - offsetMin(tz, guess) * 60000;
  const again = guess - offsetMin(tz, t) * 60000;
  if (again !== t) t = again;
  return t;
}
const keyOf = (tz, ms) => partsIn(tz, ms).key;
const weekday = (key) => { const [y, m, d] = key.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
const addDaysKey = (key, n) => { const [y, m, d] = key.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const toMin = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };

// ------------------------------------------------------------------ settings
const str = (v, max, def = "") => { const s = String(v == null ? def : v).replace(/[\u0000-\u001f\u007f]+/g, " ").trim(); return s.slice(0, max); };
const int = (v, min, max, def) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def; };
const email = (v) => { const s = str(v, 160).toLowerCase(); return /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[a-z]{2,}$/i.test(s) ? s : ""; };
const newId = (p) => p + crypto.randomBytes(4).toString("hex");

/** Cleans settings from the owner's dashboard (or a preset). Throws a friendly Error when something essential is missing. */
function sanitizeSettings(s, prev = {}) {
  s = s && typeof s === "object" ? s : {};
  const out = {
    name: str(s.name, 80) || prev.name || "My business",
    tag: str(s.tag, 120),
    tz: validTz(s.tz) ? String(s.tz) : prev.tz || "America/New_York",
    currency: str(s.currency, 4, "$") || "$",
    accent: /^#[0-9a-f]{6}$/i.test(s.accent || "") ? s.accent : prev.accent || "#7a4fe0",
    who: str(s.who, 30) || "team member",
    needAddress: Boolean(s.needAddress),
    policy: str(s.policy, 400),
    notifyEmail: email(s.notifyEmail) || prev.notifyEmail || "",
    phone: str(s.phone, 30),
    buffer: int(s.buffer, 0, 240, 10),
    notice: int(s.notice, 0, 14 * 24 * 60, 120),
    daysAhead: int(s.daysAhead, 1, 365, 60),
    step: [5, 10, 15, 20, 30, 60].includes(+s.step) ? +s.step : 15,
    cancelHours: int(s.cancelHours, 0, 14 * 24, 24),
    reminderHours: int(s.reminderHours, 0, 7 * 24, 24),
    setupDone: s.setupDone === undefined ? prev.setupDone !== false : Boolean(s.setupDone), // false until the owner finishes the setup steps
  };
  const svcIn = Array.isArray(s.services) ? s.services.slice(0, 40) : [];
  out.services = svcIn.map((x) => ({
    id: ID.test(x && x.id) ? x.id : newId("s"), name: str(x && x.name, 60) || "Service", desc: str(x && x.desc, 200),
    mins: Math.round(int(x && x.mins, 5, 720, 30) / 5) * 5, price: int(x && x.price, 0, 1e6, 0),
    category: str(x && x.category, 40),
    buffer: x && x.buffer !== undefined && x.buffer !== null && x.buffer !== "" ? int(x.buffer, 0, 240, 0) : null, // null = the business default
    online: !(x && x.online === false), // false = staff can book it, customers can't (phone only)
  }));
  const ids = new Set();
  out.services = out.services.filter((x) => (ids.has(x.id) ? false : ids.add(x.id)));
  if (!out.services.length) throw new Error("Add at least one service.");
  const staffIn = Array.isArray(s.staff) ? s.staff.slice(0, 30) : [];
  const pids = new Set();
  out.staff = staffIn.map((x) => ({
    id: ID.test(x && x.id) ? x.id : newId("p"), name: str(x && x.name, 50) || "Team member", role: str(x && x.role, 50),
    days: [...new Set((Array.isArray(x && x.days) ? x.days : []).map(Number).filter((d) => DAYS.includes(d)))],
    services: [...new Set((Array.isArray(x && x.services) ? x.services : []).filter((id) => ids.has(id)))],
    hours: cleanHours(x && x.hours, true), // this person's own hours per weekday (inside the business hours); missing day = business hours
    breaks: (Array.isArray(x && x.breaks) ? x.breaks : []).slice(0, 6).filter((b) => b && HHMM.test(b.from) && HHMM.test(b.to) && toMin(b.from) < toMin(b.to)).map((b) => ({ from: b.from, to: b.to })),
  })).filter((x) => (pids.has(x.id) ? false : pids.add(x.id)));
  if (!out.staff.length) throw new Error("Add at least one team member.");
  out.hours = cleanHours(s.hours, false);
  const qids = new Set();
  out.questions = (Array.isArray(s.questions) ? s.questions.slice(0, 20) : []).map((q) => ({
    id: ID.test(q && q.id) ? q.id : newId("q"), label: str(q && q.label, 120),
    type: ["text", "long", "select", "yesno"].includes(q && q.type) ? q.type : "text",
    options: (Array.isArray(q && q.options) ? q.options : []).map((o) => str(o, 60)).filter(Boolean).slice(0, 20),
    required: Boolean(q && q.required),
  })).filter((q) => q.label && !(q.type === "select" && !q.options.length) && (qids.has(q.id) ? false : qids.add(q.id)));
  out.poweredBy = s.poweredBy !== false; // set by the plan, never by the owner (see plans.js)
  return out;
}
/** { 0..6: [from, to] | null }. sparse=true keeps only the days given (a person's overrides). */
function cleanHours(h, sparse) {
  const out = {};
  for (const d of DAYS) {
    const v = h && typeof h === "object" ? h[d] : undefined;
    if (sparse && v === undefined) continue;
    out[d] = Array.isArray(v) && HHMM.test(v[0]) && HHMM.test(v[1]) && toMin(v[0]) < toMin(v[1]) ? [v[0], v[1]] : null;
  }
  return out;
}
/** Cleans answers to the booking questions; throws when a required one is missing. */
function cleanAnswers(s, answers) {
  const out = {};
  for (const q of s.questions || []) {
    let v = answers && answers[q.id];
    if (q.type === "yesno") v = v === true || v === "yes" ? "Yes" : v === false || v === "no" ? "No" : "";
    else v = str(v, q.type === "long" ? 1000 : 200);
    if (q.type === "select" && v && !q.options.includes(v)) v = "";
    if (q.required && !v) throw new Error(`Please answer: ${q.label}`);
    if (v) out[q.id] = v;
  }
  return out;
}
/** What anyone may see: no owner e-mail. */
function publicSettings(s) { const { notifyEmail, ...rest } = s; return rest; }

// ------------------------------------------------------------------ availability
const live = (b) => b.status !== "cancelled";
/** Clean-up time after a booking: its service's own gap, else the business gap. Time off ("block") has none. */
function gapAfter(s, x) {
  if (x.block) return 0;
  const svc = s.services.find((v) => v.id === x.serviceId);
  return (svc && svc.buffer !== null && svc.buffer !== undefined ? svc.buffer : s.buffer) * 60000;
}
/** Bookings plus time off, as one list of busy periods. blocks: [{ id, staffId: id | "all", start, end }] */
function busy(bookings, blocks = [], staff = []) {
  const out = bookings.slice();
  for (const b of blocks) for (const p of b.staffId === "all" ? staff : staff.filter((x) => x.id === b.staffId)) out.push({ id: "block-" + b.id + "-" + p.id, block: true, staffId: p.id, start: b.start, end: b.end, status: "booked" });
  return out;
}
function clashes(s, bookings, staffId, startMs, endMs, ignoreId, svc) {
  const myGap = svc ? gapAfter(s, { serviceId: svc.id }) : s.buffer * 60000;
  return bookings.some((x) => live(x) && x.staffId === staffId && x.id !== ignoreId && startMs < Date.parse(x.end) + gapAfter(s, x) && Date.parse(x.start) < endMs + (x.block ? 0 : myGap));
}
/** A person's working window on a weekday: the business hours, narrowed by their own hours. null = not working. */
function personHours(s, person, wd) {
  const biz = s.hours[wd];
  if (!biz || !person.days.includes(wd)) return null;
  const own = person.hours && person.hours[wd];
  if (own === null) return null;
  if (!own) return biz;
  const from = Math.max(toMin(biz[0]), toMin(own[0])), to = Math.min(toMin(biz[1]), toMin(own[1]));
  return from < to ? [from, to] : null;
}
/** Free start instants (ms) for one person on one local date. opts: { now, ignoreId, ignoreNotice } */
function freeStarts(s, bookings, person, svc, key, opts = {}) {
  const wd = weekday(key), out = [];
  const win = person.services.includes(svc.id) ? personHours(s, person, wd) : null;
  if (!win) return out;
  const [open, close] = typeof win[0] === "number" ? win : [toMin(win[0]), toMin(win[1])];
  const breaks = (person.breaks || []).map((b) => [toMin(b.from), toMin(b.to)]);
  const now = opts.now == null ? Date.now() : opts.now;
  const earliest = opts.ignoreNotice ? now : now + s.notice * 60000;
  for (let m = open; m + svc.mins <= close; m += s.step) {
    if (breaks.some(([a, b]) => m < b && a < m + svc.mins)) continue;
    const t = zonedToUtc(key, m, s.tz);
    if (t < earliest) continue;
    if (!clashes(s, bookings, person.id, t, t + svc.mins * 60000, opts.ignoreId, svc)) out.push(t);
  }
  return out;
}
/** Open times per local date: [{ date, slots: [{ t: ISO, staff: [ids] }] }]. staffId "any" = everyone who offers it. */
function availability(s, bookings, { serviceId, staffId = "any", from, days = 28, now = Date.now(), ignoreId, owner } = {}) {
  const svc = s.services.find((x) => x.id === serviceId && (owner || x.online !== false));
  if (!svc) throw new Error("Unknown service.");
  const people = s.staff.filter((p) => p.services.includes(svc.id) && (staffId === "any" || p.id === staffId));
  if (!people.length) throw new Error("Nobody offers that service.");
  const today = keyOf(s.tz, now);
  const last = addDaysKey(today, s.daysAhead - 1);
  let key = from && /^\d{4}-\d{2}-\d{2}$/.test(from) && from > today ? from : today;
  const out = [];
  for (let i = 0; i < Math.min(days, 62) && key <= last; i++, key = addDaysKey(key, 1)) {
    const map = new Map();
    for (const p of people) for (const t of freeStarts(s, bookings, p, svc, key, { now, ignoreId, ignoreNotice: owner })) (map.get(t) || map.set(t, []).get(t)).push(p.id);
    out.push({ date: key, slots: [...map.keys()].sort((a, b) => a - b).map((t) => ({ t: new Date(t).toISOString(), staff: map.get(t) })) });
  }
  return out;
}
/** Picks who gets an "anyone" booking: the person with the fewest appointments that day. */
function pickPerson(s, bookings, ids, key) {
  const load = (id) => bookings.filter((b) => live(b) && !b.block && b.staffId === id && keyOf(s.tz, Date.parse(b.start)) === key).length;
  return ids.slice().sort((a, b) => load(a) - load(b))[0];
}
/**
 * Checks a requested time is really free and returns { staffId, start, end } (ISO). Throws a friendly Error otherwise.
 * opts.owner: the business itself is booking (minimum notice and the booking window don't apply).
 */
function resolveSlot(s, bookings, { serviceId, staffId, start }, opts = {}) {
  const svc = s.services.find((x) => x.id === serviceId && (opts.owner || x.online !== false));
  if (!svc) throw new Error("Please choose a service.");
  const t = Date.parse(start);
  if (!Number.isFinite(t)) throw new Error("Please choose a time.");
  const now = opts.now == null ? Date.now() : opts.now;
  const key = keyOf(s.tz, t);
  if (!opts.owner && key > addDaysKey(keyOf(s.tz, now), s.daysAhead - 1)) throw new Error("That date is too far ahead.");
  const people = s.staff.filter((p) => p.services.includes(svc.id) && (!staffId || staffId === "any" || p.id === staffId));
  const free = people.filter((p) => freeStarts(s, bookings, p, svc, key, { now, ignoreId: opts.ignoreId, ignoreNotice: opts.owner }).includes(t)).map((p) => p.id);
  if (!free.length) throw new Error("Sorry, that time was just taken. Please pick another time.");
  return { staffId: free.length === 1 ? free[0] : pickPerson(s, bookings, free, key), start: new Date(t).toISOString(), end: new Date(t + svc.mins * 60000).toISOString() };
}

// ------------------------------------------------------------------ customers
function cleanCustomer(c, s) {
  const out = { name: str(c.name, 80), email: email(c.email), phone: str(c.phone, 30), address: str(c.address, 160), notes: str(c.notes, 500) };
  if (!out.name) throw new Error("Please enter your name.");
  if (!out.email) throw new Error("Please enter a valid email address.");
  if (out.phone.replace(/\D/g, "").length < 7) throw new Error("Please enter a phone number.");
  if (s.needAddress && !out.address) throw new Error("Please enter the address of the job.");
  return out;
}
function newCode(s) {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", b = crypto.randomBytes(6);
  let tail = "";
  for (let i = 0; i < 6; i++) tail += a[b[i] % a.length];
  return (s.name.replace(/[^A-Za-z]/g, "").slice(0, 4).toUpperCase() || "BOOK") + "-" + tail;
}
/** The fields a customer may see about their own booking. */
const customerView = (b) => ({ code: b.code, serviceId: b.serviceId, staffId: b.staffId, start: b.start, end: b.end, status: b.status, name: b.name, email: b.email, phone: b.phone, address: b.address || "", notes: b.notes || "", answers: b.answers || {} });
/** Time off from the owner: whole days (in the business time zone) or a time range. Returns { id, staffId, start, end, note }. */
function cleanBlock(s, b) {
  const staffId = b.staffId === "all" || s.staff.some((p) => p.id === b.staffId) ? b.staffId : null;
  if (!staffId) throw new Error("Choose who is off (or everyone).");
  let start, end;
  if (b.fromDate) {
    const re = /^\d{4}-\d{2}-\d{2}$/, to = b.toDate || b.fromDate;
    if (!re.test(b.fromDate) || !re.test(to) || to < b.fromDate) throw new Error("Choose valid dates.");
    start = zonedToUtc(b.fromDate, 0, s.tz); end = zonedToUtc(addDaysKey(to, 1), 0, s.tz);
  } else { start = Date.parse(b.start); end = Date.parse(b.end); }
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error("The end must be after the start.");
  if (end - start > 400 * 864e5) throw new Error("Time off can be at most 400 days.");
  return { id: newId("t"), staffId, start: new Date(start).toISOString(), end: new Date(end).toISOString(), note: str(b.note, 120) };
}

const clientKey = (email, phone) => (email ? String(email).toLowerCase() : String(phone || "").replace(/\D/g, "").length >= 7 ? "tel:" + String(phone).replace(/\D/g, "") : "");
/** Clients: everyone who booked (grouped by email, else phone) merged with the owner's own records (notes, tags, blocked, imports). */
function clientList(biz, now = Date.now()) {
  const s = biz.settings || biz, map = new Map();
  const price = (id) => (s.services.find((x) => x.id === id) || {}).price || 0;
  for (const [key, r] of Object.entries(biz.clients || {})) map.set(key, { key, name: r.name || "", email: r.email || "", phone: r.phone || "", notes: r.notes || "", tags: r.tags || [], blocked: Boolean(r.blocked), visits: 0, upcoming: 0, noShows: 0, cancelled: 0, spent: 0, first: "", last: "", source: r.source || "added" });
  for (const b of biz.bookings.slice().sort((a, c) => a.start.localeCompare(c.start))) {
    const key = clientKey(b.email, b.phone);
    if (!key) continue;
    const c = map.get(key) || { key, name: "", email: "", phone: "", notes: "", tags: [], blocked: false, visits: 0, upcoming: 0, noShows: 0, cancelled: 0, spent: 0, first: "", last: "", source: "booking" };
    c.name = b.name || c.name; c.email = b.email || c.email; c.phone = b.phone || c.phone;
    const past = Date.parse(b.start) < now;
    if (b.status === "cancelled") c.cancelled++;
    else if (b.status === "no-show") c.noShows++;
    else if (past) { c.visits++; c.spent += price(b.serviceId); c.last = b.start; c.first = c.first || b.start; }
    else c.upcoming++;
    map.set(key, c);
  }
  return [...map.values()].sort((a, b) => (b.last || "").localeCompare(a.last || "") || a.name.localeCompare(b.name));
}
module.exports = { clientKey, clientList, busy, cleanBlock, cleanAnswers, personHours, gapAfter, STATUSES, partsIn, validTz, offsetMin, zonedToUtc, keyOf, weekday, addDaysKey, toMin, sanitizeSettings, publicSettings, availability, freeStarts, resolveSlot, pickPerson, cleanCustomer, newCode, customerView, clashes, email, str };
