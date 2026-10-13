const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "outreach-win-"));
process.env.OUTREACH_DATA_DIR = DIR;
const store = require("../outreach/store");
const eng = require("../outreach/engine");

const base = { signature: { name: "Hassan Ali", company: "WebersLink", website: "weberslink.org", postal_address: "1 Example St" }, mailboxes: [{ email: "box1@lookalike1.com" }] };
const mk = (sending) => eng.sanitizeConfig({ ...base, sending: { dry_run: false, timezone: "Asia/Karachi", send_days: ["Mon", "Tue", "Wed", "Thu", "Fri"], min_delay_seconds: 60, max_delay_seconds: 60, ramp: "40", daily_limit: 40, window_enabled: true, window_start: "19:00", window_end: "07:00", ...sending } });
const CFG = mk({});
const z = (iso) => new Date(iso);
const reset = () => { for (const f of fs.readdirSync(DIR)) fs.rmSync(path.join(DIR, f), { recursive: true, force: true }); };
const leads = (n) => Array.from({ length: n }, (_, i) => ({ Email: `o${i}@s${i}.com`, Store: `S${i}`, Country: "US", Category: "Apparel" }));
function harness(startIso) {
  const h = { t: Date.parse(startIso), times: [], scans: 0 };
  h.box = { id: 1, addr: "box1@lookalike1.com", async scanInbox() { h.scans++; return []; }, async send(m) { h.times.push(h.t); return { messageId: `<${h.times.length}@x>` }; }, close() {} };
  h.deps = { mailboxes: [h.box], sleep: async (ms) => { h.t += ms; }, mx: async () => "yes", now: () => new Date(h.t) };
  return h;
}

test("the window works across midnight, and the small hours belong to the evening that started them", () => {
  // Asia/Karachi is UTC+5: 19:00 there = 14:00Z
  assert.strictEqual(eng.inWindow(CFG, z("2026-03-02T14:00:00Z")), true, "19:00 opens");
  assert.strictEqual(eng.inWindow(CFG, z("2026-03-02T13:59:00Z")), false, "18:59 is closed");
  assert.strictEqual(eng.inWindow(CFG, z("2026-03-03T01:59:00Z")), true, "06:59 next morning is still open");
  assert.strictEqual(eng.inWindow(CFG, z("2026-03-03T02:00:00Z")), false, "07:00 closes");
  assert.strictEqual(eng.inWindow(CFG, z("2026-03-02T22:00:00Z")), true, "03:00 is open");
  assert.strictEqual(eng.campaignDate(CFG, z("2026-03-02T14:30:00Z")), "2026-03-02");
  assert.strictEqual(eng.campaignDate(CFG, z("2026-03-03T01:00:00Z")), "2026-03-02", "06:00 Tuesday is still Monday's campaign day");
  assert.strictEqual(eng.campaignDate(CFG, z("2026-03-03T05:00:00Z")), "2026-03-03", "10:00 Tuesday is Tuesday");
  // same-day window (09:00-17:00) and no window at all
  const day = mk({ window_start: "09:00", window_end: "17:00" });
  assert.deepStrictEqual([eng.inWindow(day, z("2026-03-02T04:00:00Z")), eng.inWindow(day, z("2026-03-02T12:00:00Z")), eng.inWindow(day, z("2026-03-02T05:00:00Z"))], [true, false, true]);
  const off = mk({ window_enabled: false });
  assert.strictEqual(eng.inWindow(off, z("2026-03-02T05:00:00Z")), true);
  assert.strictEqual(eng.campaignDate(off, z("2026-03-03T01:00:00Z")), "2026-03-03", "without a window nothing changes");
});

test("send days follow the campaign day: Friday evening continues into Saturday's small hours, Saturday evening does not", () => {
  const sd = (iso) => eng.isSendDay(CFG, z(iso));
  assert.strictEqual(sd("2026-03-06T15:00:00Z"), true, "Friday 20:00");
  assert.strictEqual(sd("2026-03-06T22:00:00Z"), true, "Saturday 03:00 belongs to Friday");
  assert.strictEqual(sd("2026-03-07T15:00:00Z"), false, "Saturday 20:00");
  assert.strictEqual(sd("2026-03-07T22:00:00Z"), false, "Sunday 03:00 belongs to Saturday");
  assert.strictEqual(sd("2026-03-08T15:00:00Z"), false, "Sunday 20:00");
  assert.strictEqual(sd("2026-03-09T15:00:00Z"), true, "Monday 20:00");
});

test("settings: window times are validated, default off, and start must differ from end", () => {
  assert.strictEqual(eng.sanitizeConfig({}).sending.window_enabled, false);
  assert.deepStrictEqual([eng.sanitizeConfig({}).sending.window_start, eng.sanitizeConfig({}).sending.window_end], ["19:00", "07:00"]);
  assert.strictEqual(mk({ window_start: "7:05" }).sending.window_start, "07:05");
  assert.strictEqual(mk({ window_start: "25:00" }).sending.window_start, "19:00", "nonsense falls back to the default");
  assert.strictEqual(mk({ window_end: "abc" }).sending.window_end, "07:00");
  assert.throws(() => mk({ window_start: "08:00", window_end: "08:00" }), /must be different/);
  assert.doesNotThrow(() => mk({ window_enabled: false, window_start: "08:00", window_end: "08:00" }), "only checked when the window is on");
});

test("the dashboard gets a plain window state", () => {
  assert.deepStrictEqual(eng.windowState(mk({ window_enabled: false }), z("2026-03-02T14:00:00Z")), { enabled: false });
  const open = eng.windowState(CFG, z("2026-03-02T16:00:00Z")); // 21:00 PKT
  assert.deepStrictEqual([open.open, open.minutesToClose, open.minutesToOpen, open.timezone], [true, 600, 0, "Asia/Karachi"]);
  const closed = eng.windowState(CFG, z("2026-03-02T10:00:00Z")); // 15:00 PKT
  assert.deepStrictEqual([closed.open, closed.minutesToOpen, closed.minutesToClose], [false, 240, 0]);
});

test("outside the window a live run reads the inbox but sends nothing; a dry run ignores the window", async () => {
  reset(); eng.importLeads(leads(5), CFG);
  const h = harness("2026-03-02T10:00:00Z"); // 15:00 PKT Monday: closed
  const s = await eng.runOnce({ config: CFG }, h.deps);
  assert.deepStrictEqual([s.sent, h.times.length, h.scans], [0, 0, 1]);
  assert.match(eng.run.lines.slice(-2).join("\n"), /outside the sending window; it opens in 4h 0m/);
  assert.ok(store.loadTracking().every((t) => t.status === "new"));
  const d = await eng.runOnce({ config: CFG, forceDry: true }, harness("2026-03-02T10:00:00Z").deps);
  assert.ok(d.sent > 0, "rehearsals are allowed any time");
});

test("inside the window the day's emails are spread over the whole window and all fit", async () => {
  reset(); eng.importLeads(leads(6), CFG);
  const h = harness("2026-03-02T14:00:00Z"); // 19:00 PKT: window just opened
  const open = h.t, close = Date.parse("2026-03-03T02:00:00Z"); // 07:00 PKT
  const s = await eng.runOnce({ config: CFG }, h.deps);
  assert.strictEqual(s.sent, 6);
  assert.strictEqual(h.times[0], open, "the first goes out as soon as the window opens");
  assert.ok(h.times.every((t) => t >= open && t < close), "every email goes out inside the window");
  const gaps = h.times.slice(1).map((t, i) => (t - h.times[i]) / 1000);
  assert.ok(gaps.every((g) => g >= 60), "never faster than the minimum delay");
  assert.ok(gaps[0] >= 0.6 * (43200 / 5) - 1 && gaps[0] <= 0.95 * (43200 / 5) + 1, `the first gap is a share of the window (${gaps[0]}s), not a burst`);
  assert.ok(h.times[5] - open > 6 * 3600 * 1000, "the emails really are spread out over many hours");
});

test("when the window closes with emails left, they wait for the next window and nothing is lost", async () => {
  reset(); eng.importLeads(leads(16), CFG);
  const tight = mk({ min_delay_seconds: 3600, max_delay_seconds: 3600 }); // at least an hour apart: only 12 fit in 12 hours
  const h = harness("2026-03-02T14:00:00Z");
  const s = await eng.runOnce({ config: tight }, h.deps);
  assert.strictEqual(s.sent, 12, "19:00, 20:00 ... 06:00");
  assert.match(eng.run.lines.join("\n"), /sending window closed; 4 email\(s\) wait for the next window/);
  assert.strictEqual(store.loadTracking().filter((t) => t.status === "new").length, 4, "the rest are still waiting, untouched");
});

test("one budget per campaign day, even though the window crosses midnight", async () => {
  reset(); eng.importLeads(leads(30), CFG);
  for (const date of ["2026-03-02T17:00:00Z", "2026-03-02T21:30:00Z"]) // 22:00 Mon and 02:30 Tue PKT: both Monday's campaign day
    store.appendSentLog({ date, mode: "live", mailbox: "box1@lookalike1.com", email: "x@y.com", store: "X", step: 1, variant: "a", subject: "s" });
  const cfg = mk({ ramp: "10", daily_limit: 10 });
  const h = harness("2026-03-02T22:00:00Z"); // 03:00 Tue PKT, inside the window
  const s = await eng.runOnce({ config: cfg }, h.deps);
  assert.strictEqual(s.sent, 8, "10 for the day minus the 2 already sent this campaign day, not a fresh 10 after midnight");
  const next = await eng.runOnce({ config: cfg }, harness("2026-03-03T14:00:00Z").deps); // Tuesday 19:00: a new campaign day
  assert.ok(next.sent > 0, "the next evening gets a new budget");
});

test.after(() => fs.rmSync(DIR, { recursive: true, force: true }));
