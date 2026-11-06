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
const plans = require("./plans");
const stripe = require("./stripe");
const HOLD_MS = 35 * 60 * 1000; // a booking waiting for its deposit keeps the time this long (Stripe Checkout expires after 31 min)

const PAGE = path.join(__dirname, "..", "public", "demos", "booking", "index.html");
const ACCOUNT_PAGE = path.join(__dirname, "..", "public", "demos", "booking", "account.html");
const ACCOUNT_PAGES = ["new", "login", "forgot", "reset", "verify", "invite"]; // /book/<these> are sign-up and sign-in pages
const RESERVED = ["admin", "api", "demo", "demos", "start", "signup", "help", "www", ...ACCOUNT_PAGES];
const UNVERIFIED_DAYS = 7;
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
    let size = 0, tooBig = false; const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (tooBig) { if (size > limit + 1024 * 1024) req.destroy(); return; } // drain a little so the 413 answer arrives, then hang up
      if (size > limit) { tooBig = true; chunks.length = 0; reject(Object.assign(new Error("That request is too large."), { status: 413 })); } else chunks.push(c);
    });
    req.on("end", () => { if (tooBig) return; const raw = Buffer.concat(chunks).toString("utf8"); if (!raw.trim()) return resolve({}); try { resolve(JSON.parse(raw)); } catch (e) { reject(Object.assign(new Error("Invalid JSON"), { status: 400 })); } });
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
/** Session = slug.expiry.passwordVersion.who.signature; who = "o" (owner) or a staff login's id. */
function makeSession(acc, user) { const body = `${acc.slug}.${Date.now() + SESSION_MS}.${user ? user.pwv || 1 : acc.pwv || 1}.${user ? user.id : "o"}`; return `${body}.${sign(body)}`; }
/** Who is signed in to this business: { acc, user, role: owner | manager | staff } or null. */
function ownerOf(req, slug) {
  const acc = store.account(slug);
  if (!acc || acc.disabled) return null;
  const parts = cookieOf(req, cookieName(slug)).split(".");
  if (parts.length !== 5) return null;
  const [s, exp, pwv, who, sig] = parts, want = sign(`${s}.${exp}.${pwv}.${who}`);
  if (s !== slug || Number(exp) < Date.now() || sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  if (who === "o") return Number(pwv) === (acc.pwv || 1) ? { acc, user: null, role: "owner" } : null;
  const user = (acc.users || []).find((u) => u.id === who && u.hash);
  return user && Number(pwv) === (user.pwv || 1) ? { acc, user, role: user.role } : null;
}
const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, staffId: u.staffId || "", status: u.hash ? "active" : "invited", invitedAt: u.invitedAt || "", lastLogin: u.lastLogin || "" });
// What each role may do in the dashboard (the owner may do everything).
const OWNER_ONLY = ["delete", "stripe/connect", "stripe/dashboard", "team/invite", "team/update", "team/remove", "team/resend"];
const STAFF_OK = ["data", "seen", "status", "update", "book", "slots", "blocks/add", "blocks/remove", "clients", "client", "password"];
const sessionCookie = (req, slug, value, maxAge) => `${cookieName(slug)}=${encodeURIComponent(value)}; Path=/api/booking/${slug}; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${isHttps(req) ? "; Secure" : ""}`;

// ------------------------------------------------------------------ business helpers
const active = (acc) => Boolean(acc && !acc.disabled && acc.verified !== false); // signed-up pages count once the email is confirmed
function getBiz(slug) {
  const acc = store.account(slug);
  if (!active(acc)) return null;
  const biz = store.loadBiz(slug);
  return biz ? { acc, ...biz } : null;
}
function notify(kind, biz, b, slug) {
  mail.send(kind, biz.settings, b, slug).then((ok) => { if (!ok) return; const fresh = store.loadBiz(slug); const x = fresh && fresh.bookings.find((y) => y.id === b.id); if (x) { (x.mails = x.mails || []).push(kind); store.saveBiz(slug, fresh); } });
}
/** Releases bookings whose deposit was never paid. Returns true when something changed. */
function expireHolds(biz, now = Date.now()) {
  let changed = false;
  for (const b of biz.bookings) if (b.status === "pending" && Date.parse(b.holdUntil) < now) { b.status = "expired"; if (b.payment) b.payment.status = "unpaid"; changed = true; }
  return changed;
}
/** A deposit was paid (from the customer's return or Stripe's webhook). Idempotent. */
async function markPaid(slug, bookingId, session) {
  const biz = store.loadBiz(slug);
  const b = biz && biz.bookings.find((x) => x.id === bookingId);
  if (!b || !b.payment || b.payment.status === "paid" || b.payment.status === "refunded") return b;
  if (session.payment_status !== "paid" || (session.metadata && session.metadata.booking !== b.id)) return b;
  b.payment = { ...b.payment, status: "paid", paymentIntent: session.payment_intent, paidAt: new Date().toISOString() };
  if (b.status === "pending") b.status = "booked";
  else if (b.status === "expired") { // paid after the hold ran out: keep it if the time is still free, else refund
    try { Object.assign(b, core.resolveSlot(biz.settings, core.busy(biz.bookings, biz.blocks, biz.settings.staff), { serviceId: b.serviceId, staffId: b.staffId, start: b.start }, { owner: true, ignoreId: b.id }), { status: "booked" }); }
    catch (e) { await refundBooking(biz, b, "time no longer free"); }
  }
  b.seen = false;
  store.saveBiz(slug, biz);
  if (b.status === "booked") { notify("confirm", { settings: biz.settings }, b, slug); notify("owner-new", { settings: biz.settings }, b, slug); }
  return b;
}
async function refundBooking(biz, b, why) {
  if (!b.payment || b.payment.status !== "paid" || !b.payment.paymentIntent || !biz.stripe) return false;
  try { await stripe.refund(biz.stripe.account, b.payment.paymentIntent); b.payment.status = "refunded"; b.payment.refundedAt = new Date().toISOString(); b.payment.refundNote = why || ""; return true; }
  catch (e) { b.payment.refundError = String(e.message).slice(0, 200); console.error("booking refund failed:", e.message); return false; }
}
const paymentsReady = (biz) => stripe.enabled() && biz.stripe && biz.stripe.chargesEnabled;
function uniqueCode(biz) {
  let c;
  do c = core.newCode(biz.settings); while (biz.bookings.some((b) => b.code === c));
  return c;
}
function findByCode(biz, code, email) {
  const c = String(code || "").trim().toUpperCase(), e = String(email || "").trim().toLowerCase();
  return biz.bookings.find((b) => b.code === c && b.email === e) || null;
}
const monthKey = (ms) => new Date(ms).toISOString().slice(0, 7);
const onlineThisMonth = (biz) => biz.bookings.filter((b) => b.source === "online" && monthKey(Date.parse(b.createdAt)) === monthKey(Date.now())).length;
const ownerBooking = (b) => ({ payment: b.payment ? { amount: b.payment.amount, currency: b.payment.currency, status: b.payment.status, paidAt: b.payment.paidAt || "", refundError: b.payment.refundError || "" } : null, holdUntil: b.holdUntil || "", answers: b.answers || {}, id: b.id, code: b.code, serviceId: b.serviceId, staffId: b.staffId, start: b.start, end: b.end, status: b.status, name: b.name, email: b.email, phone: b.phone,
  address: b.address || "", notes: b.notes || "", source: b.source, createdAt: b.createdAt, rescheduled: Boolean(b.rescheduled), isNew: !b.seen, reminded: Boolean(b.remindedAt) });

// ------------------------------------------------------------------ pages
function servePage(req, res, slug) {
  const acc = active(store.account(slug)) ? store.account(slug) : null;
  const page = fs.readFileSync(PAGE, "utf8").replace("<html lang=\"en\">", `<html lang="en" data-slug="${acc ? slug : ""}">`)
    .replace(/<meta name="robots"[^>]*>/, '<meta name="robots" content="noindex, nofollow">');
  const admin = /\/admin\/?$/.test(req.url.split("?")[0]);
  res.writeHead(acc ? 200 : 404, {
    "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin",
    "Content-Security-Policy": `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors ${admin ? "'none'" : "*"}`,
    ...(admin ? { "X-Frame-Options": "DENY" } : {}),
  });
  res.end(req.method === "HEAD" ? undefined : page);
}

// ------------------------------------------------------------------ public + owner API
async function businessApi(req, res, slug, rest) {
  const m = req.method, ip = clientIp(req);
  const biz = getBiz(slug);
  if (!biz) return fail(res, 404, "This booking page doesn't exist.");
  if (expireHolds(biz)) store.saveBiz(slug, biz);
  const s = biz.settings, plan = plans.planOf(biz.acc);
  const occ = () => core.busy(biz.bookings, biz.blocks, s.staff); // bookings + time off

  if (rest === "config" && m === "GET") return send(res, 200, { ok: true, settings: { ...core.publicSettings(s), poweredBy: plan.poweredBy, payments: Boolean(paymentsReady(biz)), testPayments: stripe.testMode() } });
  const notYet = s.setupDone === false && ["slots", "book", "lookup", "cancel", "reschedule"].includes(rest);
  if (notYet) return fail(res, 404, "This business isn't taking online bookings yet.");
  if (rest === "slots" && m === "GET") {
    if (!allow("slots:" + ip, 240, 600e3)) return fail(res, 429, "Too many requests. Please wait a moment.");
    const q = new URL(req.url, "http://x").searchParams;
    try { return send(res, 200, { ok: true, days: core.availability(s, occ(), { serviceId: q.get("service"), staffId: q.get("staff") || "any", from: q.get("from"), days: Number(q.get("days")) || 28 }) }); }
    catch (e) { return fail(res, 400, e.message); }
  }
  if (rest === "book" && m === "POST") {
    const body = await readJson(req);
    if (body.website) return send(res, 200, { ok: true, booking: null }); // honeypot: bots fill every field
    if (!allow("book:" + ip, 8, 3600e3) || !allow("book-all:" + slug, 300, 3600e3)) return fail(res, 429, "Too many bookings from this connection. Please call us instead.");
    try {
      const who = core.cleanCustomer(body, s);
      const answers = core.cleanAnswers(s, body.answers);
      const rec = biz.clients[core.clientKey(who.email)] || biz.clients[core.clientKey("", who.phone)];
      if (rec && rec.blocked) throw new Error(`Online booking isn't available for you.${s.phone ? " Please call " + s.phone + "." : " Please contact us."}`);
      if (plan.bookingsPerMonth && onlineThisMonth(biz) >= plan.bookingsPerMonth) throw new Error(`Online booking is full for this month.${s.phone ? " Please call " + s.phone + "." : " Please contact us."}`);
      const upcoming = biz.bookings.filter((b) => b.email === who.email && b.status === "booked" && Date.parse(b.start) > Date.now()).length;
      if (upcoming >= 5) throw new Error("You already have 5 upcoming bookings. Please call us to book more.");
      const slot = core.resolveSlot(s, occ(), body);
      const b = { id: crypto.randomBytes(8).toString("hex"), code: uniqueCode(biz), serviceId: body.serviceId, ...slot, ...who, answers, status: "booked", source: "online", createdAt: new Date().toISOString() };
      const svc = s.services.find((x) => x.id === b.serviceId), deposit = core.depositFor(svc);
      if (deposit > 0 && paymentsReady(biz)) { // hold the time and send the customer to pay
        Object.assign(b, { status: "pending", holdUntil: new Date(Date.now() + HOLD_MS).toISOString(), payment: { amount: deposit, currency: s.currencyCode, status: "pending" } });
        biz.bookings.push(b); store.saveBiz(slug, biz);
        let session;
        const page = `${mail.base()}/book/${slug}`;
        try {
          session = await stripe.createCheckout({ account: biz.stripe.account, amount: deposit, currency: s.currencyCode, email: b.email,
            name: `${deposit === svc.price ? "Payment" : "Deposit"}: ${svc.name}`, description: `${s.name}, ${new Intl.DateTimeFormat("en-US", { timeZone: s.tz, dateStyle: "medium", timeStyle: "short" }).format(new Date(b.start))}. Booking ${b.code}.`,
            successUrl: `${page}?paid=${encodeURIComponent(b.code)}&session_id={CHECKOUT_SESSION_ID}`, cancelUrl: `${page}?unpaid=${encodeURIComponent(b.code)}`, metadata: { booking: b.id, slug, code: b.code } });
        } catch (e) {
          const again = store.loadBiz(slug); const x = again.bookings.find((y) => y.id === b.id); if (x) { x.status = "expired"; store.saveBiz(slug, again); }
          return fail(res, 502, `Online payment isn't available right now (${String(e.message).slice(0, 80)}). Please try again${s.phone ? " or call " + s.phone : ""}.`);
        }
        const again = store.loadBiz(slug); const x = again.bookings.find((y) => y.id === b.id);
        if (x) { x.payment.sessionId = session.id; store.saveBiz(slug, again); }
        return send(res, 200, { ok: true, booking: core.customerView(x || b), payUrl: session.url });
      }
      biz.bookings.push(b); store.saveBiz(slug, biz);
      notify("confirm", biz, b, slug); notify("owner-new", biz, b, slug);
      return send(res, 200, { ok: true, booking: core.customerView(b) });
    } catch (e) { return fail(res, 400, e.message); }
  }
  if (rest === "payment" && m === "POST") { // the customer is back from Stripe Checkout
    if (!allow("pay:" + ip, 30, 600e3)) return fail(res, 429, "Too many attempts. Please wait a moment.");
    const body = await readJson(req);
    const b = biz.bookings.find((x) => x.code === String(body.code || "").toUpperCase());
    if (!b || !b.payment) return fail(res, 404, "We couldn't find that booking.");
    if (b.payment.status === "pending" && body.sessionId === b.payment.sessionId && biz.stripe) {
      try { await markPaid(slug, b.id, await stripe.getCheckout(biz.stripe.account, b.payment.sessionId)); } catch (e) { return fail(res, 502, "We couldn't check the payment with Stripe yet. Refresh in a moment."); }
    }
    const fresh = store.loadBiz(slug).bookings.find((x) => x.id === b.id);
    return send(res, 200, { ok: true, booking: core.customerView(fresh), paid: fresh.payment.status === "paid" });
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
      b.status = "cancelled"; b.cancelledAt = new Date().toISOString(); b.cancelledBy = "customer"; b.seen = false;
      await refundBooking(biz, b, "cancelled by the customer in time");
      store.saveBiz(slug, biz);
      notify("cancel", biz, b, slug); notify("owner-cancel", biz, b, slug);
      return send(res, 200, { ok: true, booking: core.customerView(b) });
    }
    try {
      const slot = core.resolveSlot(s, occ(), { serviceId: b.serviceId, staffId: body.staffId || b.staffId, start: body.start }, { ignoreId: b.id });
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
  const me = ownerOf(req, slug);
  if (!me) return fail(res, 401, "Please sign in.");
  const what = rest.slice(6), role = me.role, staffOnly = role === "staff" ? me.user.staffId : null;
  if (OWNER_ONLY.includes(what) && role !== "owner") return fail(res, 403, "Only the owner can do that.");
  if (role === "staff" && !STAFF_OK.includes(what)) return fail(res, 403, "Your login can't do that. Ask the owner or a manager.");
  const mine = (b) => !staffOnly || b.staffId === staffOnly; // staff only see and change their own appointments
  const myClientKeys = () => new Set(biz.bookings.filter(mine).map((b) => core.clientKey(b.email, b.phone)).filter(Boolean));

  if (what === "data" && m === "GET") {
    const from = Date.now() - 90 * 864e5;
    if (!biz.feedToken) { biz.feedToken = crypto.randomBytes(16).toString("hex"); store.saveBiz(slug, biz); }
    return send(res, 200, { ok: true, settings: { ...s, poweredBy: plan.poweredBy }, slug, ownerEmail: biz.acc.ownerEmail, mailOn: mail.canSend(),
      me: { role, name: me.user ? me.user.name : "Owner", email: me.user ? me.user.email : biz.acc.ownerEmail, staffId: staffOnly || (me.user && me.user.staffId) || "" },
      team: role === "owner" ? (biz.acc.users || []).map(publicUser) : undefined,
      bookings: biz.bookings.filter((b) => Date.parse(b.end) > from && mine(b)).map(ownerBooking), blocks: biz.blocks.filter((b) => !staffOnly || b.staffId === "all" || b.staffId === staffOnly),
      plan: { key: biz.acc.plan || "free", ...plan, usage: { bookingsThisMonth: onlineThisMonth(biz), staff: s.staff.length } },
      plans: { free: plans.free, pro: plans.pro }, services: plans.SERVICES,
      requests: store.requests().filter((r) => r.slug === slug).slice(-10),
      feedUrl: `${mail.base()}/api/booking-feed/${slug}/${biz.feedToken}.ics`,
      payments: { available: stripe.enabled(), test: stripe.testMode(), connected: Boolean(biz.stripe && biz.stripe.account), chargesEnabled: Boolean(biz.stripe && biz.stripe.chargesEnabled), feePercent: stripe.feePercent() } });
  }
  if (what === "seen" && m === "POST") { biz.bookings.forEach((b) => { b.seen = true; }); store.saveBiz(slug, biz); return send(res, 200, { ok: true }); }
  if (what === "status" && m === "POST") {
    const body = await readJson(req);
    const b = biz.bookings.find((x) => x.id === body.id);
    if (!b || !core.STATUSES.includes(body.status) || !mine(b)) return fail(res, 400, "Unknown booking or status.");
    if (b.status === "cancelled" && body.status !== "cancelled") {
      try { core.resolveSlot(s, occ(), { serviceId: b.serviceId, staffId: b.staffId, start: b.start }, { owner: true, ignoreId: b.id }); }
      catch (e) { return fail(res, 400, "That time has been booked by someone else since, so it can't be restored."); }
    }
    if (b.status === "pending" || b.status === "expired") return fail(res, 400, "This booking is waiting for (or never got) its deposit, so it can't be changed.");
    const wasLive = b.status === "booked";
    b.status = body.status; b.seen = true;
    if (body.status === "cancelled" && body.refund !== false) await refundBooking(biz, b, "cancelled by the business");
    store.saveBiz(slug, biz);
    if (body.status === "cancelled" && wasLive && body.notify !== false && Date.parse(b.start) > Date.now()) notify("cancel", biz, b, slug);
    return send(res, 200, { ok: true });
  }
  if (what === "settings" && m === "PUT") {
    const body = await readJson(req);
    let next;
    try { next = core.sanitizeSettings(body.settings, s); } catch (e) { return fail(res, 400, e.message); }
    // Never strand a customer: a service or person with upcoming bookings can't be removed.
    const ahead = biz.bookings.filter((b) => b.status === "booked" && Date.parse(b.start) > Date.now());
    const lostSvc = ahead.find((b) => !next.services.some((x) => x.id === b.serviceId));
    const lostPerson = ahead.find((b) => !next.staff.some((x) => x.id === b.staffId));
    if (lostSvc) return fail(res, 400, `"${(s.services.find((x) => x.id === lostSvc.serviceId) || {}).name || "A service"}" has upcoming bookings. Cancel or move them before removing it.`);
    if (lostPerson) return fail(res, 400, `${(s.staff.find((x) => x.id === lostPerson.staffId) || {}).name || "That person"} has upcoming bookings. Cancel or move them before removing them.`);
    if (plan.staff && next.staff.length > plan.staff) return fail(res, 403, `The ${plan.name} plan includes ${plan.staff} team member${plan.staff > 1 ? "s" : ""}. Upgrade to add more (Plan & help).`);
    if (plan.questions !== null && next.questions.length > plan.questions) return fail(res, 403, `The ${plan.name} plan includes ${plan.questions} booking questions. Upgrade for more (Plan & help).`);
    next.poweredBy = plan.poweredBy;
    biz.settings = next;
    store.saveBiz(slug, biz);
    return send(res, 200, { ok: true, settings: biz.settings });
  }
  if (what === "book" && m === "POST") { // phone / walk-in booking by the owner
    const body = await readJson(req);
    if (staffOnly && body.staffId !== staffOnly) return fail(res, 403, "You can only add bookings to your own calendar.");
    try {
      const who = core.cleanCustomer({ ...body, email: body.email || `no-email+${Date.now()}@invalid.local` }, s);
      if (!body.email) who.email = "";
      const slot = core.resolveSlot(s, occ(), body, { owner: true });
      const answers = core.cleanAnswers({ ...s, questions: (s.questions || []).map((q) => ({ ...q, required: false })) }, body.answers);
      const b = { id: crypto.randomBytes(8).toString("hex"), code: uniqueCode(biz), serviceId: body.serviceId, ...slot, ...who, answers, status: "booked", source: body.source === "walk-in" ? "walk-in" : "phone", createdAt: new Date().toISOString(), seen: true };
      biz.bookings.push(b); store.saveBiz(slug, biz);
      if (b.email && body.sendConfirmation !== false) notify("confirm", biz, b, slug);
      return send(res, 200, { ok: true, booking: ownerBooking(b) });
    } catch (e) { return fail(res, 400, e.message); }
  }
  if (what === "stripe/connect" && m === "POST") {
    if (!stripe.enabled()) return fail(res, 503, "Online payments aren't switched on for this website yet. Ask WebersLink.");
    try {
      if (!biz.stripe || !biz.stripe.account) { const a = await stripe.createAccount({ email: biz.acc.ownerEmail, name: s.name, url: `${mail.base()}/book/${slug}` }); biz.stripe = { account: a.id, chargesEnabled: false, createdAt: new Date().toISOString() }; store.saveBiz(slug, biz); }
      const back = `${mail.base()}/book/${slug}/admin?stripe=back`;
      const link = await stripe.accountLink(biz.stripe.account, back.replace("back", "retry"), back);
      return send(res, 200, { ok: true, url: link.url });
    } catch (e) { return fail(res, 502, String(e.message).slice(0, 200)); }
  }
  if (what === "stripe/status" && m === "POST") {
    if (!biz.stripe || !stripe.enabled()) return send(res, 200, { ok: true, payments: { available: stripe.enabled(), connected: false } });
    try { const a = await stripe.getAccount(biz.stripe.account); Object.assign(biz.stripe, { chargesEnabled: Boolean(a.charges_enabled), detailsSubmitted: Boolean(a.details_submitted), checkedAt: new Date().toISOString() }); store.saveBiz(slug, biz); }
    catch (e) { return fail(res, 502, String(e.message).slice(0, 200)); }
    return send(res, 200, { ok: true, payments: { available: true, connected: true, chargesEnabled: biz.stripe.chargesEnabled, detailsSubmitted: biz.stripe.detailsSubmitted } });
  }
  if (what === "stripe/dashboard" && m === "POST") {
    if (!biz.stripe || !stripe.enabled()) return fail(res, 400, "Connect Stripe first.");
    try { return send(res, 200, { ok: true, url: (await stripe.loginLink(biz.stripe.account)).url }); } catch (e) { return fail(res, 502, String(e.message).slice(0, 200)); }
  }
  if (what === "refund" && m === "POST") {
    const body = await readJson(req);
    const b = biz.bookings.find((x) => x.id === body.id);
    if (!b || !b.payment || b.payment.status !== "paid" || !mine(b)) return fail(res, 400, "There's no paid deposit on this booking to refund.");
    if (!(await refundBooking(biz, b, "refunded by the business"))) { store.saveBiz(slug, biz); return fail(res, 502, "Stripe couldn't refund it: " + (b.payment.refundError || "unknown error")); }
    store.saveBiz(slug, biz);
    return send(res, 200, { ok: true });
  }
  if (what === "slots" && m === "GET") { // owner view: includes phone-only services, ignores minimum notice
    const q = new URL(req.url, "http://x").searchParams;
    try { return send(res, 200, { ok: true, days: core.availability(s, occ(), { serviceId: q.get("service"), staffId: staffOnly || q.get("staff") || "any", days: Number(q.get("days")) || 28, owner: true }) }); }
    catch (e) { return fail(res, 400, e.message); }
  }
  if (what === "update" && m === "POST") { // the owner moves or edits a booking
    const body = await readJson(req);
    const b = biz.bookings.find((x) => x.id === body.id);
    if (!b || b.status === "cancelled" || !mine(b)) return fail(res, 400, "That booking can't be changed (it may be cancelled).");
    if (b.status === "pending" || b.status === "expired") return fail(res, 400, "This booking is waiting for (or never got) its deposit.");
    if (staffOnly && body.staffId && body.staffId !== staffOnly) return fail(res, 403, "Only the owner or a manager can give a booking to someone else.");
    const next = { serviceId: body.serviceId || b.serviceId, staffId: body.staffId || b.staffId, start: body.start || b.start };
    const moved = next.start !== b.start || next.staffId !== b.staffId || next.serviceId !== b.serviceId;
    try {
      const who = core.cleanCustomer({ name: body.name ?? b.name, email: (body.email ?? b.email) || "x@no-email.invalid", phone: body.phone ?? b.phone, address: body.address ?? b.address, notes: body.notes ?? b.notes }, { ...s, needAddress: false });
      if (!(body.email ?? b.email)) who.email = "";
      if (moved) Object.assign(b, core.resolveSlot(s, occ(), { ...next, staffId: next.staffId }, { owner: true, ignoreId: b.id }), { serviceId: next.serviceId, rescheduled: true, remindedAt: undefined });
      Object.assign(b, who, { seen: true });
      store.saveBiz(slug, biz);
      if (moved && b.email && body.notify !== false && Date.parse(b.start) > Date.now()) notify("moved", biz, b, slug);
      return send(res, 200, { ok: true, booking: ownerBooking(b) });
    } catch (e) { return fail(res, 400, e.message.replace("Sorry, that time was just taken. Please pick another time.", "That time isn't free for this person (another booking, time off, a break or outside their hours).")); }
  }
  if (what === "blocks/add" && m === "POST") {
    const body = await readJson(req);
    let blk;
    if (staffOnly && body.staffId !== staffOnly) return fail(res, 403, "You can only add your own time off.");
    try { blk = core.cleanBlock(s, body); } catch (e) { return fail(res, 400, e.message); }
    if ((biz.blocks || []).length >= 500) return fail(res, 400, "Too many time-off entries. Remove old ones first.");
    biz.blocks = (biz.blocks || []).concat(blk); store.saveBiz(slug, biz);
    const clash = biz.bookings.filter((b) => b.status === "booked" && (blk.staffId === "all" || b.staffId === blk.staffId) && Date.parse(b.start) < Date.parse(blk.end) && Date.parse(blk.start) < Date.parse(b.end));
    return send(res, 200, { ok: true, block: blk, conflicts: clash.map(ownerBooking) });
  }
  if (what === "blocks/remove" && m === "POST") {
    const body = await readJson(req);
    const blk = (biz.blocks || []).find((b) => b.id === body.id);
    if (blk && staffOnly && blk.staffId !== staffOnly) return fail(res, 403, "You can only remove your own time off.");
    biz.blocks = (biz.blocks || []).filter((b) => b.id !== body.id); store.saveBiz(slug, biz);
    return send(res, 200, { ok: true });
  }
  if (what === "clients" && m === "GET") { const keys = staffOnly ? myClientKeys() : null; return send(res, 200, { ok: true, clients: core.clientList(biz).filter((c) => !keys || keys.has(c.key)) }); }
  if (what === "client" && m === "POST") {
    const body = await readJson(req);
    const key = body.key || core.clientKey(core.email(body.email), body.phone);
    if (!key) return fail(res, 400, "Enter an email or a phone number.");
    if (staffOnly && !myClientKeys().has(key)) return fail(res, 403, "You can only update your own clients.");
    const r = biz.clients[key] || {};
    biz.clients[key] = { ...r, name: core.str(body.name ?? r.name, 80), email: core.email(body.email ?? r.email) || r.email || "", phone: core.str(body.phone ?? r.phone, 30),
      notes: core.str(body.notes ?? r.notes, 2000), tags: (Array.isArray(body.tags) ? body.tags : r.tags || []).map((t) => core.str(t, 30)).filter((t, i, a) => t && a.indexOf(t) === i).slice(0, 10),
      blocked: body.blocked === undefined ? Boolean(r.blocked) : Boolean(body.blocked), source: r.source || "added" };
    if (Object.keys(biz.clients).length > 20000) return fail(res, 400, "Client list is full (20,000).");
    store.saveBiz(slug, biz);
    return send(res, 200, { ok: true, key });
  }
  if (what === "clients/import" && m === "POST") {
    const body = await readJson(req, 4 * 1024 * 1024);
    const rows = Array.isArray(body.rows) ? body.rows.slice(0, 5000) : [];
    let added = 0, updated = 0, skipped = 0;
    for (const row of rows) {
      const em = core.email(row.email), key = core.clientKey(em, row.phone);
      if (!key || !core.str(row.name, 80)) { skipped++; continue; }
      const r = biz.clients[key];
      biz.clients[key] = { ...(r || {}), name: core.str(row.name, 80), email: em || (r && r.email) || "", phone: core.str(row.phone, 30) || (r && r.phone) || "",
        notes: core.str(row.notes, 2000) || (r && r.notes) || "", tags: String(row.tags || "").split(/[,;|]/).map((t) => core.str(t, 30)).filter(Boolean).slice(0, 10).concat((r && r.tags) || []).filter((t, i, a) => a.indexOf(t) === i).slice(0, 10),
        blocked: Boolean(r && r.blocked), source: (r && r.source) || "import" };
      r ? updated++ : added++;
    }
    if (Object.keys(biz.clients).length > 20000) return fail(res, 400, "That would make more than 20,000 clients.");
    store.saveBiz(slug, biz);
    return send(res, 200, { ok: true, added, updated, skipped });
  }
  if (what === "clients.csv" && m === "GET") {
    const q = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""').replace(/^([=+\-@\t\r])/, "'$1")}"`;
    const rows = [["Name", "Email", "Phone", "Visits", "Upcoming", "No-shows", "Cancelled", "Spent", "Last visit", "Tags", "Notes", "Blocked"]]
      .concat(core.clientList(biz).map((c) => [c.name, c.email, c.phone, c.visits, c.upcoming, c.noShows, c.cancelled, c.spent, (c.last || "").slice(0, 10), c.tags.join(", "), c.notes, c.blocked ? "yes" : ""]));
    res.writeHead(200, { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="clients-${slug}.csv"`, "Cache-Control": "no-store" });
    return res.end("\ufeff" + rows.map((r) => r.map(q).join(",")).join("\r\n"));
  }
  if (what === "feed/reset" && m === "POST") {
    biz.feedToken = crypto.randomBytes(16).toString("hex"); store.saveBiz(slug, biz);
    return send(res, 200, { ok: true, feedUrl: `${mail.base()}/api/booking-feed/${slug}/${biz.feedToken}.ics` });
  }
  if (what === "request" && m === "POST") { // upgrade, done-for-you setup or a custom feature: goes to you
    const body = await readJson(req);
    if (!["upgrade", "setup", "custom"].includes(body.kind)) return fail(res, 400, "Choose what you need.");
    if (!allow("request:" + slug, 5, 864e5)) return fail(res, 429, "You've sent several requests today. We'll be in touch.");
    const r = { id: crypto.randomBytes(6).toString("hex"), slug, name: s.name, ownerEmail: biz.acc.ownerEmail, kind: body.kind, message: core.str(body.message, 3000), phone: core.str(body.phone, 30), status: "open", createdAt: new Date().toISOString() };
    store.saveRequests(store.requests().concat(r).slice(-2000));
    const to = process.env.BOOKING_ADMIN_EMAIL || process.env.SMTP_USER;
    if (to) mail.sendPlain(to, `Booking ${r.kind} request: ${s.name}`, `${s.name} (${mail.base()}/book/${slug})\nOwner: ${r.ownerEmail}${r.phone ? ", " + r.phone : ""}\nPlan: ${plan.name}\nRequest: ${r.kind}\n\n${r.message || "(no message)"}\n\nSee all requests: ${mail.base()}/admin/booking.html`);
    return send(res, 200, { ok: true, request: r });
  }
  if (what === "password" && m === "POST" && me.user) { // a staff login changes its own password
    const body = await readJson(req);
    if (!checkPassword(me.user, body.current)) return fail(res, 400, "Your current password is wrong.");
    if (String(body.next || "").length < 10) return fail(res, 400, "Use at least 10 characters.");
    const list = store.accounts(), u = list.find((a) => a.slug === slug).users.find((x) => x.id === me.user.id);
    Object.assign(u, hashPassword(body.next), { pwv: (u.pwv || 1) + 1 }); store.saveAccounts(list);
    return send(res, 200, { ok: true }, { "Set-Cookie": sessionCookie(req, slug, makeSession(me.acc, u), SESSION_MS / 1000) });
  }
  if (what === "team/invite" && m === "POST") {
    const body = await readJson(req);
    if (plan.logins === 0) return fail(res, 403, `Team logins are part of Pro. Upgrade under Plan & help.`);
    const email = core.email(body.email), name = core.str(body.name, 60);
    if (!email) return fail(res, 400, "Enter their email address.");
    if (!["manager", "staff"].includes(body.role)) return fail(res, 400, "Choose a role.");
    if (body.role === "staff" && !s.staff.some((p) => p.id === body.staffId)) return fail(res, 400, "Choose which team member's calendar they use.");
    const list = store.accounts(), acc = list.find((a) => a.slug === slug);
    acc.users = acc.users || [];
    if (email === acc.ownerEmail || acc.users.some((u) => u.email === email)) return fail(res, 409, "That email already has a login here.");
    if (acc.users.length >= 50) return fail(res, 400, "That's the maximum of 50 logins.");
    const token = crypto.randomBytes(24).toString("hex");
    const u = { id: "u" + crypto.randomBytes(5).toString("hex"), email, name: name || email.split("@")[0], role: body.role, staffId: s.staff.some((p) => p.id === body.staffId) ? body.staffId : "", pwv: 1, invitedAt: new Date().toISOString(), inviteHash: crypto.createHash("sha256").update(token).digest("hex"), inviteExp: Date.now() + 7 * 864e5 };
    acc.users.push(u); store.saveAccounts(list);
    const sent = await mail.sendAccount("invite", email, { name: s.name, link: `${mail.base()}/book/invite?token=${token}` });
    return send(res, 200, { ok: true, user: publicUser(u), emailed: sent });
  }
  if ((what === "team/update" || what === "team/remove" || what === "team/resend") && m === "POST") {
    const body = await readJson(req);
    const list = store.accounts(), acc = list.find((a) => a.slug === slug), u = (acc.users || []).find((x) => x.id === body.id);
    if (!u) return fail(res, 404, "Unknown login.");
    if (what === "team/remove") { acc.users = acc.users.filter((x) => x !== u); store.saveAccounts(list); return send(res, 200, { ok: true }); }
    if (what === "team/resend") {
      if (u.hash) return fail(res, 400, "They've already set a password.");
      const token = crypto.randomBytes(24).toString("hex");
      Object.assign(u, { inviteHash: crypto.createHash("sha256").update(token).digest("hex"), inviteExp: Date.now() + 7 * 864e5, invitedAt: new Date().toISOString() }); store.saveAccounts(list);
      return send(res, 200, { ok: true, emailed: await mail.sendAccount("invite", u.email, { name: s.name, link: `${mail.base()}/book/invite?token=${token}` }) });
    }
    if (!["manager", "staff"].includes(body.role)) return fail(res, 400, "Choose a role.");
    if (body.role === "staff" && !s.staff.some((p) => p.id === body.staffId)) return fail(res, 400, "Choose which team member's calendar they use.");
    Object.assign(u, { role: body.role, staffId: s.staff.some((p) => p.id === body.staffId) ? body.staffId : "", pwv: (u.pwv || 1) + 1 }); // role change signs them out
    store.saveAccounts(list);
    return send(res, 200, { ok: true, user: publicUser(u) });
  }
  if (what === "password" && m === "POST") {
    const body = await readJson(req);
    if (!checkPassword(biz.acc, body.current)) return fail(res, 400, "Your current password is wrong.");
    if (String(body.next || "").length < 10) return fail(res, 400, "Use at least 10 characters.");
    const list = store.accounts(), acc = list.find((a) => a.slug === slug);
    Object.assign(acc, hashPassword(body.next), { pwv: (acc.pwv || 1) + 1 }); store.saveAccounts(list);
    return send(res, 200, { ok: true }, { "Set-Cookie": sessionCookie(req, slug, makeSession(acc), SESSION_MS / 1000) });
  }
  if (what === "delete" && m === "POST") { // the owner closes their booking page for good
    const body = await readJson(req);
    if (!checkPassword(biz.acc, body.password)) return fail(res, 400, "Your password is wrong.");
    store.deleteBiz(slug);
    store.saveAccounts(store.accounts().filter((a) => a.slug !== slug));
    return send(res, 200, { ok: true }, { "Set-Cookie": sessionCookie(req, slug, "", 0) });
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
        source: a.source || "admin", verified: a.verified !== false, setupDone: b.settings.setupDone !== false, plan: a.plan || "free",
        upcoming: b.bookings.filter((x) => x.status === "booked" && Date.parse(x.start) > now).length, total: b.bookings.length };
    }) });
  }
  if (rest === "requests" && m === "GET") return send(res, 200, { ok: true, requests: store.requests().slice().reverse(), plans: Object.fromEntries(Object.entries(plans).filter(([, v]) => v && v.name)) });
  const body = m === "POST" ? await readJson(req) : {};
  if (rest === "request-status" && m === "POST") {
    const list = store.requests(), r = list.find((x) => x.id === body.id);
    if (!r) return fail(res, 404, "Unknown request.");
    r.status = body.status === "done" ? "done" : "open"; store.saveRequests(list);
    return send(res, 200, { ok: true });
  }
  if (rest === "create" && m === "POST") {
    const slug = String(body.slug || "").trim().toLowerCase();
    if (!store.SLUG.test(slug)) return fail(res, 400, "Web address: 3–40 lowercase letters, numbers or dashes (e.g. studio-nova).");
    if (RESERVED.includes(slug) || store.account(slug)) return fail(res, 400, "That web address is taken.");
    const ownerEmail = core.email(body.ownerEmail);
    if (!ownerEmail) return fail(res, 400, "Enter the owner's email.");
    const preset = presets[body.preset] || presets.other;
    let settings;
    try { settings = core.sanitizeSettings({ ...preset, name: body.name, tag: body.tag || preset.tag, tz: body.tz, currency: body.currency, phone: body.phone, notifyEmail: ownerEmail, setupDone: false }); }
    catch (e) { return fail(res, 400, e.message); }
    const password = newPassword();
    store.saveBiz(slug, { settings, bookings: [] });
    store.saveAccounts(store.accounts().concat({ slug, ownerEmail, ...hashPassword(password), pwv: 1, createdAt: new Date().toISOString(), source: "admin" }));
    return send(res, 200, { ok: true, slug, password, url: `${mail.base()}/book/${slug}` });
  }
  const list = store.accounts(), acc = list.find((a) => a.slug === body.slug);
  if (!acc) return fail(res, 404, "Unknown business.");
  if (rest === "reset-password" && m === "POST") {
    const password = newPassword();
    Object.assign(acc, hashPassword(password), { pwv: (acc.pwv || 1) + 1 }); store.saveAccounts(list);
    return send(res, 200, { ok: true, password });
  }
  if (rest === "set-plan" && m === "POST") {
    if (!plans[body.plan] || !plans[body.plan].name) return fail(res, 400, "Unknown plan.");
    acc.plan = body.plan; store.saveAccounts(list);
    const b = store.loadBiz(acc.slug);
    if (b) { b.settings.poweredBy = plans[body.plan].poweredBy; store.saveBiz(acc.slug, b); }
    return send(res, 200, { ok: true });
  }
  if (rest === "disable" && m === "POST") { acc.disabled = Boolean(body.disabled); store.saveAccounts(list); return send(res, 200, { ok: true }); }
  return fail(res, 404, "Not found");
}

// ------------------------------------------------------------------ owner accounts: sign up, confirm email, sign in, reset password
const tokenHash = (t) => crypto.createHash("sha256").update(String(t)).digest("hex");
const newToken = () => crypto.randomBytes(24).toString("hex");
function slugify(name) {
  return String(name || "").toLowerCase().replace(/['’`]/g, "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 36).replace(/-+$/, "");
}
function freeSlug(base) {
  let s = store.SLUG.test(base) && !RESERVED.includes(base) ? base : (base + "-booking").replace(/^-+/, "").slice(0, 40);
  if (!store.SLUG.test(s)) s = "booking-" + crypto.randomBytes(3).toString("hex");
  if (!store.account(s)) return s;
  for (let i = 2; i < 100; i++) { const t = `${s.slice(0, 36)}-${i}`; if (!store.account(t)) return t; }
  return `${s.slice(0, 30)}-${crypto.randomBytes(3).toString("hex")}`;
}
function loggedIn(req, res, acc, extra = {}, user = null) {
  return send(res, 200, { ok: true, slug: acc.slug, ...extra }, { "Set-Cookie": sessionCookie(req, acc.slug, makeSession(acc, user), SESSION_MS / 1000) });
}
function findInvite(token) {
  const h = crypto.createHash("sha256").update(String(token || "")).digest("hex");
  for (const acc of store.accounts()) {
    if (acc.disabled) continue;
    const user = (acc.users || []).find((u) => u.inviteHash && u.inviteHash === h && u.inviteExp > Date.now());
    if (user) return { acc, user };
  }
  return null;
}
function updateAccount(slug, fn) { const list = store.accounts(), a = list.find((x) => x.slug === slug); if (!a) return null; fn(a); store.saveAccounts(list); return a; }
async function sendVerify(acc, name) {
  const token = newToken();
  updateAccount(acc.slug, (a) => { a.verifyHash = tokenHash(token); a.verifyExp = Date.now() + 48 * 3600e3; });
  return mail.sendAccount("verify", acc.ownerEmail, { name, link: `${mail.base()}/book/verify?token=${token}` });
}
const bizName = (slug) => ((store.loadBiz(slug) || {}).settings || {}).name || slug;

async function accountApi(req, res, what) {
  if (req.method !== "POST") return fail(res, 405, "Use POST.");
  const ip = clientIp(req), body = await readJson(req);
  const email = core.email(body.email);
  if (what === "signup") {
    if (process.env.BOOKING_SIGNUP === "off") return fail(res, 403, "New sign-ups are closed at the moment. Please contact us.");
    if (!mail.canSend()) return fail(res, 503, "Sign-up isn't open yet (email isn't set up on the server). Please contact us.");
    if (body.website) return send(res, 200, { ok: true, email }); // honeypot
    if (!allow("signup:" + ip, 3, 3600e3) || !allow("signup-day:" + ip, 10, 864e5) || !allow("signup-all", 60, 864e5)) return fail(res, 429, "Too many sign-ups from this connection. Please try again later.");
    const name = core.str(body.name, 80);
    if (name.length < 2) return fail(res, 400, "Enter your business name.");
    if (!email) return fail(res, 400, "Enter a valid email address.");
    if (String(body.password || "").length < 10) return fail(res, 400, "Choose a password of at least 10 characters.");
    if (String(body.password).length > 200) return fail(res, 400, "That password is too long.");
    const mine = store.accounts().filter((a) => a.ownerEmail === email && !a.disabled);
    if (mine.some((a) => a.verified !== false)) return fail(res, 409, "There's already a booking page for this email. Sign in, or reset your password.");
    for (const a of mine) { store.deleteBiz(a.slug); store.saveAccounts(store.accounts().filter((x) => x.slug !== a.slug)); } // an older unconfirmed try: start again
    let slug;
    if (body.slug) {
      slug = String(body.slug).trim().toLowerCase();
      if (!store.SLUG.test(slug)) return fail(res, 400, "Web address: 3–40 lowercase letters, numbers or dashes.");
      if (RESERVED.includes(slug) || store.account(slug)) return fail(res, 409, "That web address is taken. Try another.");
    } else slug = freeSlug(slugify(name));
    const preset = presets[body.type] || presets.other;
    let settings;
    try { settings = core.sanitizeSettings({ ...preset, name, tz: body.tz, currency: body.currency, notifyEmail: email, setupDone: false }); }
    catch (e) { return fail(res, 400, e.message); }
    store.saveBiz(slug, { settings, bookings: [] });
    const acc = { slug, ownerEmail: email, ...hashPassword(body.password), pwv: 1, createdAt: new Date().toISOString(), source: "signup", verified: false };
    store.saveAccounts(store.accounts().concat(acc));
    if (!(await sendVerify(acc, name))) return fail(res, 502, "We couldn't send the confirmation email. Please try again in a few minutes.");
    return send(res, 200, { ok: true, email, slug });
  }
  if (what === "resend") {
    if (!allow("resend:" + ip, 5, 3600e3)) return fail(res, 429, "Too many requests. Please wait a while.");
    const acc = email && store.accounts().find((a) => a.ownerEmail === email && a.verified === false && !a.disabled);
    if (acc) await sendVerify(acc, bizName(acc.slug));
    return send(res, 200, { ok: true });
  }
  if (what === "verify") {
    if (!allow("verify:" + ip, 20, 3600e3)) return fail(res, 429, "Too many attempts. Please wait a while.");
    const h = tokenHash(body.token || "");
    const acc = store.accounts().find((a) => a.verifyHash && a.verifyHash === h);
    if (!acc || acc.disabled) return fail(res, 400, "This link has already been used or isn't valid. Sign in, or sign up again.");
    if (acc.verifyExp < Date.now()) return fail(res, 400, "This link has expired. Sign in to get a new one.");
    const done = updateAccount(acc.slug, (a) => { a.verified = true; a.verifiedAt = new Date().toISOString(); delete a.verifyHash; delete a.verifyExp; });
    return loggedIn(req, res, done);
  }
  if (what === "login") {
    if (!allow("acct-login:" + ip, 10, 900e3)) return fail(res, 429, "Too many attempts. Try again in 15 minutes.");
    const all = email ? store.accounts().filter((a) => !a.disabled) : [];
    const acc = all.filter((a) => a.ownerEmail === email).find((a) => checkPassword(a, body.password));
    if (acc) {
      if (acc.verified === false) return fail(res, 403, "Please confirm your email first. We've sent you a link (check spam too).");
      return loggedIn(req, res, acc);
    }
    for (const a of all) { // a manager or staff login
      const u = (a.users || []).find((x) => x.email === email && x.hash && checkPassword(x, body.password));
      if (u && a.verified !== false) { const list = store.accounts(), uu = list.find((x) => x.slug === a.slug).users.find((x) => x.id === u.id); uu.lastLogin = new Date().toISOString(); store.saveAccounts(list); return loggedIn(req, res, a, {}, uu); }
    }
    await new Promise((r) => setTimeout(r, 400)); return fail(res, 401, "Wrong email or password.");
  }
  if (what === "invite") { // what the invite page shows before they set a password
    const found = findInvite(body.token);
    if (!found) return fail(res, 400, "This invite has expired or was already used. Ask the owner to send it again.");
    return send(res, 200, { ok: true, business: bizName(found.acc.slug), email: found.user.email, name: found.user.name, role: found.user.role });
  }
  if (what === "accept") {
    if (!allow("accept:" + ip, 20, 3600e3)) return fail(res, 429, "Too many attempts. Please wait a while.");
    if (String(body.password || "").length < 10) return fail(res, 400, "Choose a password of at least 10 characters.");
    const found = findInvite(body.token);
    if (!found) return fail(res, 400, "This invite has expired or was already used. Ask the owner to send it again.");
    const list = store.accounts(), acc = list.find((a) => a.slug === found.acc.slug), u = acc.users.find((x) => x.id === found.user.id);
    Object.assign(u, hashPassword(body.password), { pwv: (u.pwv || 1) + 1, joinedAt: new Date().toISOString(), lastLogin: new Date().toISOString(), name: core.str(body.name, 60) || u.name });
    delete u.inviteHash; delete u.inviteExp; store.saveAccounts(list);
    return loggedIn(req, res, acc, {}, u);
  }
  if (what === "forgot") {
    if (!allow("forgot:" + ip, 5, 3600e3)) return fail(res, 429, "Too many requests. Please wait a while.");
    const acc = email && store.accounts().filter((a) => a.ownerEmail === email && !a.disabled).pop();
    if (acc) {
      const token = newToken();
      updateAccount(acc.slug, (a) => { a.resetHash = tokenHash(token); a.resetExp = Date.now() + 3600e3; });
      await mail.sendAccount("reset", email, { name: bizName(acc.slug), link: `${mail.base()}/book/reset?token=${token}` });
    } else if (email) { // a manager or staff login
      const a = store.accounts().find((x) => !x.disabled && (x.users || []).some((u) => u.email === email && u.hash));
      if (a) {
        const token = newToken();
        updateAccount(a.slug, (x) => { const u = x.users.find((y) => y.email === email); u.resetHash = tokenHash(token); u.resetExp = Date.now() + 3600e3; });
        await mail.sendAccount("reset", email, { name: bizName(a.slug), link: `${mail.base()}/book/reset?token=${token}` });
      }
    }
    return send(res, 200, { ok: true }); // same answer either way: nobody can test which emails have accounts
  }
  if (what === "reset") {
    if (!allow("reset:" + ip, 20, 3600e3)) return fail(res, 429, "Too many attempts. Please wait a while.");
    if (String(body.password || "").length < 10) return fail(res, 400, "Choose a password of at least 10 characters.");
    const h = tokenHash(body.token || "");
    const acc = store.accounts().find((a) => a.resetHash && a.resetHash === h && !a.disabled);
    if (!acc) { // a manager or staff login?
      const a = store.accounts().find((x) => !x.disabled && (x.users || []).some((u) => u.resetHash === h && u.resetExp > Date.now()));
      if (!a) return fail(res, 400, "This reset link has expired or was already used. Ask for a new one.");
      const list = store.accounts(), u = list.find((x) => x.slug === a.slug).users.find((x) => x.resetHash === h);
      Object.assign(u, hashPassword(body.password), { pwv: (u.pwv || 1) + 1 }); delete u.resetHash; delete u.resetExp; store.saveAccounts(list);
      return loggedIn(req, res, a, {}, u);
    }
    if (acc.resetExp < Date.now()) return fail(res, 400, "This reset link has expired or was already used. Ask for a new one.");
    const done = updateAccount(acc.slug, (a) => { Object.assign(a, hashPassword(body.password)); a.pwv = (a.pwv || 1) + 1; a.verified = true; delete a.resetHash; delete a.resetExp; });
    return loggedIn(req, res, done);
  }
  return fail(res, 404, "Not found");
}
/** Private calendar feed for the owner (subscribe in Google, Outlook or Apple Calendar). The token in the URL is the key. */
function serveFeed(req, res, slug, token) {
  const biz = getBiz(slug);
  const ok = biz && biz.feedToken && biz.feedToken.length === token.length && crypto.timingSafeEqual(Buffer.from(biz.feedToken), Buffer.from(token));
  if (!ok) { res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("Not found"); }
  const s = biz.settings, from = Date.now() - 30 * 864e5;
  const d = (iso) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const esc = (v) => String(v || "").replace(/[\r\n]+/g, " ").replace(/([,;\\])/g, "\\$1");
  const svc = (id) => (s.services.find((x) => x.id === id) || {}).name || "Appointment", who = (id) => (s.staff.find((x) => x.id === id) || {}).name || "";
  const ev = biz.bookings.filter((b) => b.status !== "cancelled" && Date.parse(b.end) > from).map((b) => ["BEGIN:VEVENT", `UID:${b.id}@${slug}.booking.weberslink`, `DTSTAMP:${d(b.createdAt || b.start)}`, `DTSTART:${d(b.start)}`, `DTEND:${d(b.end)}`,
    `SUMMARY:${esc(b.name + " – " + svc(b.serviceId))}`, `DESCRIPTION:${esc(`With ${who(b.staffId)}. ${b.phone || ""} ${b.email || ""}. Code ${b.code}.${b.notes ? " Notes: " + b.notes : ""}`)}`, b.address ? `LOCATION:${esc(b.address)}` : "", b.status === "booked" ? "STATUS:CONFIRMED" : "STATUS:TENTATIVE", "END:VEVENT"].filter(Boolean).join("\r\n"));
  const off = (biz.blocks || []).map((b) => ["BEGIN:VEVENT", `UID:${b.id}@${slug}.booking.weberslink`, `DTSTAMP:${d(b.start)}`, `DTSTART:${d(b.start)}`, `DTEND:${d(b.end)}`, `SUMMARY:${esc("Time off – " + (b.staffId === "all" ? "everyone" : who(b.staffId)) + (b.note ? ": " + b.note : ""))}`, "TRANSP:TRANSPARENT", "END:VEVENT"].join("\r\n"));
  res.writeHead(200, { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(req.method === "HEAD" ? undefined : ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Weberslink//Booking//EN", "CALSCALE:GREGORIAN", `X-WR-CALNAME:${esc(s.name)} bookings`, `X-WR-TIMEZONE:${s.tz}`, ...ev, ...off, "END:VCALENDAR"].join("\r\n"));
}
/** Stripe Connect webhook: payments completed or expired, and connected accounts becoming able to take payments. */
async function stripeWebhook(req, res) {
  const raw = await new Promise((resolve, reject) => { const c = []; let n = 0; req.on("data", (d) => { n += d.length; if (n > 512 * 1024) { reject(new Error("too large")); req.destroy(); } else c.push(d); }); req.on("end", () => resolve(Buffer.concat(c).toString("utf8"))); req.on("error", reject); });
  let ev;
  try { ev = stripe.verifyWebhook(raw, req.headers["stripe-signature"]); } catch (e) { return fail(res, 400, e.message); }
  const obj = (ev.data && ev.data.object) || {};
  if (ev.type === "checkout.session.completed" || ev.type === "checkout.session.async_payment_succeeded") {
    const md = obj.metadata || {};
    const acc = md.slug && store.account(md.slug), biz = acc && store.loadBiz(md.slug);
    if (biz && biz.stripe && biz.stripe.account === ev.account) await markPaid(md.slug, md.booking, obj); // only trust events from that business's own account
  } else if (ev.type === "checkout.session.expired") {
    const md = obj.metadata || {}, biz = md.slug && store.loadBiz(md.slug), b = biz && biz.bookings.find((x) => x.id === md.booking);
    if (b && b.status === "pending" && biz.stripe && biz.stripe.account === ev.account) { b.status = "expired"; b.payment.status = "unpaid"; store.saveBiz(md.slug, biz); }
  } else if (ev.type === "account.updated") {
    for (const acc of store.accounts()) {
      const biz = store.loadBiz(acc.slug);
      if (biz && biz.stripe && biz.stripe.account === obj.id) { Object.assign(biz.stripe, { chargesEnabled: Boolean(obj.charges_enabled), detailsSubmitted: Boolean(obj.details_submitted), checkedAt: new Date().toISOString() }); store.saveBiz(acc.slug, biz); }
    }
  }
  return send(res, 200, { received: true });
}
/** Removes sign-ups that never confirmed their email. */
function cleanupUnverified(now = Date.now()) {
  const old = store.accounts().filter((a) => a.verified === false && now - Date.parse(a.createdAt) > UNVERIFIED_DAYS * 864e5);
  for (const a of old) store.deleteBiz(a.slug);
  if (old.length) store.saveAccounts(store.accounts().filter((a) => !old.some((o) => o.slug === a.slug)));
  return old.length;
}
/** The scheduling engine (core.js) for the browser, so the demo and the dashboard use exactly the server's rules. */
let coreJs = null;
function serveCore(req, res) {
  if (!coreJs) {
    const src = fs.readFileSync(path.join(__dirname, "core.js"), "utf8");
    coreJs = "/* WebersLink booking engine (same code as the server) */\n(function () {\n\"use strict\";\nvar module = { exports: {} }, exports = module.exports;\n" +
      "var require = function (n) { if (n !== \"crypto\") throw new Error(n); return { randomBytes: function (k) { var a = new Uint8Array(k); window.crypto.getRandomValues(a); a.toString = function () { return Array.prototype.map.call(a, function (x) { return (\"0\" + x.toString(16)).slice(-2); }).join(\"\"); }; return a; } }; };\n" +
      src.replace(/^"use strict";?/m, "") + "\nwindow.BookingCore = module.exports;\n})();\n";
  }
  res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff" });
  res.end(req.method === "HEAD" ? undefined : coreJs);
}
function serveAccountPage(req, res) {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY", "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'" });
  res.end(req.method === "HEAD" ? undefined : fs.readFileSync(ACCOUNT_PAGE, "utf8"));
}

// ------------------------------------------------------------------ entry point + reminders
function handle(req, res) {
  const p = String(req.url || "").split("?")[0];
  if (p === "/demos/booking/core.js" && (req.method === "GET" || req.method === "HEAD")) { serveCore(req, res); return true; }
  const ap = /^\/book\/([a-z]+)\/?$/.exec(p);
  if (ap && ACCOUNT_PAGES.includes(ap[1]) && (req.method === "GET" || req.method === "HEAD")) { serveAccountPage(req, res); return true; }
  const feed = /^\/api\/booking-feed\/([a-z0-9-]{3,40})\/([0-9a-f]{32})\.ics$/.exec(p);
  if (feed && (req.method === "GET" || req.method === "HEAD")) { serveFeed(req, res, feed[1], feed[2]); return true; }
  if (p === "/api/booking-stripe/webhook" && req.method === "POST") { stripeWebhook(req, res).catch((e) => { console.error("stripe webhook:", e.message); if (!res.headersSent) fail(res, 500, "error"); }); return true; }
  const acct = /^\/api\/booking-account\/([a-z]+)$/.exec(p);
  if (acct) { accountApi(req, res, acct[1]).catch((e) => { if (!res.headersSent) fail(res, e.status || 500, e.status ? e.message : "Server error"); if (!e.status) console.error("booking account error:", e); }); return true; }
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
    if (!active(acc)) continue;
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
  const tick = () => { try { for (const a of store.accounts()) { const b = store.loadBiz(a.slug); if (b && expireHolds(b)) store.saveBiz(a.slug, b); } } catch (e) { console.error("booking holds:", e.message); } try { cleanupUnverified(); } catch (e) { console.error("booking cleanup:", e.message); } sendReminders().catch((e) => console.error("booking reminders:", e.message)); };
  setInterval(tick, 5 * 60 * 1000).unref();
  setTimeout(tick, 40 * 1000).unref();
}

module.exports = { handle, startScheduler, sendReminders, cleanupUnverified, setSiteAdminCheck, hashPassword, checkPassword, slugify };
