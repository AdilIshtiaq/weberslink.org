/*
 * List cleaner: free, built-in hygiene checks that keep bad addresses out of the send queue.
 *
 *  - assess(email): instant offline checks (typos, throwaway domains, placeholders, scraped junk, system and
 *    spam-trap-prone mailboxes, shared role mailboxes like info@).
 *  - startScan(): background job that adds a domain check (can the domain receive mail?) for every waiting lead
 *    and shows a preview. Nothing changes until applyScan().
 *
 * It cannot prove a specific inbox exists (only paid verifiers do that), so the bounce auto-pause stays the safety net.
 */
const store = require("./store");

const SKIPPED = "skipped-bad-address";

const DISPOSABLE = new Set(("mailinator.com guerrillamail.com guerrillamail.net guerrillamail.org guerrillamail.biz sharklasers.com grr.la " +
  "10minutemail.com 10minutemail.net 20minutemail.com tempmail.com temp-mail.org temp-mail.io tempmail.net tempmailo.com throwawaymail.com " +
  "yopmail.com yopmail.net yopmail.fr trashmail.com trashmail.net trashmail.de dispostable.com getnada.com nada.email maildrop.cc mailnesia.com " +
  "mintemail.com fakeinbox.com fakemail.net spamgourmet.com spam4.me mohmal.com emailondeck.com burnermail.io moakt.com mytemp.email tmpmail.org " +
  "tmpmail.net discard.email discardmail.com anonbox.net harakirimail.com mailcatch.com mailforspam.com jetable.org incognitomail.org " +
  "armyspy.com cuvox.de dayrep.com einrot.com fleckens.hu gustr.com jourrapide.com rhyta.com superrito.com teleworm.us byom.de ").split(/\s+/).filter(Boolean));

// Domains that exist only because an address was scraped from error trackers or example text.
const JUNK_DOMAINS = new Set(["example.com", "example.org", "example.net", "test.com", "domain.com", "yourdomain.com", "yourcompany.com", "email.com",
  "sentry.io", "sentry.wixpress.com", "wixpress.com", "sentry-next.wixpress.com", "localhost", "invalid.com"]);
const FILE_TLDS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "css", "js", "json", "pdf", "woff", "woff2", "ttf", "map", "mp4", "zip"]);

const DOMAIN_TYPOS = {
  "gmial.com": "gmail.com", "gmai.com": "gmail.com", "gmal.com": "gmail.com", "gamil.com": "gmail.com", "gnail.com": "gmail.com", "gmaill.com": "gmail.com",
  "gmil.com": "gmail.com", "gmail.co": "gmail.com", "gmail.con": "gmail.com", "gmail.cm": "gmail.com", "gmail.om": "gmail.com", "gmali.com": "gmail.com",
  "yahooo.com": "yahoo.com", "yaho.com": "yahoo.com", "yhoo.com": "yahoo.com", "yahoo.con": "yahoo.com", "yahoo.co": "yahoo.com", "yaoo.com": "yahoo.com",
  "hotmial.com": "hotmail.com", "hotmal.com": "hotmail.com", "hotmai.com": "hotmail.com", "hotmail.con": "hotmail.com", "homail.com": "hotmail.com",
  "outlok.com": "outlook.com", "outllook.com": "outlook.com", "outlook.con": "outlook.com", "outloook.com": "outlook.com",
  "iclod.com": "icloud.com", "icloud.con": "icloud.com", "icoud.com": "icloud.com", "aol.con": "aol.com", "live.con": "live.com",
};
const TLD_TYPO = /\.(con|cmo|vom|coom|comm|ocm|cim|xom|c0m|cpm|clm)$/;

// Mailboxes that never reach a person, or that spam traps and complaint-happy filters watch.
const SYSTEM_BOXES = new Set(["noreply", "no-reply", "donotreply", "do-not-reply", "mailer-daemon", "mailerdaemon", "postmaster", "abuse", "webmaster",
  "hostmaster", "root", "spam", "security", "privacy", "legal", "compliance", "unsubscribe", "bounce", "bounces", "dmarc", "daemon", "nobody", "listserv"]);
// Shared inboxes. Often fine for small shops (the owner reads info@), but riskier: skip them with one tick if you prefer.
const ROLE_BOXES = new Set(["info", "sales", "support", "contact", "contactus", "hello", "hi", "hey", "admin", "office", "enquiries", "enquiry", "inquiries",
  "inquiry", "orders", "order", "team", "help", "service", "services", "customerservice", "customercare", "customersupport", "care", "mail", "shop", "store",
  "billing", "accounts", "accounting", "hr", "careers", "jobs", "marketing", "press", "media", "general", "reception", "bookings", "booking", "feedback", "pr"]);
const PLACEHOLDER_LOCALS = new Set(["test", "testing", "tester", "example", "sample", "name", "yourname", "your-name", "youremail", "your-email", "email", "user",
  "username", "someone", "somebody", "none", "na", "n-a", "xxx", "xxxx", "abc", "abcd", "asdf", "qwerty", "demo", "null", "noemail", "no-email", "nomail", "fake", "john.doe", "johndoe", "firstname", "lastname", "first.last"]);

const normLocal = (l) => l.toLowerCase().split("+")[0].replace(/[._]/g, "");

/** Offline assessment of one address. Returns { action: "ok"|"remove"|"flag", kind, reason }. */
function assess(email) {
  const e = String(email || "").trim().toLowerCase();
  const bad = (kind, reason) => ({ action: "remove", kind, reason });
  if (!store.isEmail(e)) return bad("syntax", "not a valid email address");
  const at = e.lastIndexOf("@");
  const local = e.slice(0, at), domain = e.slice(at + 1);
  const tld = domain.split(".").pop();
  if (local.length > 64 || /\.\./.test(e) || local.startsWith(".") || local.endsWith(".") || domain.startsWith(".") || domain.startsWith("-") || /[^a-z0-9.\-\u00a1-\uffff]/.test(domain) || domain.split(".").some((l) => !l || l.length > 63 || l.startsWith("-") || l.endsWith("-"))) return bad("syntax", "malformed address");
  if (/^\d+$/.test(tld) || tld.length < 2) return bad("syntax", "domain has no valid ending");
  if (FILE_TLDS.has(tld)) return bad("junk", `looks like a file name, not an address (.${tld})`);
  if (JUNK_DOMAINS.has(domain) || [...JUNK_DOMAINS].some((j) => domain.endsWith("." + j))) return bad("junk", "placeholder or scraped-junk domain");
  if (DISPOSABLE.has(domain)) return bad("disposable", "throwaway email domain");
  if (DOMAIN_TYPOS[domain]) return bad("typo", `domain typo: did you mean ${DOMAIN_TYPOS[domain]}?`);
  if (TLD_TYPO.test(domain)) return bad("typo", `domain ending looks mistyped (.${tld})`);
  const base = normLocal(local);
  if (SYSTEM_BOXES.has(local.toLowerCase().split("+")[0]) || SYSTEM_BOXES.has(base)) return bad("system", "system address (never reaches a person / spam-trap prone)");
  if (PLACEHOLDER_LOCALS.has(local.toLowerCase().split("+")[0]) || PLACEHOLDER_LOCALS.has(base)) return bad("placeholder", "placeholder name, not a real mailbox");
  if (ROLE_BOXES.has(base)) return { action: "flag", kind: "role", reason: `shared mailbox (${local}@): higher spam-complaint risk` };
  return { action: "ok", kind: "ok", reason: "" };
}

// ---------------------------------------------------------------- background scan
const FREE_MAIL = /^(gmail|googlemail|yahoo|ymail|hotmail|outlook|live|msn|aol|icloud|me|comcast|verizon|proton|protonmail|gmx|mail)\./i;
const job = { running: false, phase: "", done: 0, total: 0, startedAt: null, result: null, error: "" };

function jobStatus() {
  return { running: job.running, phase: job.phase, done: job.done, total: job.total, startedAt: job.startedAt, error: job.error, result: job.result && { counts: job.result.counts, items: job.result.items, at: job.result.at } };
}

/**
 * Looks at every lead still waiting to be emailed. `mx(domain)` -> "yes" | "no" | "unknown" (injectable for tests).
 * Runs in the background; poll jobStatus(). Does not change any lead.
 */
function startScan({ mx, concurrency = 10 } = {}) {
  if (job.running) return { started: false, reason: "A scan is already running." };
  Object.assign(job, { running: true, phase: "Checking addresses", done: 0, total: 0, startedAt: new Date().toISOString(), result: null, error: "" });
  const done = (async () => {
    const waiting = store.loadTracking().filter((t) => t.status === "new");
    const decisions = new Map();
    const domains = new Map();
    for (const t of waiting) {
      const a = assess(t.email);
      decisions.set(t.email.toLowerCase(), { ...a, mx: t.mx || "" });
      if (a.action !== "remove" && !t.mx) {
        const d = t.email.split("@")[1].toLowerCase();
        if (!FREE_MAIL.test(d)) domains.set(d, "");
      }
    }
    job.phase = "Checking domains can receive mail"; job.total = domains.size; job.done = 0;
    const queue = [...domains.keys()];
    const worker = async () => {
      while (queue.length) {
        const d = queue.shift();
        try { domains.set(d, await mx(d)); } catch (e) { domains.set(d, "unknown"); }
        job.done++;
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, queue.length || 1) }, worker));
    const counts = { total: waiting.length, ok: 0, remove: 0, role: 0, noMailServer: 0, byKind: {} };
    const items = [];
    for (const t of waiting) {
      const key = t.email.toLowerCase();
      const dec = decisions.get(key);
      const dom = domains.get(t.email.split("@")[1].toLowerCase());
      if (dec.action !== "remove" && dom === "no") { dec.action = "remove"; dec.kind = "no-mail-server"; dec.reason = "its domain has no mail server (mail would bounce)"; }
      if (dec.action === "remove") { counts.remove++; if (dec.kind === "no-mail-server") counts.noMailServer++; counts.byKind[dec.kind] = (counts.byKind[dec.kind] || 0) + 1; }
      else if (dec.action === "flag") counts.role++;
      else counts.ok++;
      dec.domainMx = dom || dec.mx || "";
      if (dec.action !== "ok") items.push({ email: t.email, store: t.store, action: dec.action, kind: dec.kind, reason: dec.reason });
    }
    job.result = { counts, items: items.slice(0, 400), decisions, at: new Date().toISOString() };
  })().catch((e) => { job.error = e.message; }).finally(() => { job.running = false; job.phase = job.error ? "Failed" : "Done"; });
  return { started: true, done };
}

/**
 * Applies the last scan to leads that are STILL waiting (anything that changed meanwhile is left alone).
 * Bad addresses and addresses with no mail server become "skipped-bad-address" (reversible with restore).
 */
function applyScan({ skipRoles = false } = {}) {
  if (!job.result) return { ok: false, error: "Run the scan first." };
  const rows = store.loadTracking();
  const out = { skipped: 0, roleSkipped: 0, domainsConfirmed: 0 };
  for (const t of rows) {
    if (t.status !== "new") continue;
    const dec = job.result.decisions.get(t.email.toLowerCase());
    if (!dec) continue;
    if (dec.action === "remove" || (skipRoles && dec.action === "flag")) {
      t.status = SKIPPED; t.note = dec.reason;
      if (dec.action === "flag") out.roleSkipped++; else out.skipped++;
    } else if (dec.domainMx === "yes" && !t.mx) { t.mx = "yes"; out.domainsConfirmed++; }
  }
  store.saveTracking(rows);
  return { ok: true, ...out };
}

/** Undo for a single lead the cleaner skipped. */
function restore(email) {
  const row = store.loadTracking().find((t) => t.email.toLowerCase() === String(email).toLowerCase());
  if (!row || row.status !== SKIPPED) return null;
  return store.updateLead(row.email, { status: "new", note: `restored by you ${new Date().toISOString().slice(0, 10)}` });
}

// Websites that belong to a platform, not to the store: a "domain" like this says nothing about the lead.
const SHARED_HOSTS = new Set(["myshopify.com", "etsy.com", "wixsite.com", "squarespace.com", "weebly.com", "blogspot.com", "wordpress.com", "facebook.com", "instagram.com",
  "linktr.ee", "amazon.com", "ebay.com", "godaddysites.com", "business.site", "webflow.io", "carrd.co", "tumblr.com", "medium.com", "github.io", "sites.google.com"]);

module.exports = { FREE_MAIL, SHARED_HOSTS, SKIPPED, assess, startScan, jobStatus, applyScan, restore };
