const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const net = require("net");
const http = require("http");
const path = require("path");

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "outreach-deliver-"));
process.env.OUTREACH_DATA_DIR = DIR;
process.env.ADMIN_PASSWORD = "correct-horse-battery";
process.env.OUTREACH_PUBLIC_URL = "https://weberslink.org";
delete process.env.GEMINI_OUTREACH_KEY; delete process.env.GEMINI_API_KEY;
const store = require("../outreach/store");
const eng = require("../outreach/engine");
const unsub = require("../outreach/unsub");
const warmup = require("../outreach/warmup");
const verify = require("../outreach/verify");
const cleaner = require("../outreach/cleaner");
const { Mailbox } = require("../outreach/mail");
const outreach = require("../outreach/index");

test.after(() => fs.rmSync(DIR, { recursive: true, force: true }));
const reset = () => { for (const f of fs.readdirSync(DIR)) fs.rmSync(path.join(DIR, f), { recursive: true, force: true }); };
const lead = (o) => Object.assign(Object.fromEntries(store.TRACK_FIELDS.map((f) => [f, ""])), o);
const CONFIG = eng.sanitizeConfig({
  signature: { name: "Hassan Ali", title: "Founder", company: "WebersLink", website: "weberslink.org", postal_address: "1 Example St" },
  sending: { dry_run: false, timezone: "UTC", send_days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] },
  mailboxes: [{ email: "hassan@weberslink.org" }],
});

// ------------------------------------------------------------ one-click unsubscribe
test("cold emails carry the RFC 8058 one-click pair when an https address exists, mailto only otherwise", () => {
  reset();
  const box = new Mailbox({ id: 1, email: "hassan@weberslink.org", from_name: "Hassan" });
  const url = unsub.urlFor("Owner@Shop.com", CONFIG);
  assert.match(url, /^https:\/\/weberslink\.org\/u\/[A-Za-z0-9_-]+\.[0-9a-f]{24}$/);
  const m = box.build({ to: "owner@shop.com", subject: "s", text: "t", unsubscribeUrl: url });
  assert.strictEqual(m.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  assert.match(m.headers["List-Unsubscribe"], /^<https:\/\/weberslink\.org\/u\/.+>, <mailto:hassan@weberslink\.org\?subject=unsubscribe>$/);
  const plain = box.build({ to: "o@shop.com", subject: "s", text: "t" });
  assert.deepStrictEqual(Object.keys(plain.headers), ["List-Unsubscribe"]);
  assert.deepStrictEqual(box.build({ to: "o@shop.com", subject: "s", text: "t", listUnsubscribe: false }).headers, {}, "personal replies carry none");
  assert.strictEqual(box.build({ to: "o@shop.com", subject: "s", text: "t", unsubscribeUrl: "http://evil.example/u/x" }).headers["List-Unsubscribe-Post"], undefined, "plain http is never used");
  assert.strictEqual(box.build({ to: "a@b.com", subject: "s", text: "t", listUnsubscribe: false, warmup: "tok" }).headers["X-Warmup"], "tok");
});

test("unsubscribe tokens can't be forged or reused for another address", () => {
  reset();
  const url = unsub.urlFor("owner@shop.com", CONFIG), token = url.split("/u/")[1];
  assert.strictEqual(unsub.parse(token), "owner@shop.com");
  const [b64, mac] = token.split(".");
  assert.strictEqual(unsub.parse(b64 + "." + "0".repeat(24)), null);
  const other = Buffer.from("victim@shop.com").toString("base64url");
  assert.strictEqual(unsub.parse(other + "." + mac), null, "a valid mac for one address is useless for another");
  assert.strictEqual(unsub.parse("garbage"), null);
  assert.strictEqual(unsub.urlFor("not-an-email", CONFIG), "");
  assert.strictEqual(unsub.urlFor("owner@shop.com", { signature: { website: "" } }, {}), "", "no site address: no https link");
});

test("GET only asks for confirmation; POST unsubscribes, suppresses and stops the sequence; bad tokens 404", async () => {
  reset();
  store.saveTracking([lead({ email: "owner@shop.com", status: "active", step: "1" }), lead({ email: "b@shop2.com", status: "bounced" })]);
  const server = http.createServer((req, res) => { if (!outreach.handle(req, res)) { res.writeHead(404); res.end(); } });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const path1 = new URL(unsub.urlFor("owner@shop.com", CONFIG)).pathname;
    const g = await fetch(base + path1);
    assert.strictEqual(g.status, 200);
    assert.match(await g.text(), /<form method="post">/);
    assert.strictEqual(store.loadTracking()[0].status, "active", "a mail scanner opening the link changes nothing");
    const p = await fetch(base + path1, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "List-Unsubscribe=One-Click" });
    assert.strictEqual(p.status, 200);
    assert.match(await p.text(), /unsubscribed/);
    assert.strictEqual(store.loadTracking()[0].status, "unsubscribed");
    assert.ok(store.loadSuppression().has("owner@shop.com"));
    await fetch(base + new URL(unsub.urlFor("b@shop2.com", CONFIG)).pathname, { method: "POST" });
    assert.strictEqual(store.loadTracking()[1].status, "bounced", "a bounced lead keeps its status");
    assert.strictEqual((await fetch(base + "/u/bogus.token", { method: "POST" })).status, 404);
  } finally { server.close(); }
});

test("live sends include the unsubscribe URL for that lead", async () => {
  reset();
  eng.importLeads([{ Email: "o@shop.com", Store: "Shop", Website: "shop.com", Country: "United States" }], CONFIG);
  const sent = [];
  const box = { id: 1, addr: "hassan@weberslink.org", async send(m) { sent.push(m); return { messageId: "<1@x>" }; }, async scanInbox() { return []; }, close() {}, hasPassword: () => true };
  await eng.runOnce({ config: CONFIG }, { mailboxes: [box], sleep: async () => {}, mx: async () => "yes" });
  assert.strictEqual(unsub.parse(sent[0].unsubscribeUrl.split("/u/")[1]), "o@shop.com");
});

// ------------------------------------------------------------ warm-up
function warmBox(addr, name, inbox = []) {
  const b = { addr, name, sent: [], inbox, hasPassword: () => true, closed: false,
    async send(m) { b.sent.push(m); return { messageId: "<w@x>" }; }, async warmupSweep() { const x = b.inbox; b.inbox = []; return x; }, close() {} };
  return b;
}
const WCFG = (o = {}) => ({ sending: { timezone: "UTC" }, warmup: { enabled: true, per_day: 4, reply_percent: 100, ...o } });
const noon = new Date("2026-11-17T12:00:00Z");

test("warm-up: each mailbox sends to the others up to its daily share, tagged and logged as warm-up, never as a cold send", async () => {
  reset();
  const boxes = [warmBox("a@x.com", "Adil"), warmBox("b@x.com", "Hassan"), warmBox("c@x.com", "Sienna")];
  let slept = 0;
  const run = () => warmup.tick({ cfg: WCFG(), boxes, now: noon, rand: () => 0.3, sleep: async () => { slept++; } });
  const r1 = await run(), r2 = await run(), r3 = await run();
  assert.strictEqual(r1.sent, 6, "two per mailbox per pass");
  assert.strictEqual(r2.sent, 6);
  assert.strictEqual(r3.sent, 0, "4 a day each is the limit");
  assert.ok(slept > 0);
  for (const b of boxes) {
    assert.strictEqual(b.sent.length, 4);
    for (const m of b.sent) { assert.ok(m.warmup); assert.strictEqual(m.listUnsubscribe, false); assert.notStrictEqual(m.to, b.addr); assert.ok(boxes.some((o) => o.addr === m.to)); assert.match(m.text, /^Hi \w+,/); }
  }
  assert.ok(store.readCsv("sent_log.csv").every((r) => r.mode === "warmup"));
  const done = eng.status(CONFIG);
  assert.strictEqual(done.mailboxes[0].sentToday, 0, "warm-up mail never uses the cold-email budget");
});

test("warm-up: reads and rescues incoming warm-up mail, answers in the thread, records placement (a free inbox-placement test)", async () => {
  reset();
  const b = warmBox("b@x.com", "Hassan", [
    { folder: "inbox", from: "a@x.com", subject: "Checking in", messageId: "<m1@x>", token: "t1", isReply: false },
    { folder: "spam", from: "a@x.com", subject: "Notes from today", messageId: "<m2@x>", token: "t2", isReply: false },
    { folder: "inbox", from: "a@x.com", subject: "Re: Checking in", messageId: "<m3@x>", token: "t1", isReply: true },
    { folder: "inbox", from: "stranger@elsewhere.com", subject: "hello", messageId: "<m4@x>", token: "t9", isReply: false },
  ]);
  const a = warmBox("a@x.com", "Adil");
  const r = await warmup.tick({ cfg: WCFG({ per_day: 1 }), boxes: [a, b], now: noon, rand: () => 0.1, sleep: async () => {} });
  assert.deepStrictEqual([r.inbox, r.spam], [2, 1], "strangers are ignored");
  assert.strictEqual(r.replied, 1, "replies are capped by the daily share, and replies to replies are not answered");
  const reply = b.sent.find((m) => m.inReplyTo);
  assert.strictEqual(reply.inReplyTo, "<m1@x>");
  assert.strictEqual(reply.to, "a@x.com");
  assert.match(reply.subject, /^Re: /);
  assert.strictEqual(reply.warmup, "t1");
  const pl = warmup.status(noon).placement["b@x.com"];
  assert.deepStrictEqual([pl.inbox, pl.spam], [2, 1]);
});

test("warm-up respects its switch, daytime hours, and needs two mailboxes; one failing mailbox doesn't stop the others", async () => {
  reset();
  const boxes = [warmBox("a@x.com", "A"), warmBox("b@x.com", "B")];
  assert.match((await warmup.tick({ cfg: WCFG({ enabled: false }), boxes, now: noon, sleep: async () => {} })).skipped, /off/);
  assert.match((await warmup.tick({ cfg: WCFG(), boxes, now: new Date("2026-11-17T03:00:00Z"), sleep: async () => {} })).skipped, /daytime/);
  assert.match((await warmup.tick({ cfg: WCFG(), boxes: [boxes[0]], now: noon, sleep: async () => {} })).skipped, /two mailboxes/);
  assert.strictEqual((await warmup.tick({ cfg: WCFG({ enabled: false }), boxes, now: new Date("2026-11-17T03:00:00Z"), force: true, rand: () => 0.5, sleep: async () => {} })).sent, 4, "a manual run ignores the switch and the hours");
  reset();
  const bad = warmBox("a@x.com", "A"); bad.send = async () => { throw new Error("smtp down"); };
  const good = warmBox("b@x.com", "B");
  const r = await warmup.tick({ cfg: WCFG(), boxes: [bad, good], now: noon, rand: () => 0.5, sleep: async () => {} });
  assert.strictEqual(r.sent, 2);
  const unreadable = warmBox("c@x.com", "C"); unreadable.warmupSweep = async () => { throw new Error("imap down"); };
  await assert.doesNotReject(warmup.tick({ cfg: WCFG(), boxes: [unreadable, good], now: noon, rand: () => 0.5, sleep: async () => {} }));
});

test("health score drops with warm-up mail landing in spam", () => {
  reset();
  store.writeJson("warmup.json", { days: {}, placement: { "a@x.com": { inbox: 5, spam: 5, last: "" }, "b@x.com": { inbox: 2, spam: 2, last: "" } } });
  assert.strictEqual(warmup.spamRate("a@x.com"), 0.5);
  assert.strictEqual(warmup.spamRate("b@x.com"), 0, "too few samples to judge");
  assert.ok(eng.healthScore({ spamRate: 0.5 }) <= 70);
});

// ------------------------------------------------------------ SMTP verification
function fakeSmtp(rules) {
  const server = net.createServer((s) => {
    s.write("220 fake ESMTP\r\n");
    let buf = "";
    s.on("data", (d) => {
      buf += d.toString();
      for (let i; (i = buf.indexOf("\r\n")) >= 0; ) {
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        if (/^EHLO/i.test(line)) s.write("250-fake\r\n250 8BITMIME\r\n");
        else if (/^MAIL/i.test(line)) s.write("250 ok\r\n");
        else if (/^RCPT/i.test(line)) s.write(rules(line.match(/<(.+)>/)[1]) + "\r\n");
        else if (/^QUIT/i.test(line)) { s.end("221 bye\r\n"); }
      }
    });
    s.on("error", () => {});
  });
  return new Promise((r) => server.listen(0, "127.0.0.1", () => r({ server, port: server.address().port })));
}
const mxTo = () => [{ exchange: "127.0.0.1", priority: 10 }];

test("SMTP verification tells valid, invalid, catch-all and unknown apart, and never sends mail", async () => {
  const seen = [];
  const { server, port } = await fakeSmtp((to) => { seen.push(to); return to.endsWith("@catchall.com") ? "250 ok" : to.startsWith("good@") ? "250 ok" : to.startsWith("zz-") ? "550 5.1.1 no such user" : to.startsWith("gone@") ? "550 5.1.1 User unknown" : to.startsWith("grey@") ? "451 4.7.1 greylisted" : to.startsWith("block@") ? "550 5.7.1 blocked by spam policy" : "250 ok"; });
  const p = (e) => verify.probe(e, { mxLookup: mxTo, port, fromDomain: "weberslink.org", timeoutMs: 3000 });
  try {
    assert.strictEqual(await p("good@shop.com"), "valid");
    assert.strictEqual(await p("gone@shop.com"), "invalid");
    assert.strictEqual(await p("grey@shop.com"), "unknown");
    assert.strictEqual(await p("block@shop.com"), "unknown", "a policy block says nothing about the mailbox");
    assert.strictEqual(await p("anyone@catchall.com"), "catch-all");
    assert.ok(seen.some((x) => x.startsWith("zz-")), "a random address is tried to detect catch-all");
  } finally { server.close(); }
  assert.strictEqual(await verify.probe("a@b.com", { mxLookup: mxTo, port: 1, timeoutMs: 500 }), "unknown", "port closed");
  assert.strictEqual(await verify.probe("a@b.com", { mxLookup: async () => { throw new Error("nxdomain"); } }), "unknown");
});

test("list cleaner with SMTP: invalid mailboxes are set aside, catch-all and valid are noted, unknown changes nothing; off by default", async () => {
  reset();
  eng.importLeads([["good", "shop1.com"], ["gone", "shop2.com"], ["any", "shop3.com"], ["grey", "shop4.com"], ["free", "gmail.com"]].map(([u, d]) => ({ Email: `${u}@${d}`, Store: u, Website: d, Country: "United States" })), CONFIG);
  const answers = { "good@shop1.com": "valid", "gone@shop2.com": "invalid", "any@shop3.com": "catch-all", "grey@shop4.com": "unknown" };
  const asked = [];
  let s = cleaner.startScan({ mx: async () => "yes" }); await s.done;
  assert.strictEqual(cleaner.jobStatus().result.counts.smtpInvalid, undefined, "no SMTP phase unless asked");
  s = cleaner.startScan({ mx: async () => "yes", smtp: async (e) => { asked.push(e); return answers[e]; } }); await s.done;
  const c = cleaner.jobStatus().result.counts;
  assert.deepStrictEqual([c.smtpInvalid, c.catchAll], [1, 1]);
  assert.ok(!asked.includes("free@gmail.com"), "free-mail providers are not probed");
  cleaner.applyScan();
  const by = Object.fromEntries(store.loadTracking().map((t) => [t.email, t]));
  assert.strictEqual(by["gone@shop2.com"].status, cleaner.SKIPPED);
  assert.match(by["gone@shop2.com"].note, /does not exist/);
  assert.strictEqual(by["any@shop3.com"].status, "new");
  assert.strictEqual(by["any@shop3.com"].smtp, "catch-all");
  assert.strictEqual(by["good@shop1.com"].smtp, "valid");
  assert.strictEqual(by["grey@shop4.com"].smtp, "");
  assert.strictEqual(by["grey@shop4.com"].status, "new");
});

// ------------------------------------------------------------ API
test("API: new endpoints are behind login; copy check, outcomes, snooze clearing and AI status work", async () => {
  reset();
  store.saveTracking([lead({ email: "a@shop.com", status: "replied", snooze_until: "2030-01-01" })]);
  const server = http.createServer((req, res) => { if (!outreach.handle(req, res)) { res.writeHead(404); res.end(); } });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (m, u, b, c) => fetch(base + u, { method: m, headers: { "Content-Type": "application/json", ...(c ? { Cookie: c } : {}) }, body: b === undefined ? undefined : JSON.stringify(b) }).then(async (r) => ({ status: r.status, json: await r.json() }));
  try {
    for (const [m, u] of [["POST", "/api/outreach/templates/check"], ["GET", "/api/outreach/ai/status"], ["POST", "/api/outreach/ai/draft"], ["POST", "/api/outreach/ai/score/start"], ["POST", "/api/outreach/ai/objections"], ["POST", "/api/outreach/warmup/run"]]) {
      assert.strictEqual((await call(m, u, m === "GET" ? undefined : {})).status, 401, u);
    }
    const login = await fetch(base + "/api/outreach/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: process.env.ADMIN_PASSWORD }) });
    const cookie = login.headers.get("set-cookie").split(";")[0];
    const chk = await call("POST", "/api/outreach/templates/check", { text: "Subject: ACT NOW LIMITED TIME\n\nHi {first_name}, buy now.", step: 1 }, cookie);
    assert.strictEqual(chk.status, 200);
    assert.ok(chk.json.issues.length >= 2);
    const noAi = await call("POST", "/api/outreach/templates/check", { text: "Subject: Hello there\n\nHi, a short note.", ai: true }, cookie);
    assert.ok(noAi.json.aiError, "AI review reports why it can't run instead of failing");
    assert.strictEqual((await call("POST", "/api/outreach/leads/action", { email: "a@shop.com", action: "meeting_booked" }, cookie)).status, 200);
    assert.strictEqual(store.loadTracking()[0].outcome, "meeting_booked");
    await call("POST", "/api/outreach/leads/action", { email: "a@shop.com", action: "clear_snooze" }, cookie);
    assert.strictEqual(store.loadTracking()[0].snooze_until, "");
    const st = await call("GET", "/api/outreach/ai/status", undefined, cookie);
    assert.strictEqual(st.json.configured, false);
    assert.strictEqual((await call("POST", "/api/outreach/ai/draft", { email: "nobody@x.com" }, cookie)).status, 404);
    assert.strictEqual((await call("POST", "/api/outreach/ai/score/start", {}, cookie)).status, 400, "no key / no ICP: a clear error, not a crash");
    const status = await call("GET", "/api/outreach/status", undefined, cookie);
    assert.ok(status.json.analytics && status.json.warmup && status.json.ai);
  } finally { server.close(); }
});
