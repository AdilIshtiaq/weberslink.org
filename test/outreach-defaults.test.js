const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "outreach-def-"));
process.env.OUTREACH_DATA_DIR = DIR;
delete process.env.OUTREACH_NOTIFY_EMAIL;
delete process.env.OUTREACH_PASSWORD_1;
delete process.env.OUTREACH_PASSWORD;
const eng = require("../outreach/engine");
const store = require("../outreach/store");
const wipe = () => { for (const f of fs.readdirSync(DIR)) fs.rmSync(path.join(DIR, f), { recursive: true, force: true }); };

test("a fresh install (or wiped data folder) starts with the owner's own settings", () => {
  wipe();
  const c = eng.loadConfig();
  assert.deepStrictEqual(c.signature, { name: "Hassan Ali", title: "Founder", company: "WebersLink", website: "weberslink.org", postal_address: "2315 Chestnut Street, Montgomery, Alabama 36107, United States", accent_color: "#5b2ee5", logo: true });
  assert.deepStrictEqual(c.mailboxes, [{ id: 1, email: "hassan@weberslink.org", from_name: "Hassan Ali", enabled: true, smtp_host: "smtp.hostinger.com", smtp_port: 465, imap_host: "imap.hostinger.com", imap_port: 993 }]);
  const s = c.sending;
  assert.deepStrictEqual([s.timezone, s.window_enabled, s.window_start, s.window_end, s.daily_limit, s.ramp, s.bounce_pause_percent, s.followup_gaps_days, s.send_days, s.countries],
    ["America/New_York", true, "19:00", "07:00", 20, [5, 10, 15, 20], 3, [3, 4, 7], ["Mon", "Tue", "Wed", "Thu", "Fri"], ["US", "UK"]]);
  assert.strictEqual(s.dry_run, true, "live sending is never on by default");
  assert.strictEqual(s.notify_email, "", "the private address is not in the code");
  // the defaults are a valid configuration the dashboard can save as it stands
  assert.doesNotThrow(() => eng.sanitizeConfig(c));
  c.mailboxes[0].email = "changed@x.com"; // callers can't alter the built-in defaults by accident
  assert.strictEqual(eng.loadConfig().mailboxes[0].email, "hassan@weberslink.org");
});

test("anything saved in the dashboard wins over the defaults", () => {
  wipe();
  eng.saveConfig(eng.sanitizeConfig({ signature: { name: "Someone Else", company: "Other Co", website: "other.example", postal_address: "9 Elm Road, Leeds, UK" },
    sending: { timezone: "Asia/Karachi", ramp: "3,6", daily_limit: 8, window_enabled: false }, mailboxes: [] }));
  const c = eng.loadConfig();
  assert.strictEqual(c.signature.name, "Someone Else");
  assert.deepStrictEqual([c.sending.timezone, c.sending.ramp, c.sending.daily_limit, c.sending.window_enabled], ["Asia/Karachi", [3, 6], 8, false]);
  assert.deepStrictEqual(c.mailboxes, [], "a saved empty mailbox list means no mailboxes on purpose; the default mailbox does not come back");
  // an older config that predates a setting still gets the default for just that setting
  store.writeJson("config.json", { signature: { name: "Old Save" }, sending: { timezone: "UTC" }, mailboxes: [] });
  const old = eng.loadConfig();
  assert.deepStrictEqual([old.signature.name, old.signature.company, old.sending.timezone, old.sending.bounce_pause_percent], ["Old Save", "WebersLink", "UTC", 3]);
});

test("the notification address comes from a private environment variable, and a saved one wins", () => {
  wipe();
  process.env.OUTREACH_NOTIFY_EMAIL = "  owner@private.example ";
  try {
    assert.strictEqual(eng.loadConfig().sending.notify_email, "owner@private.example");
    eng.saveConfig(eng.sanitizeConfig({ sending: { notify_email: "saved@private.example" }, mailboxes: [] }));
    assert.strictEqual(eng.loadConfig().sending.notify_email, "saved@private.example");
  } finally { delete process.env.OUTREACH_NOTIFY_EMAIL; }
});

test("a fresh install cannot send anything by accident, even if someone flips it to live", async () => {
  wipe();
  const cfg = eng.loadConfig();
  const live = { ...cfg, sending: { ...cfg.sending, dry_run: false } };
  const s = await eng.runOnce({ config: live }); // real mailbox objects, no password set
  assert.strictEqual(s.sent, 0);
  assert.match(s.reason, /OUTREACH_PASSWORD_1/, "it says exactly what is missing");
});

test("no private email address is written anywhere in the repository's source", () => {
  const root = path.join(__dirname, "..");
  const secret = ["adilishtiaq", "8040", "@gmail.com"].join(""); // assembled so this file doesn't contain it
  const needle = secret.split("@")[0];
  const hits = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (["node_modules", ".git", "outreach-data"].includes(e.name)) continue;
    const f = path.join(d, e.name);
    if (e.isDirectory()) walk(f); else if (/\.(js|html|json|md|txt|csv)$/.test(e.name) && fs.readFileSync(f, "utf8").includes(needle)) hits.push(path.relative(root, f));
  } };
  walk(root);
  assert.deepStrictEqual(hits, []);
});

test.after(() => fs.rmSync(DIR, { recursive: true, force: true }));
