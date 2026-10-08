/*
 * Outreach storage: plain files in OUTREACH_DATA_DIR (default ../outreach-data, i.e. outside
 * the app folder so a Git deploy doesn't wipe it). Nothing here is ever committed.
 *
 * All writes are synchronous read-modify-write, so the background run and the dashboard API
 * can't overwrite each other's changes (Node runs one JS task at a time).
 */
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.resolve(process.env.OUTREACH_DATA_DIR || path.join(__dirname, "..", "outreach-data"));
const P = (...a) => path.join(DATA_DIR, ...a);

const TRACK_FIELDS = ["email", "first_name", "store", "domain", "country", "category", "niche", "step", "status", "mailbox", "variant",
  "last_sent", "subject", "first_message_id", "last_message_id", "psi", "lcp", "mx", "note", "replied_at", "loom_sent"];
// Fields the engine owns. The dashboard owns the rest (loom_sent), so a run never overwrites them.
const ENGINE_FIELDS = TRACK_FIELDS.filter((f) => f !== "loom_sent");
const SENT_FIELDS = ["date", "mode", "mailbox", "email", "store", "step", "variant", "subject"];

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ---- CSV (RFC 4180 subset) ----
function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", q = false;
  text = String(text || "").replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); if (row.length > 1 || row[0] !== "") rows.push(row); }
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] === undefined ? "" : r[i]])));
}

function csvCell(v) {
  let s = v === undefined || v === null ? "" : String(v);
  // Stop spreadsheet formula injection if someone opens an export in Excel.
  if (/^[=+@\t]/.test(s) || (/^-/.test(s) && !/^-?\d/.test(s))) s = "'" + s;
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function toCsv(rows, fields) {
  return [fields.join(",")].concat(rows.map((r) => fields.map((f) => csvCell(r[f])).join(","))).join("\n") + "\n";
}

function readCsv(name) {
  try { return parseCsv(fs.readFileSync(P(name), "utf8")); } catch (e) { if (e.code === "ENOENT") return []; throw e; }
}

function atomicWrite(file, text) {
  ensureDir();
  const tmp = file + "." + process.pid + ".tmp";
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

function writeCsv(name, rows, fields) {
  atomicWrite(P(name), toCsv(rows, fields));
}

function readJson(name, fallback) {
  try { return JSON.parse(fs.readFileSync(P(name), "utf8")); } catch (e) { return fallback; }
}
function writeJson(name, data) {
  atomicWrite(P(name), JSON.stringify(data, null, 2));
}

// ---- tracking.csv ----
function loadTracking() {
  return readCsv("tracking.csv").map((r) => { for (const f of TRACK_FIELDS) if (r[f] === undefined) r[f] = ""; return r; });
}
function saveTracking(rows) {
  writeCsv("tracking.csv", rows, TRACK_FIELDS);
}
/** Write one lead's engine-owned fields without touching anyone else's data. */
function saveRow(t) {
  const rows = loadTracking();
  const key = t.email.toLowerCase();
  const i = rows.findIndex((r) => r.email.toLowerCase() === key);
  if (i < 0) { rows.push(t); } else for (const f of ENGINE_FIELDS) rows[i][f] = t[f] === undefined ? "" : t[f];
  saveTracking(rows);
}
/** Change dashboard-owned fields (and status/notes for manual actions) on one lead. */
function updateLead(email, patch) {
  const rows = loadTracking();
  const r = rows.find((x) => x.email.toLowerCase() === String(email).toLowerCase());
  if (!r) return null;
  Object.assign(r, patch);
  saveTracking(rows);
  return r;
}

function appendSentLog(row) {
  ensureDir();
  const file = P("sent_log.csv");
  const fresh = !fs.existsSync(file);
  fs.appendFileSync(file, (fresh ? SENT_FIELDS.join(",") + "\n" : "") + SENT_FIELDS.map((f) => csvCell(row[f])).join(",") + "\n");
}

function appendLog(line) {
  try { ensureDir(); fs.appendFileSync(P("run_log.txt"), line + "\n"); } catch (e) { /* logging must never break a run */ }
}

function loadSuppression() {
  const out = new Set();
  try {
    for (const line of fs.readFileSync(P("do_not_contact.csv"), "utf8").split(/\r?\n/)) {
      const v = line.split(",")[0].trim().toLowerCase();
      if (v && v !== "email") out.add(v);
    }
  } catch (e) { /* optional file */ }
  return out;
}
function addSuppression(value) {
  ensureDir();
  fs.appendFileSync(P("do_not_contact.csv"), value.trim().toLowerCase() + "\n");
}

module.exports = { DATA_DIR, P, ensureDir, TRACK_FIELDS, ENGINE_FIELDS, SENT_FIELDS, parseCsv, toCsv, readCsv, writeCsv, readJson, writeJson,
  loadTracking, saveTracking, saveRow, updateLead, appendSentLog, appendLog, loadSuppression, addSuppression, atomicWrite };
