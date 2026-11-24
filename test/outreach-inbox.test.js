const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "outreach-inbox-"));
process.env.OUTREACH_DATA_DIR = DIR;
process.env.ADMIN_PASSWORD = "correct horse battery";
const store = require("../outreach/store");
const eng = require("../outreach/engine");
const outreach = require("../outreach");

const CONFIG = eng.sanitizeConfig({
  signature: { name: "Hassan Ali", title: "Founder", company: "WebersLink", website: "weberslink.org", postal_address: "1 Example St, Lahore" },
  sending: { dry_run: true, check_inbox_in_dry_run: true, send_days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], min_delay_seconds: 0, max_delay_seconds: 0, countries: ["US", "UK"], timezone: "UTC", notify_email: "me@example.com", ramp: "10,20,30,40", daily_limit: 40 },
  mailboxes: [{ email: "a@getweberslink.com", from_name: "Hassan" }],
});
const lead = (o) => Object.assign(Object.fromEntries(store.TRACK_FIELDS.map((f) => [f, ""])), o);

let server, base, cookie = "";
test.before(async () => {
  server = http.createServer((req, res) => { if (!outreach.handle(req, res)) { res.writeHead(404); res.end("no"); } });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => { server.close(); fs.rmSync(DIR, { recursive: true, force: true }); });

async function api(method, url, body) {
  const res = await fetch(base + url, { method, headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { res, json: await res.json().catch(() => null) };
}
const fakeBox = (found, o = {}) => ({ addr: "a@getweberslink.com", hasPassword: () => !o.noPassword, close() {}, async findReplyFrom() { if (o.fail) throw o.fail; return found; } });

test("a reply's message is saved on the lead and shown in the inbox list, with the AI off", async () => {
  store.saveTracking([lead({ email: "owner@shop.com", store: "Shop", domain: "shop.com", status: "active", step: "1", mailbox: "a@getweberslink.com", first_message_id: "<id-1>", last_message_id: "<id-1>", subject: "Your site" })]);
  const inbox = [{ from: "owner@shop.com", from_raw: "Owner <owner@shop.com>", subject: "Re: Your site", in_reply_to: "<id-1>", references: "", body: "full", fresh: "Yes please send the video.\n\nI am free on Friday." }];
  const box = { id: 1, addr: "a@getweberslink.com", sent: [], async send() { return { messageId: "<x@x>" }; }, async scanInbox() { return inbox; }, close() {} };
  await eng.runOnce({ config: CONFIG }, { mailboxes: [box], sleep: async () => {}, mx: async () => "yes" });
  const row = store.loadTracking().find((t) => t.email === "owner@shop.com");
  assert.strictEqual(row.status, "replied");
  assert.strictEqual(row.reply_text, "Yes please send the video.\n\nI am free on Friday.");
  assert.strictEqual(row.reply_subject, "Re: Your site");
  assert.strictEqual(row.reply_snippet, "Yes please send the video. I am free on Friday.");
  const listed = eng.status(CONFIG, new Date()).replied.find((r) => r.email === "owner@shop.com");
  assert.strictEqual(listed.text, row.reply_text);
  assert.strictEqual(listed.replySubject, "Re: Your site");
});

test("replyFields trims, limits and normalises what is stored", () => {
  const f = eng.replyFields({ text: "  Hello\r\nthere  ", subject: "Re:   hi\nthere", snippet: "" });
  assert.deepStrictEqual(f, { reply_snippet: "Hello there", reply_text: "Hello\nthere", reply_subject: "Re: hi there" });
  assert.strictEqual(eng.replyFields({ text: "x".repeat(5000) }).reply_text.length, 3000);
  assert.strictEqual(eng.replyFields({ text: "y".repeat(900) }).reply_snippet.length, 300);
});

test("fetchReplyMessage returns what was saved without touching the mailbox", async () => {
  store.saveTracking([lead({ email: "a@shop.com", status: "replied", mailbox: "a@getweberslink.com", reply_text: "Saved text", reply_subject: "Re: x" })]);
  const out = await eng.fetchReplyMessage("A@shop.com", CONFIG, { mailboxes: [fakeBox(null, { fail: new Error("must not be called") })] });
  assert.deepStrictEqual(out, { text: "Saved text", subject: "Re: x", stored: true });
});

test("an older reply with no saved text is read from its mailbox, then kept", async () => {
  store.saveTracking([lead({ email: "old@shop.com", status: "replied", mailbox: "a@getweberslink.com" })]);
  const out = await eng.fetchReplyMessage("old@shop.com", CONFIG, { mailboxes: [fakeBox({ text: "Please call me.", subject: "Re: hello", date: "2026-11-20T10:00:00.000Z" })] });
  assert.strictEqual(out.text, "Please call me.");
  assert.strictEqual(out.stored, false);
  const row = store.loadTracking().find((t) => t.email === "old@shop.com");
  assert.strictEqual(row.reply_text, "Please call me.");
  assert.strictEqual(row.reply_subject, "Re: hello");
  assert.strictEqual(row.reply_snippet, "Please call me.");
  // The second time it is served from storage.
  assert.strictEqual((await eng.fetchReplyMessage("old@shop.com", CONFIG, { mailboxes: [fakeBox(null, { fail: new Error("no") })] })).stored, true);
});

test("fetchReplyMessage explains why a message can't be loaded", async () => {
  store.saveTracking([lead({ email: "x@shop.com", status: "replied", mailbox: "a@getweberslink.com" }), lead({ email: "new@shop.com", status: "new" })]);
  await assert.rejects(eng.fetchReplyMessage("nobody@shop.com", CONFIG, { mailboxes: [] }), /Lead not found/);
  await assert.rejects(eng.fetchReplyMessage("new@shop.com", CONFIG, { mailboxes: [] }), /has not replied/);
  await assert.rejects(eng.fetchReplyMessage("x@shop.com", CONFIG, { mailboxes: [] }), /not set up in Settings/);
  await assert.rejects(eng.fetchReplyMessage("x@shop.com", CONFIG, { mailboxes: [fakeBox(null, { noPassword: true })] }), /No password is set/);
  await assert.rejects(eng.fetchReplyMessage("x@shop.com", CONFIG, { mailboxes: [fakeBox(null)] }), /Couldn't find their message/);
});

test("the API serves a saved reply and rejects bad input", async () => {
  const login = await fetch(base + "/api/outreach/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: process.env.ADMIN_PASSWORD }) });
  cookie = login.headers.get("set-cookie").split(";")[0];
  store.saveTracking([lead({ email: "api@shop.com", status: "replied", mailbox: "a@getweberslink.com", reply_text: "Hello from the client", reply_subject: "Re: video" })]);
  const ok = await api("POST", "/api/outreach/replies/message", { email: "api@shop.com" });
  assert.strictEqual(ok.res.status, 200);
  assert.deepStrictEqual(ok.json, { ok: true, text: "Hello from the client", subject: "Re: video", stored: true });
  const missing = await api("POST", "/api/outreach/replies/message", { email: "nobody@shop.com" });
  assert.strictEqual(missing.res.status, 400);
  assert.match(missing.json.error, /Lead not found/);
  const draft = await api("POST", "/api/outreach/ai/draft", { email: "nobody@shop.com" });
  assert.strictEqual(draft.res.status, 404);
});
