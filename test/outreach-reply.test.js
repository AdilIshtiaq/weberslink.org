const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "outreach-reply-"));
process.env.OUTREACH_DATA_DIR = DIR;
const store = require("../outreach/store");
const eng = require("../outreach/engine");

test.after(() => fs.rmSync(DIR, { recursive: true, force: true }));

const lead = (o) => { const t = Object.fromEntries(store.TRACK_FIELDS.map((f) => [f, ""])); return Object.assign(t, o); };
function fakeBox(addr, o = {}) {
  const b = { addr, sent: [], hasPassword: () => !o.noPassword, close() {},
    async send(m) { if (o.fail) throw o.fail; b.sent.push(m); return { messageId: "<r@x>" }; } };
  return b;
}
const cfg = eng.loadConfig();
const reset = () => {
  store.saveTracking([
    lead({ email: "a@shop.com", first_name: "Ann", store: "Shop", domain: "shop.com", status: "replied", mailbox: "hassan@weberslink.org", subject: "Your site", first_message_id: "<1@x>", last_message_id: "<2@x>" }),
    lead({ email: "stop@shop.com", status: "unsubscribed", mailbox: "hassan@weberslink.org" }),
  ]);
  store.writeJson("scheduled.json", { items: [] });
};

test("sendReply sends from the lead's mailbox, threaded, without an unsubscribe header", async () => {
  reset();
  const box = fakeBox("hassan@weberslink.org");
  await eng.sendReply({ email: "A@shop.com", subject: "", text: "Hi Ann,\r\nHere is your video." }, cfg, { mailboxes: [box] });
  const m = box.sent[0];
  assert.strictEqual(m.to, "a@shop.com");
  assert.strictEqual(m.subject, "Re: Your site");
  assert.strictEqual(m.inReplyTo, "<2@x>");
  assert.deepStrictEqual(m.references, ["<1@x>", "<2@x>"]);
  assert.strictEqual(m.listUnsubscribe, false);
  assert.ok(!m.text.includes("\r"));
  assert.strictEqual(store.readCsv("sent_log.csv").pop().mode, "reply"); // never counts toward the daily budget
});

test("sendReply refuses strangers, opted-out leads, empty text and a missing mailbox/password", async () => {
  reset();
  const box = fakeBox("hassan@weberslink.org");
  await assert.rejects(eng.sendReply({ email: "x@nowhere.com", text: "hi" }, cfg, { mailboxes: [box] }), /not in your lead list/);
  await assert.rejects(eng.sendReply({ email: "stop@shop.com", text: "hi" }, cfg, { mailboxes: [box] }), /unsubscribed/);
  await assert.rejects(eng.sendReply({ email: "a@shop.com", text: "  " }, cfg, { mailboxes: [box] }), /Write a message/);
  await assert.rejects(eng.sendReply({ email: "a@shop.com", text: "hi" }, cfg, { mailboxes: [fakeBox("other@weberslink.org")] }), /not set up/);
  await assert.rejects(eng.sendReply({ email: "a@shop.com", text: "hi" }, cfg, { mailboxes: [fakeBox("hassan@weberslink.org", { noPassword: true })] }), /No password/);
  assert.strictEqual(box.sent.length, 0);
});

test("scheduling validates the time, lists, and cancels", () => {
  reset();
  const now = new Date("2026-11-04T10:00:00Z");
  assert.throws(() => eng.scheduleReply({ email: "a@shop.com", text: "hi", sendAt: "nonsense" }, now), /date and time/);
  assert.throws(() => eng.scheduleReply({ email: "a@shop.com", text: "hi", sendAt: "2026-11-03T10:00:00Z" }, now), /past/);
  assert.throws(() => eng.scheduleReply({ email: "a@shop.com", text: "hi", sendAt: "2030-01-01T00:00:00Z" }, now), /within the next year/);
  const item = eng.scheduleReply({ email: "a@shop.com", text: "later", sendAt: "2026-11-05T09:00:00Z" }, now);
  assert.strictEqual(eng.listScheduled().length, 1);
  assert.strictEqual(eng.cancelScheduled(item.id), true);
  assert.strictEqual(eng.cancelScheduled(item.id), false);
  assert.strictEqual(eng.listScheduled().length, 0);
});

test("processScheduled sends only what is due, once", async () => {
  reset();
  const now = new Date();
  const soon = eng.scheduleReply({ email: "a@shop.com", subject: "Video", text: "due", sendAt: new Date(now.getTime() + 1000).toISOString() }, now);
  eng.scheduleReply({ email: "a@shop.com", text: "tomorrow", sendAt: new Date(now.getTime() + 864e5).toISOString() }, now);
  const box = fakeBox("hassan@weberslink.org");
  assert.strictEqual(await eng.processScheduled(cfg, { mailboxes: [box] }, now), 0); // nothing due yet
  const later = new Date(now.getTime() + 5000);
  assert.strictEqual(await eng.processScheduled(cfg, { mailboxes: [box] }, later), 1);
  assert.strictEqual(await eng.processScheduled(cfg, { mailboxes: [box] }, later), 0); // not twice
  assert.deepStrictEqual(box.sent.map((m) => m.text), ["due"]);
  assert.strictEqual(eng.listScheduled().find((i) => i.id === soon.id).status, "sent");
});

test("a failed send is retried a few times, then marked failed; a timeout is never retried", async () => {
  reset();
  const now = new Date();
  eng.scheduleReply({ email: "a@shop.com", text: "x", sendAt: new Date(now.getTime() + 1000).toISOString() }, now);
  const bad = fakeBox("hassan@weberslink.org", { fail: Object.assign(new Error("auth failed"), { code: "EAUTH" }) });
  const later = new Date(now.getTime() + 5000);
  for (let i = 0; i < 2; i++) { await eng.processScheduled(cfg, { mailboxes: [bad] }, later); assert.strictEqual(eng.listScheduled()[0].status, "pending"); }
  await eng.processScheduled(cfg, { mailboxes: [bad] }, later);
  assert.strictEqual(eng.listScheduled()[0].status, "failed");

  reset();
  eng.scheduleReply({ email: "a@shop.com", text: "y", sendAt: new Date(now.getTime() + 1000).toISOString() }, now);
  await eng.processScheduled(cfg, { mailboxes: [fakeBox("hassan@weberslink.org", { fail: Object.assign(new Error("t"), { code: "ETIMEDOUT" }) })] }, later);
  const it = eng.listScheduled()[0];
  assert.strictEqual(it.status, "failed"); assert.match(it.error, /Sent folder/);
});

test("a lead who opts out before the scheduled time is not emailed", async () => {
  reset();
  const now = new Date();
  eng.scheduleReply({ email: "a@shop.com", text: "x", sendAt: new Date(now.getTime() + 1000).toISOString() }, now);
  store.updateLead("a@shop.com", { status: "do-not-contact" });
  const box = fakeBox("hassan@weberslink.org");
  await eng.processScheduled(cfg, { mailboxes: [box] }, new Date(now.getTime() + 5000));
  assert.strictEqual(box.sent.length, 0);
  assert.strictEqual(eng.listScheduled()[0].status, "failed");
});

const rt = require("../outreach/richtext");
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

test("rich text: links and formatting survive, scripts and bad links do not", () => {
  const out = rt.sanitize('<p>Watch <a href="https://loom.com/x?a=1&amp;b=2" onclick="evil()">the video</a></p><script>alert(1)</script><b style="x">B</b><a href="javascript:alert(1)">bad</a><img src="x" onerror="y"><iframe src="https://e.com">hidden</iframe>');
  assert.match(out, /<a href="https:\/\/loom.com\/x\?a=1&amp;b=2" target="_blank" rel="noopener">the video<\/a>/);
  assert.ok(!/script|onclick|onerror|javascript|iframe|hidden/i.test(out));
  assert.match(out, /<b>B<\/b>/);
  assert.strictEqual(rt.htmlToText('<div>Hi Ann,</div><div>Watch <a href="https://loom.com/x">the video</a></div><ul><li>one</li></ul>'), "Hi Ann,\nWatch the video (https://loom.com/x)\n\n- one");
});

test("rich text: pasted images become inline attachments, files are attached, size is capped", () => {
  const p = rt.prepare(`<div>Look</div><img src="data:image/png;base64,${PNG}" alt="shot">`, [{ name: "../plan.pdf", type: "application/pdf", data: Buffer.from("pdf").toString("base64") }]);
  assert.strictEqual(p.attachments.length, 2);
  assert.match(p.html, new RegExp(`<img src="cid:${p.attachments[0].cid}"`));
  assert.strictEqual(p.attachments[1].filename, "_plan.pdf");
  assert.throws(() => rt.prepare("<div>x</div>", [{ name: "big.bin", data: "A".repeat(15 * 1024 * 1024) }]), /10 MB/);
});

test("a scheduled rich reply keeps its links and attachments, sent as HTML", async () => {
  reset();
  const now = new Date();
  const item = eng.scheduleReply({ email: "a@shop.com", html: '<div>Watch: <a href="https://loom.com/v">demo video</a></div>', files: [{ name: "a.txt", type: "text/plain", data: Buffer.from("hello").toString("base64") }], sendAt: new Date(now.getTime() + 1000).toISOString() }, now);
  assert.deepStrictEqual(item.files, ["a.txt"]);
  const box = fakeBox("hassan@weberslink.org");
  assert.strictEqual(await eng.processScheduled(cfg, { mailboxes: [box] }, new Date(now.getTime() + 5000)), 1);
  const m = box.sent[0];
  assert.match(m.html, /<a href="https:\/\/loom.com\/v"[^>]*>demo video<\/a>/);
  assert.strictEqual(m.text, "Watch: demo video (https://loom.com/v)");
  assert.strictEqual(m.attachments[0].content.toString(), "hello");
  assert.strictEqual(store.readJson("scheduled.json").items[0].attachments[0].content, ""); // contents dropped once sent
});
