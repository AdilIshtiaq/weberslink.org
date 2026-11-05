const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "outreach-clicks-"));
process.env.OUTREACH_DATA_DIR = DIR;
delete process.env.OUTREACH_PUBLIC_URL;
const store = require("../outreach/store");
const clicks = require("../outreach/clicks");
const eng = require("../outreach/engine");
const tpl = require("../outreach/templates");

test.after(() => fs.rmSync(DIR, { recursive: true, force: true }));
const cfg = { signature: { website: "weberslink.org" } };
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const tokenOf = (html) => /\/r\/([A-Za-z0-9]+)/.exec(html)[1];

test("base URL comes from the signature website or OUTREACH_PUBLIC_URL, https only", () => {
  assert.strictEqual(clicks.baseUrl(cfg, {}), "https://weberslink.org");
  assert.strictEqual(clicks.baseUrl(cfg, { OUTREACH_PUBLIC_URL: "https://go.example.com/x" }), "https://go.example.com");
  assert.strictEqual(clicks.baseUrl({ signature: { website: "http://plain.com" } }, {}), "");
  assert.strictEqual(clicks.baseUrl({ signature: {} }, {}), "");
});

test("links are rewritten per lead, mailto and existing tracked links are left alone, tokens are reused", () => {
  const html = '<p>Watch <a href="https://loom.com/v?a=1&amp;b=2" style="x">the demo</a> or <a href="mailto:me@x.com">mail</a></p>';
  const t0 = new Date("2026-11-05T10:00:00Z");
  const out = clicks.trackHtml(html, { email: "A@Shop.com", source: "reply", cfg, now: t0, env: {} });
  assert.match(out, /<a href="https:\/\/weberslink\.org\/r\/[A-Za-z0-9]{12}" style="x">the demo<\/a>/);
  assert.match(out, /href="mailto:me@x.com"/);
  assert.strictEqual(clicks.trackHtml(out, { email: "a@shop.com", cfg, now: t0, env: {} }), out);
  const again = clicks.trackHtml(html, { email: "a@shop.com", cfg, now: t0, env: {} });
  assert.strictEqual(tokenOf(again), tokenOf(out));
  const other = clicks.trackHtml(html, { email: "b@shop.com", cfg, now: t0, env: {} });
  assert.notStrictEqual(tokenOf(other), tokenOf(out));
  const link = store.readJson("links.json").tokens[tokenOf(out)];
  assert.strictEqual(link.u, "https://loom.com/v?a=1&b=2");
  assert.strictEqual(link.l, "the demo");
});

test("a person's click is counted and redirects; scanners, HEAD and instant clicks are not counted as people", () => {
  const sent = new Date("2026-11-05T10:00:00Z");
  const tok = tokenOf(clicks.trackHtml('<a href="https://demo.weberslink.org">demo site</a>', { email: "c@shop.com", cfg, now: sent, env: {} }));
  assert.strictEqual(clicks.record(tok, { method: "HEAD", ua: UA, now: new Date(sent.getTime() + 3600e3) }), "https://demo.weberslink.org");
  assert.strictEqual(clicks.record(tok, { ua: UA, now: new Date(sent.getTime() + 5000) }), "https://demo.weberslink.org"); // within a minute: scanner
  clicks.record(tok, { ua: "Mozilla/5.0 (compatible; Proofpoint URL Defense)", now: new Date(sent.getTime() + 7200e3) });
  assert.strictEqual(clicks.forLead("c@shop.com").clicks, 0);
  assert.strictEqual(clicks.forLead("c@shop.com").scanner, 2);
  const when = new Date(sent.getTime() + 3 * 3600e3);
  clicks.record(tok, { ua: UA, now: when });
  clicks.record(tok, { ua: UA, now: new Date(when.getTime() + 2000) }); // double click: once
  const s = clicks.forLead("C@shop.com");
  assert.strictEqual(s.clicks, 1);
  assert.deepStrictEqual(s.links, { "demo site": 1 });
  assert.strictEqual(clicks.recent(5)[0].email, "c@shop.com");
  assert.ok(clicks.recent(50, true).length > clicks.recent(50).length);
});

test("unknown or malformed tokens never redirect anywhere but home; nothing is recorded", () => {
  assert.strictEqual(clicks.record("nope"), "");
  assert.strictEqual(clicks.record("../../etc/passwd"), "");
  assert.strictEqual(clicks.record("AAAAAAAAAAAA"), "");
  const res = { writeHead(code, h) { this.code = code; this.h = h; }, end() {} };
  assert.strictEqual(clicks.handle({ url: "/r/AAAAAAAAAAAA?x=https://evil.com", method: "GET", headers: {} }, res), true);
  assert.strictEqual(res.code, 302); assert.strictEqual(res.h.Location, "/");
  assert.strictEqual(clicks.handle({ url: "/other", method: "GET", headers: {} }, res), false);
});

test("campaign templates turn written web addresses into links", () => {
  const c = eng.loadConfig();
  const r = tpl.render(1, { email: "x@y.com", domain: "y.com", store: "Y" }, c, "a", "Subject: hi\n\nSee https://demo.weberslink.org/a?b=1&c=2.\n\nBye");
  assert.match(r.html, /<a href="https:\/\/demo\.weberslink\.org\/a\?b=1&amp;c=2" [^>]*>https:\/\/demo\.weberslink\.org\/a\?b=1&amp;c=2<\/a>\./);
  assert.match(r.text, /See https:\/\/demo\.weberslink\.org\/a\?b=1&c=2\./); // text part keeps the real address
});

test("a dashboard reply is sent with tracked links in HTML and real links in text", async () => {
  const lead = Object.fromEntries(store.TRACK_FIELDS.map((f) => [f, ""]));
  store.saveTracking([Object.assign(lead, { email: "d@shop.com", status: "replied", mailbox: "h@weberslink.org", domain: "shop.com" })]);
  const c = eng.loadConfig(); c.signature.website = "weberslink.org";
  const sent = [];
  const box = { addr: "h@weberslink.org", hasPassword: () => true, close() {}, async send(m) { sent.push(m); } };
  await eng.sendReply({ email: "d@shop.com", html: '<div>Video: <a href="https://loom.com/v">watch</a></div>' }, c, { mailboxes: [box] });
  assert.match(sent[0].html, /https:\/\/weberslink\.org\/r\//);
  assert.strictEqual(sent[0].text, "Video: watch (https://loom.com/v)");
  c.sending.track_clicks = false;
  await eng.sendReply({ email: "d@shop.com", html: '<div><a href="https://loom.com/v">watch</a></div>' }, c, { mailboxes: [box] });
  assert.ok(!/\/r\//.test(sent[1].html));
});
