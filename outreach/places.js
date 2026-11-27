/*
 * Google Maps / Apify "Google Places" exports (CSV or JSON) -> clean lead candidates.
 *
 * What a raw export looks like: hundreds of columns, up to dozens of emails per business (placeholders, job-application and
 * privacy addresses, a virtual-office provider's address), websites full of tracking parameters, state names instead of codes,
 * the same firm listed once per office, and a few results that don't match what was searched for. This module turns each row into one
 * candidate with: the best email (and a few alternatives), a clean website and domain, a normalised place, the rating and reviews, and
 * plain reasons for anything that makes it unusable or worth a second look. Nothing here touches the network or the lead list.
 */
const crypto = require("crypto");
const store = require("./store");
const cleaner = require("./cleaner");
const geo = require("./geo");

const val = (v) => (v == null ? "" : String(v).trim());

/** Does this look like a Google Places export? (Apify's crawler names: title, placeId, categoryName, emails/0 ...) */
function looksLikePlaces(rows) {
  const r = Array.isArray(rows) && rows[0];
  if (!r || typeof r !== "object") return false;
  const keys = new Set(Object.keys(r));
  return keys.has("title") && (keys.has("placeId") || keys.has("cid") || keys.has("categoryName")) && (keys.has("address") || keys.has("street") || keys.has("city"));
}

// ---------------------------------------------------------------- emails
const NOT_A_PERSON = /^(jobs?|careers?|hr|recruit(ing|ment|er)?|webmaster|privacy|press|media|abuse|postmaster|mailer-daemon|noreply|no-reply|donotreply|do-not-reply|unsubscribe|newsletter|security|dmca|billing|invoices?|accounting|spam|bounce|root|www)$/i;
const PLACEHOLDER = /(^|[@.])(mysite|mydomain|domain|email|yourdomain|yoursite|yourcompany|company|example|sample|test|localhost|sentry|wixpress|godaddy|squarespace|wordpress|wpengine|cloudflare|googlegroups)\.[a-z.]+$|@(your|name|user|username|firstname|lastname|first|last)\b|\.(png|jpe?g|gif|webp|svg|css|js)$/i;
const ROLE = /^(info|contact|hello|hi|office|admin|sales|support|enquiries|inquiries|service|services|team|mail|booking|bookings|reception|help|intake|general|frontdesk|desk|clientservices|clients|questions)$/i;
const FREE = /^(gmail|googlemail|yahoo|ymail|hotmail|outlook|live|msn|aol|icloud|me|proton|protonmail|gmx|mail|comcast|verizon)\./i;
const TWO_PART_TLD = /\.(co|com|org|net|ac|gov)\.[a-z]{2}$/i;

const rootDomain = (host) => { const h = String(host || "").toLowerCase().replace(/^www\./, ""); const n = h.split("."); return TWO_PART_TLD.test(h) ? n.slice(-3).join(".") : n.slice(-2).join("."); };

/** Every email field in a row, whatever the export's shape: emails/0, emails/1 ..., an "email" column, a "a@x.com; b@y.com" cell, or a real array. */
function emailsOf(row) {
  const out = [];
  const add = (v) => { if (Array.isArray(v)) v.forEach(add); else if (v != null) String(v).split(/[;,\s]+/).forEach((x) => { if (x.trim()) out.push(x.trim()); }); };
  for (const k of Object.keys(row)) if (/^emails?(\/\d+)?$/i.test(k)) add(row[k]);
  return out;
}
/**
 * Cleans and ranks a business's emails. siteDomain is the business's own website domain. Returns [{ email, rank, sameDomain, role, free, note }] best first.
 * Rank: 0 = a person at the business's own domain, 1 = a shared mailbox there (info@), 2 = free-mail, 3 = some other domain (a parent firm, a platform, a virtual-office provider).
 */
function rankEmails(list, siteDomain = "") {
  const root = siteDomain ? rootDomain(siteDomain) : "";
  const seen = new Set(), out = [];
  for (let raw of list) {
    let e = val(raw).toLowerCase().replace(/^mailto:/, "");
    try { e = decodeURIComponent(e); } catch (x) { /* keep as is */ }
    e = e.replace(/[?#].*$/, "").replace(/^[<"'(]+|[>"'),.;:]+$/g, "");
    if (seen.has(e) || !store.isEmail(e)) continue;
    seen.add(e);
    const [local, domain] = e.split("@"), base = local.split("+")[0];
    if (base.split(/[._-]/).some((t) => NOT_A_PERSON.test(t)) || PLACEHOLDER.test(e) || cleaner.assess(e).action === "remove") continue;
    const same = Boolean(root) && rootDomain(domain) === root, role = ROLE.test(base) || cleaner.assess(e).action === "flag", free = FREE.test(domain);
    const rank = same ? (role ? 1 : 0) : free ? 2 : 3;
    out.push({ email: e, rank, sameDomain: same, role, free, note: same ? "" : free ? "free mail" : root ? "different domain than their website" : "" });
  }
  out.sort((a, b) => a.rank - b.rank);
  // A big firm lists a dozen individual lawyers: guessing one of them is worse than writing to its general mailbox.
  const people = out.filter((x) => x.rank === 0);
  if (people.length >= 4) { const shared = out.find((x) => x.rank === 1); if (shared) { out.splice(out.indexOf(shared), 1); out.unshift(Object.assign(shared, { note: "large firm: its general mailbox was chosen over individual lawyers" })); } }
  return out;
}

// ---------------------------------------------------------------- websites and places
/** Tracking parameters and paths removed: "https://www.x.com/miami/?utm_source=google" -> { origin: "https://www.x.com", domain: "x.com" }. */
function cleanSite(url, domainHint = "") {
  const raw = val(url) || (domainHint ? "https://" + val(domainHint) : "");
  if (!raw) return { origin: "", domain: "" };
  try {
    const u = new URL(/^https?:/i.test(raw) ? raw : "https://" + raw);
    const host = u.hostname.toLowerCase();
    if (!/^https?:$/.test(u.protocol) || !host.includes(".") || /^\d+\.\d+\.\d+\.\d+$/.test(host) || host === "localhost") return { origin: "", domain: "" };
    return { origin: u.origin, domain: host.replace(/^www\./, "") };
  } catch (e) { return { origin: "", domain: "" }; }
}

// Words in a search ("personal injury lawyer in Phoenix") and the category words that satisfy them.
const SYNONYMS = { lawyer: ["lawyer", "attorney", "law", "legal", "solicitor", "counsel"], attorney: ["lawyer", "attorney", "law", "legal"], dentist: ["dent", "orthodont"], plumber: ["plumb"], electrician: ["electric"],
  roofer: ["roof"], roofing: ["roof"], doctor: ["doctor", "physician", "clinic", "medical"], accountant: ["accountant", "accounting", "tax", "bookkeep", "cpa"], realtor: ["real estate", "realtor", "estate agent"], hvac: ["hvac", "heating", "air conditioning"] };
const GENERIC = new Set(["best", "near", "local", "top", "cheap", "affordable", "services", "service", "company", "companies", "firm", "firms", "office", "offices"]);
/** The words a result's category must touch, from the search that found it. [] when the search is unknown (everything passes). */
function targetWords(searchString) {
  const type = val(searchString).toLowerCase().split(/\s+(?:in|near|around)\s+/)[0];
  const words = type.split(/[^a-z]+/).filter((w) => w.length > 3 && !GENERIC.has(w));
  const out = new Set();
  for (const w of words) { out.add(w); for (const s of SYNONYMS[w] || SYNONYMS[w.replace(/(ers|er|s)$/, "")] || SYNONYMS[w.replace(/s$/, "")] || []) out.add(s); out.add(w.replace(/(ers|er|ing|s)$/, "")); }
  return [...out];
}
const onTarget = (categories, words) => !words.length || words.some((w) => categories.toLowerCase().includes(w));

function categoriesOf(row) { return Object.keys(row).filter((k) => /^categories(\/\d+)?$/.test(k)).map((k) => val(row[k])).filter(Boolean); }
const truthy = (v) => /^(true|1|yes)$/i.test(val(v));

/**
 * One export row -> one candidate. ctx: { allowedCountries?: Set of two-letter codes }. Hard problems set `blocked` and `reason`; soft ones go in `warn`.
 */
function candidateFromPlace(row, ctx = {}) {
  const name = val(row.title || row.name).replace(/\s+/g, " ").slice(0, 140);
  const site = cleanSite(row.website, row.domain);
  const cats = categoriesOf(row), category = val(row.categoryName) || cats[0] || "";
  const address = val(row.address), postal = val(row.postalCode);
  const m = /,\s*([A-Z]{2})\s+\d{5}/.exec(address);
  const state = geo.normState(val(row.state) || (m ? m[1] : ""));
  let country = geo.normCountry(val(row.countryCode));
  if (!country) {
    const tld = (site.domain.split(".").pop() || "").toLowerCase();
    if (geo.CA_CODES.has(state) || (!geo.US_CODES.has(state) && tld === "ca")) country = "CA";
    else if (geo.US_CODES.has(state) || /^\d{5}(-\d{4})?$/.test(postal)) country = "US";
    else if (tld === "uk") country = "UK";
  }
  const ranked = rankEmails(emailsOf(row), site.domain), best = ranked[0];
  const rating = val(row.totalScore), reviews = val(row.reviewsCount);
  const c = {
    id: crypto.createHash("sha1").update(val(row.placeId) || `${site.domain || name}|${address}`).digest("hex").slice(0, 10),
    name, website: site.origin, domain: site.domain, email: best ? best.email : "", emailSource: best ? "file" : "", alternatives: ranked.slice(1, 4).map((x) => x.email),
    role: Boolean(best && best.role), free: Boolean(best && best.free), phone: val(row.phone || row["phones/0"]).slice(0, 40), address: address.slice(0, 160),
    city: val(row.city).slice(0, 60), state: state.slice(0, 20), country, category: category.slice(0, 100),
    rating: rating && Number.isFinite(Number(rating)) ? String(Math.round(Number(rating) * 10) / 10) : "", reviews: reviews && Number.isFinite(Number(reviews)) ? String(Math.round(Number(reviews))) : "",
    source: val(row.searchString).slice(0, 120), warn: [],
  };
  if (!name) { c.blocked = true; c.reason = "no business name"; }
  else if (truthy(row.permanentlyClosed)) { c.blocked = true; c.reason = "permanently closed"; }
  else if (truthy(row.temporarilyClosed)) { c.blocked = true; c.reason = "temporarily closed"; }
  else if (ctx.allowedCountries && country && !ctx.allowedCountries.has(country)) { c.blocked = true; c.reason = `country (${country}) is not allowed in Settings`; }
  if (!c.email && !c.reason) c.reason = c.domain ? "no email in the file (its website can be searched)" : "no email and no website";
  if (best && best.note) c.warn.push(best.note);
  if (c.role) c.warn.push("shared mailbox");
  const words = targetWords(row.searchString);
  if (words.length && !onTarget(`${category} ${cats.join(" ")}`, words)) { c.offTarget = true; c.warn.push(`category "${category || "none"}" does not match the search`); }
  return c;
}

/** All rows -> candidates, with duplicates inside the file removed (one firm listed per office). Returns { items, stats }. */
function candidatesFromRows(rows, ctx = {}) {
  const items = [], seenId = new Set(), seenEmail = new Set(), seenDomain = new Map();
  const stats = { rows: rows.length, duplicatesInFile: 0 };
  for (const row of rows) {
    const c = candidateFromPlace(row, ctx);
    const domKey = c.domain && !FREE.test(c.domain) ? rootDomain(c.domain) : "";
    const first = seenId.has(c.id) ? "place" : domKey && seenDomain.has(domKey) ? "company" : c.email && seenEmail.has(c.email) ? "email" : "";
    if (first) { stats.duplicatesInFile++; c.duplicate = true; c.blocked = true; c.reason = { place: "listed twice in the file", company: "same company as another row (another office)", email: "same email as another row" }[first]; }
    seenId.add(c.id); if (c.email) seenEmail.add(c.email); if (domKey && !seenDomain.has(domKey)) seenDomain.set(domKey, c.id);
    items.push(c);
  }
  return { items, stats };
}

/** An Apify JSON export holds nested arrays (emails: [...]); flatten the ones the reader needs to the CSV column style. */
function flattenRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row || {})) {
    if (Array.isArray(v)) v.forEach((x, i) => { if (x != null && typeof x !== "object") out[`${k}/${i}`] = x; });
    else if (v && typeof v === "object") { for (const [k2, v2] of Object.entries(v)) if (v2 == null || typeof v2 !== "object") out[`${k}/${k2}`] = v2; }
    else out[k] = v;
  }
  return out;
}

module.exports = { looksLikePlaces, emailsOf, rankEmails, rootDomain, cleanSite, targetWords, onTarget, candidateFromPlace, candidatesFromRows, flattenRow };
