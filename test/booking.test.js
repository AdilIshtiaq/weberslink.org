const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "booking-"));
process.env.BOOKING_DATA_DIR = DIR;
process.env.OUTREACH_DATA_DIR = DIR;
const core = require("../booking/core");
const presets = require("../booking/presets");
const mail = require("../booking/mail");
const booking = require("../booking");
test.after(() => fs.rmSync(DIR, { recursive: true, force: true }));

const sent = [];
mail.setSender(async (m, kind) => { sent.push({ kind, to: m.to, subject: m.subject, ics: Boolean(m.attachments) }); });

test("time zones: wall time in the business zone, DST-safe", () => {
  assert.strictEqual(new Date(core.zonedToUtc("2026-07-01", 9 * 60, "America/New_York")).toISOString(), "2026-07-01T13:00:00.000Z");
  assert.strictEqual(new Date(core.zonedToUtc("2026-12-01", 9 * 60, "America/New_York")).toISOString(), "2026-12-01T14:00:00.000Z");
  assert.strictEqual(new Date(core.zonedToUtc("2026-11-05", 9 * 60, "Asia/Karachi")).toISOString(), "2026-11-05T04:00:00.000Z");
  assert.strictEqual(core.keyOf("Asia/Karachi", Date.parse("2026-11-04T20:00:00Z")), "2026-11-05");
});

test("settings are cleaned; essentials required", () => {
  const s = core.sanitizeSettings({ ...presets.salon, name: "<b>X</b>", tz: "Nowhere/Fake", hours: { 1: ["18:00", "09:00"], 2: ["09:00", "17:00"] }, buffer: 9999 });
  assert.strictEqual(s.tz, "America/New_York");
  assert.strictEqual(s.hours[1], null); assert.deepStrictEqual(s.hours[2], ["09:00", "17:00"]);
  assert.strictEqual(s.buffer, 240);
  assert.throws(() => core.sanitizeSettings({ services: [], staff: [] }), /service/);
});

test("availability respects hours, notice, buffer and existing bookings; a taken time is refused", () => {
  const s = core.sanitizeSettings({ ...presets.other, tz: "UTC", notice: 60, buffer: 15, step: 30, daysAhead: 30 });
  const now = Date.parse("2026-11-09T08:00:00Z"); // Monday
  let days = core.availability(s, [], { serviceId: "s1", now, days: 7 });
  assert.strictEqual(days[0].date, "2026-11-09");
  assert.strictEqual(days[0].slots[0].t, "2026-11-09T09:00:00.000Z"); // opens 09:00, notice 60 min ok
  assert.strictEqual(days[0].slots.at(-1).t, "2026-11-09T16:30:00.000Z"); // 30 min service ends at close
  assert.strictEqual(days[5].slots.length, 0); // Saturday closed
  const b = { id: "x", staffId: "p1", status: "booked", start: "2026-11-09T10:00:00.000Z", end: "2026-11-09T10:30:00.000Z" };
  days = core.availability(s, [b], { serviceId: "s1", now, days: 1 });
  const ts = days[0].slots.map((x) => x.t.slice(11, 16));
  assert.ok(!ts.includes("10:00") && !ts.includes("09:30") && !ts.includes("10:30")); // buffer both sides
  assert.ok(ts.includes("11:00"));
  assert.throws(() => core.resolveSlot(s, [b], { serviceId: "s1", staffId: "any", start: "2026-11-09T10:00:00Z" }, { now }), /taken/);
  const nine = now + 3600e3;
  assert.throws(() => core.resolveSlot(s, [], { serviceId: "s1", staffId: "any", start: "2026-11-09T09:30:00Z" }, { now: nine }), /taken/); // inside notice
  assert.strictEqual(core.resolveSlot(s, [], { serviceId: "s1", staffId: "any", start: "2026-11-09T09:30:00Z" }, { now: nine, owner: true }).staffId, "p1"); // owner may
  assert.throws(() => core.resolveSlot(s, [], { serviceId: "s1", staffId: "any", start: "2026-11-09T08:30:00Z" }, { now, owner: true }), /taken/); // before opening
});

// ---- HTTP: full flow on a real server
function server() { return new Promise((r) => { const sv = http.createServer((req, res) => { if (!booking.handle(req, res)) { res.writeHead(404); res.end(); } }); sv.listen(0, () => r(sv)); }); }
async function call(sv, method, url, body, cookie) {
  const res = await fetch(`http://127.0.0.1:${sv.address().port}${url}`, { method, headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch (e) {}
  return { status: res.status, json, text, cookie: (res.headers.get("set-cookie") || "").split(";")[0] };
}
const tick = () => new Promise((r) => setTimeout(r, 30));

test("site owner creates a business; customers book, look up, move, cancel; owner manages", async () => {
  const sv = await server();
  let siteAdmin = false; booking.setSiteAdminCheck(() => siteAdmin);
  try {
    assert.strictEqual((await call(sv, "POST", "/api/booking-admin/create", { slug: "nova" })).status, 401);
    siteAdmin = true;
    assert.match((await call(sv, "POST", "/api/booking-admin/create", { slug: "Bad Slug!", ownerEmail: "o@x.com" })).json.error, /Web address/);
    const made = await call(sv, "POST", "/api/booking-admin/create", { slug: "nova", name: "Studio Nova", ownerEmail: "owner@nova.com", preset: "salon", tz: "UTC" });
    assert.strictEqual(made.status, 200); const pw = made.json.password; assert.ok(pw.length >= 14);
    assert.strictEqual((await call(sv, "POST", "/api/booking-admin/create", { slug: "nova", ownerEmail: "o@x.com" })).status, 400);
    assert.strictEqual((await call(sv, "GET", "/api/booking-admin/list")).json.businesses[0].slug, "nova");

    const first = await call(sv, "POST", "/api/booking/nova/login", { password: pw });
    const draft = (await call(sv, "GET", "/api/booking/nova/admin/data", null, first.cookie)).json.settings;
    assert.strictEqual((await call(sv, "GET", "/api/booking/nova/slots?service=s1")).status, 404); // not live until set up
    await call(sv, "PUT", "/api/booking/nova/admin/settings", { settings: { ...draft, setupDone: true } }, first.cookie);
    const page = await call(sv, "GET", "/book/nova");
    assert.strictEqual(page.status, 200); assert.match(page.text, /data-slug="nova"/);
    assert.strictEqual((await call(sv, "GET", "/book/nobody")).status, 404);
    const cfg = await call(sv, "GET", "/api/booking/nova/config");
    assert.strictEqual(cfg.json.settings.name, "Studio Nova"); assert.ok(!("notifyEmail" in cfg.json.settings));

    const slots = (await call(sv, "GET", "/api/booking/nova/slots?service=s1&staff=any&days=14")).json.days.slice(3).find((d) => d.slots.length); // past the 24 h change window
    const t = slots.slots[0].t;
    const form = { serviceId: "s1", staffId: "any", start: t, name: "Ann Lee", email: "Ann@Example.com", phone: "555 123 4567" };
    assert.match((await call(sv, "POST", "/api/booking/nova/book", { ...form, email: "nope" })).json.error, /email/);
    const bk = await call(sv, "POST", "/api/booking/nova/book", form);
    assert.strictEqual(bk.status, 200); const code = bk.json.booking.code;
    assert.strictEqual(bk.json.booking.email, "ann@example.com");
    assert.match((await call(sv, "POST", "/api/booking/nova/book", { ...form, email: "b@example.com" })).json.error, /taken/);
    assert.strictEqual((await call(sv, "POST", "/api/booking/nova/book", { ...form, website: "spam" })).json.booking, null); // honeypot
    await tick();
    assert.deepStrictEqual(sent.map((x) => x.kind).sort(), ["confirm", "owner-new"]);
    assert.ok(sent.find((x) => x.kind === "confirm").ics); assert.strictEqual(sent.find((x) => x.kind === "owner-new").to, "owner@nova.com");

    assert.strictEqual((await call(sv, "POST", "/api/booking/nova/lookup", { code, email: "x@y.com" })).status, 404);
    const look = await call(sv, "POST", "/api/booking/nova/lookup", { code: code.toLowerCase(), email: "ANN@example.com" });
    assert.strictEqual(look.json.booking.code, code);
    const later = (await call(sv, "GET", "/api/booking/nova/slots?service=s1&staff=any&days=14")).json.days.filter((d) => d.slots.length).at(-1).slots[0].t;
    const moved = await call(sv, "POST", "/api/booking/nova/reschedule", { code, email: "ann@example.com", start: later });
    assert.strictEqual(moved.json.booking.start, later);

    // owner
    assert.strictEqual((await call(sv, "GET", "/api/booking/nova/admin/data")).status, 401);
    assert.strictEqual((await call(sv, "POST", "/api/booking/nova/login", { password: "wrong" })).status, 401);
    const login = await call(sv, "POST", "/api/booking/nova/login", { password: pw });
    assert.match(login.cookie, /^wlb_nova=/);
    const data = await call(sv, "GET", "/api/booking/nova/admin/data", null, login.cookie);
    assert.strictEqual(data.json.bookings.length, 1); assert.ok(data.json.bookings[0].rescheduled);
    const phone = await call(sv, "POST", "/api/booking/nova/admin/book", { serviceId: "s2", staffId: "p1", start: t, name: "Walk In", phone: "555 999 0000" }, login.cookie);
    assert.strictEqual(phone.status, 200, phone.text);
    const set = await call(sv, "PUT", "/api/booking/nova/admin/settings", { settings: { ...data.json.settings, name: "Studio Nova Hair" } }, login.cookie);
    assert.strictEqual(set.json.settings.name, "Studio Nova Hair");
    const csv = await call(sv, "GET", "/api/booking/nova/admin/export.csv", null, login.cookie);
    assert.match(csv.text, /Ann Lee/); assert.match(csv.text, /Walk In/);
    // another business's cookie never works here
    assert.strictEqual((await call(sv, "GET", "/api/booking/other/admin/data", null, login.cookie)).status, 404);

    const cancel = await call(sv, "POST", "/api/booking/nova/cancel", { code, email: "ann@example.com" });
    assert.strictEqual(cancel.json.booking.status, "cancelled");
    assert.strictEqual((await call(sv, "POST", "/api/booking/nova/cancel", { code, email: "ann@example.com" })).status, 400);

    // reset password logs the old session out
    const reset = await call(sv, "POST", "/api/booking-admin/reset-password", { slug: "nova" });
    assert.ok(reset.json.password);
    assert.strictEqual((await call(sv, "GET", "/api/booking/nova/admin/data", null, login.cookie)).status, 401);
    // disabled business: page and API gone
    await call(sv, "POST", "/api/booking-admin/disable", { slug: "nova", disabled: true });
    assert.strictEqual((await call(sv, "GET", "/api/booking/nova/config")).status, 404);
    assert.strictEqual((await call(sv, "GET", "/book/nova")).status, 404);
  } finally { sv.close(); }
});

test("reminders go out once, only inside the reminder window", async () => {
  const store = require("../booking/store");
  const s = core.sanitizeSettings({ ...presets.other, name: "Rem", tz: "UTC", reminderHours: 24 });
  store.saveAccounts(store.accounts().concat({ slug: "rem", ownerEmail: "o@rem.com" }));
  const now = Date.parse("2026-11-10T09:00:00Z");
  const mk = (id, startH) => ({ id, code: "REM-" + id, serviceId: "s1", staffId: "p1", status: "booked", email: id + "@x.com", name: "N", phone: "5551234567",
    start: new Date(now + startH * 3600e3).toISOString(), end: new Date(now + (startH + 0.5) * 3600e3).toISOString(), createdAt: new Date(now - 3 * 864e5).toISOString() });
  store.saveBiz("rem", { settings: s, bookings: [mk("soon", 20), mk("far", 40), mk("past", -2)] });
  sent.length = 0;
  assert.strictEqual(await booking.sendReminders(now), 1);
  assert.strictEqual(await booking.sendReminders(now), 0);
  assert.deepStrictEqual(sent.map((x) => x.to), ["soon@x.com"]);
});
