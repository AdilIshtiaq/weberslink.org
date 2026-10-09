/*
 * Backup and restore of everything the outreach tool keeps: settings, leads and their progress, sent history,
 * do-not-contact list, mailbox warm-up dates and your edited email templates.
 * NOT included: passwords (they only live in server environment variables) and the login key.
 *
 * A backup is one JSON file. Restoring validates every part before touching anything, saves a safety copy of the
 * current data first, and refuses while a send run is in progress.
 */
const fs = require("fs");
const path = require("path");
const store = require("./store");
const tpl = require("./templates");
const eng = require("./engine");

const FORMAT = "weberslink-outreach-backup";
const FILES = ["config.json", "tracking.csv", "sent_log.csv", "do_not_contact.csv", "mailboxes.json", "research_state.json", "backup_state.json"];
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const TEMPLATE = /^templates\/(email[1-4][b-z]?\.txt)$/;

const readText = (p) => { try { return fs.readFileSync(p, "utf8"); } catch (e) { return null; } };

/** Builds the backup object (and records the time, for the "last backup" reminder). */
function create({ markDone = true } = {}) {
  if (markDone) store.writeJson("backup_state.json", { lastBackup: new Date().toISOString() }); // first, so the file carries its own date
  const files = {};
  for (const name of FILES) { const t = readText(store.P(name)); if (t != null) files[name] = t; }
  try { for (const n of fs.readdirSync(tpl.OVERRIDE)) if (tpl.FILE_RE.test(n)) files["templates/" + n] = fs.readFileSync(path.join(tpl.OVERRIDE, n), "utf8"); } catch (e) { /* no edited templates */ }
  return { format: FORMAT, version: 1, createdAt: new Date().toISOString(), files };
}

function lastBackup() { return store.readJson("backup_state.json", {}).lastBackup || ""; }

/** Throws an Error (with .status 400) describing the first problem; returns the list of files to write when everything is valid. */
function validate(bundle) {
  const bad = (m) => Object.assign(new Error(m), { status: 400 });
  if (!bundle || typeof bundle !== "object" || bundle.format !== FORMAT) throw bad("That isn't an outreach backup file.");
  if (bundle.version !== 1) throw bad("This backup was made by a newer version and can't be restored here.");
  if (!bundle.files || typeof bundle.files !== "object" || Array.isArray(bundle.files)) throw bad("The backup has no data in it.");
  const out = [];
  for (const [name, text] of Object.entries(bundle.files)) {
    if (typeof text !== "string" || text.length > MAX_FILE_BYTES) throw bad(`"${name}" is missing or too large.`);
    const t = TEMPLATE.exec(name);
    if (!t && !FILES.includes(name)) throw bad(`The backup contains an unexpected file ("${String(name).slice(0, 40)}").`);
    if (name === "config.json") { try { eng.sanitizeConfig(JSON.parse(text)); } catch (e) { throw bad("The settings in the backup are not valid: " + e.message); } }
    else if (name === "tracking.csv") {
      const rows = store.parseCsv(text);
      if (text.trim() && !(rows.length ? "email" in rows[0] : /^\s*email\b/i.test(text))) throw bad("The leads file in the backup is not valid.");
    } else if (name === "sent_log.csv") {
      if (text.trim() && !/^date,mode,mailbox,email/.test(text)) throw bad("The sent log in the backup is not valid.");
    } else if (name.endsWith(".json")) { try { const o = JSON.parse(text); if (!o || typeof o !== "object") throw new Error("x"); } catch (e) { throw bad(`"${name}" in the backup is not valid.`); } }
    else if (t) { try { tpl.parseTemplate(text, name); tpl.render(Number(t[1][5]), tpl.SAMPLE_LEAD, eng.loadConfig(), "a", text); } catch (e) { throw bad(`Template ${t[1]} in the backup is not valid: ${e.message}`); } }
    out.push([name, text]);
  }
  if (!out.length) throw bad("The backup has no data in it.");
  return out;
}

/** Restores a backup. Returns { restored: [names], safetyCopy }. */
function restore(bundle) {
  if (eng.run.running) throw Object.assign(new Error("A run is in progress. Stop it before restoring."), { status: 409 });
  const entries = validate(bundle);
  let safetyCopy = "";
  try { // a way back if this was the wrong file
    const cur = create({ markDone: false });
    if (Object.keys(cur.files).length) {
      fs.mkdirSync(store.P("backups"), { recursive: true });
      safetyCopy = `backups/before-restore-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
      store.atomicWrite(store.P(safetyCopy), JSON.stringify(cur));
    }
  } catch (e) { safetyCopy = ""; }
  for (const [name, text] of entries) {
    const t = TEMPLATE.exec(name);
    if (t) { fs.mkdirSync(tpl.OVERRIDE, { recursive: true }); store.atomicWrite(path.join(tpl.OVERRIDE, t[1]), text); }
    else store.atomicWrite(store.P(name), text);
  }
  return { restored: entries.map(([n]) => n), safetyCopy };
}

module.exports = { create, restore, validate, lastBackup, FORMAT };
