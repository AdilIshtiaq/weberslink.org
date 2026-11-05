/*
 * Online booking for client businesses.
 *
 *   /book/<slug>             customer booking page (can also be embedded in the business's own site with an iframe)
 *   /book/<slug>/admin       the business owner's dashboard (password login)
 *   /admin/booking.html      your page to create and manage businesses (uses the Outreach admin login)
 *
 *   /api/booking/<slug>/...  public: config, slots, book, lookup, cancel, reschedule
 *                            owner:  login, logout, admin/data, admin/status, admin/settings, admin/book, admin/password, admin/export.csv
 *   /api/booking-admin/...   site owner: list, create, reset-password, disable
 *
 * Abuse limits: per-IP caps on bookings and lookups, a hidden honeypot field, login throttling, and every time is
 * re-checked on the server (the browser's view of free times is never trusted).
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const core = require("./core");
const store = require("./store");
const mail = require("./mail");
const presets = require("./presets");

const PAGE = path.join(__dirname, "..", "public", "demos", "booking", "index.html");
const SESSION_MS = 12 * 3600 * 1000;
let isSiteAdmin = () => false; // set by server.js (Outreach login)
function setSiteAdminCheck(fn) { isSiteAdmin = fn; }

// ------------------------------------------------------------------ small HTTP helpers
function send(res, code, obj, headers = {}) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers });
  res.end(JSON.stringify(obj));
}
const fail = (res, code, error) => send(res, code, { ok: false, error });
function readJson(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", (c) => { size += c.length; if (size > limit) { reject(Object.assign(new Error("Request too large"), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { const raw = Buffer.concat(chunks).toString("utf8"); if (!raw.trim()) return resolve({}); try { resolve(JSON.parse(raw)); } catch (e) { reject(Object.assign(new Error("Invalid JSON"), { status: 400 })); } });
    req.on("error", reject);
  });
}
const clientIp = (req) => { const x = String(req.headers["x-forwarded-for"] || "").split(",").map((s) => s.trim()).filter(Boolean); return x.length ? x[x.length - 1] : String(req.socket.remoteAddress || ""); };
const isHttps = (req) => Boolean(req.socket && req.socket.encrypted) || String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https";
function cookieOf(req, name) {
  for (const part of String(req.headers.cookie || "").split(";")) { const i = part.indexOf("="); if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim()); }
  return "";
}
// Simple sliding-window limiter: allow(key, max, windowMs)
const hits = new Map();
function allow(key, max, windowMs) {
  const now = Date.now(), arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) { hits.set(key, arr); return false; }
  arr.push(now); hits.set(key, arr);
  if (hits.size > 20000) for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > 3600e3) hits.delete(k);
  return true;
}

// ------------------------------------------------------------------ passwords + owner sessions
function hashPassword(pw) { const salt = crypto.randomBytes(16).toString("hex"); return { salt, hash: crypto.scryptSync(String(pw), salt, 32).toString("hex") }; }
function checkPassword(acc, pw) {
  if (!acc || !acc.hash) return false;
  const got = crypto.scryptSync(String(pw), acc.salt, 32), want = Buffer.from(acc.hash, "hex");
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}
function newPassword() { const a = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789", b = crypto.randomBytes(14); let s = ""; for (const x of b) s += a[x % a.length]; return s; }
const sign = (v) => crypto.createHmac("sha256", store.key()).update(v).digest("hex");
const cookieName = (slug) => "wlb_" + slug.replace(/-/g, "_");
function makeSession(acc) { const body = `${acc.slug}.${Date.now() + SESSION_MS}.${acc.pwv || 1}`; return `${body}.${sign(body)}`; }
function ownerOf(req, slug) {
  const acc = store.account(slug);
  if (!acc || acc.disabled) return null;
  const parts = cookieOf(req, cookieName(slug)).split(".");
  if (parts.length !== 4) return null;
  const [s, exp, pwv, sig] = parts, want = sign(`${s}.${exp}.${pwv}`);
  if (s !== slug || Number(exp) < Date.now() || Number(pwv) !== (acc.pwv || 1) || sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  return acc;
}
const sessionCookie = (req, slug, value, maxAge) => `${cookieName(slug)}=${encodeURIComponent(value)}; Path=/api/booking/${slug}; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${isHttps(req) ? "; Secure" : ""}`;

// ------------------------------------------------------------------ business helpers
function getBiz(slug) {
  const acc = store.account(slug);
  if (!acc || acc.disabled) return null;
  const biz = store.loadBiz(slug);
  return biz ? { acc, ...biz } : null;
}
function notify(kind, biz, b, slug) {
  mail.send(kind, biz.settings, b, slug).then((ok) => { if (!ok) return; const fresh = store.loadBiz(slug); const x = fresh && fresh.bookings.find((y) => y.id === b.id); if (x) { (x.mails = x.mails || []).push(kind); store.saveBiz(slug, fresh); } });
}
function findByCode(biz, code, email) {
  const c = String(code || "").trim().toUpperCase(), e = String(email || "").trim().toLowerCase();
  return biz.bookings.find((b) => b.code === c && b.email === e) || null;
}
const ownerBooking = (b) => ({ id: b.id, code: b.code, serviceId: b.serviceId, staffId: b.staffId, start: b.start, end: b.end, status: b.status, name: b.name, email: b.email, phone: b.phone,
  address: b.address || "", notes: b.notes || "", source: b.source, createdAt: b.createdAt, rescheduled: Boolean(b.rescheduled), isNew: !b.seen, reminded: Boolean(b.remindedAt) });

// ------------------------------------------------------------------ pages
function servePage(req, res, slug) {
  const acc = store.account(slug);
  const page = fs.readFileSync(PAGE, "utf8").replace("<html lang=\"en\">", `<html lang="en" data-slug="${acc && !acc.disabled ? slug : ""}">`)
    .replace(/<meta name="robots"[^>]*>/, '<meta name="robots" content="noindex, nofollow">');
  const admin = /\/admin\/?$/.test(req.url.split("?")[0]);
  res.writeHead(acc && !acc.disabled ? 200 : 404, {
    "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin",
    "Content-Security-Policy": `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors ${admin ? "'none'" : "*"}`,
    ...(admin ? { "X-Frame-Options": "DENY" } : {}),
  });
  res.end(req.method === "HEAD" ? undefined : page);
}

// ------------------------------------------------------------------ public + owner API
async function businessApi(req, res, slug, rest) {
  const m = req.method, ip = clientIp(req);
  const biz = getBiz(slug);
  if (!biz) return fail(res, 404, "This booking page doesn't exist.");
  const s = biz.settings;

  if (rest === "config" && m === "GET") return send(res, 200, { ok: true, settings: core.publicSettings(s) });
  if (rest === "slots" && m === "GET") {
    if (!allow("slots:" + ip, 240, 600e3)) return fail(res, 429, "Too many requests. Please wait a moment.");
    const q = new URL(req.url, "http://x").searchParams;
    try { return send(res, 200, { ok: true, days: core.availability(s, biz.bookings, { serviceId: q.get("service"), staffId: q.get("staff") || "any", from: q.get("from"), days: Number(q.get("days")) || 28 }) }); }
    catch (e) { return fail(res, 400, e.message); }
  }
  if (rest === "book" && m === "POST") {
    const body = await readJson(req);
    if (body.website) return send(res, 200, { ok: true, booking: null }); // honeypot: bots fill every field
    if (!allow("book:" + ip, 8, 3600e3) || !allow("book-all:" + slug, 300, 3600e3)) return fail(res, 429, "Too many bookings from this connection. Please call us instead.");
    try {
      const who = core.cleanCustomer(body, s);
      const upcoming = biz.bookings.filter((b) => b.email === who.email && b.status === "booked" && Date.parse(b.start) > Date.now()).length;
      if (upcoming >= 5) throw new Error("You already have 5 upcoming bookings. Please call us to book more.");
      const slot = core.resolveSlot(s, biz.bookings, body);
      const b = { id: crypto.randomBytes(8).toString("hex"), code: core.newCode(s), serviceId: body.serviceId, ...slot, ...who, status: "booked", source: "online", createdAt: new Date().toISOString() };
      biz.bookings.push(b); store.saveBiz(slug, biz);
      notify("confirm", biz, b, slug); notify("owner-new", biz, b, slug);
      return send(res, 200, { ok: true, booking: core.customerView(b) });
    } catch (e) { return fail(res, 400, e.message); }
  }
  if (["lookup", "cancel", "reschedule"].includes(rest) && m === "POST") {
    if (!allow("lookup:" + ip, 30, 600e3)) return fail(res, 429, "Too many attempts. Please wait 10 minutes.");
    const body = await readJson(req);
    const b = findByCode(biz, body.code, body.email);
    if (!b) return fail(res, 404, "We couldn't find a booking with that code and email.");
    const lockedMsg = `Online changes close ${s.cancelHours} hours before the appointment.${s.phone ? " Please call " + s.phone + "." : " Please contact us."}`;
    const changeable = b.status === "booked" && Date.parse(b.start) - Date.now() > s.cancelHours * 3600e3;
    if (rest === "lookup") return send(res, 200, { ok: true, booking: core.customerView(b), changeable, lockedMsg: changeable ? "" : lockedMsg });
    if (!changeable) return fail(res, 400, b.status !== "booked" ? "This booking can't be changed any more." : lockedMsg);
    if (rest === "cancel") {
      b.status = "cancelled"; b.cancelledAt = new Date().toISOString(); b.cancelledBy = "customer"; b.seen = false; store.saveBiz(slug, biz);
      notify("cancel", biz, b, slug); notify("owner-cancel", biz, b, slug);
      return send(res, 200, { ok: true, booking: core.customerView(b) });
    }
    try {
      const slot = core.resolveSlot(s, biz.bookings, { serviceId: b.serviceId, staffId: body.staffId || b.staffId, start: body.start }, { ignoreId: b.id });
      Object.assign(b, slot, { rescheduled: true, remindedAt: undefined, seen: false }); store.saveBiz(slug, biz);
      notify("moved", biz, b, slug); notify("owner-moved", biz, b, slug);
      return send(res, 200, { ok: true, booking: core.customerView(b) });
    } catch (e) { return fail(res, 400, e.message); }
  }

  // --- owner ---
  if (rest === "login" && m === "POST") {
    if (!allow("login:" + ip + ":" + slug, 8, 900e3)) return fail(res, 429, "Too many attempts. Try again in 15 minutes.");
    const body = await readJson(req);
    if (!checkPassword(biz.acc, body.password)) { await new Promise((r) => setTimeout(r, 400)); return fail(res, 401, "Wrong password."); }
    return send(res, 200, { ok: true }, { "Set-Cookie": sessionCookie(req, slug, makeSession(biz.acc), SESSION_MS / 1000) });
  }
  if (rest === "logout" && m === "POST") return send(res, 200, { ok: true }, { "Set-Cookie": sessionCookie(req, slug, "", 0) });
  if (!rest.startsWith("admin/")) return fail(res, 404, "Not found");
  if (!ownerOf(req, slug)) return fail(res, 401, "Please sign in.");
  const what = rest.slice(6);

  if (what === "data" && m === "GET") {
    const from = Date.now() - 90 * 864e5;
    return send(res, 200, { ok: true, settings: s, slug, mailOn: Boolean(process.env.SMTP_USER && process.env.SMTP_PASS),
      bookings: biz.bookings.filter((b) => Date.parse(b.end) > from).map(ownerBooking) });
  }
  if (what === "seen" && m === "POST") { biz.bookings.forEach((b) => { b.seen = true; }); store.saveBiz(slug, biz); return send(res, 200, { ok: true }); }
  if (what === "status" && m === "POST") {
    const body = await readJson(req);
    const b = biz.bookings.find((x) => x.id === body.id);
    if (!b || !core.STATUSES.includes(body.status)) return fail(res, 400, "Unknown booking or status.");
    if (b.status === "cancelled" && body.status !== "cancelled") {
      try { core.resolveSlot(s, biz.bookings, { serviceId: b.serviceId, staffId: b.staffId, start: b.start }, { owner: true, ignoreId: b.id }); }
      catch (e) { return fail(res, 400, "That time has been booked by someone else since, so it can't be restored."); }
    }
    const wasLive = b.status === "booked";
    b.status = body.status; b.seen = true; store.saveBiz(slug, biz);
    if (body.status === "cancelled" && wasLive && body.notify !== false && Date.parse(b.start) > Date.now()) notify("cancel", biz, b, slug);
    return send(res, 200, { ok: true });
  }
  if (what === "settings" && m === "PUT") {
    const body = await readJson(req);
    try { biz.settings = core.sanitizeSettings(body.settings, s); } catch (e) { return fail(res, 400, e.message); }
    store.saveBiz(slug, biz);
    return send(res, 200, { ok: true, settings: biz.settings });
  }
  if (what === "book" && m === "POST") { // phone / walk-in booking by the owner
    const body = await readJson(req);
    try {
      const who = core.cleanCustomer({ ...body, email: body.email || `no-email+${Date.now()}@invalid.local` }, s);
      if (!body.email) who.email = "";
      const slot = core.resolveSlot(s, biz.bookings, body, { owner: true });
      const b = { id: crypto.randomBytes(8).toString("hex"), code: core.newCode(s), serviceId: body.serviceId, ...slot, ...who, status: "booked", source: body.source === "walk-in" ? "walk-in" : "phone", createdAt: new Date().toISOString(), seen: true };
      biz.bookings.push(b); store.saveBiz(slug, biz);
      if (b.email && body.sendConfirmation !== false) notify("confirm", biz, b, slug);
      return send(res, 200, { ok: true, booking: ownerBooking(b) });
    } catch (e) { return fail(res, 400, e.message); }
  }
  if (what === "password" && m === "POST") {
    const body = await readJson(req);
    if (!checkPassword(biz.acc, body.current)) return fail(res, 400, "Your current password is wrong.");
    if (String(body.next || "").length < 10) return fail(res, 400, "Use at least 10 characters.");
    const list = store.accounts(), acc = list.find((a) => a.slug === slug);
    Object.assign(acc, hashPassword(body.next), { pwv: (acc.pwv || 1) + 1 }); store.saveAccounts(list);
    return send(res, 200, { ok: true }, { "Set-Cookie": sessionCookie(req, slug, makeSession(acc), SESSION_MS / 1000) });
  }
  if (what === "export.csv" && m === "GET") {
    const q = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""').replace(/^([=+\-@\t\r])/, "'$1")}"`;
    const svc = (id) => (s.services.find((x) => x.id === id) || {}).name || id, who = (id) => (s.staff.find((x) => x.id === id) || {}).name || id;
    const local = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: s.tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso)).replace(",", "");
    const rows = [["Start", "End", "Service", "With", "Customer", "Email", "Phone", "Address", "Notes", "Status", "Source", "Code", "Booked at"]]
      .concat(biz.bookings.slice().sort((a, b) => a.start.localeCompare(b.start)).map((b) => [local(b.start), local(b.end), svc(b.serviceId), who(b.staffId), b.name, b.email, b.phone, b.address, b.notes, b.status, b.source, b.code, b.createdAt]));
    res.writeHead(200, { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="bookings-${slug}.csv"`, "Cache-Control": "no-store" });
    return res.end("﻿" + rows.map((r) => r.map(q).join(",")).join("\r\n"));
  }
  return fail(res, 404, "Not found");
}

// ------------------------------------------------------------------ site-owner API (create businesses)
async function siteAdminApi(req, res, rest) {
  if (!isSiteAdmin(req)) return fail(res, 401, "Sign in on the Outreach dashboard first (same password).");
  const m = req.method;
  if (rest === "list" && m === "GET") {
    return send(res, 200, { ok: true, base: mail.base(), mailOn: Boolean(process.env.SMTP_USER && process.env.SMTP_PASS), businesses: store.accounts().map((a) => {
      const b = store.loadBiz(a.slug) || { settings: {}, bookings: [] };
      const now = Date.now();
      return { slug: a.slug, name: b.settings.name || a.slug, ownerEmail: a.ownerEmail, disabled: Boolean(a.disabled), createdAt: a.createdAt,
        upcoming: b.bookings.filter((x) => x.status === "booked" && Date.parse(x.start) > now).length, total: b.bookings.length };
    }) });
  }
  const body = m === "POST" ? await readJson(req) : {};
  if (rest === "create" && m === "POST") {
    const slug = String(body.slug || "").trim().toLowerCase();
    if (!store.SLUG.test(slug)) return fail(res, 400, "Web address: 3–40 lowercase letters, numbers or dashes (e.g. studio-nova).");
    if (["admin", "api", "demo", "new"].includes(slug) || store.account(slug)) return fail(res, 400, "That web address is taken.");
    const ownerEmail = core.email(body.ownerEmail);
    if (!ownerEmail) return fail(res, 400, "Enter the owner's email.");
    const preset = presets[body.preset] || presets.other;
    let settings;
    try { settings = core.sanitizeSettings({ ...preset, name: body.name, tag: body.tag || preset.tag, tz: body.tz, currency: body.currency, phone: body.phone, notifyEmail: ownerEmail }); }
    catch (e) { return fail(res, 400, e.message); }
    const password = newPassword();
    store.saveBiz(slug, { settings, bookings: [] });
    store.saveAccounts(store.accounts().concat({ slug, ownerEmail, ...hashPassword(password), pwv: 1, createdAt: new Date().toISOString() }));
    return send(res, 200, { ok: true, slug, password, url: `${mail.base()}/book/${slug}` });
  }
  const list = store.accounts(), acc = list.find((a) => a.slug === body.slug);
  if (!acc) return fail(res, 404, "Unknown business.");
  if (rest === "reset-password" && m === "POST") {
    const password = newPassword();
    Object.assign(acc, hashPassword(password), { pwv: (acc.pwv || 1) + 1 }); store.saveAccounts(list);
    return send(res, 200, { ok: true, password });
  }
  if (rest === "disable" && m === "POST") { acc.disabled = Boolean(body.disabled); store.saveAccounts(list); return send(res, 200, { ok: true }); }
  return fail(res, 404, "Not found");
}

// ------------------------------------------------------------------ entry point + reminders
function handle(req, res) {
  const p = String(req.url || "").split("?")[0];
  let mm = /^\/book\/([a-z0-9-]{3,40})(\/admin)?\/?$/.exec(p);
  if (mm && (req.method === "GET" || req.method === "HEAD")) { servePage(req, res, mm[1]); return true; }
  mm = /^\/api\/booking\/([a-z0-9-]{3,40})\/([a-z/.]+)$/.exec(p);
  const sa = /^\/api\/booking-admin\/([a-z-]+)$/.exec(p);
  if (!mm && !sa) return false;
  const run = mm ? businessApi(req, res, mm[1], mm[2]) : siteAdminApi(req, res, sa[1]);
  run.catch((e) => { if (!res.headersSent) fail(res, e.status || 500, e.status ? e.message : "Server error"); if (!e.status) console.error("booking error:", e); });
  return true;
}

/** Sends day-before reminders that are due. Safe to call often. */
async function sendReminders(now = Date.now()) {
  let n = 0;
  for (const acc of store.accounts()) {
    if (acc.disabled) continue;
    const biz = store.loadBiz(acc.slug);
    if (!biz || !biz.settings.reminderHours) continue;
    const due = biz.bookings.filter((b) => b.status === "booked" && b.email && !b.remindedAt && Date.parse(b.start) > now && Date.parse(b.start) - now <= biz.settings.reminderHours * 3600e3 && now - Date.parse(b.createdAt) > 3600e3);
    for (const b of due) {
      // mark first (write-ahead), so a crash never sends twice
      const fresh = store.loadBiz(acc.slug), x = fresh.bookings.find((y) => y.id === b.id);
      if (!x || x.remindedAt) continue;
      x.remindedAt = new Date(now).toISOString(); store.saveBiz(acc.slug, fresh);
      if (await mail.send("reminder", fresh.settings, x, acc.slug)) n++;
    }
  }
  return n;
}
function startScheduler() {
  const tick = () => sendReminders().catch((e) => console.error("booking reminders:", e.message));
  setInterval(tick, 5 * 60 * 1000).unref();
  setTimeout(tick, 40 * 1000).unref();
}

module.exports = { handle, startScheduler, sendReminders, setSiteAdminCheck, hashPassword, checkPassword };
