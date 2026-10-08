/*
 * Cold-email sequencer engine (Node port of the Python outreach tool, v2.3).
 *
 * Each run: 1) read inboxes -> mark replies / opt-outs / bounces and notify you,
 * 2) pause any mailbox with a high bounce rate, 3) send due follow-ups in the original thread
 * from the original mailbox, 4) start new leads spread over mailboxes, each with its own warm-up.
 */
const fs = require("fs");
const dns = require("dns").promises;
const store = require("./store");
const tpl = require("./templates");
const { Mailbox, passwordFor } = require("./mail");
const { stripOurFooter } = require("./inbound");

const VERSION = "2.3";
const DONE_STATUSES = ["replied", "unsubscribed", "bounced", "do-not-contact"];
const STOP_WORDS = /\b(unsubscribe|remove me|stop emailing|stop sending|not interested|take me off|do not (contact|email)|don'?t (contact|email)|opt.?out|no thanks|no thank you)\b/i;
const BOUNCE_FROM = /mailer-daemon|postmaster|mail delivery/i;
const BOUNCE_SUBJ = /undeliver|delivery (status|failure|has failed)|returned mail|failure notice|could not be delivered|address not found/i;
// A notice only counts as a bounce when it reports a permanent failure. "Delayed" / "warning" notices are not bounces.
const BOUNCE_DELAY = /action:\s*(delayed|delivered|relayed)|\(delay\)|delivery (has been )?delayed|will (keep|continue) (trying|to try)|still trying|warning:/i;
const BOUNCE_PERMANENT = /action:\s*failed|status:\s*5\.\d+\.\d+|does(n'?t| not) exist|user unknown|unknown user|no such user|address (not found|rejected)|mailbox (unavailable|not found|full|disabled)|couldn'?t be found|wasn'?t delivered|was not delivered|could not (be )?deliver(ed)?|unable to deliver|not delivered|failed permanently|permanent (error|failure)|undeliverable|\b55\d[ -]/i;
const AUTO_REPLY = /auto.?reply|automatic reply|out of (the )?office|autoresponder|thank you for (contacting|your (email|message))/i;
const FREE_MAIL = /^(gmail|googlemail|yahoo|ymail|hotmail|outlook|live|msn|aol|icloud|me|comcast|verizon|proton|protonmail|gmx|mail)\./i;
const EMAIL_RE = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g;
const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const COUNTRY_ALIAS = { "UNITED STATES": "US", USA: "US", "UNITED KINGDOM": "UK", GB: "UK", CANADA: "CA" };

// ---------------------------------------------------------------- config
const DEFAULT_CONFIG = {
  signature: { name: "", title: "", company: "WebersLink", website: "weberslink.org", postal_address: "", accent_color: "#5B2EE5" },
  sending: {
    dry_run: true, countries: ["US", "UK"], send_days: ["Mon", "Tue", "Wed", "Thu", "Fri"], timezone: "America/New_York",
    daily_limit: 40, ramp: [10, 20, 30, 40], followup_gaps_days: [3, 4, 7], min_delay_seconds: 90, max_delay_seconds: 240,
    notify_email: "", html_emails: true, check_mx: true, bounce_pause_percent: 5, check_inbox_in_dry_run: false,
  },
  mailboxes: [],
};

function loadConfig() {
  const saved = store.readJson("config.json", {});
  return {
    signature: { ...DEFAULT_CONFIG.signature, ...(saved.signature || {}) },
    sending: { ...DEFAULT_CONFIG.sending, ...(saved.sending || {}) },
    mailboxes: Array.isArray(saved.mailboxes) ? saved.mailboxes : [],
  };
}

const str = (v, n = 300) => String(v == null ? "" : v).trim().slice(0, n);
const intIn = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const intList = (v, d) => { const a = (Array.isArray(v) ? v : String(v).split(",")).map((x) => Math.round(Number(x))).filter((x) => Number.isFinite(x) && x > 0 && x <= 1000); return a.length ? a : d; };

/** Validate + normalise a config coming from the dashboard. Returns the clean config. */
function sanitizeConfig(input) {
  const s = input.sending || {}, g = input.signature || {}, d = DEFAULT_CONFIG;
  const tz = str(s.timezone, 60) || d.sending.timezone;
  try { new Intl.DateTimeFormat("en-CA", { timeZone: tz }); } catch (e) { throw new Error(`Unknown time zone "${tz}"`); }
  const minD = intIn(s.min_delay_seconds, 0, 3600, d.sending.min_delay_seconds);
  const out = {
    signature: {
      name: str(g.name, 100), title: str(g.title, 100), company: str(g.company, 100), website: str(g.website, 200),
      postal_address: str(g.postal_address, 300), accent_color: /^#[0-9a-f]{6}$/i.test(str(g.accent_color)) ? str(g.accent_color) : d.signature.accent_color,
    },
    sending: {
      dry_run: s.dry_run !== false,
      countries: [...new Set(intList0(s.countries, d.sending.countries).map((c) => c.toUpperCase()))],
      send_days: intList0(s.send_days, d.sending.send_days).map((x) => x.slice(0, 1).toUpperCase() + x.slice(1, 3).toLowerCase()).filter((x) => DAYS.includes(x.toLowerCase())),
      timezone: tz,
      daily_limit: intIn(s.daily_limit, 1, 40, 40), // hard cap: never above 40/day per mailbox
      ramp: intList(s.ramp, d.sending.ramp).map((x) => Math.min(x, 40)),
      followup_gaps_days: intList(s.followup_gaps_days, d.sending.followup_gaps_days).slice(0, 3),
      min_delay_seconds: minD,
      max_delay_seconds: Math.max(minD, intIn(s.max_delay_seconds, 0, 7200, d.sending.max_delay_seconds)),
      notify_email: str(s.notify_email, 200), html_emails: s.html_emails !== false, check_mx: s.check_mx !== false,
      bounce_pause_percent: intIn(s.bounce_pause_percent, 1, 50, 5), check_inbox_in_dry_run: Boolean(s.check_inbox_in_dry_run),
    },
    mailboxes: sanitizeMailboxes(input.mailboxes),
  };
  if (out.sending.notify_email && !store.isEmail(out.sending.notify_email)) throw new Error("Notification email is not a valid address");
  for (const m of out.mailboxes) if (m.email && !store.isEmail(m.email)) throw new Error(`Mailbox "${m.email}" is not a valid address`);
  if (!out.sending.send_days.length) throw new Error("Choose at least one send day");
  return out;
}
// Mail servers the dashboard may send passwords to. Without this, a hijacked admin session could point a mailbox at
// a server it controls and capture the real password. Add others with OUTREACH_ALLOWED_HOSTS (comma separated).
function hostAllowed(host) {
  const h = String(host).toLowerCase();
  if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(h)) return false;
  const extra = String(process.env.OUTREACH_ALLOWED_HOSTS || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  return h === "hostinger.com" || h.endsWith(".hostinger.com") || extra.includes(h);
}

/** Mailbox ids are permanent: removing or reordering mailboxes never renumbers them (ids pick the password variable). */
function sanitizeMailboxes(list) {
  const incoming = (Array.isArray(list) ? list : []).slice(0, 10);
  const used = new Set();
  const ids = incoming.map((m) => {
    const id = Number(m && m.id);
    if (Number.isInteger(id) && id >= 1 && id <= 99 && !used.has(id)) { used.add(id); return id; }
    return 0;
  });
  return incoming.map((m, i) => {
    let id = ids[i];
    if (!id) { id = 1; while (used.has(id)) id++; used.add(id); }
    const box = {
      id, email: str(m.email, 200), from_name: str(m.from_name, 100), enabled: m.enabled !== false,
      smtp_host: str(m.smtp_host, 200) || "smtp.hostinger.com", smtp_port: intIn(m.smtp_port, 1, 65535, 465),
      imap_host: str(m.imap_host, 200) || "imap.hostinger.com", imap_port: intIn(m.imap_port, 1, 65535, 993),
    };
    for (const k of ["smtp_host", "imap_host"]) {
      if (box.email && !hostAllowed(box[k])) throw new Error(`The server "${box[k]}" isn't allowed. Mailbox passwords are only sent to Hostinger servers unless you list the host in the OUTREACH_ALLOWED_HOSTS environment variable.`);
    }
    return box;
  });
}

function intList0(v, d) { const a = (Array.isArray(v) ? v : String(v == null ? "" : v).split(",")).map((x) => String(x).trim()).filter(Boolean); return a.length ? a : d; }

function saveConfig(cfg) {
  store.writeJson("config.json", cfg);
}

// ---------------------------------------------------------------- dates (in the sending time zone)
function tzParts(date, tz) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const g = (t) => f.find((p) => p.type === t).value;
  return { date: `${g("year")}-${g("month")}-${g("day")}`, weekday: g("weekday").slice(0, 3).toLowerCase(), hour: parseInt(g("hour"), 10) };
}
const today = (cfg, now = new Date()) => tzParts(now, cfg.sending.timezone).date;
function daysBetween(a, b) { return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5); }
function daysSince(iso, cfg, now = new Date()) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return 0;
  return daysBetween(tzParts(d, cfg.sending.timezone).date, today(cfg, now));
}
function isSendDay(cfg, now = new Date()) {
  return cfg.sending.send_days.map((d) => d.toLowerCase().slice(0, 3)).includes(tzParts(now, cfg.sending.timezone).weekday);
}

// ---------------------------------------------------------------- run state + logging
const run = { running: false, stop: false, startedAt: null, mode: "", lines: [], last: null, wakes: new Set() };
function log(msg) {
  const line = `[${new Date().toISOString().replace("T", " ").slice(0, 19)}] ${msg}`;
  run.lines.push(line);
  if (run.lines.length > 600) run.lines.splice(0, run.lines.length - 600);
  store.appendLog(line);
  return line;
}
function sleepAbortable(ms) {
  return new Promise((resolve) => {
    const done = () => { clearTimeout(t); run.wakes.delete(done); resolve(); };
    const t = setTimeout(done, ms);
    run.wakes.add(done);
  });
}
function requestStop() {
  run.stop = true;
  for (const wake of [...run.wakes]) wake();
}

// ---------------------------------------------------------------- leads
function normCountry(c) {
  const u = String(c || "").trim().toUpperCase();
  return COUNTRY_ALIAS[u] || u;
}
function emailDomain(e) { return String(e).toLowerCase().split("@")[1] || ""; }
function suppressed(addr, sup) {
  const e = addr.toLowerCase();
  return sup.has(e) || sup.has("@" + emailDomain(e));
}

/** Apply country / do-not-contact / "a colleague already replied" rules. Returns true if anything changed. */
function applyRules(track, cfg) {
  const allowed = new Set(cfg.sending.countries.map((c) => c.toUpperCase()));
  const sup = store.loadSuppression();
  let changed = false;
  const set = (t, status, note) => { if (t.status !== status || (note !== undefined && t.note !== note)) { t.status = status; if (note !== undefined) t.note = note; changed = true; } };
  for (const t of track) {
    if (t.status === "skipped-country" && allowed.has(t.country)) set(t, "new");
    if (t.status === "new" && !allowed.has(t.country)) set(t, "skipped-country");
    if (suppressed(t.email, sup) && !DONE_STATUSES.includes(t.status)) set(t, "do-not-contact", "on do_not_contact.csv");
  }
  const doneDomains = new Set(track.filter((t) => ["replied", "unsubscribed"].includes(t.status) && !FREE_MAIL.test(emailDomain(t.email))).map((t) => emailDomain(t.email)));
  for (const t of track) {
    if (["new", "active"].includes(t.status) && doneDomains.has(emailDomain(t.email))) set(t, "do-not-contact", "colleague already replied / opted out");
  }
  return changed;
}

function loadState(cfg) {
  const track = store.loadTracking();
  if (applyRules(track, cfg)) store.saveTracking(track);
  return track;
}

/** rows: objects with either our field names or the spreadsheet's column names. */
function importLeads(rows, cfg) {
  const track = store.loadTracking();
  const have = new Map(track.map((t) => [t.email.toLowerCase(), t]));
  const allowed = new Set(cfg.sending.countries.map((c) => c.toUpperCase()));
  const res = { added: 0, existing: 0, invalid: 0 };
  const pick = (r, ...names) => { for (const n of names) for (const k of Object.keys(r)) if (k.trim().toLowerCase() === n) return String(r[k] == null ? "" : r[k]).trim(); return ""; };
  const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? String(Math.round(n)) : ""; };
  for (const r of rows) {
    const email = pick(r, "email").slice(0, 254);
    if (!store.isEmail(email)) { res.invalid++; continue; }
    const key = email.toLowerCase();
    const lcp = pick(r, "lcp", "homepage lcp (sec)");
    const lead = {
      email, first_name: (pick(r, "first_name", "owner name").split(/\s+/)[0] || "").slice(0, 60), store: pick(r, "store").slice(0, 150),
      domain: tpl.prettyDomain(pick(r, "domain", "website") || emailDomain(email)).slice(0, 150), country: normCountry(pick(r, "country")),
      category: pick(r, "category").slice(0, 100), niche: pick(r, "niche").slice(0, 100),
      psi: num(pick(r, "psi", "mobile pagespeed (0-100)")), lcp: /^\d+(\.\d+)?$/.test(lcp) ? lcp : "",
    };
    const cur = have.get(key);
    if (cur) {
      res.existing++;
      for (const k of ["first_name", "store", "category", "niche", "psi", "lcp"]) if (!cur[k] && lead[k]) cur[k] = lead[k];
      continue;
    }
    const t = Object.fromEntries(store.TRACK_FIELDS.map((f) => [f, ""]));
    Object.assign(t, lead, { step: "0", status: allowed.has(lead.country) ? "new" : "skipped-country" });
    track.push(t); have.set(key, t); res.added++;
  }
  applyRules(track, cfg);
  store.saveTracking(track);
  return res;
}

// ---------------------------------------------------------------- inbox classification
function classify(messages, track, myAddrs) {
  const mine = new Set(myAddrs.map((a) => a.toLowerCase()));
  const byEmail = new Map(track.map((t) => [t.email.toLowerCase(), t]));
  const byMsgId = new Map();
  const byDomain = new Map();
  const add = (k, t) => { if (!byDomain.has(k)) byDomain.set(k, []); byDomain.get(k).push(t); };
  for (const t of track) {
    for (const k of ["first_message_id", "last_message_id"]) if (t[k]) byMsgId.set(t[k].trim(), t);
    const ed = emailDomain(t.email);
    if (!FREE_MAIL.test(ed)) add(ed, t);
    add(String(t.domain).toLowerCase().replace(/^(shop|store|www)\./, ""), t);
  }
  const changes = [];
  const stamp = new Date().toISOString().slice(0, 10);
  for (const msg of messages) {
    const frm = msg.from;
    if (!frm || mine.has(frm)) continue;
    // Quoted history and our own footer (which contains "unsubscribe") must never decide anything.
    const fresh = stripOurFooter(msg.fresh || "");
    if (BOUNCE_FROM.test(msg.from_raw || "") || BOUNCE_SUBJ.test(msg.subject || "")) {
      const text = `${msg.subject}\n${msg.body}`;
      if (BOUNCE_DELAY.test(text) && !/action:\s*failed/i.test(text)) continue; // a delay notice, not a bounce
      if (!BOUNCE_PERMANENT.test(text)) continue;
      for (const addr of new Set((msg.body.match(EMAIL_RE) || []).map((a) => a.toLowerCase()))) {
        const t = byEmail.get(addr);
        if (t && ["active", "new", "finished"].includes(t.status)) {
          t.status = "bounced"; t.note = `bounce: ${msg.subject.slice(0, 60)}`;
          changes.push({ kind: "BOUNCED", lead: t, snippet: "" });
        }
      }
      continue;
    }
    let lead = byEmail.get(frm);
    if (!lead) {
      const ids = `${msg.in_reply_to} ${msg.references}`.split(/\s+/).filter(Boolean);
      const hit = ids.find((i) => byMsgId.has(i));
      lead = hit ? byMsgId.get(hit) : null;
    }
    if (!lead && frm.includes("@")) {
      const fd = emailDomain(frm);
      const cands = [...new Set(byDomain.get(fd) || [])];
      lead = cands.length === 1 && !FREE_MAIL.test(fd) ? cands[0] : null;
    }
    const wantsStop = STOP_WORDS.test(fresh) || STOP_WORDS.test(msg.subject || "") || ["no", "no.", "stop", "remove"].includes(fresh.trim().toLowerCase());
    if (!lead) {
      // A stop request we can't tie to a lead (forwarded, sent from another address): never ignore it.
      const isReply = Boolean(msg.in_reply_to || msg.references) || /^re:/i.test(msg.subject || "");
      if (wantsStop && isReply && !AUTO_REPLY.test(msg.subject || "")) {
        changes.push({ kind: "UNMATCHED-STOP", lead: { email: frm, store: "(unknown sender)", mailbox: "" }, snippet: fresh.replace(/\s+/g, " ").trim().slice(0, 300) });
      }
      continue;
    }
    if (DONE_STATUSES.includes(lead.status) || lead.status === "new") continue;
    if (AUTO_REPLY.test(msg.subject) && !STOP_WORDS.test(fresh)) { lead.note = `auto-reply ${stamp}`; continue; }
    const snippet = fresh.replace(/\s+/g, " ").trim().slice(0, 300);
    if (wantsStop) {
      lead.status = "unsubscribed"; lead.note = `asked to stop ${stamp}`;
      changes.push({ kind: "OPT-OUT", lead, snippet });
    } else {
      lead.status = "replied"; lead.note = `replied ${stamp} from ${frm}`; lead.replied_at = new Date().toISOString();
      changes.push({ kind: "REPLIED", lead, snippet });
    }
  }
  return changes;
}

// ---------------------------------------------------------------- warm-up, safety, planning
function dailyLimitFor(box, cfg, state, now = new Date()) {
  const ramp = cfg.sending.ramp, cap = cfg.sending.daily_limit;
  const start = ((state.mailboxes || {})[box.addr.toLowerCase()] || {}).first_live_send;
  if (!start) return Math.min(ramp[0], cap);
  const week = Math.floor(Math.max(0, daysBetween(start, today(cfg, now))) / 7);
  return Math.min(ramp[Math.min(week, ramp.length - 1)], cap);
}

function bounceCheck(track, box, cfg) {
  const addr = box.addr.toLowerCase();
  const mine = track.filter((t) => (t.mailbox || "").toLowerCase() === addr && (Number(t.step || 0) >= 1 || t.status === "bounced"));
  const bounced = mine.filter((t) => t.status === "bounced").length;
  const rate = mine.length ? (100 * bounced) / mine.length : 0;
  return { paused: mine.length >= 20 && rate >= cfg.sending.bounce_pause_percent, rate, sent: mine.length };
}

function dueFollowups(track, cfg, now = new Date()) {
  const gaps = cfg.sending.followup_gaps_days;
  return track.filter((t) => {
    if (t.status !== "active" || t.sending) return false;
    const step = Number(t.step || 0);
    return step >= 1 && step <= 3 && daysSince(t.last_sent, cfg, now) >= (gaps[step - 1] || gaps[gaps.length - 1]);
  });
}

const withTimeout = (promise, ms) => Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error("DNS timeout"), { code: "ETIMEOUT" })), ms).unref())]);

async function domainReceivesMail(domain) {
  try {
    const mx = await withTimeout(dns.resolveMx(domain), 6000);
    if (mx.length) return "yes";
  } catch (e) {
    if (!["ENODATA", "ENOTFOUND", "ENODOMAIN"].includes(e.code)) return "unknown"; // lookup itself failed: don't block
  }
  try { return (await withTimeout(dns.resolve4(domain), 6000)).length ? "yes" : "no"; } catch (e) {
    return ["ENODATA", "ENOTFOUND", "ENODOMAIN"].includes(e.code) ? "no" : "unknown";
  }
}

function readiness(cfg, boxes, { live }) {
  const problems = tpl.templateProblems(cfg);
  for (const k of ["name", "company", "website", "postal_address"]) {
    if (!String(cfg.signature[k] || "").trim() || /\[/.test(cfg.signature[k])) problems.push(`Settings > signature: ${k} is empty or still a placeholder`);
  }
  if (!boxes.length) problems.push("Settings: add at least one enabled sending mailbox");
  for (const b of boxes) {
    if (!store.isEmail(b.addr)) problems.push(`Mailbox ${b.id}: email address is not set`);
    else if (live && typeof b.hasPassword === "function" && !b.hasPassword()) problems.push(`Mailbox ${b.addr}: set the OUTREACH_PASSWORD_${b.id} environment variable on the server`);
  }
  return problems;
}

// ---------------------------------------------------------------- the run
/**
 * deps: { mailboxes: [boxes] (default: real ones from config), scanMailboxes, sleep(ms), mx(domain), now() }
 * Mailboxes send in parallel (each paces itself), so a day's sending takes about as long as ONE mailbox's share.
 * Returns a summary object. Throws nothing for normal "not ready" situations: they are logged.
 */
async function runOnce(opts = {}, deps = {}) {
  const cfg = opts.config || loadConfig();
  const dry = opts.forceDry ? true : cfg.sending.dry_run;
  const clock = () => (deps.now ? deps.now() : new Date());
  const now = clock();
  const boxes = deps.mailboxes || cfg.mailboxes.filter((m) => m.enabled && m.email).map((m) => new Mailbox(m));
  // Inboxes of switched-off mailboxes are still read (replies to earlier mail may arrive there), if they have a password.
  const extra = deps.mailboxes ? [] : cfg.mailboxes.filter((m) => m.email && !m.enabled).map((m) => new Mailbox(m)).filter((b) => b.hasPassword());
  const scanBoxes = deps.scanMailboxes || [...boxes, ...extra];
  const sleep = deps.sleep || sleepAbortable;
  const mx = deps.mx || domainReceivesMail;
  const summary = { mode: dry ? "dry" : "live", sent: 0, replies: 0, optOuts: 0, bounces: 0, problems: [], paused: [], note: "" };

  const problems = readiness(cfg, boxes, { live: !dry });
  if (problems.length) {
    log("NOT SENDING - fix these first:");
    problems.forEach((p) => log("  - " + p));
    summary.problems = problems;
    return summary;
  }
  const sendDay = isSendDay(cfg, now);
  log(`=== Run start v${VERSION} (${dry ? "DRY RUN" : "LIVE"}) - ${boxes.length} mailbox(es)${sendDay ? "" : " - not a send day, checking inboxes only"}`);

  const state = store.readJson("mailboxes.json", { mailboxes: {} });
  state.mailboxes = state.mailboxes || {};
  let track = loadState(cfg);
  const held = track.filter((t) => t.sending);
  if (held.length) log(`  WARNING: ${held.length} lead(s) were mid-send when an earlier run stopped unexpectedly and are on hold. Check your Sent folder, then resolve them in the dashboard.`);
  try {
    // 1. inboxes. Every change is saved lead-by-lead (never the whole list), so edits made in the dashboard
    //    while this scan is running can't be overwritten.
    if (!dry || cfg.sending.check_inbox_in_dry_run) {
      const all = [];
      const sendKeys = new Set(boxes.map((b) => b.addr.toLowerCase()));
      for (const box of scanBoxes) {
        const key = box.addr.toLowerCase();
        const mb = (state.mailboxes[key] ||= {});
        let res;
        try { res = await box.scanInbox({ sinceDays: 45, afterUid: mb.lastUid, uidValidity: mb.uidValidity }); } catch (e) {
          if (sendKeys.has(key)) {
            log(`  Inbox check failed for ${box.addr} (${e.message}). No sending this run, to be safe.`);
            summary.note = "inbox check failed";
            return summary;
          }
          log(`  (could not read the inbox of switched-off mailbox ${box.addr}: ${e.message})`);
          continue;
        }
        const msgs = Array.isArray(res) ? res : res.messages;
        const changes = classify(msgs, track, scanBoxes.map((b) => b.addr));
        for (const c of changes) {
          if (c.kind === "UNMATCHED-STOP") { if (!dry) store.addSuppression(c.lead.email); } else store.saveRow(c.lead);
        }
        all.push(...changes);
        if (!Array.isArray(res) && res.maxUid) { mb.lastUid = res.maxUid; mb.uidValidity = res.uidValidity; store.writeJson("mailboxes.json", state); }
      }
      for (const c of all) {
        log(`  ${c.kind.padEnd(8)} ${c.lead.email}  (${c.lead.store})${c.snippet ? `  "${c.snippet.slice(0, 80)}"` : ""}${c.kind === "UNMATCHED-STOP" && !dry ? "  -> added to do-not-contact" : ""}`);
        if (c.kind === "REPLIED") summary.replies++; else if (c.kind === "OPT-OUT" || c.kind === "UNMATCHED-STOP") summary.optOuts++; else summary.bounces++;
      }
      if (all.length) await notify(cfg, boxes, all, dry);
    }
    track = loadState(cfg);
    if (!sendDay) { log("=== Run end - today is not in send_days"); return summary; }

    // 2. budgets
    const doneToday = dry ? {} : sentTodayByBox(cfg, now);
    const budget = {};
    for (const box of boxes) {
      const key = box.addr.toLowerCase();
      const b = bounceCheck(track, box, cfg);
      if (b.paused) {
        log(`  PAUSED ${box.addr}: bounce rate ${b.rate.toFixed(1)}% over ${b.sent} leads. Remove dead addresses, then raise the pause limit in Settings to resume.`);
        budget[key] = 0; summary.paused.push(box.addr);
        continue;
      }
      const lim = dailyLimitFor(box, cfg, state, now);
      budget[key] = Math.max(0, lim - (doneToday[key] || 0));
      log(`  ${box.addr}: today's limit ${lim}, already sent ${doneToday[key] || 0}, budget ${budget[key]}`);
    }
    const byAddr = Object.fromEntries(boxes.map((b) => [b.addr.toLowerCase(), b]));

    // 3. plan: follow-ups first (from the mailbox that started the thread), then new leads spread over mailboxes
    const plan = new Map(boxes.map((b) => [b.addr.toLowerCase(), []]));
    const left = { ...budget };
    for (const t of dueFollowups(track, cfg, now)) {
      // Only an empty mailbox field may fall back to "the only mailbox": a thread that belongs to a switched-off
      // mailbox must not silently continue from another address.
      const box = byAddr[(t.mailbox || "").toLowerCase()] || (!t.mailbox && boxes.length === 1 ? boxes[0] : null);
      if (!box) { log(`  ${t.email}: its mailbox ${JSON.stringify(t.mailbox)} is switched off or removed - follow-up skipped`); continue; }
      const key = box.addr.toLowerCase();
      if ((left[key] || 0) <= 0) continue;
      t.mailbox = t.mailbox || box.addr;
      plan.get(key).push({ t, step: Number(t.step) + 1 }); left[key]--;
    }
    let rr = 0;
    for (const t of track.filter((x) => x.status === "new" && !x.sending)) {
      if (run.stop) break;
      const open = boxes.filter((b) => (left[b.addr.toLowerCase()] || 0) > 0);
      if (!open.length) break;
      if (cfg.sending.check_mx && !t.mx) {
        t.mx = await mx(emailDomain(t.email));
        if (t.mx !== "no") store.saveRow(t);
        if (t.mx === "no") {
          t.status = "skipped-no-mailserver"; t.note = "email domain has no mail server";
          log(`  ${t.email}: domain can't receive mail - skipped`);
          store.saveRow(t);
          continue;
        }
      }
      const box = open[rr++ % open.length];
      plan.get(box.addr.toLowerCase()).push({ t, step: 1 }); left[box.addr.toLowerCase()]--;
    }

    // 4. send. Returns "sent" | "skipped" | "stop" (stop = this mailbox is done for today).
    const deliver = async (t, step, box) => {
      // Re-read the lead right before sending: it may have been marked do-not-contact, replied, imported again
      // or edited in the dashboard since the plan was made (a run can take a while).
      const current = store.loadTracking().find((x) => x.email.toLowerCase() === t.email.toLowerCase());
      const why = !current ? "no longer in the lead list"
        : current.sending ? "on hold"
        : DONE_STATUSES.includes(current.status) ? `now ${current.status}`
        : suppressed(current.email, store.loadSuppression()) ? "on the do-not-contact list"
        : step === 1 ? (current.status !== "new" ? `status is ${current.status}` : "")
        : (current.status !== "active" || Number(current.step) !== step - 1 ? `status changed (${current.status}, step ${current.step})` : "");
      if (why) { log(`  skipped ${t.email}: ${why}`); return "skipped"; }
      const mailboxHint = t.mailbox;
      for (const f of store.ENGINE_FIELDS) t[f] = current[f];
      t.mailbox = t.mailbox || mailboxHint;

      const variant = tpl.pickVariant(t, step);
      const r = tpl.render(step, t, cfg, variant);
      const html = cfg.sending.html_emails ? r.html : undefined;
      const subject = step > 1 ? (/^re:/i.test(t.subject) ? t.subject : "Re: " + t.subject) : r.subject;
      const refs = [...new Set([t.first_message_id, t.last_message_id].filter(Boolean))];
      const tag = `email ${step}${variant !== "a" ? variant : ""}`;
      const logRow = { date: clock().toISOString(), mode: dry ? "dry" : "live", mailbox: box.addr, email: t.email, store: t.store, step, variant, subject };
      if (dry) {
        log(`  [dry run] ${box.addr} would send ${tag} to ${t.email}: ${subject}`);
        try { store.appendSentLog(logRow); } catch (e) { /* planning only */ }
        summary.sent++;
        return "sent";
      }
      // Write-ahead marker: if the process dies between the SMTP send and the save below, this lead is
      // held for a human check instead of being emailed twice.
      t.sending = String(step);
      store.saveRow(t);
      let sent;
      try {
        sent = await box.send({ to: t.email, subject, text: r.text, html, inReplyTo: step > 1 ? refs[refs.length - 1] : undefined, references: step > 1 ? refs : undefined });
      } catch (e) {
        if (e.code === "EENVELOPE" || (/recipient/i.test(e.message || "") && e.responseCode >= 500)) {
          const rc = Number(e.responseCode || (e.rejectedErrors && e.rejectedErrors[0] && e.rejectedErrors[0].responseCode) || 0);
          t.sending = "";
          if (rc >= 400 && rc < 500) { // greylisting / temporary: leave the lead as it was and try again on a later run
            log(`  TEMPORARY refusal for ${t.email} (${rc}) - will try again on a later run`);
          } else {
            t.status = "bounced"; t.note = "recipient refused by server"; t.mailbox = box.addr;
            log(`  REFUSED ${t.email}`);
          }
          store.saveRow(t);
          return "skipped";
        }
        // A timeout or dropped connection may have happened after the server accepted the message: keep the
        // marker so a person checks the Sent folder. Any other failure definitely did not send: clear it.
        const unsure = ["ETIMEDOUT", "ESOCKET"].includes(e.code);
        if (unsure) log(`  UNSURE whether ${t.email} was sent (${e.code}). Held for a manual check in the dashboard - it will not be retried automatically.`);
        else { t.sending = ""; store.saveRow(t); }
        log(`  Could not send from ${box.addr} (${e.code || e.responseCode || "error"}: ${String(e.message).slice(0, 120)}). Stopping this mailbox for today.`);
        return "stop";
      }
      // The mail is out. Record it in the order that matters most; one failure must not abort the run.
      summary.sent++;
      log(`  SENT ${tag} ${box.addr} -> ${t.email} (${t.store})`);
      try { store.appendSentLog(logRow); } catch (e) { log(`  WARNING: could not write the sent log (${e.message})`); }
      try {
        const mb = (state.mailboxes[box.addr.toLowerCase()] ||= {});
        if (!mb.first_live_send) mb.first_live_send = today(cfg, now);
        store.writeJson("mailboxes.json", state);
      } catch (e) { log(`  WARNING: could not save mailbox state (${e.message})`); }
      try {
        t.sending = ""; t.step = String(step); t.last_sent = clock().toISOString(); t.last_message_id = sent.messageId;
        if (step === 1) { t.first_message_id = sent.messageId; t.subject = subject; t.status = "active"; t.mailbox = box.addr; t.variant = variant; }
        if (step === 4) t.status = "finished";
        store.saveRow(t);
      } catch (e) { log(`  WARNING: ${t.email} WAS emailed but the lead could not be saved (${e.message}). It stays on hold; check it in the dashboard.`); }
      return "sent";
    };

    const worker = async (box) => {
      const key = box.addr.toLowerCase();
      let sentOne = false;
      for (const item of plan.get(key)) {
        if (run.stop) break;
        if (!dry && sentOne) { // each mailbox paces itself; mailboxes run side by side
          const wait = cfg.sending.min_delay_seconds + Math.floor(Math.random() * (cfg.sending.max_delay_seconds - cfg.sending.min_delay_seconds + 1));
          log(`  ${box.addr}: waiting ${wait}s ...`);
          await sleep(wait * 1000);
          if (run.stop) break;
        }
        const r = await deliver(item.t, item.step, box);
        if (r === "stop") break;
        if (r === "sent") sentOne = true;
      }
    };
    const outcomes = await Promise.allSettled(boxes.map(worker));
    outcomes.forEach((o, i) => { if (o.status === "rejected") log(`  ERROR in ${boxes[i].addr}: ${o.reason && o.reason.message}`); });
  } finally {
    for (const b of new Set([...boxes, ...scanBoxes])) b.close && b.close();
  }
  log(`=== Run end - emails ${dry ? "planned" : "sent"} this run: ${summary.sent}${run.stop ? " (stopped early)" : ""}`);
  return summary;
}

function sentTodayByBox(cfg, now) {
  const t0 = today(cfg, now), c = {};
  for (const r of store.readCsv("sent_log.csv")) {
    if (r.mode === "live" && tzParts(new Date(r.date), cfg.sending.timezone).date === t0) c[(r.mailbox || "").toLowerCase()] = (c[(r.mailbox || "").toLowerCase()] || 0) + 1;
  }
  return c;
}

async function notify(cfg, boxes, changes, dry) {
  const to = cfg.sending.notify_email;
  const hits = changes.filter((c) => ["REPLIED", "OPT-OUT", "UNMATCHED-STOP"].includes(c.kind));
  if (!to || !hits.length || dry || !boxes.length) return;
  const replied = hits.filter((c) => c.kind === "REPLIED").length;
  const text = "New activity from your outreach:\n\n" + hits.map((c) => c.kind === "UNMATCHED-STOP"
    ? `STOP REQUEST from ${c.lead.email} (not matched to a lead; added to your do-not-contact list)\n    "${c.snippet}"\n`
    : `${c.kind}: ${c.lead.store} <${c.lead.email}>  (via ${c.lead.mailbox || "?"})\n    "${c.snippet}"\n`).join("\n") +
    (replied ? "\nSend the free video audit to people who replied within 24 hours - from the mailbox they wrote to.\n" : "");
  try {
    await boxes[0].send({ to, subject: replied ? `Outreach: ${replied} new repl${replied === 1 ? "y" : "ies"}` : "Outreach: opt-outs recorded", text, listUnsubscribe: false }, { saveCopy: false });
    log(`  Notified ${to} about ${hits.length} inbox change(s).`);
  } catch (e) { log(`  Could not send notification email: ${e.message}`); }
}

// ---------------------------------------------------------------- background runner (file lock + status)
const LOCK = () => store.P("outreach.lock");
const LOCK_STALE_MS = 10 * 60 * 1000; // the running process touches the lock every minute
function acquireLock() {
  store.ensureDir();
  try {
    const st = fs.statSync(LOCK());
    const pid = parseInt(fs.readFileSync(LOCK(), "utf8"), 10);
    let alive = false;
    try { process.kill(pid, 0); alive = true; } catch (e) { alive = e.code === "EPERM"; }
    if (alive && Date.now() - st.mtimeMs < LOCK_STALE_MS) return false; // a live run owns it
    fs.unlinkSync(LOCK()); // owner is gone (crash/restart) or stopped touching it: take over at once
  } catch (e) { /* no lock */ }
  try { fs.writeFileSync(LOCK(), `${process.pid} ${new Date().toISOString()}`, { flag: "wx" }); return true; } catch (e) { return false; }
}
function releaseLock() { try { fs.unlinkSync(LOCK()); } catch (e) { /* ignore */ } }

/** Starts a run in the background. Returns { started } or { started:false, reason }. */
function startRun(opts = {}, deps = {}) {
  if (run.running || !acquireLock()) return { started: false, reason: "A run is already in progress." };
  run.running = true; run.stop = false; run.startedAt = new Date().toISOString(); run.mode = opts.forceDry ? "dry" : loadConfig().sending.dry_run ? "dry" : "live";
  const beat = setInterval(() => { try { const t = new Date(); fs.utimesSync(LOCK(), t, t); } catch (e) { /* lock gone */ } }, 60 * 1000);
  beat.unref();
  log(`Run requested (${opts.source || "dashboard"})`);
  const done = runOnce(opts, deps).then((s) => { run.last = { ...s, at: new Date().toISOString(), source: opts.source || "dashboard" }; })
    .catch((e) => { log(`Run failed: ${e.stack || e.message}`); run.last = { error: e.message, at: new Date().toISOString(), source: opts.source || "dashboard" }; })
    .finally(() => { clearInterval(beat); run.running = false; run.stop = false; releaseLock(); });
  return { started: true, done };
}

// ---------------------------------------------------------------- preview + status
function previewNext(n, cfg = loadConfig(), boxes) {
  const track = loadState(cfg);
  const usable = (boxes || cfg.mailboxes.filter((m) => m.enabled && m.email)).map((b) => b.addr || b.email);
  const out = [];
  const add = (t, step) => {
    const variant = tpl.pickVariant(t, step);
    const r = tpl.render(step, t, cfg, variant);
    out.push({ to: t.email, store: t.store, from: step === 1 ? usable[out.length % (usable.length || 1)] || "" : t.mailbox, step, variant,
      subject: step > 1 ? (/^re:/i.test(t.subject) ? t.subject : "Re: " + t.subject) : r.subject, text: r.text, html: r.html });
  };
  for (const t of dueFollowups(track, cfg)) { if (out.length >= n) break; add(t, Number(t.step) + 1); }
  for (const t of track.filter((x) => x.status === "new" && !x.sending)) { if (out.length >= n) break; add(t, 1); }
  return out;
}

function status(cfg = loadConfig(), now = new Date()) {
  const track = store.loadTracking();
  const state = store.readJson("mailboxes.json", { mailboxes: {} });
  const count = (arr, f) => arr.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});
  const started = track.filter((t) => Number(t.step || 0) >= 1 || ["replied", "unsubscribed"].includes(t.status));
  const group = (keyFn) => {
    const g = {};
    for (const t of started) { const k = keyFn(t); (g[k] ||= { started: 0, replied: 0, bounced: 0 }); g[k].started++; if (t.status === "replied") g[k].replied++; if (t.status === "bounced") g[k].bounced++; }
    return g;
  };
  const doneToday = sentTodayByBox(cfg, now);
  const mailboxes = cfg.mailboxes.filter((m) => m.email).map((m) => {
    const key = m.email.toLowerCase(), box = { addr: m.email };
    const b = bounceCheck(track, box, cfg);
    return { id: m.id, email: m.email, enabled: m.enabled, passwordSet: Boolean(passwordFor(m)), firstLiveSend: (state.mailboxes[key] || {}).first_live_send || "",
      todayLimit: dailyLimitFor(box, cfg, state, now), sentToday: doneToday[key] || 0, bounceRate: Math.round(b.rate * 10) / 10, paused: b.paused };
  });
  const daily = mailboxes.filter((m) => m.enabled && !m.paused).reduce((a, m) => a + m.todayLimit, 0);
  const remaining = track.filter((t) => t.status === "new").length;
  return {
    version: VERSION, dryRun: cfg.sending.dry_run, sendDay: isSendDay(cfg, now), today: today(cfg, now),
    total: track.length, byStatus: count(track, (t) => t.status), byMailbox: group((t) => t.mailbox || "?"), byVariant: group((t) => t.variant || "a"),
    furthestStep: count(started.filter((t) => Number(t.step)), (t) => `email ${t.step}`), mailboxes, remaining,
    daysLeft: remaining && daily ? Math.ceil(remaining / daily) : 0,
    replied: track.filter((t) => t.status === "replied").sort((a, b) => String(b.replied_at).localeCompare(String(a.replied_at))).map((t) => ({
      email: t.email, store: t.store, mailbox: t.mailbox, note: t.note, repliedAt: t.replied_at, loomSent: t.loom_sent === "1", domain: t.domain })),
    held: track.filter((t) => t.sending).map((t) => ({ email: t.email, store: t.store, step: t.sending, mailbox: t.mailbox })),
    problems: readiness(cfg, cfg.mailboxes.filter((m) => m.enabled && m.email).map((m) => new Mailbox(m)), { live: !cfg.sending.dry_run }),
    running: run.running, startedAt: run.startedAt, runMode: run.mode, last: run.last, log: run.lines.slice(-200),
  };
}

// ---------------------------------------------------------------- go-live checks
/** Sends one sample "email 1" from every enabled mailbox to `to`. Returns { problems } or { results }. */
async function sendTest(to, cfg = loadConfig(), deps = {}) {
  if (!store.isEmail(String(to))) throw new Error("Enter a valid email address to send the test to.");
  const boxes = deps.mailboxes || cfg.mailboxes.filter((m) => m.enabled && m.email).map((m) => new Mailbox(m));
  const problems = readiness(cfg, boxes, { live: true });
  if (problems.length) return { problems };
  const track = store.loadTracking();
  const sample = { ...(track.find((t) => t.psi) || tpl.SAMPLE_LEAD), email: String(to) };
  const results = [];
  for (const box of boxes) {
    try {
      const variant = tpl.pickVariant(sample, 1);
      const r = tpl.render(1, sample, cfg, variant);
      await box.send({ to, subject: "[TEST] " + r.subject, text: r.text, html: cfg.sending.html_emails ? r.html : undefined }, { saveCopy: false });
      results.push({ mailbox: box.addr, ok: true });
    } catch (e) { results.push({ mailbox: box.addr, ok: false, error: String(e.message).slice(0, 160) }); }
    finally { box.close && box.close(); }
  }
  log(`Test email sent to ${to}: ${results.filter((r) => r.ok).length} of ${results.length} mailbox(es) OK`);
  return { results };
}

/** MX / SPF / DKIM / DMARC status for each sending domain. `resolver` is injectable for tests. */
async function dnsHealth(cfg = loadConfig(), resolver = dns) {
  const lookup = async (fn, ...args) => { try { return await withTimeout(fn.apply(resolver, args), 6000); } catch (e) { return ["ENODATA", "ENOTFOUND", "ENODOMAIN"].includes(e.code) ? [] : null; } };
  const flat = (txt) => (txt || []).map((r) => r.join("")).filter(Boolean);
  const domains = [...new Set(cfg.mailboxes.filter((m) => m.enabled && /@/.test(m.email)).map((m) => m.email.split("@")[1].toLowerCase()))];
  const out = [];
  for (const domain of domains) {
    const mx = await lookup(resolver.resolveMx, domain);
    const txt = flat(await lookup(resolver.resolveTxt, domain));
    const spf = txt.filter((t) => /^v=spf1/i.test(t));
    let dkim = null;
    for (const sel of ["hostingermail-a", "hostingermail-b", "hostingermail-c", "hostingermail1", "default", "selector1", "google"]) {
      const c = await lookup(resolver.resolveCname, `${sel}._domainkey.${domain}`);
      const t = c && c.length ? c : flat(await lookup(resolver.resolveTxt, `${sel}._domainkey.${domain}`));
      if (t && t.length) { dkim = sel; break; }
    }
    const dmarc = flat(await lookup(resolver.resolveTxt, `_dmarc.${domain}`)).filter((t) => /^v=dmarc1/i.test(t));
    out.push({ domain, checks: [
      { name: "MX", status: mx === null ? "unknown" : mx.length ? "ok" : "bad", detail: mx === null ? "lookup failed" : mx.length ? mx.map((m) => m.exchange).join(", ") : "missing: this domain cannot receive replies" },
      { name: "SPF", status: spf.length === 1 ? "ok" : spf.length ? "bad" : "bad", detail: spf.length === 1 ? spf[0] : spf.length ? "more than one SPF record: merge them into one" : "missing: add the SPF record from Hostinger > Emails > DNS" },
      { name: "DKIM", status: dkim ? "ok" : "warn", detail: dkim ? `selector ${dkim}` : "not found: enable DKIM in Hostinger > Emails > DNS (your selector may be one we don't try)" },
      { name: "DMARC", status: dmarc.length ? "ok" : "warn", detail: dmarc.length ? dmarc[0] : "missing: add TXT _dmarc  v=DMARC1; p=none; rua=mailto:you@yourdomain" },
    ] });
  }
  return out;
}

/** Resolve a lead held by the write-ahead marker. "retry": it was not sent, allow sending again. "skip": never email them. */
function resolveHeld(email, action) {
  const row = store.loadTracking().find((t) => t.email.toLowerCase() === String(email).toLowerCase());
  if (!row || !row.sending) return null;
  if (action === "retry") return store.updateLead(row.email, { sending: "", note: `hold cleared ${new Date().toISOString().slice(0, 10)}` });
  if (action === "skip") return store.updateLead(row.email, { sending: "", status: "do-not-contact", note: "held after unsure send; skipped by you" });
  return null;
}

module.exports = { sendTest, dnsHealth, resolveHeld, VERSION, DEFAULT_CONFIG, loadConfig, saveConfig, sanitizeConfig, importLeads, classify, dailyLimitFor, bounceCheck, dueFollowups, runOnce,
  startRun, requestStop, previewNext, status, readiness, applyRules, loadState, tzParts, isSendDay, today, daysSince, run, log };
