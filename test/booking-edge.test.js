// Edge cases, abuse and security for the booking system.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "booking-edge-"));
process.env.BOOKING_DATA_DIR = path.join(DIR, "booking");
process.env.OUTREACH_DATA_DIR = DIR;
const core = require("../booking/core");
const presets = require("../booking/presets");
const mail = require("../booking/mail");
const store = require("../booking/store");
const booking = require("../booking");
test.after(() => fs.rmSync(DIR, { recursive: true, force: true }));

const sent = [];
mail.setSender(async (m, kind) => { sent.push({ kind, to: m.to, subject: m.subject, html: m.html, text: m.text }); });
booking.setSiteAdminCheck(() => true);

let sv;
test.before(() => new Promise((r) => { sv = http.createServer((req, res) => { if (!booking.handle(req, res)) { res.writeHead(404); res.end(); } }); sv.listen(0, r); }));
test.after(() => sv.close());
async function call(method, url, body, cookie, headers = {}) {
  const res = await fetch(`http://127.0.0.1:${sv.address().port}${url}`, { method, headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}), ...headers }, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
  const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch (e) {}
  return { status: res.status, json, text, headers: res.headers, cookie: (res.headers.get("set-cookie") || "").split(";")[0] };
}
const tick = () => new Promise((r) => setTimeout(r, 30));
let ip = 0;
const fresh = () => ({ "x-forwarded-for": "10.0." + Math.floor(++ip / 250) + "." + (ip % 250) }); // a new client address per call, so rate limits don't interfere
async function make(slug, extra = {}) {
  const r = await call("POST", "/api/booking-admin/create", { slug, name: "Biz " + slug, ownerEmail: "owner@" + slug + ".test", preset: "other", tz: "UTC", ...extra });
  assert.strictEqual(r.status, 200, r.text);
  const login = await call("POST", `/api/booking/${slug}/login`, { password: r.json.password }, null, fresh());
  const cfg = (await call("GET", `/api/booking/${slug}/admin/data`, undefined, login.cookie)).json.settings;
  assert.strictEqual(cfg.setupDone, false); // new pages wait for the owner's setup
  assert.strictEqual((await call("GET", `/api/booking/${slug}/slots?service=s1`, undefined, null, fresh())).status, 404);
  assert.strictEqual((await call("PUT", `/api/booking/${slug}/admin/settings`, { settings: { ...cfg, setupDone: true } }, login.cookie)).status, 200);
  return { pw: r.json.password, cookie: login.cookie };
}
async function firstSlots(slug, n = 1, skipDays = 3, svc = "s1") {
  const days = (await call("GET", `/api/booking/${slug}/slots?service=${svc}&staff=any&days=20`, undefined, null, fresh())).json.days;
  const out = []; // non-overlapping times (services here are 30 minutes)
  for (const s of days.slice(skipDays).filter((d) => d.slots.length)[0].slots) if (!out.length || Date.parse(s.t) - Date.parse(out[out.length - 1]) >= 30 * 60000) out.push(s.t);
  return out.slice(0, n);
}
const person = (o = {}) => ({ name: "Ann Lee", email: "ann@example.com", phone: "555 123 4567", ...o });

// ------------------------------------------------------------------ core
test("DST: 9am stays 9am local across the clock change, and the 23/25-hour days are handled", () => {
  // US clocks go back on 2026-11-01 and forward on 2026-03-08
  assert.strictEqual(new Date(core.zonedToUtc("2026-10-31", 540, "America/New_York")).toISOString(), "2026-10-31T13:00:00.000Z");
  assert.strictEqual(new Date(core.zonedToUtc("2026-11-01", 540, "America/New_York")).toISOString(), "2026-11-01T14:00:00.000Z");
  assert.strictEqual(new Date(core.zonedToUtc("2026-03-08", 540, "America/New_York")).toISOString(), "2026-03-08T13:00:00.000Z");
  const s = core.sanitizeSettings({ ...presets.other, tz: "America/New_York", step: 60, notice: 0, hours: { 0: ["00:00", "05:00"] }, staff: [{ id: "p1", name: "P", days: [0], services: ["s1"] }] });
  const day = core.availability(s, [], { serviceId: "s1", from: "2026-11-01", days: 1, now: Date.parse("2026-10-30T00:00:00Z") })[0];
  const local = day.slots.map((x) => new Intl.DateTimeFormat("en-US", { timeZone: s.tz, hour: "numeric", hourCycle: "h23" }).format(new Date(x.t)));
  assert.deepStrictEqual(local, ["00", "01", "02", "03", "04"]); // no slot lost or doubled on the 25-hour day
});

test("half-hour and far-east zones; overnight bookings never leak to the wrong day", () => {
  assert.strictEqual(new Date(core.zonedToUtc("2026-11-05", 600, "Asia/Kolkata")).toISOString(), "2026-11-05T04:30:00.000Z");
  assert.strictEqual(new Date(core.zonedToUtc("2026-11-05", 600, "Pacific/Auckland")).toISOString(), "2026-11-04T21:00:00.000Z");
  assert.strictEqual(core.keyOf("Pacific/Auckland", Date.parse("2026-11-04T21:00:00Z")), "2026-11-05");
});

test("settings: limits, duplicates, unknown services on people, bad colour and step", () => {
  const s = core.sanitizeSettings({
    ...presets.other, accent: "red; background:url(x)", step: 7, currency: "EURO$$", daysAhead: 0, notice: -5,
    services: [{ id: "s1", name: "A", mins: 3, price: -10 }, { id: "s1", name: "dup" }, { id: "../x", name: "B", mins: 9999 }],
    staff: [{ id: "p1", name: "P", days: [1, 9, "2", 1], services: ["s1", "nope"] }],
  });
  assert.strictEqual(s.accent, "#7a4fe0"); assert.strictEqual(s.step, 15); assert.strictEqual(s.currency, "EURO");
  assert.strictEqual(s.daysAhead, 1); assert.strictEqual(s.notice, 0);
  assert.strictEqual(s.services.length, 2); assert.strictEqual(s.services[0].mins, 5); assert.strictEqual(s.services[0].price, 0);
  assert.match(s.services[1].id, /^s[0-9a-f]{8}$/); assert.strictEqual(s.services[1].mins, 720);
  assert.deepStrictEqual(s.staff[0].days, [1, 2]); assert.deepStrictEqual(s.staff[0].services, ["s1"]);
  assert.throws(() => core.sanitizeSettings({ ...presets.other, staff: [] }), /team member/);
});

test("a service nobody offers has no times, and asking for it is a clear error", () => {
  const s = core.sanitizeSettings({ ...presets.other, services: [...presets.other.services, { id: "s9", name: "Unstaffed", mins: 30 }] });
  assert.throws(() => core.availability(s, [], { serviceId: "s9" }), /Nobody offers/);
  assert.throws(() => core.availability(s, [], { serviceId: "nope" }), /Unknown service/);
});

// ------------------------------------------------------------------ HTTP: input handling
test("bad requests: invalid JSON, oversized body, unknown routes, path tricks", async () => {
  await make("edge-a");
  assert.strictEqual((await call("POST", "/api/booking/edge-a/book", "{not json", null, fresh())).status, 400);
  assert.strictEqual((await call("POST", "/api/booking/edge-a/book", JSON.stringify({ notes: "x".repeat(70 * 1024) }), null, fresh())).status, 413);
  assert.strictEqual((await call("GET", "/api/booking/edge-a/nothing")).status, 404);
  assert.strictEqual((await call("DELETE", "/api/booking/edge-a/config")).status, 404);
  assert.strictEqual((await call("GET", "/api/booking/..%2F..%2Fetc/config")).status, 404);
  assert.strictEqual((await call("GET", "/book/../admin")).status, 404);
  assert.strictEqual((await call("GET", "/api/booking/edge-a/slots?service=zzz", undefined, null, fresh())).status, 400);
});

test("booking validation: required fields, bad times, outside hours, too far ahead, past", async () => {
  const [t] = await firstSlots("edge-a");
  const b = (o) => call("POST", "/api/booking/edge-a/book", { serviceId: "s1", staffId: "any", start: t, ...person(), ...o }, null, fresh());
  assert.match((await b({ name: "" })).json.error, /name/);
  assert.match((await b({ phone: "12" })).json.error, /phone/);
  assert.match((await b({ email: "a@b" })).json.error, /email/);
  assert.match((await b({ start: "not a date" })).json.error, /time/);
  assert.match((await b({ serviceId: "zzz" })).json.error, /service/);
  assert.match((await b({ start: "2020-01-01T10:00:00Z" })).json.error, /taken/);
  assert.match((await b({ start: new Date(Date.parse(t) + 60000).toISOString() })).json.error, /taken/); // not on the grid
  assert.match((await b({ start: new Date(Date.now() + 400 * 864e5).toISOString() })).json.error, /too far/);
  assert.match((await b({ staffId: "p9" })).json.error, /taken/);
});

test("two customers racing for the same time: exactly one wins", async () => {
  await make("edge-race");
  const [t] = await firstSlots("edge-race");
  const tries = await Promise.all([1, 2, 3, 4, 5].map((i) => call("POST", "/api/booking/edge-race/book", { serviceId: "s1", staffId: "any", start: t, ...person({ email: `r${i}@example.com` }) }, null, fresh())));
  assert.strictEqual(tries.filter((r) => r.status === 200).length, 1);
  assert.strictEqual(store.loadBiz("edge-race").bookings.length, 1);
});

test("'anyone' spreads work: the second booking at the same time goes to the other free person", async () => {
  const { cookie } = await make("edge-team");
  const cfg = (await call("GET", "/api/booking/edge-team/admin/data", undefined, cookie)).json.settings;
  cfg.staff.push({ id: "p2", name: "Bo", role: "", days: [1, 2, 3, 4, 5], services: ["s1"] });
  assert.strictEqual((await call("PUT", "/api/booking/edge-team/admin/settings", { settings: cfg }, cookie)).status, 200);
  const [t] = await firstSlots("edge-team");
  const a = await call("POST", "/api/booking/edge-team/book", { serviceId: "s1", staffId: "any", start: t, ...person({ email: "a1@example.com" }) }, null, fresh());
  const b = await call("POST", "/api/booking/edge-team/book", { serviceId: "s1", staffId: "any", start: t, ...person({ email: "a2@example.com" }) }, null, fresh());
  assert.strictEqual(a.status, 200); assert.strictEqual(b.status, 200, b.text);
  assert.notStrictEqual(a.json.booking.staffId, b.json.booking.staffId);
  assert.match((await call("POST", "/api/booking/edge-team/book", { serviceId: "s1", staffId: "any", start: t, ...person({ email: "a3@example.com" }) }, null, fresh())).json.error, /taken/);
});

test("abuse limits: honeypot, 5 upcoming per email, per-connection booking cap, lookup cap", async () => {
  await make("edge-abuse");
  const slots = await firstSlots("edge-abuse", 9, 2);
  const hp = await call("POST", "/api/booking/edge-abuse/book", { serviceId: "s1", staffId: "any", start: slots[0], ...person(), website: "http://spam" }, null, fresh());
  assert.strictEqual(hp.status, 200); assert.strictEqual(store.loadBiz("edge-abuse").bookings.length, 0);
  for (let i = 0; i < 5; i++) assert.strictEqual((await call("POST", "/api/booking/edge-abuse/book", { serviceId: "s1", staffId: "any", start: slots[i], ...person({ email: "same@example.com" }) }, null, fresh())).status, 200);
  assert.match((await call("POST", "/api/booking/edge-abuse/book", { serviceId: "s1", staffId: "any", start: slots[5], ...person({ email: "SAME@example.com" }) }, null, fresh())).json.error, /5 upcoming/);
  const one = { "x-forwarded-for": "203.0.113.9" };
  const codes = [];
  for (let i = 0; i < 9; i++) codes.push((await call("POST", "/api/booking/edge-abuse/book", { serviceId: "s1", staffId: "any", start: slots[i], ...person({ email: `cap${i}@example.com` }) }, null, one)).status);
  assert.ok(codes.includes(429), "per-connection cap kicks in: " + codes.join(","));
  const looks = [];
  for (let i = 0; i < 32; i++) looks.push((await call("POST", "/api/booking/edge-abuse/lookup", { code: "X-" + i, email: "x@y.com" }, null, { "x-forwarded-for": "203.0.113.10" })).status);
  assert.ok(looks.includes(429));
});

test("change rules: cancel cut-off, cancelled can't be moved, wrong email can't touch it", async () => {
  const { cookie } = await make("edge-rules");
  const cfg = (await call("GET", "/api/booking/edge-rules/admin/data", undefined, cookie)).json.settings;
  cfg.cancelHours = 24 * 30; // everything is inside the cut-off
  await call("PUT", "/api/booking/edge-rules/admin/settings", { settings: cfg }, cookie);
  const [t] = await firstSlots("edge-rules");
  const code = (await call("POST", "/api/booking/edge-rules/book", { serviceId: "s1", staffId: "any", start: t, ...person() }, null, fresh())).json.booking.code;
  const look = await call("POST", "/api/booking/edge-rules/lookup", { code, email: "ann@example.com" }, null, fresh());
  assert.strictEqual(look.json.changeable, false); assert.match(look.json.lockedMsg, /hours before/);
  assert.match((await call("POST", "/api/booking/edge-rules/cancel", { code, email: "ann@example.com" }, null, fresh())).json.error, /hours before/);
  assert.strictEqual((await call("POST", "/api/booking/edge-rules/cancel", { code, email: "eve@example.com" }, null, fresh())).status, 404);
  cfg.cancelHours = 0;
  await call("PUT", "/api/booking/edge-rules/admin/settings", { settings: cfg }, cookie);
  assert.strictEqual((await call("POST", "/api/booking/edge-rules/cancel", { code, email: "ann@example.com" }, null, fresh())).status, 200);
  assert.match((await call("POST", "/api/booking/edge-rules/reschedule", { code, email: "ann@example.com", start: t }, null, fresh())).json.error, /can't be changed/);
});

test("rescheduling: own old time is free to reuse, a clash is refused, the booking keeps its code", async () => {
  await make("edge-move");
  const [t1, t2] = await firstSlots("edge-move", 2);
  const a = (await call("POST", "/api/booking/edge-move/book", { serviceId: "s1", staffId: "any", start: t1, ...person() }, null, fresh())).json.booking;
  await call("POST", "/api/booking/edge-move/book", { serviceId: "s1", staffId: "any", start: t2, ...person({ email: "b@example.com" }) }, null, fresh());
  assert.match((await call("POST", "/api/booking/edge-move/reschedule", { code: a.code, email: a.email, start: t2 }, null, fresh())).json.error, /taken/);
  const same = await call("POST", "/api/booking/edge-move/reschedule", { code: a.code, email: a.email, start: t1 }, null, fresh());
  assert.strictEqual(same.status, 200, same.text); assert.strictEqual(same.json.booking.code, a.code);
});

// ------------------------------------------------------------------ owner
test("owner: session isolation, logout, status rules, undo of a cancel only when still free", async () => {
  const A = await make("edge-own-a"), B = await make("edge-own-b");
  assert.strictEqual((await call("GET", "/api/booking/edge-own-b/admin/data", undefined, A.cookie)).status, 401);
  const forged = A.cookie.replace("wlb_edge_own_a", "wlb_edge_own_b");
  assert.strictEqual((await call("GET", "/api/booking/edge-own-b/admin/data", undefined, forged)).status, 401);
  const [t] = await firstSlots("edge-own-a");
  const bk = (await call("POST", "/api/booking/edge-own-a/book", { serviceId: "s1", staffId: "any", start: t, ...person() }, null, fresh())).json.booking;
  const id = (await call("GET", "/api/booking/edge-own-a/admin/data", undefined, A.cookie)).json.bookings[0].id;
  assert.strictEqual((await call("POST", "/api/booking/edge-own-a/admin/status", { id, status: "deleted" }, A.cookie)).status, 400);
  sent.length = 0;
  assert.strictEqual((await call("POST", "/api/booking/edge-own-a/admin/status", { id, status: "cancelled" }, A.cookie)).status, 200);
  await tick();
  assert.deepStrictEqual(sent.map((x) => x.kind), ["cancel"]);
  await call("POST", "/api/booking/edge-own-a/book", { serviceId: "s1", staffId: "any", start: t, ...person({ email: "c@example.com" }) }, null, fresh());
  assert.match((await call("POST", "/api/booking/edge-own-a/admin/status", { id, status: "booked" }, A.cookie)).json.error, /booked by someone else/);
  const out = await call("POST", "/api/booking/edge-own-a/logout", {}, A.cookie);
  assert.match(out.headers.get("set-cookie"), /Max-Age=0/);
  assert.ok(bk.code && B.pw);
});

test("owner: can't remove a service or person with upcoming bookings; can when they're cancelled", async () => {
  const { cookie } = await make("edge-del");
  const [t] = await firstSlots("edge-del");
  const code = (await call("POST", "/api/booking/edge-del/book", { serviceId: "s1", staffId: "any", start: t, ...person() }, null, fresh())).json.booking.code;
  const cfg = (await call("GET", "/api/booking/edge-del/admin/data", undefined, cookie)).json.settings;
  const noSvc = { ...cfg, services: [{ id: "s2", name: "Other", mins: 30, price: 0 }], staff: cfg.staff.map((p) => ({ ...p, services: ["s2"] })) };
  assert.match((await call("PUT", "/api/booking/edge-del/admin/settings", { settings: noSvc }, cookie)).json.error, /upcoming bookings/);
  const noPerson = { ...cfg, staff: [{ id: "p2", name: "New", days: [1], services: ["s1"] }] };
  assert.match((await call("PUT", "/api/booking/edge-del/admin/settings", { settings: noPerson }, cookie)).json.error, /upcoming bookings/);
  await call("POST", "/api/booking/edge-del/cancel", { code, email: "ann@example.com" }, null, fresh());
  assert.strictEqual((await call("PUT", "/api/booking/edge-del/admin/settings", { settings: noSvc }, cookie)).status, 200);
});

test("owner: phone bookings may skip notice but not overlap; password change logs out old sessions", async () => {
  const { cookie, pw } = await make("edge-phone");
  const soon = new Date(Math.ceil((Date.now() + 10 * 60000) / 900000) * 900000);
  const day = core.keyOf("UTC", soon.getTime()), mins = soon.getUTCHours() * 60 + soon.getUTCMinutes();
  const cfg = (await call("GET", "/api/booking/edge-phone/admin/data", undefined, cookie)).json.settings;
  for (const d of [0, 1, 2, 3, 4, 5, 6]) cfg.hours[d] = ["00:00", "23:45"];
  cfg.staff[0].days = [0, 1, 2, 3, 4, 5, 6]; cfg.services[0].mins = 15; cfg.notice = 600;
  await call("PUT", "/api/booking/edge-phone/admin/settings", { settings: cfg }, cookie);
  if (mins + 15 <= 23 * 60 + 45) {
    const p = { serviceId: "s1", staffId: "p1", start: soon.toISOString(), name: "Walk In", phone: "555 999 0000", source: "walk-in" };
    assert.strictEqual((await call("POST", "/api/booking/edge-phone/admin/book", p, cookie)).status, 200);
    assert.match((await call("POST", "/api/booking/edge-phone/admin/book", p, cookie)).json.error, /taken/);
    assert.match((await call("POST", "/api/booking/edge-phone/book", { ...p, ...person() }, null, fresh())).json.error, /taken/); // customers still need notice
    assert.ok(day);
  }
  assert.match((await call("POST", "/api/booking/edge-phone/admin/password", { current: "nope", next: "abcdefghijk" }, cookie)).json.error, /current password/);
  assert.match((await call("POST", "/api/booking/edge-phone/admin/password", { current: pw, next: "short" }, cookie)).json.error, /10 characters/);
  const ch = await call("POST", "/api/booking/edge-phone/admin/password", { current: pw, next: "a-much-better-password" }, cookie);
  assert.strictEqual(ch.status, 200);
  assert.strictEqual((await call("GET", "/api/booking/edge-phone/admin/data", undefined, cookie)).status, 401);
  assert.strictEqual((await call("GET", "/api/booking/edge-phone/admin/data", undefined, ch.cookie)).status, 200);
  assert.strictEqual((await call("POST", "/api/booking/edge-phone/login", { password: "a-much-better-password" }, null, fresh())).status, 200);
});

test("owner login is throttled per connection", async () => {
  await make("edge-brute");
  const one = { "x-forwarded-for": "198.51.100.7" };
  const codes = [];
  for (let i = 0; i < 10; i++) codes.push((await call("POST", "/api/booking/edge-brute/login", { password: "guess" + i }, null, one)).status);
  assert.deepStrictEqual(codes.slice(-2), [429, 429]);
});

test("CSV export neutralises spreadsheet formulas and keeps Excel-friendly encoding", async () => {
  const { cookie } = await make("edge-csv");
  const [t] = await firstSlots("edge-csv");
  await call("POST", "/api/booking/edge-csv/book", { serviceId: "s1", staffId: "any", start: t, ...person({ name: "=HYPERLINK(\"http://evil\")", notes: "+1 call me" }) }, null, fresh());
  const csv = await call("GET", "/api/booking/edge-csv/admin/export.csv", undefined, cookie);
  assert.ok(/^\ufeff?"Start"/.test(csv.text)); // BOM for Excel (fetch may strip it when decoding)
  assert.match(csv.text, /"'=HYPERLINK\(""http:\/\/evil""\)"/); assert.match(csv.text, /"'\+1 call me"/);
  assert.match(csv.headers.get("content-disposition"), /bookings-edge-csv\.csv/);
});

// ------------------------------------------------------------------ site admin, pages, emails
test("site admin: reserved and duplicate names, owner email required, list counts", async () => {
  for (const slug of ["admin", "api", "ab", "-bad", "bad-", "a b", "a".repeat(41)]) assert.strictEqual((await call("POST", "/api/booking-admin/create", { slug, ownerEmail: "o@x.com" })).status, 400, slug);
  assert.match((await call("POST", "/api/booking-admin/create", { slug: "edge-noemail", ownerEmail: "nope" })).json.error, /email/);
  assert.strictEqual((await call("POST", "/api/booking-admin/reset-password", { slug: "nobody-here" })).status, 404);
  const list = (await call("GET", "/api/booking-admin/list")).json.businesses;
  assert.ok(list.find((b) => b.slug === "edge-race").total === 1);
  booking.setSiteAdminCheck(() => false);
  assert.strictEqual((await call("GET", "/api/booking-admin/list")).status, 401);
  booking.setSiteAdminCheck(() => true);
});

test("pages: booking page can be embedded, dashboard can't; unknown and switched-off pages are 404", async () => {
  const p = await call("GET", "/book/edge-a");
  assert.match(p.headers.get("content-security-policy"), /frame-ancestors \*/);
  assert.strictEqual(p.headers.get("x-frame-options"), null);
  const a = await call("GET", "/book/edge-a/admin");
  assert.match(a.headers.get("content-security-policy"), /frame-ancestors 'none'/); assert.strictEqual(a.headers.get("x-frame-options"), "DENY");
  assert.match(p.text, /noindex, nofollow/);
  assert.strictEqual((await call("GET", "/book/never-made")).status, 404);
  await call("POST", "/api/booking-admin/disable", { slug: "edge-a", disabled: true });
  assert.strictEqual((await call("GET", "/book/edge-a")).status, 404);
  await call("POST", "/api/booking-admin/disable", { slug: "edge-a", disabled: false });
  assert.strictEqual((await call("GET", "/book/edge-a")).status, 200);
});

test("emails: customer text is escaped in HTML, sender name and links are right, owner alert goes to the owner", async () => {
  await make("edge-mail");
  const [t] = await firstSlots("edge-mail");
  sent.length = 0;
  await call("POST", "/api/booking/edge-mail/book", { serviceId: "s1", staffId: "any", start: t, ...person({ name: "<script>x</script> Ann", notes: "<img src=x onerror=alert(1)>" }) }, null, fresh());
  await tick();
  const owner = sent.find((x) => x.kind === "owner-new"), cust = sent.find((x) => x.kind === "confirm");
  assert.strictEqual(owner.to, "owner@edge-mail.test"); assert.strictEqual(cust.to, "ann@example.com");
  assert.ok(!/<script>|<img src=x/.test(owner.html + cust.html));
  assert.match(cust.text, /\/book\/edge-mail\?code=/);
  const c = mail.compose("confirm", core.sanitizeSettings({ ...presets.other, tz: "Asia/Karachi" }), { id: "1", code: "X-1", serviceId: "s1", staffId: "p1", start: "2026-11-09T04:00:00Z", end: "2026-11-09T04:30:00Z", name: "A", email: "a@x.com", phone: "1" }, "s");
  assert.match(c.text, /9:00 AM/); // business time zone, not the server's
  assert.match(c.ics, /DTSTART:20261109T040000Z/);
});

test("backup includes booking pages and restores them", () => {
  const backup = require("../outreach/backup");
  const b = backup.create({ markDone: false });
  assert.ok(b.files["booking/businesses.json"]); assert.ok(b.files["booking/b-edge-race.json"]);
  assert.ok(!Object.keys(b.files).some((n) => /secret/.test(n)));
  assert.throws(() => backup.validate({ ...b, files: { "booking/../../evil.json": "{}" } }), /unexpected file/);
  fs.rmSync(path.join(process.env.BOOKING_DATA_DIR, "b-edge-race.json"));
  backup.restore(b);
  assert.strictEqual(store.loadBiz("edge-race").bookings.length, 1);
});

test("unique booking codes even when the random code repeats", () => {
  const s = core.sanitizeSettings(presets.other);
  const seen = new Set();
  for (let i = 0; i < 2000; i++) seen.add(core.newCode(s));
  assert.ok(seen.size > 1990);
  assert.match([...seen][0], /^[A-Z]{4}-[A-HJ-NP-Z2-9]{6}$/);
});
