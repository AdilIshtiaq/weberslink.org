// Staff logins: invite, accept, sign in with email, roles and what each can do, reset, removal.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "booking-team-"));
process.env.BOOKING_DATA_DIR = path.join(DIR, "booking");
process.env.OUTREACH_DATA_DIR = DIR;
process.env.BOOKING_PUBLIC_URL = "https://example.test";
delete process.env.STRIPE_SECRET_KEY;
const mail = require("../booking/mail");
const store = require("../booking/store");
const booking = require("../booking");
const inbox = [];
mail.setSender(async (m, kind) => { inbox.push({ kind, to: m.to, text: m.text, subject: m.subject }); });
booking.setSiteAdminCheck(() => true);

let sv;
test.before(() => new Promise((r) => { sv = http.createServer((req, res) => { if (!booking.handle(req, res)) { res.writeHead(404); res.end(); } }); sv.listen(0, r); }));
test.after(() => { sv.close(); fs.rmSync(DIR, { recursive: true, force: true }); });
let n = 0;
const ip = () => ({ "x-forwarded-for": "10.3." + Math.floor(++n / 250) + "." + (n % 250) });
async function call(method, url, body, cookie) {
  const res = await fetch(`http://127.0.0.1:${sv.address().port}${url}`, { method, headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}), ...ip() }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch (e) {}
  return { status: res.status, json, text, cookie: (res.headers.get("set-cookie") || "").split(";")[0] };
}
const tokenFrom = (to) => /token=([0-9a-f]+)/.exec(inbox.filter((m) => m.to === to).pop().text)[1];
const A = "/api/booking/team-shop";
let OWNER, MGR, STAFF, PW;

test("setup: Free plan has no team logins; Pro does", async () => {
  const made = await call("POST", "/api/booking-admin/create", { slug: "team-shop", name: "Team Shop", ownerEmail: "boss@team.test", preset: "salon", tz: "UTC" });
  PW = made.json.password;
  OWNER = (await call("POST", `${A}/login`, { password: PW })).cookie;
  const d = (await call("GET", `${A}/admin/data`, undefined, OWNER)).json;
  assert.strictEqual(d.me.role, "owner"); assert.deepStrictEqual(d.team, []);
  assert.match((await call("POST", `${A}/admin/team/invite`, { email: "sam@team.test", role: "staff", staffId: "p1" }, OWNER)).json.error, /part of Pro/);
  await call("POST", "/api/booking-admin/set-plan", { slug: "team-shop", plan: "pro" });
  const st = { ...d.settings, setupDone: true, staff: [{ id: "p1", name: "Sam", days: [0, 1, 2, 3, 4, 5, 6], services: ["s1", "s2", "s3"] }, { id: "p2", name: "Kim", days: [0, 1, 2, 3, 4, 5, 6], services: ["s1", "s2", "s3"] }] };
  for (const dd of [0, 1, 2, 3, 4, 5, 6]) st.hours[dd] = ["08:00", "20:00"];
  assert.strictEqual((await call("PUT", `${A}/admin/settings`, { settings: st }, OWNER)).status, 200);
});

test("owner invites a manager and a staff member; invite validation", async () => {
  assert.match((await call("POST", `${A}/admin/team/invite`, { email: "x", role: "staff", staffId: "p1" }, OWNER)).json.error, /email/);
  assert.match((await call("POST", `${A}/admin/team/invite`, { email: "x@team.test", role: "boss" }, OWNER)).json.error, /role/);
  assert.match((await call("POST", `${A}/admin/team/invite`, { email: "x@team.test", role: "staff" }, OWNER)).json.error, /calendar/);
  assert.match((await call("POST", `${A}/admin/team/invite`, { email: "boss@team.test", role: "manager" }, OWNER)).json.error, /already/);
  const m = await call("POST", `${A}/admin/team/invite`, { email: "mia@team.test", name: "Mia", role: "manager" }, OWNER);
  assert.strictEqual(m.status, 200); assert.strictEqual(m.json.user.status, "invited");
  const s = await call("POST", `${A}/admin/team/invite`, { email: "Sam@Team.test", name: "Sam", role: "staff", staffId: "p1" }, OWNER);
  assert.strictEqual(s.json.user.email, "sam@team.test");
  assert.match(inbox.find((x) => x.to === "sam@team.test").subject, /invited to Team Shop/);
  assert.strictEqual((await call("POST", `${A}/admin/team/invite`, { email: "sam@team.test", role: "staff", staffId: "p1" }, OWNER)).status, 409);
  const acc = store.account("team-shop");
  assert.ok(acc.users.every((u) => u.inviteHash && !u.inviteToken && !u.hash)); // only a hash of the link is stored
});

test("invite page and accepting: sets a password, signs in, link single-use; resend replaces the link", async () => {
  const old = tokenFrom("sam@team.test");
  const sam = store.account("team-shop").users.find((u) => u.email === "sam@team.test");
  assert.strictEqual((await call("POST", `${A}/admin/team/resend`, { id: sam.id }, OWNER)).status, 200);
  assert.strictEqual((await call("POST", "/api/booking-account/invite", { token: old })).status, 400);
  const tok = tokenFrom("sam@team.test");
  const info = await call("POST", "/api/booking-account/invite", { token: tok });
  assert.deepStrictEqual({ b: info.json.business, r: info.json.role }, { b: "Team Shop", r: "staff" });
  assert.match((await call("POST", "/api/booking-account/accept", { token: tok, password: "short" })).json.error, /10 characters/);
  const acc = await call("POST", "/api/booking-account/accept", { token: tok, password: "sam password 1" });
  assert.strictEqual(acc.status, 200); assert.strictEqual(acc.json.slug, "team-shop"); STAFF = acc.cookie;
  assert.strictEqual((await call("POST", "/api/booking-account/accept", { token: tok, password: "sam password 2" })).status, 400);
  const mtok = tokenFrom("mia@team.test");
  MGR = (await call("POST", "/api/booking-account/accept", { token: mtok, password: "mia password 1", name: "Mia R" })).cookie;
  // sign in with email later
  const li = await call("POST", "/api/booking-account/login", { email: "sam@team.test", password: "sam password 1" });
  assert.strictEqual(li.status, 200); assert.strictEqual(li.json.slug, "team-shop");
  assert.strictEqual((await call("POST", "/api/booking-account/login", { email: "sam@team.test", password: "wrong" })).status, 401);
  // the owner's password-only page login isn't a back door for staff passwords
  assert.strictEqual((await call("POST", `${A}/login`, { password: "sam password 1" })).status, 401);
});

test("staff see and change only their own appointments, clients and time off", async () => {
  const days = (await call("GET", `${A}/slots?service=s2&days=14`)).json.days.slice(2).find((d) => d.slots.length);
  const t = days.slots.find((x) => x.staff.includes("p1") && x.staff.includes("p2")).t;
  const mineB = await call("POST", `${A}/admin/book`, { serviceId: "s2", staffId: "p1", start: t, name: "Mine Client", phone: "555 111 0001", email: "mine@x.test" }, OWNER);
  const theirs = await call("POST", `${A}/admin/book`, { serviceId: "s2", staffId: "p2", start: t, name: "Their Client", phone: "555 111 0002", email: "theirs@x.test" }, OWNER);
  const d = (await call("GET", `${A}/admin/data`, undefined, STAFF)).json;
  assert.strictEqual(d.me.role, "staff"); assert.strictEqual(d.me.staffId, "p1"); assert.strictEqual(d.team, undefined);
  assert.deepStrictEqual(d.bookings.map((b) => b.name), ["Mine Client"]);
  assert.match((await call("POST", `${A}/admin/status`, { id: theirs.json.booking.id, status: "done" }, STAFF)).json.error, /Unknown booking/);
  assert.match((await call("POST", `${A}/admin/update`, { id: theirs.json.booking.id, notes: "x" }, STAFF)).json.error, /can't be changed/);
  assert.match((await call("POST", `${A}/admin/update`, { id: mineB.json.booking.id, staffId: "p2" }, STAFF)).json.error, /Only the owner or a manager/);
  assert.strictEqual((await call("POST", `${A}/admin/update`, { id: mineB.json.booking.id, notes: "Running late" }, STAFF)).status, 200);
  assert.strictEqual((await call("POST", `${A}/admin/book`, { serviceId: "s2", staffId: "p2", start: t, name: "X", phone: "555 111 0003" }, STAFF)).status, 403);
  const slots = (await call("GET", `${A}/admin/slots?service=s2&staff=p2&days=3`, undefined, STAFF)).json.days.flatMap((x) => x.slots);
  assert.ok(slots.length && slots.every((x) => x.staff.every((id) => id === "p1"))); // asking for Kim still returns only Sam
  const clients = (await call("GET", `${A}/admin/clients`, undefined, STAFF)).json.clients;
  assert.deepStrictEqual(clients.map((c) => c.email), ["mine@x.test"]);
  assert.strictEqual((await call("POST", `${A}/admin/client`, { key: "theirs@x.test", notes: "x" }, STAFF)).status, 403);
  assert.strictEqual((await call("POST", `${A}/admin/client`, { key: "mine@x.test", notes: "Likes tea" }, STAFF)).status, 200);
  assert.strictEqual((await call("POST", `${A}/admin/blocks/add`, { staffId: "all", fromDate: "2030-01-01" }, STAFF)).status, 403);
  const off = await call("POST", `${A}/admin/blocks/add`, { staffId: "p1", fromDate: "2030-01-01" }, STAFF);
  assert.strictEqual(off.status, 200);
  const ownerOff = await call("POST", `${A}/admin/blocks/add`, { staffId: "p2", fromDate: "2030-01-02" }, OWNER);
  assert.strictEqual((await call("POST", `${A}/admin/blocks/remove`, { id: ownerOff.json.block.id }, STAFF)).status, 403);
  for (const [method, url, body] of [["PUT", "admin/settings", { settings: d.settings }], ["GET", "admin/export.csv"], ["GET", "admin/clients.csv"], ["POST", "admin/clients/import", { rows: [] }], ["POST", "admin/request", { kind: "setup" }], ["POST", "admin/feed/reset", {}], ["POST", "admin/team/invite", { email: "z@x.test", role: "staff", staffId: "p1" }], ["POST", "admin/delete", { password: PW }]]) {
    assert.strictEqual((await call(method, `${A}/${url}`, body, STAFF)).status, 403, url);
  }
});

test("managers run the business but can't manage logins, Stripe or delete the page", async () => {
  const d = (await call("GET", `${A}/admin/data`, undefined, MGR)).json;
  assert.strictEqual(d.me.role, "manager"); assert.strictEqual(d.me.name, "Mia R"); assert.strictEqual(d.bookings.length, 2); assert.strictEqual(d.team, undefined);
  assert.strictEqual((await call("PUT", `${A}/admin/settings`, { settings: { ...d.settings, phone: "0300 1234567" } }, MGR)).status, 200);
  assert.strictEqual((await call("GET", `${A}/admin/export.csv`, undefined, MGR)).status, 200);
  for (const url of ["admin/team/invite", "admin/stripe/connect", "admin/delete"]) assert.strictEqual((await call("POST", `${A}/${url}`, { email: "q@x.test", role: "staff", password: PW }, MGR)).status, 403, url);
});

test("staff change their own password; owner changes a role (signs them out) or removes a login", async () => {
  assert.match((await call("POST", `${A}/admin/password`, { current: "nope", next: "abcdefghijkl" }, STAFF)).json.error, /current password/);
  const ch = await call("POST", `${A}/admin/password`, { current: "sam password 1", next: "sam password 2" }, STAFF);
  assert.strictEqual(ch.status, 200); STAFF = ch.cookie;
  assert.strictEqual((await call("GET", `${A}/admin/data`, undefined, STAFF)).status, 200);
  assert.strictEqual(store.account("team-shop").pwv || 1, 1); // the owner's password is untouched
  const team = (await call("GET", `${A}/admin/data`, undefined, OWNER)).json.team;
  const sam = team.find((u) => u.email === "sam@team.test");
  assert.strictEqual(sam.status, "active");
  await call("POST", `${A}/admin/team/update`, { id: sam.id, role: "manager" }, OWNER);
  assert.strictEqual((await call("GET", `${A}/admin/data`, undefined, STAFF)).status, 401); // must sign in again
  const again = (await call("POST", "/api/booking-account/login", { email: "sam@team.test", password: "sam password 2" })).cookie;
  assert.strictEqual((await call("GET", `${A}/admin/data`, undefined, again)).json.me.role, "manager");
  await call("POST", `${A}/admin/team/remove`, { id: sam.id }, OWNER);
  assert.strictEqual((await call("GET", `${A}/admin/data`, undefined, again)).status, 401);
  assert.strictEqual((await call("POST", "/api/booking-account/login", { email: "sam@team.test", password: "sam password 2" })).status, 401);
});

test("forgot password works for a team login", async () => {
  inbox.length = 0;
  await call("POST", "/api/booking-account/forgot", { email: "mia@team.test" });
  const tok = tokenFrom("mia@team.test");
  const r = await call("POST", "/api/booking-account/reset", { token: tok, password: "mia password 2" });
  assert.strictEqual(r.status, 200); assert.strictEqual(r.json.slug, "team-shop");
  assert.strictEqual((await call("GET", `${A}/admin/data`, undefined, MGR)).status, 401); // old session ended
  assert.strictEqual((await call("POST", "/api/booking-account/login", { email: "mia@team.test", password: "mia password 2" })).status, 200);
});
