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
  };
  const svcIn = Array.isArray(s.services) ? s.services.slice(0, 40) : [];
  out.services = svcIn.map((x) => ({
    id: ID.test(x && x.id) ? x.id : newId("s"), name: str(x && x.name, 60) || "Service", desc: str(x && x.desc, 200),
    mins: Math.round(int(x && x.mins, 5, 720, 30) / 5) * 5, price: int(x && x.price, 0, 1e6, 0),
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
  })).filter((x) => (pids.has(x.id) ? false : pids.add(x.id)));
  if (!out.staff.length) throw new Error("Add at least one team member.");
  out.hours = {};
  for (const d of DAYS) {
    const h = s.hours && s.hours[d];
    out.hours[d] = Array.isArray(h) && HHMM.test(h[0]) && HHMM.test(h[1]) && toMin(h[0]) < toMin(h[1]) ? [h[0], h[1]] : null;
  }
  return out;
}
/** What anyone may see: no owner e-mail. */
function publicSettings(s) { const { notifyEmail, ...rest } = s; return rest; }

// ------------------------------------------------------------------ availability
const live = (b) => b.status !== "cancelled";
function clashes(s, bookings, staffId, startMs, endMs, ignoreId) {
  const buf = s.buffer * 60000;
  return bookings.some((x) => live(x) && x.staffId === staffId && x.id !== ignoreId && startMs < Date.parse(x.end) + buf && Date.parse(x.start) < endMs + buf);
}
/** Free start instants (ms) for one person on one local date. opts: { now, ignoreId, ignoreNotice } */
function freeStarts(s, bookings, person, svc, key, opts = {}) {
  const wd = weekday(key), hrs = s.hours[wd], out = [];
  if (!hrs || !person.days.includes(wd) || !person.services.includes(svc.id)) return out;
  const now = opts.now == null ? Date.now() : opts.now;
  const earliest = opts.ignoreNotice ? now : now + s.notice * 60000;
  for (let m = toMin(hrs[0]); m + svc.mins <= toMin(hrs[1]); m += s.step) {
    const t = zonedToUtc(key, m, s.tz);
    if (t < earliest) continue;
    if (!clashes(s, bookings, person.id, t, t + svc.mins * 60000, opts.ignoreId)) out.push(t);
  }
  return out;
}
/** Open times per local date: [{ date, slots: [{ t: ISO, staff: [ids] }] }]. staffId "any" = everyone who offers it. */
function availability(s, bookings, { serviceId, staffId = "any", from, days = 28, now = Date.now(), ignoreId } = {}) {
  const svc = s.services.find((x) => x.id === serviceId);
  if (!svc) throw new Error("Unknown service.");
  const people = s.staff.filter((p) => p.services.includes(svc.id) && (staffId === "any" || p.id === staffId));
  if (!people.length) throw new Error("Nobody offers that service.");
  const today = keyOf(s.tz, now);
  const last = addDaysKey(today, s.daysAhead - 1);
  let key = from && /^\d{4}-\d{2}-\d{2}$/.test(from) && from > today ? from : today;
  const out = [];
  for (let i = 0; i < Math.min(days, 62) && key <= last; i++, key = addDaysKey(key, 1)) {
    const map = new Map();
    for (const p of people) for (const t of freeStarts(s, bookings, p, svc, key, { now, ignoreId })) (map.get(t) || map.set(t, []).get(t)).push(p.id);
    out.push({ date: key, slots: [...map.keys()].sort((a, b) => a - b).map((t) => ({ t: new Date(t).toISOString(), staff: map.get(t) })) });
  }
  return out;
}
/** Picks who gets an "anyone" booking: the person with the fewest appointments that day. */
function pickPerson(s, bookings, ids, key) {
  const load = (id) => bookings.filter((b) => live(b) && b.staffId === id && keyOf(s.tz, Date.parse(b.start)) === key).length;
  return ids.slice().sort((a, b) => load(a) - load(b))[0];
}
/**
 * Checks a requested time is really free and returns { staffId, start, end } (ISO). Throws a friendly Error otherwise.
 * opts.owner: the business itself is booking (minimum notice and the booking window don't apply).
 */
function resolveSlot(s, bookings, { serviceId, staffId, start }, opts = {}) {
  const svc = s.services.find((x) => x.id === serviceId);
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
const customerView = (b) => ({ code: b.code, serviceId: b.serviceId, staffId: b.staffId, start: b.start, end: b.end, status: b.status, name: b.name, email: b.email, phone: b.phone, address: b.address || "", notes: b.notes || "" });

module.exports = { STATUSES, partsIn, validTz, offsetMin, zonedToUtc, keyOf, weekday, addDaysKey, toMin, sanitizeSettings, publicSettings, availability, freeStarts, resolveSlot, pickPerson, cleanCustomer, newCode, customerView, clashes, email, str };
