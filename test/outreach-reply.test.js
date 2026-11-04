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
