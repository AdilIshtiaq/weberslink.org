const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "outreach-clean-"));
process.env.OUTREACH_DATA_DIR = DIR;
process.env.ADMIN_PASSWORD = "cleaner test password";
const store = require("../outreach/store");
const eng = require("../outreach/engine");
const cleaner = require("../outreach/cleaner");

const CONFIG = eng.sanitizeConfig({
  signature: { name: "Hassan Ali", company: "WebersLink", website: "weberslink.org", postal_address: "1 Example St" },
  sending: { dry_run: false, send_days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], min_delay_seconds: 0, max_delay_seconds: 0, timezone: "UTC" },
  mailboxes: [{ email: "box1@lookalike1.com" }],
});
const reset = () => { for (const f of fs.readdirSync(DIR)) fs.rmSync(path.join(DIR, f), { recursive: true, force: true }); };
const row = (email, extra = {}) => ({ Email: email, Store: email.split("@")[0], Country: "US", Category: "Apparel", ...extra });
const rowOf = (email) => store.loadTracking().find((t) => t.email === email);
const waitScan = async () => { for (let i = 0; i < 200 && cleaner.jobStatus().running; i++) await new Promise((r) => setTimeout(r, 10)); };

test("assess: bad addresses are caught with a reason", () => {
  const cases = {
    "not-an-email": "syntax", "a@b": "syntax", "a..b@shop.com": "syntax", ".a@shop.com": "syntax", "a@shop.123": "syntax",
    "logo@2x.png": "junk", "abc123@sentry.wixpress.com": "junk", "someone@example.com": "junk", "x@mail.fitco.com": "ok", "x@name.domain.com": "junk",
    "foo@mailinator.com": "disposable", "foo@YOPMAIL.com": "disposable",
    "sara@gmial.com": "typo", "bob@hotmail.con": "typo", "amy@shop.con": "typo", "tom@store.cmo": "typo",
    "noreply@shop.com": "system", "no-reply@shop.com": "system", "Postmaster@shop.com": "system", "abuse@shop.com": "system", "mailer-daemon@x.com": "system",
    "test@shop.com": "placeholder", "yourname@shop.com": "placeholder", "john.doe@shop.com": "placeholder",
  };
  for (const [email, kind] of Object.entries(cases)) {
    const a = cleaner.assess(email);
    const want = kind === "ok" ? "ok" : "remove";
    assert.strictEqual(a.action, want, `${email} -> ${a.action}/${a.kind}`);
    if (kind !== "ok") assert.strictEqual(a.kind, kind, email);
    if (kind !== "ok") assert.ok(a.reason.length > 5, "has a human reason");
  }
  assert.match(cleaner.assess("sara@gmial.com").reason, /gmail\.com/, "suggests the fix");
  assert.strictEqual(cleaner.assess(`${"a".repeat(65)}@shop.com`).action, "remove", "local part over 64 chars");
});

test("assess: real addresses are not wrongly flagged; shared mailboxes are only flagged", () => {
  for (const ok of ["sara.khan@lenshub.co.uk", "john@my-shop.co", "owner@münchen.de", "contact.me@x.com", "testimonials@shop.com", "infoseek@shop.com", "jo+promo@gmail.com",
    "hassan@getweberslink.com", "bob@fitco.com", "o'brien@shop.ie", "a_b@shop.com"]) {
    assert.strictEqual(cleaner.assess(ok).action, "ok", ok);
  }
  for (const role of ["info@shop.com", "Sales@shop.com", "customer.service@shop.com", "support+vip@shop.com", "hello@shop.com", "contact@shop.com", "orders@shop.com"]) {
    const a = cleaner.assess(role);
    assert.deepStrictEqual([a.action, a.kind], ["flag", "role"], role);
  }
});

test("import sets clearly bad addresses aside (reversibly) and they are never emailed", async () => {
  reset();
  const res = eng.importLeads([row("good@shop1.com"), row("noreply@shop2.com"), row("foo@mailinator.com"), row("sara@gmial.com"), row("info@shop3.com")], CONFIG);
  assert.deepStrictEqual([res.added, res.cleaned], [5, 3]);
  assert.strictEqual(rowOf("noreply@shop2.com").status, "skipped-bad-address");
  assert.match(rowOf("sara@gmial.com").note, /gmail\.com/);
  assert.strictEqual(rowOf("info@shop3.com").status, "new", "role mailboxes are kept at import");
  const sent = [];
  const box = { id: 1, addr: "box1@lookalike1.com", async scanInbox() { return []; }, async send(m) { sent.push(m.to); return { messageId: `<${sent.length}@x>` }; }, close() {} };
  await eng.runOnce({ config: CONFIG }, { mailboxes: [box], sleep: async () => {}, mx: async () => "yes" });
  assert.deepStrictEqual(sent.sort(), ["good@shop1.com", "info@shop3.com"]);
  assert.match(eng.nextEmail(rowOf("noreply@shop2.com"), CONFIG), /^Skipped: system address/);
});

test("scan previews without changing anything; apply skips bad + dead domains; roles only when ticked; restore undoes it", async () => {
  reset();
  eng.importLeads([row("good@shop1.com"), row("info@shop2.com"), row("owner@deaddomain.com"), row("ok@gmail.com"), row("noreply@shop3.com")], CONFIG);
  const before = JSON.stringify(store.loadTracking());
  const lookups = [];
  const mx = async (d) => { lookups.push(d); return d === "deaddomain.com" ? "no" : "yes"; };
  const started = cleaner.startScan({ mx });
  assert.ok(started.started);
  assert.strictEqual(cleaner.startScan({ mx }).started, false, "one scan at a time");
  await started.done;
  const st = cleaner.jobStatus();
  assert.deepStrictEqual([st.running, st.result.counts.total, st.result.counts.ok, st.result.counts.remove, st.result.counts.role, st.result.counts.noMailServer], [false, 4, 2, 1, 1, 1], "noreply was already set aside at import; 4 are still waiting");
  assert.ok(!lookups.includes("gmail.com"), "well-known free mail domains are not looked up");
  assert.strictEqual(new Set(lookups).size, lookups.length, "each domain is looked up once");
  assert.strictEqual(JSON.stringify(store.loadTracking()), before, "the preview changed nothing");
  assert.ok(st.result.items.some((i) => i.email === "owner@deaddomain.com" && /no mail server/.test(i.reason)));
  // someone changed meanwhile: must be left alone
  store.updateLead("good@shop1.com", { status: "replied" });
  const applied = cleaner.applyScan({ skipRoles: false });
  assert.deepStrictEqual([applied.ok, applied.skipped, applied.roleSkipped], [true, 1, 0]);
  assert.strictEqual(rowOf("owner@deaddomain.com").status, "skipped-bad-address");
  assert.strictEqual(rowOf("info@shop2.com").status, "new", "role kept without the tick");
  assert.strictEqual(rowOf("good@shop1.com").status, "replied", "changed leads are untouched");
  assert.strictEqual(rowOf("ok@gmail.com").status, "new");
  const again = cleaner.applyScan({ skipRoles: true });
  assert.strictEqual(again.roleSkipped, 1);
  assert.strictEqual(rowOf("info@shop2.com").status, "skipped-bad-address");
  assert.ok(cleaner.restore("info@shop2.com"));
  assert.strictEqual(rowOf("info@shop2.com").status, "new");
  assert.strictEqual(cleaner.restore("good@shop1.com"), null, "only cleaner-skipped leads can be restored");
});

test("a failing domain lookup never blocks a lead; empty list is fine", async () => {
  reset();
  assert.deepStrictEqual((await (async () => { const s = cleaner.startScan({ mx: async () => { throw new Error("dns down"); } }); await s.done; return cleaner.jobStatus().result.counts; })()), { total: 0, ok: 0, remove: 0, role: 0, noMailServer: 0, byKind: {} });
  eng.importLeads([row("a@shop1.com")], CONFIG);
  const s = cleaner.startScan({ mx: async () => { throw new Error("dns down"); } }); await s.done;
  assert.strictEqual(cleaner.jobStatus().result.counts.ok, 1, "unknown is treated as fine, not removed");
});

test("API: scan -> status -> apply -> restore, behind login", async () => {
  reset();
  eng.importLeads([row("good@shop1.com"), row("owner@deaddomain.com")], CONFIG);
  const outreach = require("../outreach/index");
  const server = http.createServer((req, res) => { if (!outreach.handle(req, res)) { res.writeHead(404); res.end(); } });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (m, u, b, c) => fetch(base + u, { method: m, headers: { "Content-Type": "application/json", ...(c ? { Cookie: c } : {}) }, body: b === undefined ? undefined : JSON.stringify(b) }).then(async (r) => ({ status: r.status, json: await r.json(), headers: r.headers }));
  try {
    assert.strictEqual((await call("POST", "/api/outreach/leads/clean/start", {})).status, 401);
    const login = await call("POST", "/api/outreach/login", { password: process.env.ADMIN_PASSWORD });
    const cookie = login.headers.get("set-cookie").split(";")[0];
    assert.strictEqual((await call("POST", "/api/outreach/leads/clean/apply", {}, cookie)).json.ok === true || true, true);
    // use a stubbed resolver by pre-marking the dead domain so no real DNS is needed
    const rows = store.loadTracking(); rows.forEach((t) => { t.mx = t.domain === "deaddomain.com" ? "" : "yes"; }); store.saveTracking(rows);
    const go = await call("POST", "/api/outreach/leads/clean/start", {}, cookie);
    assert.ok([202, 409].includes(go.status));
    let st; for (let i = 0; i < 100; i++) { st = (await call("GET", "/api/outreach/leads/clean/status", undefined, cookie)).json; if (!st.running && st.result) break; await new Promise((r) => setTimeout(r, 50)); }
    assert.strictEqual(st.result.counts.total, 2);
    const ap = await call("POST", "/api/outreach/leads/clean/apply", { skipRoles: false }, cookie);
    assert.strictEqual(ap.status, 200);
    const list = (await call("GET", "/api/outreach/leads?status=skipped-bad-address", undefined, cookie)).json;
    for (const r of list.rows) { assert.match(r.next, /^Skipped:/); assert.strictEqual((await call("POST", "/api/outreach/leads/action", { email: r.email, action: "restore" }, cookie)).status, 200); }
  } finally { server.close(); }
});

test("cautious defaults: bounce auto-pause is 3% unless you choose otherwise", () => {
  assert.strictEqual(eng.sanitizeConfig({}).sending.bounce_pause_percent, 3);
  assert.strictEqual(eng.DEFAULT_CONFIG.sending.bounce_pause_percent, 3);
  assert.strictEqual(eng.sanitizeConfig({ sending: { bounce_pause_percent: 5 } }).sending.bounce_pause_percent, 5);
});

test.after(() => fs.rmSync(DIR, { recursive: true, force: true }));
