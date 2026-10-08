const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const zlib = require("zlib");

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "outreach-hard-"));
process.env.OUTREACH_DATA_DIR = DIR;
process.env.ADMIN_PASSWORD = "hardening test password";
const store = require("../outreach/store");
const eng = require("../outreach/engine");
const xlsx = require("../outreach/xlsx");
const mail = require("../outreach/mail");
const outreach = require("../outreach");

// ---------- tiny zip writer so we can build .xlsx fixtures without any library ----------
const CRC = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function makeZip(files, { claimSize } = {}) {
  const locals = [], central = []; let off = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text), comp = zlib.deflateRawSync(data), nm = Buffer.from(name), crc = crc32(data);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nm.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(claimSize || data.length, 24); ch.writeUInt16LE(nm.length, 28); ch.writeUInt32LE(off, 42);
    locals.push(lh, nm, comp); central.push(ch, nm); off += 30 + nm.length + comp.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, end]);
}
const sheetXml = (rows) => `<?xml version="1.0"?><worksheet><sheetData>${rows.map((r, i) => `<row r="${i + 1}">${r.map((v, j) => {
  const ref = String.fromCharCode(65 + j) + (i + 1);
  return typeof v === "number" ? `<c r="${ref}"><v>${v}</v></c>` : v === null ? `<c r="${ref}"/>` : v.startsWith("@") ? `<c r="${ref}" t="s"><v>${v.slice(1)}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t>${v}</t></is></c>`; }).join("")}</row>`).join("")}</sheetData></worksheet>`;
function makeXlsx(sheets, shared) {
  return makeZip({
    "[Content_Types].xml": "<Types/>",
    "xl/workbook.xml": `<workbook xmlns:r="x"><sheets>${sheets.map((s, i) => `<sheet name="${s.name}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships>${sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="x" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}</Relationships>`,
    ...(shared ? { "xl/sharedStrings.xml": `<sst>${shared.map((t) => `<si><t>${t}</t></si>`).join("")}</sst>` } : {}),
    ...Object.fromEntries(sheets.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s.rows)])),
  });
}

test("xlsx: reads the Leads sheet, shared strings, numbers, entities and sparse cells", () => {
  const buf = makeXlsx([
    { name: "Notes", rows: [["ignore"], ["me"]] },
    { name: "Leads", rows: [["Email", "Store", "Country", "Mobile PageSpeed (0-100)", "Niche"], ["@0", "@1", "United States", 41, "Tom &amp; Jerry &lt;3"], ["b@y.co.uk", "Shop", null, 77.6, "x"]] },
  ], ["a@x.com", "Lens Hub"]);
  const rows = xlsx.readSheet(buf, "Leads");
  assert.strictEqual(rows.length, 2);
  assert.deepStrictEqual(rows[0], { Email: "a@x.com", Store: "Lens Hub", Country: "United States", "Mobile PageSpeed (0-100)": "41", Niche: "Tom & Jerry <3" });
  assert.strictEqual(rows[1].Country, "");
  assert.strictEqual(xlsx.readSheet(buf, "nonexistent")[0].Email === undefined, true, "falls back to the first sheet");
});

test("xlsx: garbage, truncated and zip-bomb files are rejected cleanly", () => {
  assert.throws(() => xlsx.readSheet(Buffer.from("not a zip at all")), /xlsx/);
  const ok = makeXlsx([{ name: "Leads", rows: [["Email"], ["a@b.co"]] }]);
  assert.throws(() => xlsx.readSheet(ok.subarray(0, ok.length - 30)), /xlsx|Damaged/);
  assert.throws(() => xlsx.readSheet(makeZip({ "xl/workbook.xml": "<workbook/>" }, { claimSize: 2e9 })), /too large/);
  assert.throws(() => xlsx.readSheet(makeZip({ "[Content_Types].xml": "<Types/>" })), /xlsx/);
});

function fakeBox(i, behaviour = {}) {
  const b = { id: i + 1, addr: `box${i + 1}@lookalike${i + 1}.com`, sent: [], async scanInbox() { return []; }, close() {},
    async send(msg) { if (behaviour.fail) throw Object.assign(new Error("boom"), { code: behaviour.fail }); b.sent.push(msg); return { messageId: `<m${b.sent.length}-${i}@x>` }; } };
  return b;
}
const CONFIG = eng.sanitizeConfig({
  signature: { name: "Hassan Ali", company: "WebersLink", website: "weberslink.org", postal_address: "1 Example St" },
  sending: { dry_run: false, send_days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], min_delay_seconds: 0, max_delay_seconds: 0, timezone: "UTC" },
  mailboxes: [{ email: "box1@lookalike1.com" }],
});
const deps = (boxes) => ({ mailboxes: boxes, sleep: async () => {}, mx: async () => "yes" });
const reset = () => { for (const f of fs.readdirSync(DIR)) fs.rmSync(path.join(DIR, f), { recursive: true, force: true }); };
const lead = (i) => ({ email: `o${i}@s${i}.com`, store: `S${i}`, country: "US", category: "Apparel" });

test("crash safety: an unsure send is held, never retried automatically, and can be resolved", async () => {
  reset(); eng.importLeads([lead(1), lead(2)], CONFIG);
  const s1 = await eng.runOnce({ config: CONFIG }, deps([fakeBox(0, { fail: "ETIMEDOUT" })]));
  let t = Object.fromEntries(store.loadTracking().map((x) => [x.email, x]));
  assert.strictEqual(t["o1@s1.com"].sending, "1", "held after a timeout");
  assert.strictEqual(t["o1@s1.com"].status, "new");
  assert.strictEqual(s1.sent, 0);
  // next run: held lead is skipped, the other is sent
  const box = fakeBox(0);
  await eng.runOnce({ config: CONFIG }, deps([box]));
  assert.deepStrictEqual(box.sent.map((m) => m.to), ["o2@s2.com"]);
  assert.strictEqual(eng.status(CONFIG).held.length, 1);
  // resolve: retry -> sends next run
  assert.ok(eng.resolveHeld("o1@s1.com", "retry"));
  const box2 = fakeBox(0);
  await eng.runOnce({ config: CONFIG }, deps([box2]));
  assert.deepStrictEqual(box2.sent.map((m) => m.to), ["o1@s1.com"]);
});

test("crash safety: a definite failure (auth) clears the marker; a process death mid-send leaves it", async () => {
  reset(); eng.importLeads([lead(1), lead(2)], CONFIG);
  await eng.runOnce({ config: CONFIG }, deps([fakeBox(0, { fail: "EAUTH" })]));
  assert.ok(store.loadTracking().every((x) => !x.sending), "EAUTH is not ambiguous");
  // simulate dying between the SMTP accept and the save: marker set on disk, status unchanged
  const rows = store.loadTracking(); rows[0].sending = "1"; store.saveTracking(rows);
  const box = fakeBox(0);
  await eng.runOnce({ config: CONFIG }, deps([box]));
  assert.deepStrictEqual(box.sent.map((m) => m.to), ["o2@s2.com"], "held lead is not emailed twice");
  assert.ok(eng.resolveHeld("o1@s1.com", "skip"));
  assert.strictEqual(store.loadTracking().find((x) => x.email === "o1@s1.com").status, "do-not-contact");
  assert.strictEqual(eng.resolveHeld("o2@s2.com", "retry"), null, "only held leads can be resolved");
});

test("test email: refuses until ready, then sends one sample per mailbox, never marks anything", async () => {
  reset(); eng.importLeads([lead(1)], CONFIG);
  await assert.rejects(eng.sendTest("not-an-email", CONFIG), /valid email/);
  const bad = await eng.sendTest("me@example.com", { ...CONFIG, signature: { ...CONFIG.signature, postal_address: "" } }, { mailboxes: [fakeBox(0)] });
  assert.ok(bad.problems.some((p) => /postal_address/.test(p)));
  const [a, b] = [fakeBox(0), fakeBox(1, { fail: "EAUTH" })];
  const r = await eng.sendTest("me@example.com", CONFIG, { mailboxes: [a, b] });
  assert.deepStrictEqual(r.results.map((x) => x.ok), [true, false]);
  assert.match(a.sent[0].subject, /^\[TEST\] /);
  assert.strictEqual(store.loadTracking()[0].status, "new");
});

test("DNS health: flags missing SPF/DMARC, duplicate SPF, and passes a healthy domain", async () => {
  const mk = (d) => ({ resolveMx: async (n) => { if (!d[n]?.mx) throw Object.assign(new Error("x"), { code: "ENODATA" }); return [{ exchange: "mx.h.com", priority: 1 }]; },
    resolveTxt: async (n) => { if (!d[n]?.txt) throw Object.assign(new Error("x"), { code: "ENODATA" }); return d[n].txt.map((t) => [t]); },
    resolveCname: async (n) => { if (!d[n]?.cname) throw Object.assign(new Error("x"), { code: "ENODATA" }); return d[n].cname; } });
  const cfg = { ...CONFIG, mailboxes: [{ email: "a@good.com", enabled: true }, { email: "b@bad.com", enabled: true }, { email: "c@dup.com", enabled: true }] };
  const res = await eng.dnsHealth(cfg, mk({
    "good.com": { mx: 1, txt: ["v=spf1 include:_spf.mail.hostinger.com ~all"] }, "_dmarc.good.com": { txt: ["v=DMARC1; p=none"] }, "hostingermail-a._domainkey.good.com": { cname: ["k.h.com"] },
    "dup.com": { mx: 1, txt: ["v=spf1 a ~all", "v=spf1 mx ~all"] },
  }));
  const by = (d) => Object.fromEntries(res.find((x) => x.domain === d).checks.map((c) => [c.name, c.status]));
  assert.deepStrictEqual(by("good.com"), { MX: "ok", SPF: "ok", DKIM: "ok", DMARC: "ok" });
  assert.deepStrictEqual(by("bad.com"), { MX: "bad", SPF: "bad", DKIM: "warn", DMARC: "warn" });
  assert.strictEqual(by("dup.com").SPF, "bad");
});

test("inbound mail parsing: quoted text is cut, bounce notices expose the failed address, threading ids survive", async () => {
  const { simpleParser } = require("mailparser");
  const reply = await mail.parseIncoming(await simpleParser(
    "From: Sara <sara@shop.com>\r\nTo: me@x.com\r\nSubject: Re: who answers shop.com at 2am?\r\nIn-Reply-To: <abc@x.com>\r\nReferences: <abc@x.com>\r\nMessage-ID: <r1@shop.com>\r\nContent-Type: text/plain\r\n\r\nYes please send it!\r\n\r\nOn Mon, 2 Mar 2026, Hassan wrote:\r\n> Shoppers on shop.com usually have a question\r\n> unsubscribe\r\n"));
  assert.strictEqual(reply.from, "sara@shop.com");
  assert.strictEqual(reply.in_reply_to, "<abc@x.com>");
  assert.strictEqual(reply.fresh.trim(), "Yes please send it!");
  const bounce = await mail.parseIncoming(await simpleParser(
    "From: Mail Delivery System <MAILER-DAEMON@mx.x.com>\r\nTo: me@x.com\r\nSubject: Undelivered Mail Returned to Sender\r\nMessage-ID: <b1@x.com>\r\nMIME-Version: 1.0\r\nContent-Type: multipart/report; report-type=delivery-status; boundary=\"B\"\r\n\r\n--B\r\nContent-Type: text/plain\r\n\r\nThis is the mail system.\r\n\r\n--B\r\nContent-Type: message/delivery-status\r\n\r\nFinal-Recipient: rfc822; dead@gone.com\r\nAction: failed\r\nStatus: 5.1.1\r\n\r\n--B--\r\n"));
  assert.match(bounce.from_raw, /MAILER-DAEMON/i);
  assert.match(bounce.body, /dead@gone\.com/);
  // and classify() acts on both
  const track = [{ email: "sara@shop.com", store: "Shop", domain: "shop.com", status: "active", step: "1", first_message_id: "<abc@x.com>", last_message_id: "<abc@x.com>", mailbox: "me@x.com" },
    { email: "dead@gone.com", store: "Gone", domain: "gone.com", status: "active", step: "1", first_message_id: "", last_message_id: "", mailbox: "me@x.com" }];
  const ch = eng.classify([reply, bounce], track, ["me@x.com"]);
  assert.deepStrictEqual(ch.map((c) => c.kind).sort(), ["BOUNCED", "REPLIED"]);
});

// ---------------- API ----------------
let server, base, cookie = "";
test.before(async () => {
  server = http.createServer((req, res) => { if (!outreach.handle(req, res)) { res.writeHead(404); res.end(); } });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => { server.close(); fs.rmSync(DIR, { recursive: true, force: true }); });
const api = (method, url, body, c = cookie) => fetch(base + url, { method, headers: { "Content-Type": "application/json", ...(c ? { Cookie: c } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }).then(async (r) => ({ status: r.status, headers: r.headers, json: (r.headers.get("content-type") || "").includes("json") ? await r.json() : null }));

test("API: logout really ends the session (a stolen cookie stops working); imports accept csv/xlsx only", async () => {
  reset();
  const login = await api("POST", "/api/outreach/login", { password: process.env.ADMIN_PASSWORD }, "");
  cookie = login.headers.get("set-cookie").split(";")[0];
  assert.strictEqual((await api("GET", "/api/outreach/status")).status, 200);

  const csv = Buffer.from("Email,Store,Country\no1@a.com,A,US\no2@b.com,B,UK\nbroken\n").toString("base64");
  const r1 = await api("POST", "/api/outreach/leads/import-file", { name: "leads.csv", data: csv });
  assert.deepStrictEqual([r1.json.added, r1.json.invalid], [2, 1]);
  const x = makeXlsx([{ name: "Leads", rows: [["Email", "Store"], ["x1@a.com", "X1"], ["o1@a.com", "dup"]] }]).toString("base64");
  const r2 = await api("POST", "/api/outreach/leads/import-file", { name: "Leads.XLSX", data: x });
  assert.deepStrictEqual([r2.json.added, r2.json.existing], [1, 1]);
  assert.strictEqual((await api("POST", "/api/outreach/leads/import-file", { name: "leads.xls", data: csv })).status, 400);
  assert.strictEqual((await api("POST", "/api/outreach/leads/import-file", { name: "a.xlsx", data: Buffer.from("junk").toString("base64") })).status, 400);

  assert.strictEqual((await api("POST", "/api/outreach/test-email", { to: "me@example.com" })).json.problems.length > 0, true, "test email is blocked until configured");
  assert.deepStrictEqual((await api("GET", "/api/outreach/dns")).json.domains, []);

  await api("POST", "/api/outreach/logout", {});
  assert.strictEqual((await api("GET", "/api/outreach/status")).status, 401, "revoked cookie is dead even though it has not expired");
});
