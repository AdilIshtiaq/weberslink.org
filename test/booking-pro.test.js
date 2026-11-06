// Phase 1 platform features: staff hours & breaks, time off, per-service gaps, phone-only services, booking questions,
// clients (CRM), owner edits, calendar feed, plans & limits, requests.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "booking-pro-"));
process.env.BOOKING_DATA_DIR = path.join(DIR, "booking");
process.env.OUTREACH_DATA_DIR = DIR;
process.env.BOOKING_PUBLIC_URL = "https://example.test";
process.env.BOOKING_ADMIN_EMAIL = "me@weberslink.test";
const core = require("../booking/core");
const presets = require("../booking/presets");
const mail = require("../booking/mail");
const store = require("../booking/store");
const booking = require("../booking");
test.after(() => fs.rmSync(DIR, { recursive: true, force: true }));
const inbox = [];
mail.setSender(async (m, kind) => { inbox.push({ kind, to: m.to, subject: m.subject, text: m.text }); });
booking.setSiteAdminCheck(() => true);

// ------------------------------------------------------------------ core rules (pure)
const NOW = Date.parse("2026-11-09T06:00:00Z"); // Monday, business in UTC
const base = (o = {}) => core.sanitizeSettings({ ...presets.other, tz: "UTC", notice: 0, buffer: 0, step: 30, daysAhead: 30, ...o });
const times = (s, bookings = [], opts = {}) => core.availability(s, bookings, { serviceId: "s1", now: NOW, days: 1, ...opts })[0].slots.map((x) => x.t.slice(11, 16));

test("a person's own hours narrow the business hours; a day set to off has no times", () => {
  const s = base({ staff: [{ id: "p1", name: "A", days: [1, 2, 3, 4, 5], services: ["s1"], hours: { 1: ["11:00", "13:00"], 2: null } }] });
  assert.deepStrictEqual(times(s), ["11:00", "11:30", "12:00", "12:30"]);
  assert.deepStrictEqual(core.availability(s, [], { serviceId: "s1", now: NOW, days: 2 })[1].slots, []); // Tuesday off
  assert.strictEqual(times(base()).length, 16); // 09:00-17:00 every 30 min, 30 min service
});

test("breaks are never booked across", () => {
  const s = base({ staff: [{ id: "p1", name: "A", days: [1], services: ["s1"], breaks: [{ from: "12:00", to: "13:00" }] }], services: [{ id: "s1", name: "Long", mins: 60 }] });
  const t = times(s);
  assert.ok(!t.includes("11:30") && !t.includes("12:00") && !t.includes("12:30")); // would touch the break
  assert.ok(t.includes("11:00") && t.includes("13:00"));
});

test("time off: whole days in the business time zone, for one person or everyone", () => {
  const s = base({ tz: "America/New_York", staff: [{ id: "p1", name: "A", days: [1, 2], services: ["s1"] }, { id: "p2", name: "B", days: [1, 2], services: ["s1"] }] });
  const off = core.cleanBlock(s, { staffId: "p1", fromDate: "2026-11-09", note: "Dentist" });
  assert.strictEqual(off.start, "2026-11-09T05:00:00.000Z"); assert.strictEqual(off.end, "2026-11-10T05:00:00.000Z");
  const busy = core.busy([], [off], s.staff);
  const day = core.availability(s, busy, { serviceId: "s1", now: Date.parse("2026-11-08T00:00:00Z"), from: "2026-11-09", days: 1 })[0];
  assert.ok(day.slots.length && day.slots.every((x) => x.staff.length === 1 && x.staff[0] === "p2"));
  const closed = core.busy([], [core.cleanBlock(s, { staffId: "all", fromDate: "2026-11-09", toDate: "2026-11-10" })], s.staff);
  const two = core.availability(s, closed, { serviceId: "s1", now: Date.parse("2026-11-08T00:00:00Z"), from: "2026-11-09", days: 2 });
  assert.deepStrictEqual(two.map((d) => d.slots.length), [0, 0]);
  assert.throws(() => core.cleanBlock(s, { staffId: "nobody", fromDate: "2026-11-09" }), /who is off/);
  assert.throws(() => core.cleanBlock(s, { staffId: "all", fromDate: "2026-11-10", toDate: "2026-11-09" }), /valid dates/);
  assert.throws(() => core.cleanBlock(s, { staffId: "all", start: "2026-11-09T10:00:00Z", end: "2026-11-09T09:00:00Z" }), /after the start/);
});

test("per-service gap overrides the business gap, and time off adds no gap", () => {
  const s = base({ buffer: 0, services: [{ id: "s1", name: "Colour", mins: 60, buffer: 30 }, { id: "s2", name: "Cut", mins: 30 }], staff: [{ id: "p1", name: "A", days: [1], services: ["s1", "s2"] }] });
  const b = { id: "b1", staffId: "p1", serviceId: "s1", status: "booked", start: "2026-11-09T09:00:00.000Z", end: "2026-11-09T10:00:00.000Z" };
  const cut = core.availability(s, [b], { serviceId: "s2", now: NOW, days: 1 })[0].slots.map((x) => x.t.slice(11, 16));
  assert.ok(!cut.includes("10:00") && cut.includes("10:30")); // 30 min clean-up after colour
  const blk = core.busy([], [{ id: "x", staffId: "p1", start: "2026-11-09T09:00:00.000Z", end: "2026-11-09T10:00:00.000Z" }], s.staff);
  assert.ok(core.availability(s, blk, { serviceId: "s2", now: NOW, days: 1 })[0].slots.some((x) => x.t.slice(11, 16) === "10:00"));
});

test("phone-only services: hidden from customers, bookable by the owner", () => {
  const s = base({ services: [{ id: "s1", name: "Consult", mins: 30, online: false }, { id: "s2", name: "Visit", mins: 30 }], staff: [{ id: "p1", name: "A", days: [1], services: ["s1", "s2"] }] });
  assert.throws(() => core.availability(s, [], { serviceId: "s1", now: NOW }), /Unknown service/);
  assert.ok(core.availability(s, [], { serviceId: "s1", now: NOW, owner: true, days: 1 })[0].slots.length);
  assert.throws(() => core.resolveSlot(s, [], { serviceId: "s1", staffId: "any", start: "2026-11-09T10:00:00Z" }, { now: NOW }), /service/);
  assert.strictEqual(core.resolveSlot(s, [], { serviceId: "s1", staffId: "any", start: "2026-11-09T10:00:00Z" }, { now: NOW, owner: true }).staffId, "p1");
});

test("booking questions: cleaned, required enforced, select limited to its options", () => {
  const s = base({ questions: [{ id: "q1", label: "First visit?", type: "yesno", required: true }, { id: "q2", label: "Hair length", type: "select", options: ["Short", "Long"] }, { id: "q3", label: "", type: "text" }, { label: "Bad select", type: "select" }] });
  assert.strictEqual(s.questions.length, 2); // blank label and option-less select dropped
  assert.throws(() => core.cleanAnswers(s, {}), /First visit/);
  assert.deepStrictEqual(core.cleanAnswers(s, { q1: "yes", q2: "Purple" }), { q1: "Yes" });
  assert.deepStrictEqual(core.cleanAnswers(s, { q1: false, q2: "Long" }), { q1: "No", q2: "Long" });
});

// ------------------------------------------------------------------ HTTP
let sv;
test.before(() => new Promise((r) => { sv = http.createServer((req, res) => { if (!booking.handle(req, res)) { res.writeHead(404); res.end(); } }); sv.listen(0, r); }));
test.after(() => sv.close());
let n = 0;
const ip = () => ({ "x-forwarded-for": "10.7." + Math.floor(++n / 250) + "." + (n % 250) });
async function call(method, url, body, cookie) {
  const res = await fetch(`http://127.0.0.1:${sv.address().port}${url}`, { method, headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}), ...ip() }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch (e) {}
  return { status: res.status, json, text, headers: res.headers, cookie: (res.headers.get("set-cookie") || "").split(";")[0] };
}
const tick = () => new Promise((r) => setTimeout(r, 30));
let C, S; // owner cookie, settings
const A = "/api/booking/pro-shop";
async function slotsOf(svc = "s1", skip = 2) { const days = (await call("GET", `${A}/slots?service=${svc}&days=14`)).json.days; return days.slice(skip).filter((d) => d.slots.length)[0].slots.map((x) => x.t); }

test("setup: Free plan by default, Powered-by shown, limits on team and questions", async () => {
  const made = await call("POST", "/api/booking-admin/create", { slug: "pro-shop", name: "Pro Shop", ownerEmail: "o@pro.test", preset: "other", tz: "UTC" });
  C = (await call("POST", `${A}/login`, { password: made.json.password })).cookie;
  const d = (await call("GET", `${A}/admin/data`, undefined, C)).json;
  assert.strictEqual(d.plan.key, "free"); assert.strictEqual(d.plan.staff, 1); assert.ok(d.feedUrl.startsWith("https://example.test/api/booking-feed/pro-shop/"));
  S = { ...d.settings, setupDone: true, questions: [{ id: "q1", label: "Anything we should know?", type: "text" }, { id: "q2", label: "First visit?", type: "yesno", required: true }] };
  assert.strictEqual((await call("PUT", `${A}/admin/settings`, { settings: { ...S, questions: [...S.questions, { label: "Third", type: "text" }] } }, C)).status, 403);
  assert.strictEqual((await call("PUT", `${A}/admin/settings`, { settings: { ...S, poweredBy: false } }, C)).json.settings.poweredBy, true); // owner can't remove branding on Free
  assert.strictEqual((await call("GET", `${A}/config`)).json.settings.poweredBy, true);
});

test("customer booking: questions required, answers stored and shown to the owner", async () => {
  const [t] = await slotsOf();
  const form = { serviceId: "s1", staffId: "any", start: t, name: "Ann Lee", email: "ann@x.test", phone: "555 123 4567" };
  assert.match((await call("POST", `${A}/book`, form)).json.error, /First visit/);
  const b = await call("POST", `${A}/book`, { ...form, answers: { q1: "Bad knee", q2: "yes" } });
  assert.strictEqual(b.status, 200, b.text); assert.deepStrictEqual(b.json.booking.answers, { q1: "Bad knee", q2: "Yes" });
  const d = (await call("GET", `${A}/admin/data`, undefined, C)).json;
  assert.deepStrictEqual(d.bookings[0].answers, { q1: "Bad knee", q2: "Yes" });
});

test("owner moves and edits a booking; the customer is told; clashes and time off are refused", async () => {
  const d = (await call("GET", `${A}/admin/data`, undefined, C)).json, b = d.bookings[0];
  const later = (await slotsOf("s1", 4))[0];
  inbox.length = 0;
  const up = await call("POST", `${A}/admin/update`, { id: b.id, start: later, phone: "555 999 8888", notes: "Prefers mornings" }, C);
  assert.strictEqual(up.status, 200, up.text); assert.strictEqual(up.json.booking.start, later); assert.strictEqual(up.json.booking.phone, "555 999 8888");
  await tick(); assert.deepStrictEqual(inbox.map((m) => m.kind), ["moved"]);
  const quiet = await call("POST", `${A}/admin/update`, { id: b.id, start: b.start, notify: false }, C);
  assert.strictEqual(quiet.status, 200); await tick(); assert.strictEqual(inbox.length, 1);
  // a walk-in at the same time clashes
  const w = await call("POST", `${A}/admin/book`, { serviceId: "s1", staffId: "p1", start: later, name: "Walk", phone: "555 000 1111" }, C);
  assert.strictEqual(w.status, 200, w.text);
  assert.match((await call("POST", `${A}/admin/update`, { id: b.id, start: later }, C)).json.error, /isn't free/);
});

test("time off via the API blocks customers, reports conflicts, and can be removed", async () => {
  const [t] = await slotsOf("s1", 6);
  const day = t.slice(0, 10);
  const add = await call("POST", `${A}/admin/blocks/add`, { staffId: "all", fromDate: day, note: "Holiday" }, C);
  assert.strictEqual(add.status, 200, add.text); assert.ok(Array.isArray(add.json.conflicts));
  const after = (await call("GET", `${A}/slots?service=s1&days=14`)).json.days.find((d) => d.date === day);
  assert.strictEqual(after.slots.length, 0);
  assert.match((await call("POST", `${A}/book`, { serviceId: "s1", staffId: "any", start: t, name: "B", email: "b@x.test", phone: "555 222 3333", answers: { q2: "no" } })).json.error, /taken/);
  await call("POST", `${A}/admin/blocks/remove`, { id: add.json.block.id }, C);
  assert.ok((await call("GET", `${A}/slots?service=s1&days=14`)).json.days.find((d) => d.date === day).slots.length > 0);
  assert.match((await call("POST", `${A}/admin/blocks/add`, { staffId: "zz", fromDate: day }, C)).json.error, /who is off/);
});

test("clients: built from bookings, notes and tags saved, blocked clients can't book online", async () => {
  let list = (await call("GET", `${A}/admin/clients`, undefined, C)).json.clients;
  const ann = list.find((c) => c.email === "ann@x.test");
  assert.ok(ann && ann.upcoming === 1); assert.ok(list.find((c) => c.key === "tel:5550001111")); // walk-in without email, keyed by phone
  assert.strictEqual((await call("POST", `${A}/admin/client`, { key: ann.key, notes: "Allergic to latex", tags: ["VIP", "VIP", ""], blocked: true }, C)).status, 200);
  list = (await call("GET", `${A}/admin/clients`, undefined, C)).json.clients;
  const again = list.find((c) => c.key === ann.key);
  assert.strictEqual(again.notes, "Allergic to latex"); assert.deepStrictEqual(again.tags, ["VIP"]); assert.strictEqual(again.blocked, true);
  const [t] = await slotsOf("s1", 5);
  assert.match((await call("POST", `${A}/book`, { serviceId: "s1", staffId: "any", start: t, name: "Ann", email: "ANN@x.test", phone: "555 123 4567", answers: { q2: "no" } })).json.error, /isn't available for you/);
  await call("POST", `${A}/admin/client`, { key: ann.key, blocked: false }, C);
});

test("clients: CSV import adds and updates, skips bad rows; export is formula-safe", async () => {
  const imp = await call("POST", `${A}/admin/clients/import`, { rows: [
    { name: "Zara Khan", email: "zara@x.test", phone: "0300 1234567", tags: "regular; colour" },
    { name: "Ann Lee", email: "ann@x.test", notes: "From old system" },
    { name: "", email: "noname@x.test" }, { name: "No contact" },
    { name: "=cmd()", email: "evil@x.test" },
  ] }, C);
  assert.deepStrictEqual({ a: imp.json.added, u: imp.json.updated, s: imp.json.skipped }, { a: 2, u: 1, s: 2 });
  const list = (await call("GET", `${A}/admin/clients`, undefined, C)).json.clients;
  assert.deepStrictEqual(list.find((c) => c.email === "zara@x.test").tags, ["regular", "colour"]);
  assert.strictEqual(list.find((c) => c.email === "ann@x.test").notes, "From old system");
  const csv = await call("GET", `${A}/admin/clients.csv`, undefined, C);
  assert.match(csv.text, /"'=cmd\(\)"/); assert.match(csv.headers.get("content-disposition"), /clients-pro-shop\.csv/);
});

test("calendar feed: private URL, lists bookings and time off, token can be reset", async () => {
  const d = (await call("GET", `${A}/admin/data`, undefined, C)).json;
  const url = d.feedUrl.replace("https://example.test", "");
  const f = await call("GET", url);
  assert.strictEqual(f.status, 200); assert.match(f.headers.get("content-type"), /text\/calendar/);
  assert.match(f.text, /BEGIN:VCALENDAR[\s\S]*SUMMARY:Ann Lee – /); assert.match(f.text, /X-WR-CALNAME:Pro Shop bookings/);
  assert.strictEqual((await call("GET", url.replace(/[0-9a-f]{32}/, "0".repeat(32)))).status, 404);
  const r = await call("POST", `${A}/admin/feed/reset`, {}, C);
  assert.notStrictEqual(r.json.feedUrl, d.feedUrl);
  assert.strictEqual((await call("GET", url)).status, 404); // old link stops working
});

test("requests reach you; you switch the plan; Pro lifts limits and branding", async () => {
  inbox.length = 0;
  assert.strictEqual((await call("POST", `${A}/admin/request`, { kind: "nonsense" }, C)).status, 400);
  const r = await call("POST", `${A}/admin/request`, { kind: "setup", message: "Please import my 300 clients", phone: "0300 5556667" }, C);
  assert.strictEqual(r.status, 200); await tick();
  assert.ok(inbox.find((m) => m.to === "me@weberslink.test" && /setup request: Pro Shop/.test(m.subject) && /300 clients/.test(m.text)));
  const all = (await call("GET", "/api/booking-admin/requests")).json.requests;
  assert.strictEqual(all[0].kind, "setup"); assert.strictEqual(all[0].status, "open");
  await call("POST", "/api/booking-admin/request-status", { id: all[0].id, status: "done" });
  assert.strictEqual((await call("GET", "/api/booking-admin/requests")).json.requests[0].status, "done");
  assert.strictEqual((await call("POST", "/api/booking-admin/set-plan", { slug: "pro-shop", plan: "gold" })).status, 400);
  await call("POST", "/api/booking-admin/set-plan", { slug: "pro-shop", plan: "pro" });
  assert.strictEqual((await call("GET", `${A}/config`)).json.settings.poweredBy, false);
  const d = (await call("GET", `${A}/admin/data`, undefined, C)).json;
  assert.strictEqual(d.plan.key, "pro"); assert.strictEqual(d.plan.staff, null);
  const more = { ...d.settings, staff: d.settings.staff.concat({ id: "p2", name: "Bo", days: [1, 2], services: ["s1"] }), questions: [1, 2, 3, 4].map((i) => ({ label: "Q" + i, type: "text" })) };
  assert.strictEqual((await call("PUT", `${A}/admin/settings`, { settings: more }, C)).status, 200);
  // requests are owner-scoped: they show in the owner's data
  assert.strictEqual(d.requests.length, 1);
});

test("Free plan monthly booking limit stops online bookings, not the owner's", async () => {
  await call("POST", "/api/booking-admin/set-plan", { slug: "pro-shop", plan: "free" });
  const biz = store.loadBiz("pro-shop");
  for (let i = 0; i < 100; i++) biz.bookings.push({ id: "fill" + i, code: "F-" + i, serviceId: "s1", staffId: "p1", status: "cancelled", source: "online", createdAt: new Date().toISOString(), start: "2026-01-01T00:00:00Z", end: "2026-01-01T00:30:00Z", email: "f@x.test", name: "F", phone: "5551112222" });
  biz.settings.staff = biz.settings.staff.slice(0, 1); biz.settings.questions = [];
  store.saveBiz("pro-shop", biz);
  const [t] = await slotsOf("s1", 7);
  assert.match((await call("POST", `${A}/book`, { serviceId: "s1", staffId: "any", start: t, name: "C", email: "c@x.test", phone: "555 333 4444" })).json.error, /full for this month/);
  assert.strictEqual((await call("POST", `${A}/admin/book`, { serviceId: "s1", staffId: "p1", start: t, name: "Phone", phone: "555 333 4444" }, C)).status, 200);
});

test("backup includes requests", () => {
  const b = require("../outreach/backup").create({ markDone: false });
  assert.ok(b.files["booking/requests.json"]); assert.ok(b.files["booking/b-pro-shop.json"]);
});
