const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "outreach-bk-"));
process.env.OUTREACH_DATA_DIR = DIR;
process.env.ADMIN_PASSWORD = "backup test password";
const store = require("../outreach/store");
const eng = require("../outreach/engine");
const tpl = require("../outreach/templates");
const backup = require("../outreach/backup");

const CONFIG = eng.sanitizeConfig({
  signature: { name: "Hassan Ali", company: "WebersLink", website: "weberslink.org", postal_address: "1 Example St", title: "Founder" },
  sending: { dry_run: true, notify_email: "me@example.com", timezone: "UTC" },
  mailboxes: [{ email: "a@getweberslink.com", from_name: "Hassan" }],
});
const wipe = () => { for (const f of fs.readdirSync(DIR)) fs.rmSync(path.join(DIR, f), { recursive: true, force: true }); };
const snapshot = () => Object.fromEntries(["config.json", "tracking.csv", "sent_log.csv", "do_not_contact.csv", "mailboxes.json"].map((n) => [n, fs.existsSync(store.P(n)) ? fs.readFileSync(store.P(n), "utf8") : null]));
function seed() {
  wipe();
  eng.saveConfig(CONFIG);
  eng.importLeads([{ Email: "sara@lenshub.co.uk", Store: "Lens Hub", Country: "UK", Website: "lenshub.co.uk" }, { Email: "bob@fitco.com", Store: "Fit Co", Country: "US", "First Line": "I saw that Fit Co sells gym wear with free returns on every order." }], CONFIG);
  store.addSuppression("@blocked.com");
  store.writeJson("mailboxes.json", { mailboxes: { "a@getweberslink.com": { first_live_send: "2026-03-02" } } });
  store.appendSentLog({ date: "2026-03-02T10:00:00Z", mode: "live", mailbox: "a@getweberslink.com", email: "sara@lenshub.co.uk", store: "Lens Hub", step: 1, variant: "a", subject: "hi" });
  fs.mkdirSync(tpl.OVERRIDE, { recursive: true });
  fs.writeFileSync(path.join(tpl.OVERRIDE, "email2.txt"), "Subject: my edited subject for {domain}\n\n{greeting}\n\nMy edited follow-up.\n\n{sender_first_name}\n");
  store.sessionKey();
}

test("a redeploy that wipes the data folder is fully recoverable from a backup", () => {
  seed();
  const before = snapshot();
  const b = backup.create();
  assert.strictEqual(b.format, "weberslink-outreach-backup");
  assert.ok(b.files["config.json"] && b.files["tracking.csv"] && b.files["templates/email2.txt"]);
  assert.ok(!Object.keys(b.files).some((n) => /session\.key|lock|backups/.test(n)), "no login key, lock or old backups inside");
  assert.ok(!JSON.stringify(b).includes("password"), "no passwords in the file (config has none)");
  wipe();                                                        // "redeploy"
  assert.strictEqual(eng.loadConfig().signature.name, "", "everything is gone, as the user experienced");
  const r = backup.restore(JSON.parse(JSON.stringify(b)));
  assert.ok(r.restored.includes("config.json") && r.restored.includes("templates/email2.txt"));
  assert.deepStrictEqual(snapshot(), before, "every file is back byte for byte");
  assert.strictEqual(eng.loadConfig().signature.name, "Hassan Ali");
  assert.strictEqual(eng.loadConfig().mailboxes[0].email, "a@getweberslink.com");
  assert.strictEqual(store.loadTracking().length, 2);
  assert.strictEqual(store.loadTracking().find((t) => t.email === "bob@fitco.com").research_status, "approved", "approved personal lines survive");
  assert.match(tpl.loadTemplate(2).subject, /my edited subject/, "edited emails survive");
  assert.ok(store.loadSuppression().has("@blocked.com"));
  assert.ok(backup.lastBackup(), "the backup time is remembered for the reminder");
});

test("a bad or hostile backup is refused as a whole and changes nothing", () => {
  seed(); const before = snapshot();
  const good = backup.create({ markDone: false });
  const mk = (files, extra = {}) => ({ format: backup.FORMAT, version: 1, files, ...extra });
  const bad = [
    [null, /isn't an outreach backup/], [{ format: "other", version: 1, files: {} }, /isn't an outreach backup/], [mk({ "config.json": "{}" }, { version: 2 }), /newer version/],
    [mk({}), /no data/], [{ format: backup.FORMAT, version: 1 }, /no data/], [mk({ "../evil.txt": "x" }), /unexpected file/], [mk({ "session.key": "x".repeat(64) }), /unexpected file/],
    [mk({ "outreach.lock": "1" }), /unexpected file/], [mk({ "templates/../../evil.txt": "x" }), /unexpected file/], [mk({ "templates/email9.txt": "Subject: x\n\nhi" }), /unexpected file/],
    [mk({ "config.json": 123 }), /missing or too large/], [mk({ "config.json": "not json" }), /settings in the backup are not valid/],
    [mk({ "config.json": JSON.stringify({ sending: { timezone: "Mars/Base" } }) }), /time zone/], [mk({ "tracking.csv": "name,city\nBob,Leeds\n" }), /leads file/],
    [mk({ "sent_log.csv": "garbage" }), /sent log/], [mk({ "mailboxes.json": "[" }), /not valid/], [mk({ "templates/email1.txt": "no subject line" }), /Template email1.txt/],
    [mk({ "templates/email1.txt": "Subject: x\n\n{nope}" }), /unknown field/],
    [mk({ ...good.files, "tracking.csv": "name,city\nBob,Leeds\n" }), /leads file/],   // one bad part spoils the whole restore
  ];
  for (const [bundle, re] of bad) assert.throws(() => backup.restore(bundle), (e) => re.test(e.message) && e.status === 400, JSON.stringify(bundle).slice(0, 80));
  assert.deepStrictEqual(snapshot(), before, "nothing was touched");
});

test("restore keeps a safety copy of what it replaced, and waits for a running send to finish", () => {
  seed(); const b = backup.create({ markDone: false });
  store.addSuppression("@later-added.com");
  const r = backup.restore(b);
  assert.match(r.safetyCopy, /^backups\/before-restore-/);
  const safety = JSON.parse(fs.readFileSync(store.P(r.safetyCopy), "utf8"));
  assert.ok(safety.files["do_not_contact.csv"].includes("@later-added.com"), "the replaced data can be restored again");
  assert.ok(!store.loadSuppression().has("@later-added.com"));
  eng.run.running = true;
  try { assert.throws(() => backup.restore(b), (e) => e.status === 409 && /in progress/.test(e.message)); } finally { eng.run.running = false; }
});

test("data folder facts: explicit setting, inside-the-app detection, writability", () => {
  const i = store.info();
  assert.deepStrictEqual([i.dir, i.explicit, i.writable], [DIR, true, true]);
  assert.strictEqual(i.insideApp, false);
  assert.strictEqual(store.isInside(path.join(__dirname, "..", "outreach-data"), path.join(__dirname, "..")), true, "a folder inside the app's folder is flagged");
  assert.strictEqual(store.isInside("/home/u1/outreach-data", "/home/u1/domains/site/nodejs"), false);
  assert.strictEqual(store.isInside("/a/b-other", "/a/b"), false, "a sibling with a similar name is not 'inside'");
});

test("API: download and restore behind login; status reports the data folder and last backup", async () => {
  seed();
  const outreach = require("../outreach/index");
  const server = http.createServer((req, res) => { if (!outreach.handle(req, res)) { res.writeHead(404); res.end(); } });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (m, u, b, c) => fetch(base + u, { method: m, headers: { "Content-Type": "application/json", ...(c ? { Cookie: c } : {}) }, body: b === undefined ? undefined : JSON.stringify(b) });
  try {
    assert.strictEqual((await call("GET", "/api/outreach/backup")).status, 401);
    assert.strictEqual((await call("POST", "/api/outreach/backup/restore", { backup: {} })).status, 401);
    const cookie = (await call("POST", "/api/outreach/login", { password: process.env.ADMIN_PASSWORD })).headers.get("set-cookie").split(";")[0];
    let st = await (await call("GET", "/api/outreach/status", undefined, cookie)).json();
    assert.deepStrictEqual([st.data.dir, st.data.explicit, st.data.insideApp, st.lastBackup], [DIR, true, false, ""]);
    const dl = await call("GET", "/api/outreach/backup", undefined, cookie);
    assert.strictEqual(dl.status, 200);
    assert.match(dl.headers.get("content-disposition"), /attachment; filename="outreach-backup-\d{4}-\d{2}-\d{2}\.json"/);
    const bundle = await dl.json();
    st = await (await call("GET", "/api/outreach/status", undefined, cookie)).json();
    assert.ok(st.lastBackup, "downloading a backup is remembered");
    const keep = fs.readFileSync(store.P("session.key"), "utf8");
    for (const f of fs.readdirSync(DIR)) if (f !== "session.key") fs.rmSync(path.join(DIR, f), { recursive: true, force: true }); // redeploy wipes data (login key kept here so the same cookie stays valid)
    assert.strictEqual(eng.loadConfig().signature.name, "");
    const rs = await call("POST", "/api/outreach/backup/restore", { backup: bundle }, cookie);
    assert.strictEqual(rs.status, 200);
    assert.strictEqual(eng.loadConfig().signature.name, "Hassan Ali");
    const bad = await call("POST", "/api/outreach/backup/restore", { backup: { format: "nope" } }, cookie);
    assert.strictEqual(bad.status, 400);
    assert.match((await bad.json()).error, /isn't an outreach backup/);
    assert.strictEqual(fs.readFileSync(store.P("session.key"), "utf8"), keep);
  } finally { server.close(); }
});

test.after(() => fs.rmSync(DIR, { recursive: true, force: true }));
