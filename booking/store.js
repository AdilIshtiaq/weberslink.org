/*
 * Booking data on disk: <data>/booking/businesses.json (accounts) and <data>/booking/b-<slug>.json (settings + bookings).
 * <data> is BOOKING_DATA_DIR, else the outreach data folder (OUTREACH_DATA_DIR or its default), so one backup/volume covers both.
 * Node is single-threaded and every read-modify-write here is synchronous, so two requests can't interleave a write.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DIR = () => path.resolve(process.env.BOOKING_DATA_DIR || path.join(require("../outreach/store").DATA_DIR, "booking"));
const SLUG = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
const KEEP_DAYS = 400; // finished bookings older than this are dropped

function file(name) { return path.join(DIR(), name); }
function read(name, fallback) { try { return JSON.parse(fs.readFileSync(file(name), "utf8")); } catch (e) { return fallback; } }
function write(name, data) {
  fs.mkdirSync(DIR(), { recursive: true });
  const f = file(name), tmp = `${f}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1), { mode: 0o600 });
  fs.renameSync(tmp, f);
}

const accounts = () => { const d = read("businesses.json", {}); return Array.isArray(d.list) ? d.list : []; };
const saveAccounts = (list) => write("businesses.json", { list });
const account = (slug) => accounts().find((a) => a.slug === slug) || null;

function loadBiz(slug) {
  if (!SLUG.test(slug)) return null;
  const d = read(`b-${slug}.json`, null);
  return d && d.settings ? { settings: d.settings, bookings: Array.isArray(d.bookings) ? d.bookings : [] } : null;
}
function saveBiz(slug, biz) {
  const cut = Date.now() - KEEP_DAYS * 864e5;
  write(`b-${slug}.json`, { settings: biz.settings, bookings: biz.bookings.filter((b) => Date.parse(b.end) > cut) });
}
/** Erases a business's data file for good (owner deleted their page, or a sign-up was never confirmed). */
function deleteBiz(slug) { if (SLUG.test(slug)) try { fs.unlinkSync(file(`b-${slug}.json`)); } catch (e) { /* already gone */ } }

/** Signing key for owner sessions: BOOKING_SECRET, else a random key kept in the data folder. */
let secret = null;
function key() {
  if (secret) return secret;
  if ((process.env.BOOKING_SECRET || "").length >= 32) return (secret = process.env.BOOKING_SECRET);
  let k = read("secret.json", {}).key;
  if (!k) { k = crypto.randomBytes(32).toString("hex"); write("secret.json", { key: k }); }
  return (secret = k);
}

module.exports = { DIR, SLUG, accounts, saveAccounts, account, loadBiz, saveBiz, deleteBiz, key };
