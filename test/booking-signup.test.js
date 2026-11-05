// Self-serve sign-up for business owners: sign up -> confirm email -> set up -> live; sign in; reset; delete.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "booking-signup-"));
process.env.BOOKING_DATA_DIR = path.join(DIR, "booking");
process.env.OUTREACH_DATA_DIR = DIR;
process.env.BOOKING_PUBLIC_URL = "https://example.test";
const mail = require("../booking/mail");
const store = require("../booking/store");
const booking = require("../booking");
test.after(() => fs.rmSync(DIR, { recursive: true, force: true }));

const inbox = [];
mail.setSender(async (m, kind) => { inbox.push({ kind, to: m.to, text: m.text, subject: m.subject }); });
const linkFrom = (kind, to) => { const m = inbox.filter((x) => x.kind === kind && x.to === to).pop(); return m && /https:\/\/example\.test(\/book\/[a-z]+\?token=[0-9a-f]+)/.exec(m.text)[1]; };
const tokenOf = (link) => link.split("token=")[1];

let sv;
test.before(() => new Promise((r) => { sv = http.createServer((req, res) => { if (!booking.handle(req, res)) { res.writeHead(404); res.end(); } }); sv.listen(0, r); }));
test.after(() => sv.close());
let n = 0;
const ip = () => ({ "x-forwarded-for": "10.9." + Math.floor(++n / 250) + "." + (n % 250) });
async function call(method, url, body, cookie, headers = ip()) {
  const res = await fetch(`http://127.0.0.1:${sv.address().port}${url}`, { method, headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch (e) {}
  return { status: res.status, json, text, headers: res.headers, cookie: (res.headers.get("set-cookie") || "").split(";")[0] };
}
const signup = (o = {}) => call("POST", "/api/booking-account/signup", { name: "Glow Beauty Bar", email: "owner@glow.test", password: "correct horse 1", type: "salon", tz: "Europe/London", currency: "£", ...o });

test("sign-up pages are served, framed nowhere, and not mistaken for a business", async () => {
  for (const p of ["/book/new", "/book/login", "/book/forgot", "/book/reset", "/book/verify"]) {
    const r = await call("GET", p);
    assert.strictEqual(r.status, 200, p); assert.match(r.text, /account\.js/); assert.strictEqual(r.headers.get("x-frame-options"), "DENY");
  }
});

test("validation on sign-up", async () => {
  assert.match((await signup({ name: "" })).json.error, /business name/);
  assert.match((await signup({ email: "nope" })).json.error, /email/);
  assert.match((await signup({ password: "short" })).json.error, /10 characters/);
  assert.match((await signup({ slug: "admin", email: "x1@glow.test" })).json.error, /taken/);
  assert.match((await signup({ slug: "Bad Slug", email: "x2@glow.test" })).json.error, /Web address/);
  const hp = await signup({ website: "http://spam", email: "bot@glow.test" });
  assert.strictEqual(hp.status, 200); assert.ok(!store.accounts().some((a) => a.ownerEmail === "bot@glow.test"));
});

test("full journey: sign up, can't sign in before confirming, confirm, set up, go live, customers book", async () => {
  const s = await signup();
  assert.strictEqual(s.status, 200, s.text);
  const slug = s.json.slug;
  assert.strictEqual(slug, "glow-beauty-bar");
  const acc = store.account(slug);
  assert.strictEqual(acc.verified, false); assert.ok(!acc.verifyToken && acc.verifyHash); // only a hash is stored
  // not live, can't sign in yet
  assert.strictEqual((await call("GET", "/book/" + slug)).status, 404);
  const early = await call("POST", "/api/booking-account/login", { email: "owner@glow.test", password: "correct horse 1" });
  assert.strictEqual(early.status, 403); assert.match(early.json.error, /confirm your email/);
  // resend makes a new link; the old one stops working
  const first = linkFrom("verify", "owner@glow.test");
  await call("POST", "/api/booking-account/resend", { email: "owner@glow.test" });
  const second = linkFrom("verify", "owner@glow.test");
  assert.notStrictEqual(first, second);
  assert.strictEqual((await call("POST", "/api/booking-account/verify", { token: tokenOf(first) })).status, 400);
  // confirm -> signed in
  const v = await call("POST", "/api/booking-account/verify", { token: tokenOf(second) });
  assert.strictEqual(v.status, 200); assert.strictEqual(v.json.slug, slug); assert.match(v.cookie, /^wlb_glow_beauty_bar=/);
  assert.strictEqual((await call("POST", "/api/booking-account/verify", { token: tokenOf(second) })).status, 400); // single use
  // page exists but isn't taking bookings until setup is finished
  assert.strictEqual((await call("GET", "/book/" + slug)).status, 200);
  const cfg = (await call("GET", `/api/booking/${slug}/config`)).json.settings;
  assert.strictEqual(cfg.setupDone, false); assert.strictEqual(cfg.tz, "Europe/London"); assert.strictEqual(cfg.currency, "£");
  assert.strictEqual((await call("GET", `/api/booking/${slug}/slots?service=s1`)).status, 404);
  const data = (await call("GET", `/api/booking/${slug}/admin/data`, undefined, v.cookie)).json;
  assert.strictEqual(data.ownerEmail, "owner@glow.test"); assert.strictEqual(data.settings.notifyEmail, "owner@glow.test");
  // owner finishes setup
  const done = { ...data.settings, staff: data.settings.staff.map((p) => ({ ...p, name: "Maya" })), setupDone: true };
  assert.strictEqual((await call("PUT", `/api/booking/${slug}/admin/settings`, { settings: done }, v.cookie)).status, 200);
  const days = (await call("GET", `/api/booking/${slug}/slots?service=s1&days=14`)).json.days;
  const t = days.slice(2).find((d) => d.slots.length).slots[0].t;
  const b = await call("POST", `/api/booking/${slug}/book`, { serviceId: "s1", staffId: "any", start: t, name: "Ann", email: "ann@x.test", phone: "07700 900123" });
  assert.strictEqual(b.status, 200, b.text);
  // the same email can't sign up twice
  assert.strictEqual((await signup()).status, 409);
  // sign in with email
  const li = await call("POST", "/api/booking-account/login", { email: "OWNER@glow.test", password: "correct horse 1" });
  assert.strictEqual(li.status, 200); assert.strictEqual(li.json.slug, slug);
  assert.strictEqual((await call("POST", "/api/booking-account/login", { email: "owner@glow.test", password: "wrong" })).status, 401);
});

test("forgot password: same answer for unknown emails, link works once, old sessions end", async () => {
  inbox.length = 0;
  const unknown = await call("POST", "/api/booking-account/forgot", { email: "nobody@x.test" });
  assert.strictEqual(unknown.status, 200); assert.strictEqual(inbox.length, 0);
  const before = await call("POST", "/api/booking-account/login", { email: "owner@glow.test", password: "correct horse 1" });
  await call("POST", "/api/booking-account/forgot", { email: "owner@glow.test" });
  const link = linkFrom("reset", "owner@glow.test");
  assert.ok(link && link.startsWith("/book/reset?token="));
  assert.match((await call("POST", "/api/booking-account/reset", { token: tokenOf(link), password: "short" })).json.error, /10 characters/);
  const r = await call("POST", "/api/booking-account/reset", { token: tokenOf(link), password: "a brand new password" });
  assert.strictEqual(r.status, 200); assert.ok(r.cookie);
  assert.strictEqual((await call("POST", "/api/booking-account/reset", { token: tokenOf(link), password: "another new password" })).status, 400);
  assert.strictEqual((await call("GET", "/api/booking/glow-beauty-bar/admin/data", undefined, before.cookie)).status, 401); // old session ended
  assert.strictEqual((await call("POST", "/api/booking-account/login", { email: "owner@glow.test", password: "a brand new password" })).status, 200);
});

test("expired confirmation links are refused; unconfirmed sign-ups are removed after 7 days", async () => {
  const s = await signup({ name: "Old Shop", email: "old@shop.test" });
  const link = linkFrom("verify", "old@shop.test");
  const list = store.accounts(); const a = list.find((x) => x.slug === s.json.slug);
  a.verifyExp = Date.now() - 1000; a.createdAt = new Date(Date.now() - 8 * 864e5).toISOString(); store.saveAccounts(list);
  assert.match((await call("POST", "/api/booking-account/verify", { token: tokenOf(link) })).json.error, /expired/);
  assert.strictEqual(booking.cleanupUnverified(), 1);
  assert.strictEqual(store.account(s.json.slug), null); assert.strictEqual(store.loadBiz(s.json.slug), null);
});

test("a second unconfirmed sign-up with the same email replaces the first; name clashes get a free address", async () => {
  const a = await signup({ name: "Twin Cuts", email: "twin@x.test" });
  const b = await signup({ name: "Twin Cuts", email: "twin@x.test" });
  assert.strictEqual(store.accounts().filter((x) => x.ownerEmail === "twin@x.test").length, 1);
  assert.strictEqual(a.json.slug, b.json.slug);
  const c = await signup({ name: "Twin Cuts", email: "other@x.test" });
  assert.strictEqual(c.json.slug, "twin-cuts-2");
  assert.strictEqual(booking.slugify("Sara's Hair & Beauty"), "saras-hair-and-beauty");
  const d = await signup({ name: "Login", email: "l@x.test" }); // reserved word becomes a safe address
  assert.ok(d.json.slug !== "login" && /^login-/.test(d.json.slug), d.json.slug);
});

test("sign-up limits: per connection, and switched off on the server", async () => {
  const one = { "x-forwarded-for": "203.0.113.50" };
  const codes = [];
  for (let i = 0; i < 4; i++) codes.push((await call("POST", "/api/booking-account/signup", { name: "Spam " + i, email: `s${i}@spam.test`, password: "0123456789ab" }, null, one)).status);
  assert.deepStrictEqual(codes, [200, 200, 200, 429]);
  process.env.BOOKING_SIGNUP = "off";
  assert.strictEqual((await signup({ email: "late@x.test" })).status, 403);
  delete process.env.BOOKING_SIGNUP;
  const tries = [];
  for (let i = 0; i < 12; i++) tries.push((await call("POST", "/api/booking-account/login", { email: "owner@glow.test", password: "guess" + i }, null, { "x-forwarded-for": "203.0.113.51" })).status);
  assert.ok(tries.includes(429));
});

test("owner deletes their page: password needed, data gone, address free again", async () => {
  const li = await call("POST", "/api/booking-account/login", { email: "owner@glow.test", password: "a brand new password" });
  assert.match((await call("POST", "/api/booking/glow-beauty-bar/admin/delete", { password: "wrong" }, li.cookie)).json.error, /password is wrong/);
  const del = await call("POST", "/api/booking/glow-beauty-bar/admin/delete", { password: "a brand new password" }, li.cookie);
  assert.strictEqual(del.status, 200);
  assert.strictEqual(store.account("glow-beauty-bar"), null);
  assert.strictEqual((await call("GET", "/book/glow-beauty-bar")).status, 404);
  assert.strictEqual((await call("POST", "/api/booking-account/login", { email: "owner@glow.test", password: "a brand new password" })).status, 401);
  assert.ok(!fs.readdirSync(process.env.BOOKING_DATA_DIR).some((f) => f.includes("glow-beauty-bar"))); // really erased
});

test("no email on the server: sign-up says so instead of creating dead accounts", async () => {
  mail.setSender(null);
  const saved = [process.env.SMTP_USER, process.env.SMTP_PASS]; delete process.env.SMTP_USER; delete process.env.SMTP_PASS;
  try {
    const r = await signup({ email: "nomail@x.test" });
    assert.strictEqual(r.status, 503); assert.ok(!store.accounts().some((a) => a.ownerEmail === "nomail@x.test"));
  } finally { if (saved[0]) process.env.SMTP_USER = saved[0]; if (saved[1]) process.env.SMTP_PASS = saved[1]; }
});
