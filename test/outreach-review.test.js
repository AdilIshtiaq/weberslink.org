// Regression tests for the independent code review: each test reproduces a defect that was verified before the fix.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "outreach-rev-"));
process.env.OUTREACH_DATA_DIR = DIR;
process.env.ADMIN_PASSWORD = "review test password";
const store = require("../outreach/store");
const eng = require("../outreach/engine");
const mail = require("../outreach/mail");
const { simpleParser } = require("mailparser");

const CONFIG = eng.sanitizeConfig({
  signature: { name: "Hassan Ali", company: "WebersLink", website: "weberslink.org", postal_address: "1 Example St" },
  sending: { dry_run: false, send_days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], min_delay_seconds: 0, max_delay_seconds: 0, timezone: "UTC", notify_email: "me@example.com" },
  mailboxes: [{ email: "box1@lookalike1.com" }, { email: "box2@lookalike2.com" }],
});
function fakeBox(i, o = {}) {
  const b = { id: i + 1, addr: `box${i + 1}@lookalike${i + 1}.com`, sent: [], scanCalls: [], closed: false,
    async scanInbox(opts) { b.scanCalls.push(opts); if (o.onScan) await o.onScan(); return o.scan ? o.scan(opts) : []; },
    async send(msg) { if (o.onSend) await o.onSend(msg); if (o.fail) throw o.fail; b.sent.push(msg); return { messageId: `<m${b.sent.length}-${i}-${Math.random().toString(36).slice(2, 8)}@x>` }; },
    close() { b.closed = true; } };
  return b;
}
const reset = () => { for (const f of fs.readdirSync(DIR)) fs.rmSync(path.join(DIR, f), { recursive: true, force: true }); };
const lead = (i, extra = {}) => ({ Email: `o${i}@s${i}.com`, Store: `S${i}`, Country: "US", Category: "Apparel", ...extra });
const deps = (boxes, extra = {}) => ({ mailboxes: boxes, sleep: async () => {}, mx: async () => "yes", ...extra });
const rowOf = (email) => store.loadTracking().find((t) => t.email === email);
const raw = (from, subject, body, extra = "") => `From: ${from}\r\nTo: box1@lookalike1.com\r\nSubject: ${subject}\r\nMessage-ID: <${Math.random().toString(36).slice(2)}@x>\r\n${extra}Content-Type: text/plain\r\n\r\n${body}`;

test("F1: a lead marked do-not-contact during a run is NOT emailed", async () => {
  reset(); eng.importLeads([lead(1), lead(2), lead(3)], CONFIG);
  const box = fakeBox(0, { onSend: async () => { store.addSuppression("o2@s2.com"); store.updateLead("o3@s3.com", { status: "do-not-contact" }); } });
  await eng.runOnce({ config: { ...CONFIG, mailboxes: [CONFIG.mailboxes[0]] } }, deps([box]));
  assert.deepStrictEqual(box.sent.map((m) => m.to), ["o1@s1.com"]);
  assert.strictEqual(rowOf("o3@s3.com").status, "do-not-contact", "the run must not overwrite it back to active");
  assert.strictEqual(rowOf("o2@s2.com").status, "new", "status label catches up the next time the list loads...");
  eng.loadState(CONFIG);
  assert.strictEqual(rowOf("o2@s2.com").status, "do-not-contact", "...but the suppression list already protected it");
});

test("F2: imports and dashboard edits made while the inbox is being scanned survive the run", async () => {
  reset(); eng.importLeads([lead(1)], CONFIG);
  const box = fakeBox(0, { onScan: async () => { eng.importLeads([lead(9)], CONFIG); store.updateLead("o1@s1.com", { loom_sent: "1" }); } });
  await eng.runOnce({ config: { ...CONFIG, sending: { ...CONFIG.sending, dry_run: false } } }, deps([box]));
  assert.ok(rowOf("o9@s9.com"), "the late import is still there");
  assert.strictEqual(rowOf("o1@s1.com").loom_sent, "1");
});

test("F3: if saving after a send fails the run carries on, and the lead stays held (never re-sent)", async () => {
  reset(); eng.importLeads([lead(1), lead(2)], CONFIG);
  const box = fakeBox(0);
  const realSave = store.saveRow; let calls = 0;
  store.saveRow = (t) => { calls++; if (t.email === "o1@s1.com" && t.sending === "" && t.step === "1") throw new Error("disk full"); return realSave(t); };
  try { await eng.runOnce({ config: { ...CONFIG, mailboxes: [CONFIG.mailboxes[0]] } }, deps([box])); } finally { store.saveRow = realSave; }
  assert.deepStrictEqual(box.sent.map((m) => m.to), ["o1@s1.com", "o2@s2.com"], "run was not aborted");
  assert.strictEqual(rowOf("o1@s1.com").sending, "1", "still on hold");
  const box2 = fakeBox(0); await eng.runOnce({ config: { ...CONFIG, mailboxes: [CONFIG.mailboxes[0]] } }, deps([box2]));
  assert.ok(!box2.sent.some((m) => m.to === "o1@s1.com"), "not emailed twice");
  assert.strictEqual(store.readCsv("sent_log.csv").filter((r) => r.email === "o1@s1.com").length, 1, "sent log written right after the send");
});

test("F4: a positive reply whose quoted history (wrapped attribution + our unsubscribe footer) is not an opt-out", async () => {
  const wrapped = await mail.parseIncoming(await simpleParser(raw("Sara <sara@shop.com>", "Re: who answers shop.com at 2am?",
    "Yes please send the video!\r\n\r\nOn Tue, 3 Mar 2026 at 10:15, Hassan Ali <hassan@getweberslink.com>\r\nwrote:\r\n> Shoppers on shop.com...\r\n> Prefer not to hear from me? Reply \"unsubscribe\" and I'll take you off my list.\r\n", "In-Reply-To: <abc@x>\r\n")));
  assert.strictEqual(wrapped.fresh, "Yes please send the video!");
  const noAttribution = await mail.parseIncoming(await simpleParser(raw("Sara <sara@shop.com>", "Re: hi", "Sure, go ahead\r\n\r\n> Prefer not to hear from me? Reply \"unsubscribe\" and I'll take you off my list.\r\n", "In-Reply-To: <abc@x>\r\n")));
  const track = [{ email: "sara@shop.com", store: "Shop", domain: "shop.com", status: "active", step: "1", first_message_id: "<abc@x>", last_message_id: "<abc@x>" }];
  const out = eng.classify([wrapped, noAttribution], track, ["me@x.com"]);
  assert.deepStrictEqual(out.map((c) => c.kind), ["REPLIED"]);
  // and a genuine opt-out written above the quote still works
  const stop = await mail.parseIncoming(await simpleParser(raw("Sara <sara@shop.com>", "Re: hi", "Please remove me\r\n\r\n> old", "In-Reply-To: <abc@x>\r\n")));
  const t2 = [{ email: "sara@shop.com", store: "Shop", domain: "shop.com", status: "active", step: "1", first_message_id: "<abc@x>", last_message_id: "<abc@x>" }];
  assert.strictEqual(eng.classify([stop], t2, ["me@x.com"])[0].kind, "OPT-OUT");
  // the body test uses our own footer even if `fresh` was not cut
  const t3 = [{ email: "sara@shop.com", store: "Shop", domain: "shop.com", status: "active", step: "1", first_message_id: "", last_message_id: "" }];
  const m = { from: "sara@shop.com", from_raw: "S", subject: "Re: x", in_reply_to: "", references: "", body: "", fresh: "Yes!\n\nPrefer not to hear from me? Reply \"unsubscribe\" and I'll take you off my list." };
  assert.strictEqual(eng.classify([m], t3, [])[0].kind, "REPLIED");
});

test("F5: unmatched stop requests are caught and suppressed; newsletters are not; follow-ups never switch mailbox", async () => {
  reset(); eng.importLeads([lead(1)], CONFIG);
  const stopMail = { from: "assistant@other.com", from_raw: "A", subject: "Re: who answers s1.com at 2am?", in_reply_to: "<unknown@x>", references: "", body: "", fresh: "Please stop emailing us" };
  const newsletter = { from: "news@vendor.com", from_raw: "V", subject: "Our spring sale", in_reply_to: "", references: "", body: "", fresh: "Click here to unsubscribe" };
  const box = fakeBox(0, { scan: () => [stopMail, newsletter] });
  const s = await eng.runOnce({ config: { ...CONFIG, mailboxes: [CONFIG.mailboxes[0]] } }, deps([box]));
  assert.strictEqual(s.optOuts, 1);
  assert.ok(store.loadSuppression().has("assistant@other.com"));
  assert.ok(!store.loadSuppression().has("news@vendor.com"));
  assert.ok(box.sent.some((m) => /STOP REQUEST from assistant@other\.com/.test(m.text)), "owner is told");
  // a thread owned by a switched-off mailbox is not continued from another address
  reset(); eng.importLeads([lead(2)], CONFIG);
  const rows = store.loadTracking(); Object.assign(rows[0], { status: "active", step: "1", mailbox: "off@lookalike9.com", subject: "hi", first_message_id: "<a@x>", last_message_id: "<a@x>", last_sent: "2020-01-01T00:00:00Z" }); store.saveTracking(rows);
  const only = fakeBox(0);
  await eng.runOnce({ config: { ...CONFIG, mailboxes: [CONFIG.mailboxes[0]] } }, deps([only]));
  assert.strictEqual(only.sent.length, 0);
});

test("F8: delay notices are not bounces; permanent failures are; 4xx refusals are retried, 5xx are bounces", async () => {
  const track = () => [{ email: "a@gone.com", store: "G", domain: "gone.com", status: "active", step: "1" }];
  const delay = { from: "mailer-daemon@x.com", from_raw: "Mail Delivery <mailer-daemon@x.com>", subject: "Delivery Status Notification (Delay)", in_reply_to: "", references: "", body: "Delivery to a@gone.com has been delayed. We will keep trying.", fresh: "" };
  const hard = { ...delay, subject: "Undeliverable: hi", body: "Action: failed\nStatus: 5.1.1\nFinal-Recipient: rfc822; a@gone.com\nuser unknown" };
  assert.deepStrictEqual(eng.classify([delay], track(), []).map((c) => c.kind), []);
  assert.deepStrictEqual(eng.classify([hard], track(), []).map((c) => c.kind), ["BOUNCED"]);
  reset(); eng.importLeads([lead(1)], CONFIG);
  const cfg1 = { ...CONFIG, mailboxes: [CONFIG.mailboxes[0]] };
  await eng.runOnce({ config: cfg1 }, deps([fakeBox(0, { fail: Object.assign(new Error("greylisted"), { code: "EENVELOPE", responseCode: 451 }) })]));
  assert.strictEqual(rowOf("o1@s1.com").status, "new", "temporary refusal leaves the lead alone");
  assert.strictEqual(rowOf("o1@s1.com").sending, "");
  await eng.runOnce({ config: cfg1 }, deps([fakeBox(0, { fail: Object.assign(new Error("no such user"), { code: "EENVELOPE", responseCode: 550 }) })]));
  assert.strictEqual(rowOf("o1@s1.com").status, "bounced");
});

test("F9: mailboxes send side by side (each paces itself); a stale lock is taken over, a live one is respected", async () => {
  reset(); eng.importLeads([lead(1), lead(2), lead(3), lead(4)], CONFIG);
  const waits = [];
  const [a, b] = [fakeBox(0), fakeBox(1)];
  await eng.runOnce({ config: CONFIG }, deps([a, b], { sleep: async (ms) => { waits.push(ms); } }));
  assert.strictEqual(a.sent.length + b.sent.length, 4);
  assert.strictEqual(waits.length, 2, "one wait per mailbox (2 sends each), not one per email (would be 3)");
  // locks
  const lock = path.join(DIR, "outreach.lock");
  fs.writeFileSync(lock, "999999 old"); const old = new Date(Date.now() - 60 * 60 * 1000); fs.utimesSync(lock, old, old);
  eng.saveConfig(CONFIG);
  const r = eng.startRun({ source: "test", forceDry: true }, deps([fakeBox(0)])); assert.ok(r.started, "dead owner + old lock: taken over"); await r.done;
  fs.writeFileSync(lock, `${process.pid} live`);
  assert.strictEqual(eng.startRun({ forceDry: true }, deps([fakeBox(0)])).started, false, "fresh lock of a live process is respected");
  fs.unlinkSync(lock);
});

test("F10: mailbox ids are permanent; passwords only go to allowed hosts", () => {
  const mk = (list) => eng.sanitizeConfig({ mailboxes: list }).mailboxes.map((m) => [m.id, m.email]);
  assert.deepStrictEqual(mk([{ id: 2, email: "b@x.com" }, { id: 1, email: "a@x.com" }]), [[2, "b@x.com"], [1, "a@x.com"]]);
  assert.deepStrictEqual(mk([{ id: 2, email: "b@x.com" }]), [[2, "b@x.com"]], "removing mailbox 1 does not renumber mailbox 2");
  assert.deepStrictEqual(mk([{ id: 2, email: "b@x.com" }, { email: "n@x.com" }]), [[2, "b@x.com"], [1, "n@x.com"]], "new mailbox gets the lowest free id");
  assert.deepStrictEqual(mk([{ id: 1, email: "a@x.com" }, { id: 1, email: "dup@x.com" }]).map((x) => x[0]), [1, 2], "duplicate ids are repaired");
  assert.throws(() => eng.sanitizeConfig({ mailboxes: [{ email: "a@x.com", smtp_host: "evil.example.net" }] }), /isn't allowed/);
  assert.throws(() => eng.sanitizeConfig({ mailboxes: [{ email: "a@x.com", imap_host: "10.0.0.5" }] }), /isn't allowed/);
  assert.doesNotThrow(() => eng.sanitizeConfig({ mailboxes: [{ email: "a@x.com", smtp_host: "smtp.hostinger.com" }] }));
  process.env.OUTREACH_ALLOWED_HOSTS = "mail.mycompany.com, other.example.org";
  try { assert.doesNotThrow(() => eng.sanitizeConfig({ mailboxes: [{ email: "a@x.com", smtp_host: "mail.mycompany.com" }] })); } finally { delete process.env.OUTREACH_ALLOWED_HOSTS; }
});

test("F7 + F15: working files keep the real text; only downloads are formula-safe; odd addresses are refused", () => {
  reset();
  const res = eng.importLeads([lead(1, { "Owner Name": "-Ann Lee", Store: "+Plus Size" }), { Email: "evil,victim@target.com" }, { Email: "a b@x.com" }, { Email: "<x@y.com>" }, { Email: "ok@fine.co.uk" }], CONFIG);
  assert.deepStrictEqual([res.added, res.invalid], [2, 3]);
  assert.strictEqual(rowOf("o1@s1.com").first_name, "-Ann");
  assert.strictEqual(rowOf("o1@s1.com").store, "+Plus Size");
  const exported = store.exportCsv("tracking.csv");
  assert.match(exported, /'-Ann/); assert.match(exported, /'\+Plus Size/);
  assert.ok(!fs.readFileSync(path.join(DIR, "tracking.csv"), "utf8").includes("'-Ann"));
});

test("F12: the inbox is read incrementally (each message once) and tolerates the older array form", async () => {
  reset(); eng.importLeads([lead(1)], CONFIG);
  const box = fakeBox(0, { scan: (o) => ({ messages: [], maxUid: (o.afterUid || 100) + 5, uidValidity: 777 }) });
  const cfg1 = { ...CONFIG, mailboxes: [CONFIG.mailboxes[0]] };
  await eng.runOnce({ config: cfg1 }, deps([box]));
  await eng.runOnce({ config: cfg1 }, deps([box]));
  assert.deepStrictEqual(box.scanCalls.map((c) => [c.afterUid, c.uidValidity]), [[undefined, undefined], [105, 777]]);
  assert.strictEqual(store.readJson("mailboxes.json", {}).mailboxes["box1@lookalike1.com"].lastUid, 110);
});

test("F13: plain-text SMTP is never allowed on non-465 ports", () => {
  assert.strictEqual(new mail.Mailbox({ id: 1, email: "a@x.com", smtp_port: 587 }).smtp().options.requireTLS, true);
  assert.strictEqual(new mail.Mailbox({ id: 1, email: "a@x.com", smtp_port: 465 }).smtp().options.requireTLS, false);
});

test("F14: signing key is per-install and persistent; short admin passwords keep the feature off", () => {
  const k1 = store.sessionKey(), k2 = store.sessionKey();
  assert.ok(k1 && k1.length >= 64 && k1 === k2);
  assert.strictEqual(fs.statSync(path.join(DIR, "session.key")).mode & 0o077, 0, "key file is private to the owner");
  const saved = process.env.ADMIN_PASSWORD;
  try {
    process.env.ADMIN_PASSWORD = "short-pw9";
    delete require.cache[require.resolve("../outreach/index")];
    assert.strictEqual(require("../outreach/index").enabled, false);
  } finally { process.env.ADMIN_PASSWORD = saved; delete require.cache[require.resolve("../outreach/index")]; }
});

test("F6: faking X-Forwarded-For does not bypass the per-IP limit, and bad guesses from many addresses never lock the owner out", async () => {
  const outreach = require("../outreach/index");
  const server = http.createServer((req, res) => { if (!outreach.handle(req, res)) { res.writeHead(404); res.end(); } });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = (pw, ip, fake) => fetch(base + "/api/outreach/login", { method: "POST", headers: { "Content-Type": "application/json", "X-Forwarded-For": `${fake || "6.6.6.6"}, ${ip}` }, body: JSON.stringify({ password: pw }) });
  try {
    let last;
    for (let i = 0; i < 6; i++) last = await login("wrong-password-" + i, "7.7.7.7", `1.1.1.${i}`); // changes only the client-controlled first entry
    assert.strictEqual(last.status, 429, "same real IP is blocked despite the rotating fake entry");
    // 25 failures from 25 different real addresses: the global slow-down starts, but the real password still works
    for (let i = 0; i < 25; i++) await login("nope-nope-" + i, `8.8.8.${i}`);
    const t0 = Date.now();
    const ok = await login(process.env.ADMIN_PASSWORD, "9.9.9.9");
    assert.strictEqual(ok.status, 200, "owner is not locked out");
    assert.ok(Date.now() - t0 >= 1400, "but each attempt is slowed down");
  } finally { server.close(); }
});

test("the dashboard script is valid JavaScript and the page loads it as an external file (CSP-friendly)", () => {
  const js = fs.readFileSync(path.join(__dirname, "..", "public", "admin", "outreach.js"), "utf8");
  assert.doesNotThrow(() => new (require("vm").Script)(js), "outreach.js must parse");
  const html = fs.readFileSync(path.join(__dirname, "..", "public", "admin", "outreach.html"), "utf8");
  assert.ok(html.includes('<script src="/admin/outreach.js"></script>'));
  assert.ok(!/<script>(?!\s*<\/script>)/.test(html), "no inline scripts (the CSP forbids them)");
  assert.ok(!/\son(click|change|submit|load|error)=/i.test(html), "no inline event handlers");
});

test.after(() => fs.rmSync(DIR, { recursive: true, force: true }));
