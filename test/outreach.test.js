const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

// Isolated data dir; must be set before the modules load.
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "outreach-test-"));
process.env.OUTREACH_DATA_DIR = DIR;
const store = require("../outreach/store");
const tpl = require("../outreach/templates");
const eng = require("../outreach/engine");

const CONFIG = eng.sanitizeConfig({
  signature: { name: "Hassan Ali", title: "Founder", company: "WebersLink", website: "weberslink.org", postal_address: "1 Example St, Lahore" },
  sending: { dry_run: false, send_days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], min_delay_seconds: 0, max_delay_seconds: 0, countries: ["US", "UK"], timezone: "UTC", notify_email: "me@example.com" },
  mailboxes: [{ email: "a@getweberslink.com", from_name: "Hassan" }, { email: "b@weberslinkhq.com" }],
});

function fakeBox(i, inbox = []) {
  const cfg = CONFIG.mailboxes[i];
  const b = { id: cfg.id, addr: cfg.email, sent: [], inbox, n: 0, closed: false,
    async send(msg) { b.n++; const messageId = `<${i}-${b.n}-${Math.random().toString(36).slice(2)}@x>`; b.sent.push({ ...msg, messageId }); return { messageId }; },
    async scanInbox() { return b.inbox; }, close() { b.closed = true; } };
  return b;
}
const deps = (boxes, extra = {}) => ({ mailboxes: boxes, sleep: async () => {}, mx: async () => "yes", ...extra });
function reset() { for (const f of fs.readdirSync(DIR)) fs.rmSync(path.join(DIR, f), { recursive: true, force: true }); }
function leads(n, country = "US") {
  return Array.from({ length: n }, (_, i) => ({ Email: `owner${i}@store${i}.com`, "Owner Name": i % 2 ? "Sara Khan" : "", Store: `Store ${i}`, Website: `https://www.store${i}.com/`,
    Country: country === "UK" ? "United Kingdom" : "United States", Category: "Apparel", Niche: "Fashion & Apparel", "Mobile PageSpeed (0-100)": "41", "Homepage LCP (sec)": "5.2" }));
}

test("csv round-trips commas, quotes and newlines", () => {
  const rows = [{ a: 'x,"y"', b: "line1\nline2" }, { a: "plain", b: "" }];
  assert.deepStrictEqual(store.parseCsv(store.toCsv(rows, ["a", "b"])), rows);
});

test("every bundled template renders with no leftover fields; A/B differ only in subject", () => {
  reset();
  assert.deepStrictEqual(tpl.templateProblems(CONFIG), []);
  const lead = { email: "x@y.com", store: "Lens Hub", domain: "lenshub.co.uk", country: "UK", category: "Eyewear", psi: "41", first_name: "Sara" };
  const a = tpl.render(1, lead, CONFIG, "a"), b = tpl.render(1, lead, CONFIG, "b");
  assert.notStrictEqual(a.subject, b.subject);
  assert.strictEqual(a.text, b.text);
  assert.match(a.text, /Hi Sara,/);
  assert.match(a.text, /frame sizes/);
  assert.match(a.text, /41\/100/);
  assert.doesNotMatch(a.text, /\$|£|\{|\}/); // email 1 never sells or quotes money
  assert.match(tpl.render(2, lead, CONFIG).text, /£4,200/);
  assert.match(a.html, /1 Example St/);
  assert.throws(() => tpl.render(1, lead, CONFIG, "a", "Subject: hi\n\n{nope}"), /unknown field \{nope\}/);
  assert.throws(() => tpl.parseTemplate("no subject here"), /Subject/);
});

test("import handles spreadsheet columns, duplicates, bad rows and countries", () => {
  reset();
  const rows = [...leads(3), { Email: "owner0@store0.com" }, { Email: "not-an-email" }, ...leads(1, "UK").map((r) => ({ ...r, Email: "uk@shop.co.uk" })), { Email: "ca@x.ca", Country: "Canada" }];
  const res = eng.importLeads(rows, CONFIG);
  assert.deepStrictEqual(res, { added: 5, existing: 1, invalid: 1 });
  const t = store.loadTracking();
  assert.strictEqual(t.find((x) => x.email === "ca@x.ca").status, "skipped-country");
  assert.strictEqual(t.find((x) => x.email === "uk@shop.co.uk").country, "UK");
  assert.strictEqual(t[1].first_name, "Sara");
  assert.strictEqual(t[0].domain, "store0.com");
  assert.strictEqual(t[0].psi, "41");
});

test("dry run plans emails but sends nothing and does not start warm-up", async () => {
  reset(); eng.importLeads(leads(5), CONFIG);
  const box = fakeBox(0);
  const s = await eng.runOnce({ config: { ...CONFIG, sending: { ...CONFIG.sending, dry_run: true } } }, deps([box]));
  assert.strictEqual(box.sent.length, 0);
  assert.strictEqual(s.sent, 5);
  assert.strictEqual(store.readJson("mailboxes.json", null), null);
  assert.ok(store.loadTracking().every((t) => t.status === "new"));
});

test("live run respects week-1 warm-up, spreads over mailboxes, alternates A/B", async () => {
  reset(); eng.importLeads(leads(40), CONFIG);
  const [b1, b2] = [fakeBox(0), fakeBox(1)];
  const s = await eng.runOnce({ config: CONFIG }, deps([b1, b2]));
  assert.strictEqual(s.sent, 20);
  assert.strictEqual(b1.sent.length, 10);
  assert.strictEqual(b2.sent.length, 10);
  const track = store.loadTracking();
  assert.strictEqual(track.filter((t) => t.status === "active").length, 20);
  assert.ok(new Set(track.filter((t) => t.variant).map((t) => t.variant)).size === 2, "both versions used");
  assert.ok(b1.sent.every((m) => !m.inReplyTo));
  // second run the same day sends nothing more
  const s2 = await eng.runOnce({ config: CONFIG }, deps([fakeBox(0), fakeBox(1)]));
  assert.strictEqual(s2.sent, 0);
  assert.ok(b1.closed);
});

test("follow-ups come from the same mailbox, in the same thread, only when due", async () => {
  reset(); eng.importLeads(leads(3), CONFIG);
  const box = fakeBox(0);
  const day0 = new Date("2026-03-02T15:00:00Z");
  await eng.runOnce({ config: CONFIG }, deps([box], { now: () => day0 }));
  const first = store.loadTracking().find((t) => t.email === "owner0@store0.com");
  assert.ok(first.first_message_id);

  const early = fakeBox(0);
  await eng.runOnce({ config: CONFIG }, deps([early], { now: () => new Date("2026-03-04T15:00:00Z") }));
  assert.strictEqual(early.sent.length, 0, "day 2 is too early (gap is 3 days)");

  const due = fakeBox(0);
  await eng.runOnce({ config: CONFIG }, deps([due], { now: () => new Date("2026-03-05T15:00:00Z") }));
  const m = due.sent.find((x) => x.to === "owner0@store0.com");
  assert.ok(m, "email 2 sent on day 3");
  assert.match(m.subject, /^Re: /);
  assert.strictEqual(m.inReplyTo, first.first_message_id);
  assert.deepStrictEqual(m.references, [first.first_message_id]);
  assert.strictEqual(store.loadTracking().find((t) => t.email === first.email).step, "2");
});

test("replies stop the sequence; opt-outs, bounces and auto-replies are told apart; colleagues are protected", async () => {
  reset(); eng.importLeads([...leads(3), { Email: "boss@store0.com", Store: "Store 0b", Country: "US", Website: "store0.com" }], CONFIG);
  const cfg = { ...CONFIG, sending: { ...CONFIG.sending, dry_run: true } };
  // make 3 leads active by hand
  const track = store.loadTracking();
  for (const t of track.slice(0, 3)) Object.assign(t, { status: "active", step: "1", mailbox: "a@getweberslink.com", first_message_id: `<id-${t.email}>`, last_message_id: `<id-${t.email}>`, subject: "hi", last_sent: new Date().toISOString() });
  store.saveTracking(track);
  const inbox = [
    { from: "owner0@store0.com", from_raw: "A <owner0@store0.com>", subject: "Re: hi", in_reply_to: "<id-owner0@store0.com>", references: "", body: "Yes please send it", fresh: "Yes please send it\n\nOn Mon, X wrote:\n> old" },
    { from: "owner1@store1.com", from_raw: "B", subject: "Re: hi", in_reply_to: "", references: "", body: "", fresh: "Not interested, please remove me" },
    { from: "mailer-daemon@x.com", from_raw: "Mail Delivery <mailer-daemon@x.com>", subject: "Undeliverable", in_reply_to: "", references: "", body: "could not deliver to owner2@store2.com", fresh: "" },
    { from: "owner2@store2.com", from_raw: "C", subject: "Automatic reply: out of office", in_reply_to: "", references: "", body: "", fresh: "I am away" },
  ];
  const box = fakeBox(0, inbox);
  const s = await eng.runOnce({ config: { ...cfg, sending: { ...cfg.sending, check_inbox_in_dry_run: true } } }, deps([box]));
  assert.strictEqual(s.replies, 1);
  assert.strictEqual(s.optOuts, 1);
  assert.strictEqual(s.bounces, 1);
  const now = Object.fromEntries(store.loadTracking().map((t) => [t.email, t]));
  assert.strictEqual(now["owner0@store0.com"].status, "replied");
  assert.strictEqual(now["owner1@store1.com"].status, "unsubscribed");
  assert.strictEqual(now["owner2@store2.com"].status, "bounced");
  assert.strictEqual(now["boss@store0.com"].status, "do-not-contact", "colleague at a company that replied is never emailed");
  assert.strictEqual(box.sent.length, 0, "dry run: notification email is not sent");
});

test("live run sends a reply notification", async () => {
  reset(); eng.importLeads(leads(1), CONFIG);
  const t = store.loadTracking(); Object.assign(t[0], { status: "active", step: "1", mailbox: "a@getweberslink.com", first_message_id: "<m1@x>", last_message_id: "<m1@x>", subject: "hi", last_sent: new Date().toISOString() });
  store.saveTracking(t);
  const box = fakeBox(0, [{ from: "owner0@store0.com", from_raw: "A", subject: "Re: hi", in_reply_to: "<m1@x>", references: "", body: "yes", fresh: "yes" }]);
  await eng.runOnce({ config: CONFIG }, deps([box]));
  const note = box.sent.find((m) => m.to === "me@example.com");
  assert.ok(note && /1 new reply/.test(note.subject));
});

test("a mailbox with a high bounce rate is paused", async () => {
  reset(); eng.importLeads(leads(30), CONFIG);
  const t = store.loadTracking();
  t.slice(0, 20).forEach((x, i) => Object.assign(x, { step: "1", mailbox: "a@getweberslink.com", status: i < 2 ? "bounced" : "finished" }));
  store.saveTracking(t);
  const [b1, b2] = [fakeBox(0), fakeBox(1)];
  const s = await eng.runOnce({ config: CONFIG }, deps([b1, b2]));
  assert.deepStrictEqual(s.paused, ["a@getweberslink.com"]);
  assert.strictEqual(b1.sent.length, 0);
  assert.strictEqual(b2.sent.length, 10);
});

test("not ready (no postal address / placeholders) refuses to send", async () => {
  reset(); eng.importLeads(leads(2), CONFIG);
  const bad = { ...CONFIG, signature: { ...CONFIG.signature, postal_address: "" } };
  const box = fakeBox(0);
  const s = await eng.runOnce({ config: bad }, deps([box]));
  assert.ok(s.problems.some((p) => /postal_address/.test(p)));
  assert.strictEqual(box.sent.length, 0);
});

test("domains with no mail server are skipped; send_days is respected", async () => {
  reset(); eng.importLeads(leads(2), CONFIG);
  const box = fakeBox(0);
  await eng.runOnce({ config: CONFIG }, deps([box], { mx: async (d) => (d === "store0.com" ? "no" : "yes") }));
  const t = Object.fromEntries(store.loadTracking().map((x) => [x.email, x]));
  assert.strictEqual(t["owner0@store0.com"].status, "skipped-no-mailserver");
  assert.strictEqual(t["owner1@store1.com"].status, "active");

  reset(); eng.importLeads(leads(2), CONFIG);
  const weekdays = { ...CONFIG, sending: { ...CONFIG.sending, send_days: ["Mon"] } };
  const sun = fakeBox(0);
  const s = await eng.runOnce({ config: weekdays }, deps([sun], { now: () => new Date("2026-03-01T12:00:00Z") })); // a Sunday
  assert.strictEqual(sun.sent.length, 0);
  assert.strictEqual(s.sent, 0);
});

test("dashboard edits (loom_sent) survive a run, and config limits are enforced", async () => {
  reset(); eng.importLeads(leads(3), CONFIG);
  store.updateLead("owner2@store2.com", { loom_sent: "1" });
  await eng.runOnce({ config: CONFIG }, deps([fakeBox(0)]));
  assert.strictEqual(store.loadTracking().find((t) => t.email === "owner2@store2.com").loom_sent, "1");
  const c = eng.sanitizeConfig({ ...CONFIG, sending: { ...CONFIG.sending, daily_limit: 500, ramp: "5,500", bounce_pause_percent: 0 } });
  assert.strictEqual(c.sending.daily_limit, 40);
  assert.deepStrictEqual(c.sending.ramp, [5, 40]);
  assert.throws(() => eng.sanitizeConfig({ sending: { timezone: "Mars/Base" } }), /time zone/);
});

test("background run holds a lock and can be stopped", async () => {
  reset(); eng.importLeads(leads(6), CONFIG);
  eng.saveConfig({ ...CONFIG, sending: { ...CONFIG.sending, min_delay_seconds: 60, max_delay_seconds: 60 } });
  const box = fakeBox(0);
  const r = eng.startRun({ source: "test" }, { mailboxes: [box], mx: async () => "yes" });
  assert.ok(r.started);
  assert.strictEqual(eng.startRun({}, {}).started, false, "second run is refused");
  await new Promise((res) => setTimeout(res, 50));
  eng.requestStop();
  await r.done;
  assert.strictEqual(box.sent.length, 1, "stopped during the first wait");
  assert.strictEqual(eng.run.running, false);
  assert.ok(!fs.existsSync(path.join(DIR, "outreach.lock")));
});

test.after(() => fs.rmSync(DIR, { recursive: true, force: true }));
