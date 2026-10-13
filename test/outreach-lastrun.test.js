const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "outreach-last-"));
process.env.OUTREACH_DATA_DIR = DIR;
const store = require("../outreach/store");
const eng = require("../outreach/engine");

const mk = (sending = {}, boxes = [{ email: "box1@lookalike1.com" }]) => eng.sanitizeConfig({
  signature: { name: "Hassan Ali", company: "WebersLink", website: "weberslink.org", postal_address: "1 Example St" },
  sending: { dry_run: false, timezone: "UTC", send_days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], min_delay_seconds: 0, max_delay_seconds: 0, ramp: "40", daily_limit: 40, ...sending }, mailboxes: boxes });
const reset = () => { for (const f of fs.readdirSync(DIR)) fs.rmSync(path.join(DIR, f), { recursive: true, force: true }); };
const leads = (n) => Array.from({ length: n }, (_, i) => ({ Email: `o${i}@s${i}.com`, Store: `S${i}`, Country: "US", Category: "Apparel" }));
const box = (o = {}) => ({ id: 1, addr: "box1@lookalike1.com", sent: [], async scanInbox() { if (o.scanFail) throw new Error("login failed"); return []; }, async send(m) { if (o.sendFail) throw Object.assign(new Error("Invalid login"), { code: "EAUTH" }); this.sent.push(1); return { messageId: `<${Math.random()}@x>` }; }, close() {} });
const deps = (b, extra = {}) => ({ mailboxes: [b], sleep: async () => {}, mx: async () => "yes", ...extra });

test("every way a run can end says why, in plain words", async () => {
  CFG: {
    reset();
    // 1. not ready
    let s = await eng.runOnce({ config: mk({}, [{ email: "box1@lookalike1.com" }]) && { ...mk(), signature: { ...mk().signature, postal_address: "" } } }, deps(box()));
    assert.match(s.reason, /^Not ready, nothing sent: .*postal_address/);
    // 2. no leads waiting
    s = await eng.runOnce({ config: mk() }, deps(box()));
    assert.match(s.reason, /no leads are waiting/);
    // 3. a good run
    eng.importLeads(leads(3), mk());
    s = await eng.runOnce({ config: mk() }, deps(box()));
    assert.strictEqual(s.reason, "Sent 3 emails.");
    // 4. daily limit already used
    reset(); eng.importLeads(leads(5), mk());
    store.appendSentLog({ date: new Date().toISOString(), mode: "live", mailbox: "box1@lookalike1.com", email: "x@y.com", store: "X", step: 1, variant: "a", subject: "s" });
    s = await eng.runOnce({ config: mk({ ramp: "1", daily_limit: 1 }) }, deps(box()));
    assert.match(s.reason, /every mailbox has used its limit for today/);
    // 5. not a send day
    reset(); eng.importLeads(leads(2), mk());
    const never = mk({ send_days: ["Mon"] });
    s = await eng.runOnce({ config: never }, deps(box(), { now: () => new Date("2026-03-01T12:00:00Z") })); // a Sunday
    assert.match(s.reason, /isn't one of your send days/);
  }
});

test("a closed sending window is spelled out (the case that looked like 'it runs for 30 seconds and stops')", async () => {
  reset(); eng.importLeads(leads(3), mk());
  // window 19:00-07:00 in New York; it is 10:44 in New York (19:44 in Pakistan)
  const cfg = mk({ timezone: "America/New_York", window_enabled: true, window_start: "19:00", window_end: "07:00" });
  const b = box();
  const s = await eng.runOnce({ config: cfg }, deps(b, { now: () => new Date("2026-10-13T14:44:00Z") }));
  assert.match(s.reason, /^Nothing sent: outside the sending window \(19:00-07:00 America\/New_York\); it opens in 8h 16m\. The inbox was checked\./);
  assert.strictEqual(b.sent.length, 0, "nothing was sent");
});

test("a mailbox that can't send says which one and why; a stop request is reported", async () => {
  reset(); eng.importLeads(leads(3), mk());
  let s = await eng.runOnce({ config: mk() }, deps(box({ sendFail: true })));
  assert.match(s.reason, /^Nothing sent\. Problem: box1@lookalike1\.com stopped: EAUTH Invalid login\./);
  reset(); eng.importLeads(leads(4), mk());
  const b = box(); const orig = b.send; b.send = async function (m) { const r = await orig.call(this, m); eng.requestStop(); return r; };
  s = await eng.runOnce({ config: mk() }, deps(b));
  assert.match(s.reason, /^Stopped by you\. Sent 1 first\./);
  eng.run.stop = false;
  reset(); eng.importLeads(leads(2), mk());
  s = await eng.runOnce({ config: mk({ dry_run: true }) }, deps(box()));
  assert.strictEqual(s.reason, "Dry run: planned 2 emails.");
});

test("inbox trouble stops the run with an actionable reason", async () => {
  reset(); eng.importLeads(leads(2), mk());
  const s = await eng.runOnce({ config: mk() }, deps(box({ scanFail: true })));
  assert.match(s.reason, /^Stopped for safety: could not read the inbox of box1@lookalike1\.com \(login failed\)\. Check its password \(OUTREACH_PASSWORD_1\)/);
});

test("the last run is saved to disk, and a run cut off by a restart is reported as interrupted", async () => {
  reset(); eng.importLeads(leads(2), mk());
  eng.saveConfig(mk({ dry_run: true }));
  const r = eng.startRun({ source: "test" }, deps(box()));
  assert.strictEqual(eng.readLastRun().status, "running");
  await r.done;
  const done = eng.readLastRun();
  assert.deepStrictEqual([done.status, done.mode, done.source, done.sent], ["done", "dry", "test", 2]);
  assert.strictEqual(done.reason, "Dry run: planned 2 emails.");
  // simulate a restart in the middle of a run
  store.writeJson("last_run.json", { status: "running", at: "2026-10-13T10:00:00Z", startedAt: "2026-10-13T10:00:00Z", source: "dashboard", mode: "live", reason: "Running now." });
  eng.markInterrupted();
  const cut = eng.readLastRun();
  assert.strictEqual(cut.status, "interrupted");
  assert.match(cut.reason, /server was restarted or stopped while this run was in progress/);
  assert.strictEqual(eng.status(mk()).lastRun.status, "interrupted", "the dashboard gets it");
});

test("after a restart the dashboard log still shows history, read from the log file", () => {
  reset();
  store.appendLog("[2026-10-13 14:40:00] === Run start v2.3 (LIVE)");
  store.appendLog("[2026-10-13 14:40:03] === Run end - outside the sending window");
  eng.run.lines.length = 0; // a fresh process has nothing in memory
  assert.deepStrictEqual(eng.logTail(10), ["[2026-10-13 14:40:00] === Run start v2.3 (LIVE)", "[2026-10-13 14:40:03] === Run end - outside the sending window"]);
  assert.strictEqual(eng.status(mk()).log.length, 2);
  assert.deepStrictEqual(eng.logTail(1), ["[2026-10-13 14:40:03] === Run end - outside the sending window"]);
  fs.rmSync(store.P("run_log.txt")); assert.deepStrictEqual(eng.logTail(5), [], "no log file is fine");
});

test.after(() => fs.rmSync(DIR, { recursive: true, force: true }));
