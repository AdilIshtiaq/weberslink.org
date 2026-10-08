const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "outreach-api-"));
process.env.OUTREACH_DATA_DIR = DIR;
process.env.ADMIN_PASSWORD = "correct horse battery";
process.env.OUTREACH_CRON_TOKEN = "cron-token-0123456789";
const outreach = require("../outreach");
const store = require("../outreach/store");

let server, base, cookie = "";
test.before(async () => {
  server = http.createServer((req, res) => { if (!outreach.handle(req, res)) { res.writeHead(404); res.end("no"); } });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => { server.close(); fs.rmSync(DIR, { recursive: true, force: true }); });

async function api(method, url, body, { auth = true, headers = {} } = {}) {
  const res = await fetch(base + url, { method, headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(auth && cookie ? { Cookie: cookie } : {}), ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined });
  const type = res.headers.get("content-type") || "";
  return { status: res.status, headers: res.headers, json: type.includes("json") ? await res.json() : null, text: type.includes("json") ? "" : await res.text() };
}

test("everything needs a login; wrong password is rejected; right password sets a hardened cookie", async () => {
  assert.strictEqual((await api("GET", "/api/outreach/status", undefined, { auth: false })).status, 401);
  assert.strictEqual((await api("GET", "/api/outreach/session", undefined, { auth: false })).json.authed, false);
  assert.strictEqual((await api("POST", "/api/outreach/login", { password: "nope" }, { auth: false })).status, 401);
  const ok = await api("POST", "/api/outreach/login", { password: process.env.ADMIN_PASSWORD }, { auth: false, headers: { "x-forwarded-proto": "https" } });
  assert.strictEqual(ok.status, 200);
  const sc = ok.headers.get("set-cookie");
  assert.match(sc, /HttpOnly/); assert.match(sc, /SameSite=Strict/); assert.match(sc, /Secure/);
  cookie = sc.split(";")[0];
  assert.strictEqual((await api("GET", "/api/outreach/session")).json.authed, true);
  // a tampered cookie is rejected
  assert.strictEqual((await api("GET", "/api/outreach/status", undefined, { headers: { Cookie: cookie.slice(0, -2) + "00" } })).status, 401);
});

test("state-changing calls refuse non-JSON (cross-site form posts)", async () => {
  const res = await fetch(base + "/api/outreach/stop", { method: "POST", headers: { Cookie: cookie, "Content-Type": "text/plain" }, body: "{}" });
  assert.strictEqual(res.status, 415);
});

test("settings: validated, saved, and mailbox passwords are never part of them", async () => {
  const bad = await api("PUT", "/api/outreach/config", { sending: { timezone: "Mars/Base" } });
  assert.strictEqual(bad.status, 400);
  const cfg = { signature: { name: "Hassan Ali", company: "WebersLink", website: "weberslink.org", postal_address: "1 Example St" },
    sending: { dry_run: true, send_days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], min_delay_seconds: 0, max_delay_seconds: 0, timezone: "UTC" },
    mailboxes: [{ email: "a@getweberslink.com", from_name: "Hassan", password: "SECRET-SHOULD-BE-DROPPED" }] };
  const put = await api("PUT", "/api/outreach/config", cfg);
  assert.strictEqual(put.status, 200);
  const raw = fs.readFileSync(path.join(DIR, "config.json"), "utf8");
  assert.ok(!raw.includes("SECRET-SHOULD-BE-DROPPED"));
  assert.strictEqual((await api("GET", "/api/outreach/config")).json.config.mailboxes[0].email, "a@getweberslink.com");
});

test("leads: import (spreadsheet columns), list, filter, loom flag, do-not-contact, export", async () => {
  const rows = [1, 2, 3].map((i) => ({ Email: `o${i}@shop${i}.com`, "Owner Name": "Sam Lee", Store: `Shop ${i}`, Website: `shop${i}.com`, Country: "United States", Category: "Apparel" }));
  const imp = await api("POST", "/api/outreach/leads/import", { rows });
  assert.deepStrictEqual([imp.json.added, imp.json.existing], [3, 0]);
  const list = await api("GET", "/api/outreach/leads?q=shop2");
  assert.strictEqual(list.json.total, 1);
  assert.ok(!("first_message_id" in list.json.rows[0]), "internal ids are not exposed");
  assert.strictEqual((await api("POST", "/api/outreach/leads/action", { email: "o1@shop1.com", action: "loom_sent" })).status, 200);
  assert.strictEqual((await api("POST", "/api/outreach/leads/action", { email: "nobody@x.com", action: "loom_sent" })).status, 404);
  assert.strictEqual((await api("POST", "/api/outreach/leads/action", { email: "o2@shop2.com", action: "dnc" })).status, 200);
  assert.strictEqual((await api("GET", "/api/outreach/leads?status=do-not-contact")).json.total, 1);
  assert.strictEqual((await api("POST", "/api/outreach/dnc", { value: "not valid" })).status, 400);
  const csv = await api("GET", "/api/outreach/export?file=tracking");
  assert.match(csv.text, /o1@shop1\.com/);
  const st = (await api("GET", "/api/outreach/status")).json;
  assert.strictEqual(st.total, 3);
  assert.strictEqual(st.remaining, 2);
  assert.strictEqual(st.server.cron, true);
});

test("templates: list, preview, validate on save, reset", async () => {
  const list = (await api("GET", "/api/outreach/templates")).json;
  assert.ok(list.templates.length >= 5 && list.fields.includes("domain"));
  const prev = await api("POST", "/api/outreach/templates/preview", { text: "Subject: hello {domain}\n\n{greeting}\n\nTest {questions}\n\n{sender_first_name}" });
  assert.match(prev.json.subject, /hello example\.com/); assert.match(prev.json.html, /<p/);
  for (const [text, re] of [["no subject", /Subject/], ["Subject: x\n\n{typo}", /unknown field/], ["Subject: x\n\n[YOUR OFFER HERE]", /placeholder/]]) {
    const r = await api("PUT", "/api/outreach/templates", { name: "email1.txt", text });
    assert.strictEqual(r.status, 400); assert.match(r.json.error, re);
  }
  assert.strictEqual((await api("PUT", "/api/outreach/templates", { name: "../evil.txt", text: "Subject: x\n\nhi" })).status, 400);
  const good = "Subject: hello {domain}\n\n{greeting}\n\nShort and sweet.\n\n{sender_first_name}\n";
  assert.strictEqual((await api("PUT", "/api/outreach/templates", { name: "email1.txt", text: good })).status, 200);
  const after = (await api("GET", "/api/outreach/templates")).json.templates.find((t) => t.name === "email1.txt");
  assert.ok(after.edited && after.text.includes("Short and sweet"));
  assert.strictEqual((await api("DELETE", "/api/outreach/templates?name=email1.txt", {})).status, 200);
  assert.ok(!(await api("GET", "/api/outreach/templates")).json.templates.find((t) => t.name === "email1.txt").edited);
});

test("preview shows the next emails without sending", async () => {
  const r = (await api("GET", "/api/outreach/preview?n=2")).json;
  assert.strictEqual(r.emails.length, 2);
  assert.match(r.emails[0].text, /Prefer not to hear from me/);
});

test("dry run via the dashboard works and is logged; second start is refused while running", async () => {
  const run = await api("POST", "/api/outreach/run", { dry: true });
  assert.strictEqual(run.status, 202);
  for (let i = 0; i < 50; i++) { if (!(await api("GET", "/api/outreach/status")).json.running) break; await new Promise((r) => setTimeout(r, 40)); }
  const st = (await api("GET", "/api/outreach/status")).json;
  assert.strictEqual(st.running, false);
  assert.match(st.log.join("\n"), /NOT SENDING|dry run/); // mailboxes have no password yet / or planned
});

test("cron endpoint needs the secret token", async () => {
  assert.strictEqual((await api("GET", "/api/outreach/cron?token=" + process.env.OUTREACH_CRON_TOKEN, undefined, { auth: false })).status, 405, "GET never starts a run");
  assert.strictEqual((await api("POST", "/api/outreach/cron", {}, { auth: false })).status, 403);
  assert.strictEqual((await api("POST", "/api/outreach/cron?token=wrong-token-0123456789", {}, { auth: false })).status, 403);
  const ok = await api("POST", "/api/outreach/cron?token=" + process.env.OUTREACH_CRON_TOKEN, {}, { auth: false });
  const viaHeader = await api("POST", "/api/outreach/cron", {}, { auth: false, headers: { "x-cron-token": process.env.OUTREACH_CRON_TOKEN } });
  assert.ok([202, 409].includes(viaHeader.status));
  assert.ok([202, 409].includes(ok.status));
  await new Promise((r) => setTimeout(r, 300));
});

test("repeated wrong passwords are throttled", async () => {
  let last;
  for (let i = 0; i < 7; i++) last = await api("POST", "/api/outreach/login", { password: "x" + i }, { auth: false });
  assert.strictEqual(last.status, 429);
  // even the right password is refused while throttled
  assert.strictEqual((await api("POST", "/api/outreach/login", { password: process.env.ADMIN_PASSWORD }, { auth: false })).status, 429);
});
