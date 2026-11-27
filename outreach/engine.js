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
const { normState, normCountry } = require("./geo");
const tpl = require("./templates");
const cleaner = require("./cleaner");
const research = require("./research");
const { Mailbox, passwordFor } = require("./mail");
const { stripOurFooter } = require("./inbound");
const richtext = require("./richtext");
const clicks = require("./clicks");
const ai = require("./ai");
const unsub = require("./unsub");
const webhook = require("./webhook");
const warmup = require("./warmup");

const VERSION = "2.5";
const MAX_PER_MAILBOX_PER_DAY = 100; // hard cap per mailbox (raised from 40 so one mailbox can send every 15-20 minutes around the clock)
const RESCAN_MS = 10 * 60 * 1000;    // during a long run, re-read the inboxes at least this often so replies and opt-outs stop the sequence promptly
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

// ---------------------------------------------------------------- config
// What a fresh install (or a wiped data folder) starts with: the owner's own settings, taken from their backup of 2026-10-13.
// Anything saved in the dashboard wins over these. Live sending stays OFF by default. The notification address is private,
// so it is not written here: set OUTREACH_NOTIFY_EMAIL in Hostinger and it becomes the default (see loadConfig).
const DEFAULT_CONFIG = {
  signature: { name: "Hassan Ali", title: "Founder", company: "WebersLink", website: "weberslink.org",
    postal_address: "2315 Chestnut Street, Montgomery, Alabama 36107, United States", accent_color: "#ef1421", logo: true },
  sending: {
    dry_run: true, countries: ["US", "UK"], send_days: ["Mon", "Tue", "Wed", "Thu", "Fri"], timezone: "America/New_York",
    daily_limit: 20, ramp: [5, 10, 15, 20], followup_gaps_days: [3, 4, 7], min_delay_seconds: 600, max_delay_seconds: 1200,
    notify_email: "", html_emails: true, check_mx: true, bounce_pause_percent: 3, check_inbox_in_dry_run: false, auto_run: true, track_clicks: true,
    window_enabled: true, window_start: "19:00", window_end: "07:00",
  },
  mailboxes: [
    { id: 1, email: "hassan@weberslink.org", from_name: "Hassan Ali", enabled: true, smtp_host: "smtp.hostinger.com", smtp_port: 465, imap_host: "imap.hostinger.com", imap_port: 993 },
    { id: 2, email: "adil_ishtiaq@weberslink.org", from_name: "Adil Ishtiaq", enabled: true, smtp_host: "smtp.hostinger.com", smtp_port: 465, imap_host: "imap.hostinger.com", imap_port: 993 },
    { id: 3, email: "sienna_carter@weberslink.org", from_name: "Sienna Carter", enabled: true, smtp_host: "smtp.hostinger.com", smtp_port: 465, imap_host: "imap.hostinger.com", imap_port: 993 },
  ],
  // Gemini features (need GEMINI_OUTREACH_KEY on the server). They only ever make sending MORE careful; nothing is sent by the AI.
  ai: { classify_replies: true, draft_replies: true, icp: "", min_score: 0, prioritise_by_score: true, booking_link: "", offer: "a free 3-minute video audit of their store's website", webhook_url: "" },
  // Mailboxes warm each other up: a few short messages a day between your own inboxes, opened, rescued from spam and answered.
  warmup: { enabled: false, per_day: 4, reply_percent: 60 },
  // Campaigns: groups of leads by place and business type, each with its own mailboxes, daily cap and (optionally) email copy.
  // With no campaigns every lead is emailed as before; once any exist, only leads in an ON campaign are emailed.
  campaigns: [],
};

function loadConfig() {
  const saved = store.readJson("config.json", {});
  const cfg = {
    signature: { ...DEFAULT_CONFIG.signature, ...(saved.signature || {}) },
    sending: { ...DEFAULT_CONFIG.sending, ...(saved.sending || {}) },
    // Defaults only apply when nothing was ever saved; a saved empty list means "no mailboxes" on purpose.
    mailboxes: Array.isArray(saved.mailboxes) ? saved.mailboxes : DEFAULT_CONFIG.mailboxes.map((m) => ({ ...m })),
    ai: { ...DEFAULT_CONFIG.ai, ...(saved.ai || {}) },
    warmup: { ...DEFAULT_CONFIG.warmup, ...(saved.warmup || {}) },
    campaigns: Array.isArray(saved.campaigns) ? saved.campaigns : [],
  };
  if (!cfg.sending.notify_email) cfg.sending.notify_email = String(process.env.OUTREACH_NOTIFY_EMAIL || "").trim();
  return cfg;
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
      logo: g.logo === undefined ? d.signature.logo : !(g.logo === false || g.logo === "false"),
    },
    sending: {
      dry_run: s.dry_run !== false,
      countries: [...new Set(intList0(s.countries, d.sending.countries).map((c) => c.toUpperCase()))],
      send_days: intList0(s.send_days, d.sending.send_days).map((x) => x.slice(0, 1).toUpperCase() + x.slice(1, 3).toLowerCase()).filter((x) => DAYS.includes(x.toLowerCase())),
      timezone: tz,
      daily_limit: intIn(s.daily_limit, 1, MAX_PER_MAILBOX_PER_DAY, 40), // hard cap: never above MAX_PER_MAILBOX_PER_DAY per mailbox
      ramp: intList(s.ramp, d.sending.ramp).map((x) => Math.min(x, MAX_PER_MAILBOX_PER_DAY)),
      followup_gaps_days: intList(s.followup_gaps_days, d.sending.followup_gaps_days).slice(0, 3),
      min_delay_seconds: minD,
      max_delay_seconds: Math.max(minD, intIn(s.max_delay_seconds, 0, 7200, d.sending.max_delay_seconds)),
      notify_email: str(s.notify_email, 200), html_emails: s.html_emails !== false, check_mx: s.check_mx !== false,
      bounce_pause_percent: intIn(s.bounce_pause_percent, 1, 50, 3), check_inbox_in_dry_run: Boolean(s.check_inbox_in_dry_run), auto_run: s.auto_run !== false, track_clicks: s.track_clicks !== false,
      window_enabled: s.window_enabled === true, window_start: hhmm(s.window_start, d.sending.window_start), window_end: hhmm(s.window_end, d.sending.window_end),
    },
    mailboxes: sanitizeMailboxes(input.mailboxes),
    ai: sanitizeAi(input.ai),
    warmup: sanitizeWarmup(input.warmup),
    campaigns: sanitizeCampaigns(input.campaigns),
  };
  if (out.sending.notify_email && !store.isEmail(out.sending.notify_email)) throw new Error("Notification email is not a valid address");
  for (const m of out.mailboxes) if (m.email && !store.isEmail(m.email)) throw new Error(`Mailbox "${m.email}" is not a valid address`);
  if (!out.sending.send_days.length) throw new Error("Choose at least one send day");
  if (out.sending.window_enabled && out.sending.window_start === out.sending.window_end) throw new Error("The sending window's start and end times must be different");
  return out;
}
function sanitizeAi(a = {}) {
  const d = DEFAULT_CONFIG.ai;
  const https = (v) => { const x = str(v, 500); if (!x) return ""; try { const u = new URL(x); if (u.protocol !== "https:") throw 0; return u.toString(); } catch (e) { throw new Error(`"${x.slice(0, 60)}" must be a full https:// address`); } };
  return {
    classify_replies: a.classify_replies !== false, draft_replies: a.draft_replies !== false, prioritise_by_score: a.prioritise_by_score !== false,
    icp: str(a.icp, 1200), min_score: intIn(a.min_score, 0, 10, 0), booking_link: https(a.booking_link), offer: str(a.offer, 200) || d.offer, webhook_url: https(a.webhook_url),
  };
}

/** Campaigns from the dashboard. Ids are permanent (like mailbox ids) because leads remember the id of their campaign. */
function sanitizeCampaigns(list) {
  const incoming = (Array.isArray(list) ? list : []).slice(0, 20);
  const used = new Set();
  const ids = incoming.map((c) => { const id = Number(c && c.id); if (Number.isInteger(id) && id >= 1 && id <= 99 && !used.has(id)) { used.add(id); return id; } return 0; });
  const words = (v, f = (x) => x) => [...new Set(intList0(v, []).map((x) => f(str(x, 60))).filter(Boolean))].slice(0, 40);
  return incoming.map((c, i) => {
    let id = ids[i];
    if (!id) { id = 1; while (used.has(id)) id++; used.add(id); }
    return {
      id, name: str(c.name, 60) || `Campaign ${id}`, enabled: c.enabled !== false,
      countries: words(c.countries, (x) => normCountry(x)), states: words(c.states, normState), cities: words(c.cities), types: words(c.types),
      mailboxes: [...new Set((Array.isArray(c.mailboxes) ? c.mailboxes : []).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 99))],
      daily_limit: intIn(c.daily_limit, 0, 1000, 0), // 0 = no cap of its own (the mailboxes' limits still apply)
    };
  });
}

function sanitizeWarmup(w = {}) {
  return { enabled: w.enabled === true, per_day: intIn(w.per_day, 1, 20, 4), reply_percent: intIn(w.reply_percent, 0, 100, 60) };
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
      id, email: str(m.email, 200), from_name: str(m.from_name, 100), title: str(m.title, 100), enabled: m.enabled !== false,
      smtp_host: str(m.smtp_host, 200) || "smtp.hostinger.com", smtp_port: intIn(m.smtp_port, 1, 65535, 465),
      imap_host: str(m.imap_host, 200) || "imap.hostinger.com", imap_port: intIn(m.imap_port, 1, 65535, 993),
    };
    for (const k of ["smtp_host", "imap_host"]) {
      if (box.email && !hostAllowed(box[k])) throw new Error(`The server "${box[k]}" isn't allowed. Mailbox passwords are only sent to Hostinger servers unless you list the host in the OUTREACH_ALLOWED_HOSTS environment variable.`);
    }
    return box;
  });
}

/** "7:05" -> "07:05". Anything that isn't a 24-hour time falls back to the default. */
function hhmm(v, d) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(v == null ? "" : v).trim());
  return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? `${m[1].padStart(2, "0")}:${m[2]}` : d;
}

function intList0(v, d) { const a = (Array.isArray(v) ? v : String(v == null ? "" : v).split(",")).map((x) => String(x).trim()).filter(Boolean); return a.length ? a : d; }

function saveConfig(cfg) {
  store.writeJson("config.json", cfg);
}

// ---------------------------------------------------------------- dates (in the sending time zone)
function tzParts(date, tz) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const g = (t) => f.find((p) => p.type === t).value;
  return { date: `${g("year")}-${g("month")}-${g("day")}`, weekday: g("weekday").slice(0, 3).toLowerCase(), hour: parseInt(g("hour"), 10), minute: parseInt(g("minute"), 10) };
}

// ---- optional daily sending window (e.g. 19:00 to 07:00, which crosses midnight) in the sending time zone
const toMin = (hm) => { const m = /^(\d{2}):(\d{2})$/.exec(hm || ""); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
function windowOf(cfg) {
  const s = cfg.sending;
  if (!s.window_enabled) return null;
  const a = toMin(s.window_start), b = toMin(s.window_end);
  return a == null || b == null || a === b ? null : { start: a, end: b, crosses: a > b };
}
const minuteOfDay = (cfg, now) => { const p = tzParts(now, cfg.sending.timezone); return p.hour * 60 + p.minute; };
function inWindow(cfg, now = new Date()) {
  const w = windowOf(cfg);
  if (!w) return true;
  const m = minuteOfDay(cfg, now);
  return w.crosses ? m >= w.start || m < w.end : m >= w.start && m < w.end;
}
/** Minutes until the window opens (0 if open now). */
function minutesToOpen(cfg, now = new Date()) {
  const w = windowOf(cfg);
  return !w || inWindow(cfg, now) ? 0 : (w.start - minuteOfDay(cfg, now) + 1440) % 1440;
}
/** Minutes until the window closes (only meaningful while it is open). */
function minutesToClose(cfg, now = new Date()) {
  const w = windowOf(cfg);
  return w ? (w.end - minuteOfDay(cfg, now) + 1440) % 1440 || 1440 : 1440;
}
/**
 * The "campaign day" of a moment: the calendar date, except that the small hours after midnight still belong to the
 * evening window that started the day before (Mon 19:00 to Tue 07:00 is ONE Monday campaign day: one budget, one send day).
 */
function campaignDate(cfg, d) {
  const p = tzParts(d, cfg.sending.timezone), w = windowOf(cfg);
  return w && w.crosses && p.hour * 60 + p.minute < w.end ? new Date(Date.parse(p.date + "T12:00:00Z") - 864e5).toISOString().slice(0, 10) : p.date;
}
const today = (cfg, now = new Date()) => campaignDate(cfg, now);
/** Should the app start a run by itself right now? Only when Live sending is on, automatic running is not switched off,
 *  and sending is allowed at this moment (no daily window, or the window is open). */
function autoRunDue(cfg, now = new Date(), env = process.env) {
  if (env.OUTREACH_AUTO_RUN === "off" || cfg.sending.dry_run || cfg.sending.auto_run === false) return false;
  const w = windowState(cfg, now);
  return !w.enabled || w.open;
}
function windowState(cfg, now = new Date()) {
  const w = windowOf(cfg);
  if (!w) return { enabled: false };
  const open = inWindow(cfg, now);
  return { enabled: true, start: cfg.sending.window_start, end: cfg.sending.window_end, timezone: cfg.sending.timezone, open, minutesToOpen: minutesToOpen(cfg, now), minutesToClose: open ? minutesToClose(cfg, now) : 0 };
}
function daysBetween(a, b) { return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5); }
function daysSince(iso, cfg, now = new Date()) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return 0;
  return daysBetween(campaignDate(cfg, d), today(cfg, now));
}
const addDays = (dateStr, n) => new Date(Date.parse(dateStr + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);

/** Plain-English "what happens next" for one lead, for the Leads table. */
function nextEmail(t, cfg, now = new Date()) {
  const send = cfg.sending.send_days.map((d) => d.toLowerCase().slice(0, 3));
  const nextSendDay = (from) => { let d = from; for (let i = 0; i < 8 && !send.includes(tzParts(new Date(d + "T12:00:00Z"), "UTC").weekday); i++) d = addDays(d, 1); return d; };
  const step = Number(t.step || 0);
  if (t.sending) return "On hold (check it)";
  if (t.status === "new") return "Email 1 on the next send day";
  if (t.status === "finished") return "Sequence complete";
  if (t.status === cleaner.SKIPPED) return t.note ? `Skipped: ${t.note}` : "Skipped by the list cleaner";
  if (t.status !== "active" || step < 1 || step > 3) return "";
  if (snoozed(t, cfg, now)) return `Paused until ${t.snooze_until} (out of office)`;
  const lastDay = campaignDate(cfg, new Date(t.last_sent));
  const gap = cfg.sending.followup_gaps_days[step - 1] || cfg.sending.followup_gaps_days[cfg.sending.followup_gaps_days.length - 1];
  const due = nextSendDay(addDays(lastDay, gap));
  return daysBetween(today(cfg, now), due) <= 0 ? `Email ${step + 1} due on the next run` : `Email ${step + 1} on ${due}`;
}

function isSendDay(cfg, now = new Date()) {
  const day = campaignDate(cfg, now); // which campaign day it is (a window crossing midnight counts as the day it started)
  return cfg.sending.send_days.map((d) => d.toLowerCase().slice(0, 3)).includes(tzParts(new Date(day + "T12:00:00Z"), "UTC").weekday);
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
// ---- what happened last time, in plain words, kept on disk so it survives restarts
const writeLastRun = (o) => { try { store.writeJson("last_run.json", o); } catch (e) { /* diagnostics must never break a run */ } };
const readLastRun = () => store.readJson("last_run.json", null);
/** The last lines of the run log file: the history is still there after a restart even though memory is empty. */
function logTail(n = 200) {
  try {
    const f = store.P("run_log.txt"), size = fs.statSync(f).size, len = Math.min(size, 96 * 1024);
    const fd = fs.openSync(f, "r"), buf = Buffer.alloc(len);
    try { fs.readSync(fd, buf, 0, len, size - len); } finally { fs.closeSync(fd); }
    return buf.toString("utf8").split("\n").filter(Boolean).slice(-n);
  } catch (e) { return []; }
}
/** A run left "running" by a previous process was cut off (typically the host stopped an idle app). Say so. */
function markInterrupted() {
  const last = readLastRun();
  if (last && last.status === "running" && !run.running) {
    writeLastRun({ ...last, status: "interrupted", at: new Date().toISOString(),
      reason: `The server was restarted or stopped while this run was in progress (hosts like Hostinger can stop an idle app). Nothing is lost: leads that were not emailed are still waiting. Run again, or let the 30-minute cron job continue it.` });
  }
}
markInterrupted();

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
/** One address per business from a cell holding several ("a@x.com; b@x.com"): prefer a business-domain address over free mail. */
function pickEmail(cell) {
  const all = String(cell || "").split(/[;\n]+/).map((e) => e.trim()).filter((e) => store.isEmail(e));
  return all.find((e) => !FREE_MAIL.test(emailDomain(e))) || all[0] || "";
}
/** Spreadsheets without a country column: a US ZIP code in the address or a (###) ###-#### phone means US. */
function guessCountry(r, pick) {
  const addr = pick(r, "address");
  return /\b[A-Z]{2} \d{5}\b/.test(addr) || /^\(\d{3}\) \d{3}-\d{4}/.test(pick(r, "phone (maps)", "phone")) ? "US" : "";
}
/** State and city from their own columns, or from a US street address ("..., Dallas, TX 75201"). */
function placeOf(r, pick) {
  let state = pick(r, "state", "province", "region"), city = pick(r, "city", "town");
  const m = /,\s*([^,]+?),\s*([A-Z]{2})\s+\d{5}/.exec(pick(r, "address"));
  if (m) { city = city || m[1]; state = state || m[2]; }
  return { state: state ? normState(state).slice(0, 40) : "", city: city.slice(0, 60) };
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
  if (assignCampaigns(track, cfg)) changed = true;
  for (const t of track) {
    if (["new", "active"].includes(t.status) && !t.referred_by && doneDomains.has(emailDomain(t.email))) set(t, "do-not-contact", "colleague already replied / opted out"); // a colleague named in a reply ("contact Sara") is allowed
  }
  return changed;
}

// ---------------------------------------------------------------- campaigns
const wanted = (list, v, f = (x) => x) => !list.length || list.map(f).includes(f(v));
/** Does this lead belong in the campaign? An empty filter means "any". Business types match as words inside category, niche, store name or website. */
function leadMatches(t, c) {
  if (!wanted(c.countries, normCountry(t.country), (x) => String(x).toUpperCase())) return false;
  if (!wanted(c.states, normState(t.state))) return false;
  if (!wanted(c.cities, t.city, (x) => String(x).trim().toLowerCase())) return false;
  const hay = `${t.category} ${t.niche} ${t.store} ${t.domain}`.toLowerCase();
  return !c.types.length || c.types.some((w) => hay.includes(w.toLowerCase()));
}
const campaignById = (cfg, id) => (cfg.campaigns || []).find((c) => String(c.id) === String(id));
/** Leads still waiting are re-sorted into the first matching campaign every time (so editing a campaign takes effect at once);
 *  leads already in a sequence keep theirs. A lead matching nothing has no campaign and, once any campaign exists, is not emailed. */
function assignCampaigns(track, cfg) {
  const camps = cfg.campaigns || [];
  let changed = false;
  for (const t of track) {
    if (t.campaign_lock === "1") { if (campaignById(cfg, t.campaign)) continue; t.campaign_lock = ""; changed = true; } // chosen by hand: stays put (unless its campaign is gone)
    const first = camps.find((c) => leadMatches(t, c));
    const want = first ? String(first.id) : "";
    if (t.status !== "new" && t.campaign && campaignById(cfg, t.campaign)) continue; // already in a sequence: keeps its campaign
    if (t.status !== "new" && !want) continue;
    if (t.campaign !== want) { t.campaign = want; changed = true; }
  }
  return changed;
}
/**
 * Actions on ticked leads. opts: { emails: [...], campaign } . delete | dnc | move (to a campaign, pinned so the automatic sorting leaves them) | auto (hand back to the automatic sorting).
 * Returns { affected, skipped }.
 */
function bulkLeads(action, emails, opts, cfg) {
  const want = new Set(emails.map((e) => String(e).toLowerCase())), rows = store.loadTracking(), hit = rows.filter((t) => want.has(t.email.toLowerCase()));
  let affected = 0, skipped = 0;
  if (action === "delete") {
    cleaner.protectStopped(hit);
    store.saveTracking(rows.filter((t) => !want.has(t.email.toLowerCase())));
    return { affected: hit.length, skipped: 0 };
  }
  if (action === "dnc") {
    const have = store.loadSuppression();
    for (const t of hit) { if (!have.has(t.email.toLowerCase())) store.addSuppression(t.email); t.status = "do-not-contact"; t.note = "marked never-contact in dashboard"; t.sending = ""; affected++; }
  } else if (action === "move") {
    const c = campaignById(cfg, opts.campaign);
    if (!c) throw new Error("That campaign does not exist.");
    for (const t of hit) { if (["new", "active"].includes(t.status)) { t.campaign = String(c.id); t.campaign_lock = "1"; affected++; } else skipped++; }
  } else if (action === "auto") {
    for (const t of hit) { t.campaign_lock = ""; t.campaign = ""; affected++; }
    assignCampaigns(rows, cfg);
  } else throw new Error("Unknown action.");
  store.saveTracking(rows);
  return { affected, skipped };
}
/** May this lead be emailed under the campaign rules? */
function campaignAllows(t, cfg) {
  if (!(cfg.campaigns || []).length) return true;
  const c = campaignById(cfg, t.campaign);
  return Boolean(c && c.enabled);
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
  const res = { added: 0, existing: 0, invalid: 0, cleaned: 0 };
  const pick = (r, ...names) => { for (const n of names) for (const k of Object.keys(r)) if (k.trim().toLowerCase() === n) return String(r[k] == null ? "" : r[k]).trim(); return ""; };
  const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? String(Math.round(n)) : ""; };
  for (const r of rows) {
    const email = (pick(r, "email") || pickEmail(pick(r, "email(s) found (unverified)", "email(s) found", "emails"))).slice(0, 254);
    if (!store.isEmail(email)) { res.invalid++; continue; }
    const key = email.toLowerCase();
    const lcp = pick(r, "lcp", "homepage lcp (sec)");
    const lead = {
      email, first_name: (pick(r, "first_name", "owner name").split(/\s+/)[0] || "").slice(0, 60), store: pick(r, "store", "business").slice(0, 150),
      domain: tpl.prettyDomain(pick(r, "domain", "website") || emailDomain(email)).slice(0, 150), country: normCountry(pick(r, "country") || guessCountry(r, pick)),
      category: pick(r, "category").slice(0, 100), niche: pick(r, "niche").slice(0, 100), ...placeOf(r, pick),
      phone: pick(r, "phone", "phone (maps)").slice(0, 40), rating: pick(r, "rating", "totalscore").slice(0, 6), reviews: pick(r, "reviews", "reviewscount").slice(0, 8), source: pick(r, "source").slice(0, 120),
      psi: num(pick(r, "psi", "mobile pagespeed (0-100)")), lcp: /^\d+(\.\d+)?$/.test(lcp) ? lcp : "",
    };
    // A line you wrote yourself in the spreadsheet is trusted like an approved one (after the same safety checks).
    const own = research.validateLine(pick(r, "custom_line", "custom line", "first_line", "first line", "personal line", "personalization", "personalisation"));
    if (own.ok) { lead.custom_line = own.line; lead.research_status = "approved"; }
    const cur = have.get(key);
    if (cur) {
      res.existing++;
      for (const k of ["first_name", "store", "category", "niche", "psi", "lcp", "state", "city", "phone", "rating", "reviews", "source"]) if (!cur[k] && lead[k]) cur[k] = lead[k];
      if (lead.custom_line && !cur.custom_line && !cur.research_status) { cur.custom_line = lead.custom_line; cur.research_status = "approved"; }
      continue;
    }
    const t = Object.fromEntries(store.TRACK_FIELDS.map((f) => [f, ""]));
    Object.assign(t, lead, { step: "0", status: allowed.has(lead.country) ? "new" : "skipped-country" });
    const verdict = cleaner.assess(email); // clearly bad addresses never enter the queue (restorable in the dashboard)
    if (verdict.action === "remove") { t.status = cleaner.SKIPPED; t.note = verdict.reason; res.cleaned++; }
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
    const snippet = fresh.replace(/\s+/g, " ").trim().slice(0, 300);
    const prevStatus = lead.status;
    if (AUTO_REPLY.test(msg.subject) && !STOP_WORDS.test(fresh)) {
      lead.note = `auto-reply ${stamp}`;
      changes.push({ kind: "AUTO-REPLY", lead, snippet, text: fresh || msg.body, subject: msg.subject, prevStatus }); // the sequence goes on; Gemini may read a return date
      continue;
    }
    if (wantsStop) {
      lead.status = "unsubscribed"; lead.note = `asked to stop ${stamp}`;
      changes.push({ kind: "OPT-OUT", lead, snippet });
    } else {
      lead.status = "replied"; lead.note = `replied ${stamp} from ${frm}`; lead.replied_at = new Date().toISOString(); lead.replied_step = String(lead.step || "");
      changes.push({ kind: "REPLIED", lead, snippet, text: fresh, subject: msg.subject, prevStatus });
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

/** An out-of-office reply with a return date pauses the follow-ups until then. */
const snoozed = (t, cfg, now = new Date()) => Boolean(t.snooze_until) && String(t.snooze_until) > today(cfg, now);

/** New leads in the order they should start: best ICP score first (unscored last), skipping scores below the minimum you set. */
function queueOrder(track, cfg) {
  const a = cfg.ai || {}, min = Number(a.min_score) || 0;
  let list = track.filter((x) => x.status === "new" && !x.sending && campaignAllows(x, cfg) && !(min && x.ai_score && Number(x.ai_score) < min));
  if (a.prioritise_by_score !== false) list.sort((x, y) => (Number(y.ai_score) || 0) - (Number(x.ai_score) || 0));
  if ((cfg.campaigns || []).length > 1) { // take turns between campaigns so one big list never starves the others
    const lanes = new Map();
    for (const t of list) { if (!lanes.has(t.campaign)) lanes.set(t.campaign, []); lanes.get(t.campaign).push(t); }
    list = []; const q = [...lanes.values()];
    for (let i = 0; q.some((l) => i < l.length); i++) for (const l of q) if (i < l.length) list.push(l[i]);
  }
  return list;
}
/** Settings for one mailbox's emails: a mailbox with its own name signs as that person (no borrowed job title). */
function cfgFor(cfg, box) {
  const m = box && (box.conf || box);
  const name = String((m && (m.from_name || m.name)) || "").trim();
  if (!name || name === cfg.signature.name) return cfg;
  return { ...cfg, signature: { ...cfg.signature, name, title: String((m && m.title) || "").trim() } };
}

function dueFollowups(track, cfg, now = new Date()) {
  const gaps = cfg.sending.followup_gaps_days;
  return track.filter((t) => {
    if (t.status !== "active" || t.sending || snoozed(t, cfg, now) || !campaignAllows(t, cfg)) return false;
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
    summary.reason = `Not ready, nothing sent: ${problems[0]}${problems.length > 1 ? ` (and ${problems.length - 1} more problem${problems.length > 2 ? "s" : ""})` : ""}`;
    return summary;
  }
  const sendDay = isSendDay(cfg, now);
  const windowOn = !dry && Boolean(windowOf(cfg)); // a dry run is a rehearsal and ignores the window
  const closed = windowOn && !inWindow(cfg, now);
  log(`=== Run start v${VERSION} (${dry ? "DRY RUN" : "LIVE"}) - ${boxes.length} mailbox(es)${sendDay ? "" : " - not a send day, checking inboxes only"}${windowOn ? ` - sending window ${cfg.sending.window_start}-${cfg.sending.window_end} ${cfg.sending.timezone}${closed ? " (closed now)" : " (open)"}` : ""}`);

  const state = store.readJson("mailboxes.json", { mailboxes: {} });
  state.mailboxes = state.mailboxes || {};
  let track = loadState(cfg);
  const held = track.filter((t) => t.sending);
  if (held.length) log(`  WARNING: ${held.length} lead(s) were mid-send when an earlier run stopped unexpectedly and are on hold. Check your Sent folder, then resolve them in the dashboard.`);
  try {
    // 1. inboxes. Every change is saved lead-by-lead (never the whole list), so edits made in the dashboard
    //    while this scan is running can't be overwritten. The same scan is repeated during a long run
    //    (see rescanIfDue) so a reply or "stop" is honoured within minutes, not at the next run.
    let lastScan = 0, aiOff = false;
    const scanInboxes = async () => {
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
            summary.reason = `Stopped for safety: could not read the inbox of ${box.addr} (${String(e.message).slice(0, 100)}). Check its password (OUTREACH_PASSWORD_${box.id}) and mail server settings.`;
            return false;
          }
          log(`  (could not read the inbox of switched-off mailbox ${box.addr}: ${e.message})`);
          continue;
        }
        const msgs = Array.isArray(res) ? res : res.messages;
        const changes = classify(msgs, track, scanBoxes.map((b) => b.addr));
        for (const c of changes) {
          if (c.kind === "UNMATCHED-STOP") { if (!dry) store.addSuppression(c.lead.email); } else store.saveRow(c.lead);
          // Keep what the person wrote whether or not the AI is on, so the Inbox can show it.
          if (c.kind === "REPLIED") { const f = replyFields(c); Object.assign(c.lead, f); store.updateLead(c.lead.email, f); }
        }
        for (const c of changes) {
          if (aiOff || !["REPLIED", "AUTO-REPLY"].includes(c.kind)) continue;
          const r = await ai.enrichReply(c, { cfg, dry, now: clock(), log });
          if (r && r.quota) { aiOff = true; continue; }
          if (!r) continue;
          c.ai = r;
          if (c.kind === "REPLIED" && c.lead.status === "unsubscribed") c.kind = "OPT-OUT"; // Gemini caught a stop request the word list missed
          else if (c.kind === "REPLIED" && c.lead.status !== "replied") c.kind = "AUTO-REPLY"; // an out-of-office the sequence now continues past
          if (!dry && c.kind === "REPLIED" && cfg.ai.webhook_url && ai.POSITIVE.includes(r.label)) {
            webhook.post(cfg.ai.webhook_url, { event: "positive_reply", label: r.label, summary: r.summary, email: c.lead.email, store: c.lead.store, domain: c.lead.domain, mailbox: c.lead.mailbox, replied_at: c.lead.replied_at, reply: c.snippet })
              .then((w) => { if (!w.ok) log(`  (webhook not delivered: ${w.error || w.status})`); });
          }
        }
        all.push(...changes);
        if (!Array.isArray(res) && res.maxUid) { mb.lastUid = res.maxUid; mb.uidValidity = res.uidValidity; store.writeJson("mailboxes.json", state); }
      }
      for (const c of all) {
        log(`  ${c.kind.padEnd(8)} ${c.lead.email}  (${c.lead.store})${c.snippet ? `  "${c.snippet.slice(0, 80)}"` : ""}${c.kind === "UNMATCHED-STOP" && !dry ? "  -> added to do-not-contact" : ""}`);
        if (c.kind === "REPLIED") summary.replies++; else if (c.kind === "OPT-OUT" || c.kind === "UNMATCHED-STOP") summary.optOuts++; else if (c.kind === "BOUNCED") summary.bounces++;
      }
      if (all.length) await notify(cfg, boxes, all, dry);
      lastScan = clock().getTime();
      return true;
    };
    if (!dry || cfg.sending.check_inbox_in_dry_run) {
      if (!(await scanInboxes())) return summary;
    }
    // Before each send, re-read the inboxes if the last read is older than RESCAN_MS. One scan at a time, shared by every
    // mailbox's worker. If the inbox can't be read mid-run, sending stops (the next run tries again).
    let scanning = null;
    const rescanIfDue = async () => {
      if (dry || clock().getTime() - lastScan < RESCAN_MS) return true;
      scanning = scanning || scanInboxes().finally(() => { scanning = null; });
      const ok = await scanning;
      if (!ok) (summary.errors ||= []).push("the inbox could not be read, so sending stopped (it retries on the next run)");
      return ok;
    };
    track = loadState(cfg);
    if (!sendDay) { log("=== Run end - today is not in send_days"); summary.reason = "Nothing sent: today isn't one of your send days (Settings > Send days)."; return summary; }
    if (closed) {
      log(`=== Run end - outside the sending window; it opens in ${Math.floor(minutesToOpen(cfg, now) / 60)}h ${minutesToOpen(cfg, now) % 60}m. Inboxes were checked, nothing was sent.`);
      summary.reason = `Nothing sent: outside the sending window (${cfg.sending.window_start}-${cfg.sending.window_end} ${cfg.sending.timezone}); it opens in ${Math.floor(minutesToOpen(cfg, now) / 60)}h ${minutesToOpen(cfg, now) % 60}m. The inbox was checked.`;
      return summary;
    }

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
    const capLeft = campaignCapLeft(track, cfg, now);
    for (const t of dueFollowups(track, cfg, now)) {
      // Only an empty mailbox field may fall back to "the only mailbox": a thread that belongs to a switched-off
      // mailbox must not silently continue from another address.
      const box = byAddr[(t.mailbox || "").toLowerCase()] || (!t.mailbox && boxes.length === 1 ? boxes[0] : null);
      if (!box) { log(`  ${t.email}: its mailbox ${JSON.stringify(t.mailbox)} is switched off or removed - follow-up skipped`); continue; }
      const key = box.addr.toLowerCase();
      if ((left[key] || 0) <= 0) continue;
      const fc = campaignById(cfg, t.campaign);
      if (fc && fc.id in capLeft && capLeft[fc.id] <= 0) continue;
      t.mailbox = t.mailbox || box.addr;
      plan.get(key).push({ t, step: Number(t.step) + 1 }); left[key]--;
      if (fc && fc.id in capLeft) capLeft[fc.id]--;
    }
    let rr = 0;
    for (const t of queueOrder(track, cfg)) {
      if (run.stop) break;
      const open = boxes.filter((b) => (left[b.addr.toLowerCase()] || 0) > 0);
      if (!open.length) break;
      const camp = campaignById(cfg, t.campaign);
      const mine = camp && camp.mailboxes.length ? open.filter((b) => camp.mailboxes.includes(Number(b.id))) : open; // a campaign may use only some mailboxes
      if (!mine.length || (camp && camp.id in capLeft && capLeft[camp.id] <= 0)) continue;
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
      const box = mine[rr++ % mine.length];
      plan.get(box.addr.toLowerCase()).push({ t, step: 1 }); left[box.addr.toLowerCase()]--;
      if (camp && camp.id in capLeft) capLeft[camp.id]--;
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
        : !campaignAllows(current, opts.config ? cfg : { campaigns: loadConfig().campaigns }) ? "its campaign is switched off or was removed"
        : snoozed(current, cfg, clock()) ? `snoozed until ${current.snooze_until} (out of office)`
        : step === 1 ? (current.status !== "new" ? `status is ${current.status}` : "")
        : (current.status !== "active" || Number(current.step) !== step - 1 ? `status changed (${current.status}, step ${current.step})` : "");
      if (why) { log(`  skipped ${t.email}: ${why}`); return "skipped"; }
      const mailboxHint = t.mailbox;
      for (const f of store.ENGINE_FIELDS) t[f] = current[f];
      t.custom_line = current.custom_line; t.research_status = current.research_status; // read-only here: used to render the email
      t.mailbox = t.mailbox || mailboxHint;

      const variant = tpl.pickVariant(t, step);
      const r = tpl.render(step, t, cfgFor(cfg, box), variant, null, { unsubscribeUrl: unsub.urlFor(t.email, cfg) });
      let html = cfg.sending.html_emails ? r.html : undefined;
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
      if (html && cfg.sending.track_clicks) {
        try { html = clicks.trackHtml(html, { email: t.email, source: `email ${step}`, cfg }); } catch (e) { log(`  (click tracking off for ${t.email}: ${e.message})`); }
      }
      let sent;
      try {
        sent = await box.send({ to: t.email, subject, text: r.text, html, unsubscribeUrl: unsub.urlFor(t.email, cfg), inReplyTo: step > 1 ? refs[refs.length - 1] : undefined, references: step > 1 ? refs : undefined });
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
        (summary.errors ||= []).push(`${box.addr} stopped: ${e.code || e.responseCode || "error"} ${String(e.message).slice(0, 100)}`);
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
      const items = plan.get(key);
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (run.stop) break;
        const windowClosed = () => { if (windowOn && !inWindow(cfg, clock())) { log(`  ${box.addr}: sending window closed; ${items.length - i} email(s) wait for the next window`); summary.leftover = (summary.leftover || 0) + (items.length - i); return true; } return false; };
        if (windowClosed()) break;
        if (!dry && sentOne) { // each mailbox paces itself; mailboxes run side by side
          let wait;
          const lo = cfg.sending.min_delay_seconds, hi = cfg.sending.max_delay_seconds;
          wait = lo + Math.floor(Math.random() * (hi - lo + 1)); // random gap between the minimum and maximum you set
          if (windowOn) { // ...but never more than an even share of what is left of the window, so the rest always fits
            const share = Math.round((minutesToClose(cfg, clock()) * 60) / (items.length - i));
            wait = Math.min(wait, Math.max(share, lo));
          }
          log(`  ${box.addr}: waiting ${wait >= 3600 ? `${Math.floor(wait / 3600)}h ${Math.round((wait % 3600) / 60)}m` : wait >= 120 ? `${Math.round(wait / 60)} min` : `${wait}s`} ...`);
          await sleep(wait * 1000);
          if (run.stop || windowClosed()) break;
        }
        if (!(await rescanIfDue())) break;
        const r = await deliver(item.t, item.step, box);
        if (r === "stop") break;
        if (r === "sent") sentOne = true;
      }
    };
    summary.planned = [...plan.values()].reduce((n, l) => n + l.length, 0);
    summary.noBudget = boxes.every((b) => (budget[b.addr.toLowerCase()] || 0) <= 0);
    const outcomes = await Promise.allSettled(boxes.map(worker));
    outcomes.forEach((o, i) => { if (o.status === "rejected") log(`  ERROR in ${boxes[i].addr}: ${o.reason && o.reason.message}`); });
  } finally {
    for (const b of new Set([...boxes, ...scanBoxes])) b.close && b.close();
  }
  log(`=== Run end - emails ${dry ? "planned" : "sent"} this run: ${summary.sent}${run.stop ? " (stopped early)" : ""}`);
  summary.reason = finalReason(summary, dry, summary.noBudget, summary.planned);
  return summary;
}

/** One plain-English sentence saying why a run ended the way it did. */
function finalReason(sm, dry, noBudget, planned) {
  const what = dry ? "Dry run: planned" : "Sent";
  const errs = sm.errors && sm.errors.length ? ` Problem: ${sm.errors.join("; ")}.` : "";
  if (run.stop) return `Stopped by you. ${what} ${sm.sent} first.${errs}`;
  if (sm.sent === 0) {
    if (sm.errors && sm.errors.length) return `Nothing sent.${errs}`;
    if (noBudget) return `Nothing sent: every mailbox has used its limit for today, or is paused (see Mailboxes on the dashboard).`;
    if (!planned) return `Nothing to send: no leads are waiting (import leads, or everyone has been emailed or is waiting for their follow-up day).`;
    return `Nothing was sent.${errs}`;
  }
  return `${what} ${sm.sent} email${sm.sent === 1 ? "" : "s"}.${sm.leftover ? ` The window closed with ${sm.leftover} still to go; they wait for the next window.` : ""}${errs}`;
}

/** What each campaign with a daily cap of its own may still send today. */
function campaignCapLeft(track, cfg, now) {
  const t0 = today(cfg, now), out = {};
  for (const c of cfg.campaigns || []) {
    if (!c.daily_limit) continue;
    const used = track.filter((t) => String(t.campaign) === String(c.id) && t.last_sent && campaignDate(cfg, new Date(t.last_sent)) === t0).length;
    out[c.id] = Math.max(0, c.daily_limit - used);
  }
  return out;
}

function sentTodayByBox(cfg, now) {
  const t0 = today(cfg, now), c = {};
  for (const r of store.readCsv("sent_log.csv")) {
    if (r.mode === "live" && campaignDate(cfg, new Date(r.date)) === t0) c[(r.mailbox || "").toLowerCase()] = (c[(r.mailbox || "").toLowerCase()] || 0) + 1;
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
    : `${c.kind}: ${c.lead.store} <${c.lead.email}>  (via ${c.lead.mailbox || "?"})${c.ai ? `  [${c.ai.label.replace(/_/g, " ")}]` : ""}\n    "${c.snippet}"\n${c.ai && c.ai.summary ? `    AI: ${c.ai.summary}\n` : ""}${c.lead.draft_reply ? "    A suggested reply is waiting in the dashboard (Replies tab).\n" : ""}`).join("\n") +
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
  const meta = { startedAt: run.startedAt, source: opts.source || "dashboard", mode: run.mode };
  writeLastRun({ ...meta, status: "running", at: run.startedAt, reason: "Running now." });
  const done = runOnce(opts, deps).then((s) => {
    run.last = { ...s, at: new Date().toISOString(), source: meta.source };
    writeLastRun({ ...meta, status: "done", at: run.last.at, sent: s.sent, replies: s.replies, optOuts: s.optOuts, bounces: s.bounces, reason: s.reason || "Finished." });
  })
    .catch((e) => { log(`Run failed: ${e.stack || e.message}`); run.last = { error: e.message, at: new Date().toISOString(), source: meta.source }; writeLastRun({ ...meta, status: "failed", at: run.last.at, reason: `The run crashed: ${String(e.message).slice(0, 160)}. See the log for details.` }); })
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
  for (const t of queueOrder(track, cfg)) { if (out.length >= n) break; add(t, 1); }
  return out;
}

function status(cfg = loadConfig(), now = new Date()) {
  const track = store.loadTracking();
  const state = store.readJson("mailboxes.json", { mailboxes: {} });
  const count = (arr, f) => arr.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});
  const started = track.filter((t) => Number(t.step || 0) >= 1 || ["replied", "unsubscribed"].includes(t.status));
  const group = (keyFn) => {
    const g = {};
    for (const t of started) {
      const k = keyFn(t); (g[k] ||= { started: 0, replied: 0, bounced: 0, positive: 0, meetings: 0 }); g[k].started++;
      if (t.status === "replied") g[k].replied++; if (t.status === "bounced") g[k].bounced++;
      if (ai.POSITIVE.includes(t.reply_label)) g[k].positive++; if (["meeting_booked", "won"].includes(t.outcome)) g[k].meetings++;
    }
    return g;
  };
  const doneToday = sentTodayByBox(cfg, now);
  const warmupState = warmup.status(now);
  const mailboxes = cfg.mailboxes.filter((m) => m.email).map((m) => {
    const key = m.email.toLowerCase(), box = { addr: m.email };
    const b = bounceCheck(track, box, cfg);
    const spam = warmup.spamRate(m.email);
    return { id: m.id, email: m.email, enabled: m.enabled, passwordSet: Boolean(passwordFor(m)), firstLiveSend: (state.mailboxes[key] || {}).first_live_send || "",
      todayLimit: dailyLimitFor(box, cfg, state, now), sentToday: doneToday[key] || 0, bounceRate: Math.round(b.rate * 10) / 10, paused: b.paused,
      health: healthScore({ bounceRate: b.rate, paused: b.paused, spamRate: spam }), spamRate: Math.round(spam * 1000) / 10, placement: (warmupState.placement || {})[key] || null };
  });
  const daily = mailboxes.filter((m) => m.enabled && !m.paused).reduce((a, m) => a + m.todayLimit, 0);
  // Only leads that can actually be emailed count as waiting: with campaigns, a lead in no campaign or a paused one is not in the queue.
  const remaining = track.filter((t) => t.status === "new" && campaignAllows(t, cfg)).length;
  return {
    version: VERSION, dryRun: cfg.sending.dry_run, autoRun: cfg.sending.auto_run !== false && process.env.OUTREACH_AUTO_RUN !== "off", sendDay: isSendDay(cfg, now), today: today(cfg, now), window: windowState(cfg, now),
    total: track.length, byStatus: count(track, (t) => t.status), byMailbox: group((t) => t.mailbox || "?"), byVariant: group((t) => t.variant || "a"),
    furthestStep: count(started.filter((t) => Number(t.step)), (t) => `email ${t.step}`), mailboxes, remaining,
    daysLeft: remaining && daily ? Math.ceil(remaining / daily) : 0,
    replied: track.filter((t) => t.status === "replied").sort((a, b) => String(b.replied_at).localeCompare(String(a.replied_at))).map((t) => ({
      email: t.email, store: t.store, mailbox: t.mailbox, note: t.note, repliedAt: t.replied_at, loomSent: t.loom_sent === "1", domain: t.domain, firstName: t.first_name, subject: t.subject, clicks: clicks.forLead(t.email),
      label: t.reply_label, summary: t.reply_summary, snippet: t.reply_snippet, text: t.reply_text, replySubject: t.reply_subject, draft: t.draft_reply, outcome: t.outcome })),
    analytics: analytics(track, started),
    campaigns: campaignStats(track, cfg, now, mailboxes), unassigned: (cfg.campaigns || []).length ? track.filter((t) => t.status === "new" && !t.campaign).length : 0,
    insights: insights(track, cfg, now, mailboxes),
    overview: overview(track, cfg, now, mailboxes), setup: setupSteps(cfg, mailboxes, track.length),
    ai: ai.status(), aiConfig: { icp: Boolean(cfg.ai.icp), booking: Boolean(cfg.ai.booking_link) }, warmup: { ...warmupState, enabled: cfg.warmup.enabled },
    clicks: (() => { const ls = Object.fromEntries(track.map((t) => [t.email.toLowerCase(), t])); return clicks.recent(40).map((c) => ({ ...c, store: (ls[c.email] || {}).store || "", status: (ls[c.email] || {}).status || "" })); })(),
    trackingBase: clicks.baseUrl(cfg), trackClicks: cfg.sending.track_clicks && cfg.sending.html_emails,
    scheduled: listScheduled(), waitingBlocked: track.filter((t) => t.status === "new" && !campaignAllows(t, cfg)).length,
    held: track.filter((t) => t.sending).map((t) => ({ email: t.email, store: t.store, step: t.sending, mailbox: t.mailbox })),
    problems: readiness(cfg, cfg.mailboxes.filter((m) => m.enabled && m.email).map((m) => new Mailbox(m)), { live: !cfg.sending.dry_run }),
    liveProblems: readiness(cfg, cfg.mailboxes.filter((m) => m.enabled && m.email).map((m) => new Mailbox(m)), { live: true }), // what must be fixed before Live can be switched on
    running: run.running, startedAt: run.startedAt, runMode: run.mode, last: run.last, lastRun: readLastRun(), log: run.lines.length ? run.lines.slice(-200) : logTail(200),
  };
}

/** The numbers on the Overview: today, the last 7 days and a 14-day activity series (sends and replies per day). */
function overview(track, cfg, now, mailboxes) {
  const t0 = today(cfg, now), sends = {}, replies = {};
  for (const r of store.readCsv("sent_log.csv")) if (r.mode === "live") { const d = campaignDate(cfg, new Date(r.date)); sends[d] = (sends[d] || 0) + 1; }
  for (const t of track) if (t.replied_at) { const d = campaignDate(cfg, new Date(t.replied_at)); replies[d] = (replies[d] || 0) + 1; }
  const series = Array.from({ length: 14 }, (_, i) => { const date = addDays(t0, i - 13); return { date, sent: sends[date] || 0, replies: replies[date] || 0 }; });
  const last7 = series.slice(7), since = addDays(t0, -6);
  const recent = track.filter((t) => t.replied_at && campaignDate(cfg, new Date(t.replied_at)) >= since);
  return { series, sentToday: series[13].sent, capToday: mailboxes.filter((m) => m.enabled && !m.paused).reduce((a, m) => a + m.todayLimit, 0),
    sent7: last7.reduce((a, d) => a + d.sent, 0), replies7: recent.length, positive7: recent.filter((t) => ai.POSITIVE.includes(t.reply_label)).length,
    meetings: track.filter((t) => ["meeting_booked", "won"].includes(t.outcome)).length, repliesWaiting: track.filter((t) => t.status === "replied" && t.loom_sent !== "1").length };
}

/** The getting-started checklist shown on the Overview until everything required is done. */
function markSetup(key) { try { const s = store.readJson("setup.json", {}); if (!s[key]) { s[key] = new Date().toISOString(); store.writeJson("setup.json", s); } } catch (e) { /* the checklist is a convenience */ } }
function setupSteps(cfg, mailboxes, leadCount) {
  const flags = store.readJson("setup.json", {}), sig = cfg.signature;
  const sigOk = ["name", "company", "website", "postal_address"].every((k) => String(sig[k] || "").trim() && !/\[/.test(sig[k]));
  const steps = [
    { id: "details", label: "Add your sender details", hint: "Your name, company, website and postal address appear in every email (the address is required by law).", done: sigOk, view: "settings", tab: "sender" },
    { id: "mailboxes", label: "Connect a mailbox", hint: "Add the mailbox, then set its password on the server (the variable name is shown under it).", done: mailboxes.some((m) => m.enabled && m.passwordSet), view: "settings", tab: "mailboxes" },
    { id: "leads", label: "Import your leads", hint: "Upload a spreadsheet or CSV, or find businesses for free on the Leads tab (Find new leads).", done: leadCount > 0, view: "leads" },
    { id: "gemini", label: "Connect Gemini", hint: "Optional: replies get labelled, and you get suggested answers, lead scores, a campaign builder and an email writer.", done: ai.configured(), view: "settings", tab: "ai", optional: true },
    { id: "campaign", label: "Group leads into campaigns", hint: "Optional: email each place or business type with its own mailboxes, limit and wording.", done: (cfg.campaigns || []).length > 0, view: "campaigns", optional: true },
    { id: "test", label: "Send yourself a test email", hint: "Check it lands in your inbox, not spam.", done: Boolean(flags.test_sent), view: "settings", tab: "checks" },
    { id: "dns", label: "Check your domain's email setup", hint: "SPF, DKIM and DMARC protect your emails from the spam folder.", done: Boolean(flags.dns_ok), view: "settings", tab: "checks" },
    { id: "live", label: "Switch to Live", hint: "Until then every run is a safe test that sends nothing.", done: !cfg.sending.dry_run, action: "live" },
  ];
  return { steps, done: steps.filter((s) => s.done).length, total: steps.length, complete: steps.every((s) => s.done || s.optional) };
}

/** Has this campaign got email copy of its own (otherwise it sends your default emails)? */
function hasOwnEmails(id) { try { const d = tpl.campaignDir(id); return Boolean(d) && fs.readdirSync(d).some((n) => tpl.FILE_RE.test(n)); } catch (e) { return false; } }

/** One row per campaign for the dashboard: how many leads, how they are doing, and how long the waiting ones will take. */
function campaignStats(track, cfg, now, mailboxes) {
  const t0 = today(cfg, now);
  return (cfg.campaigns || []).map((c) => {
    const mine = track.filter((t) => String(t.campaign) === String(c.id));
    const started = mine.filter((t) => Number(t.step || 0) >= 1 || ["replied", "unsubscribed"].includes(t.status));
    const n = (f) => mine.filter(f).length, rate = (x) => (started.length ? Math.round((1000 * x) / started.length) / 10 : 0);
    const boxes = mailboxes.filter((m) => m.enabled && !m.paused && (!c.mailboxes.length || c.mailboxes.includes(m.id)));
    const cap = boxes.reduce((a, m) => a + m.todayLimit, 0), capacity = c.daily_limit ? Math.min(c.daily_limit, cap) : cap;
    const waiting = n((t) => t.status === "new"), replied = n((t) => t.status === "replied"), positive = n((t) => ai.POSITIVE.includes(t.reply_label)), bounced = n((t) => t.status === "bounced");
    return { id: c.id, name: c.name, enabled: c.enabled, countries: c.countries, states: c.states, cities: c.cities, types: c.types, mailboxes: c.mailboxes, daily_limit: c.daily_limit,
      total: mine.length, waiting, active: n((t) => t.status === "active"), started: started.length, replied, positive, meetings: n((t) => ["meeting_booked", "won"].includes(t.outcome)), bounced,
      sentToday: n((t) => t.last_sent && campaignDate(cfg, new Date(t.last_sent)) === t0), replyRate: rate(replied), positiveRate: rate(positive), bounceRate: rate(bounced),
      ownEmails: hasOwnEmails(c.id), capacity, mailboxCount: boxes.length, daysLeft: waiting && capacity ? Math.ceil(waiting / capacity) : 0 };
  });
}

/** Plain-English things worth your attention, worst first. Computed from the data each time: nothing to configure. */
function insights(track, cfg, now, mailboxes) {
  const out = [], add = (level, text, go = "") => out.push({ level, text, go }); // go: where the dashboard sends you to fix it
  const camps = campaignStats(track, cfg, now, mailboxes), waiting = track.filter((t) => t.status === "new");
  for (const m of mailboxes) if (m.enabled && m.paused) add("bad", `${m.email} is paused: its bounce rate is ${m.bounceRate}%. Remove dead addresses (Leads, Clean list) before it can send again.`, "leads");
  for (const m of mailboxes) if (m.enabled && !m.paused && m.spamRate >= 30) add("bad", `${Math.round(m.spamRate)}% of warm-up mail to ${m.email} lands in spam. Slow down its sending and check its DNS (Settings, Checks & backup).`, "settings:checks");
  if (camps.length) {
    const none = waiting.filter((t) => !t.campaign).length;
    if (none) add("warn", `${none} waiting lead${none === 1 ? " matches" : "s match"} no campaign and will not be emailed. Widen a campaign or add one.`, "campaigns");
    const orphans = track.filter((t) => t.status === "active" && !campaignById(cfg, t.campaign)).length;
    if (orphans) add("warn", `${orphans} lead${orphans === 1 ? " is" : "s are"} part-way through a sequence but not in any campaign (it was removed or its filters changed), so ${orphans === 1 ? "it is" : "they are"} paused. Add a campaign that fits them.`, "campaigns");
    const overlap = waiting.filter((t) => cfg.campaigns.filter((c) => leadMatches(t, c)).length > 1).length;
    if (overlap) add("info", `${overlap} waiting lead${overlap === 1 ? " fits" : "s fit"} more than one campaign; each goes to the first campaign in your list.`, "campaigns");
    for (const c of camps) {
      if (c.enabled && !c.mailboxCount) add("bad", `Campaign "${c.name}" has no mailbox that can send right now (switched off, paused or not chosen).`, "campaigns");
      else if (c.enabled && !c.waiting && !c.active) add("info", `Campaign "${c.name}" has no leads waiting. Import leads for it or widen its filters.`, "campaigns");
      if (!c.enabled && c.waiting) add("info", `Campaign "${c.name}" is paused with ${c.waiting} lead${c.waiting === 1 ? "" : "s"} waiting.`, "campaigns");
      const blockedCountries = c.countries.filter((x) => !cfg.sending.countries.map((y) => y.toUpperCase()).includes(String(x).toUpperCase()));
      if (c.enabled && blockedCountries.length) add("warn", `Campaign "${c.name}" targets ${blockedCountries.join(", ")}, which Settings does not allow, so those leads are skipped. Add the country under Settings, Sending, Customize the details.`, "settings:sending");
      if (c.enabled && c.waiting && !c.ownEmails && c.types.length && !c.types.some((x) => /roof/i.test(x))) add("warn", `Campaign "${c.name}" would send your default emails, which are written for roofing companies. Give it its own emails (Gemini can draft them).`, "templates");
      if (c.started >= 20 && c.bounceRate >= cfg.sending.bounce_pause_percent) add("bad", `Campaign "${c.name}" bounces ${c.bounceRate}%. Its list needs cleaning before you send more.`, "leads");
    }
    const ranked = camps.filter((c) => c.started >= 20).sort((a, b) => b.replyRate - a.replyRate);
    if (ranked.length > 1 && ranked[0].replyRate > 0 && ranked[0].replyRate >= 2 * ranked[ranked.length - 1].replyRate) {
      add("info", `"${ranked[0].name}" gets ${ranked[0].replyRate}% replies against ${ranked[ranked.length - 1].replyRate}% for "${ranked[ranked.length - 1].name}". Consider giving it more daily sends.`, "campaigns");
    }
  } else if (track.length >= 20 && new Set(track.map((t) => t.country).filter(Boolean)).size + new Set(track.map((t) => t.category).filter(Boolean)).size > 3) {
    add("info", "Your leads span several places or business types. Campaigns let you email each group with its own copy, mailboxes and daily limit.", "campaigns");
  }
  const late = track.filter((t) => t.status === "replied" && t.loom_sent !== "1" && t.replied_at && now.getTime() - Date.parse(t.replied_at) > 24 * 36e5).length;
  if (late) add("warn", `${late} repl${late === 1 ? "y has" : "ies have"} waited over 24 hours without the video. Answer them first.`, "replies");
  const pos = track.filter((t) => ai.POSITIVE.includes(t.reply_label) && t.status === "replied" && !t.outcome).length;
  if (pos) add("info", `${pos} interested repl${pos === 1 ? "y has" : "ies have"} no outcome yet. Mark meetings booked so the results stay accurate.`, "replies");
  return out.sort((a, b) => ["bad", "warn", "info"].indexOf(a.level) - ["bad", "warn", "info"].indexOf(b.level));
}

// ---------------------------------------------------------------- finding leads
const STAGES = {
  waiting: (t) => t.status === "new", sequence: (t) => t.status === "active", finished: (t) => t.status === "finished", replied: (t) => t.status === "replied",
  interested: (t) => ai.POSITIVE.includes(t.reply_label), stopped: (t) => ["bounced", "unsubscribed", "do-not-contact"].includes(t.status),
  aside: (t) => String(t.status).startsWith("skipped"), held: (t) => Boolean(t.sending), referral: (t) => Boolean(t.referred_by),
};
const STAGE_NAMES = Object.keys(STAGES).concat(["snoozed", "clicked", "nocampaign", "highfit"]);
/**
 * Filters the lead list the way the dashboard asks: by stage (a plain-language group of statuses), campaign, place, business type,
 * minimum fit score and free text. q: { text, stage, status, campaign, country, state, city, type, minScore, sort }.
 */
function leadQuery(track, q, cfg, now = new Date(), clickMap = {}) {
  const text = String(q.text || "").trim().toLowerCase(), clicked = (t) => ((clickMap[t.email.toLowerCase()] || {}).clicks || 0) > 0;
  const stage = {
    snoozed: (t) => t.status === "active" && snoozed(t, cfg, now), clicked, nocampaign: (t) => !t.campaign, highfit: (t) => Number(t.ai_score) >= 7, ...STAGES,
  }[q.stage];
  const same = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
  let out = track.filter((t) => (!text || `${t.email} ${t.store} ${t.domain} ${t.city}`.toLowerCase().includes(text)) &&
    (!q.stage || (stage && stage(t))) && (!q.status || (q.status === "clicked" ? clicked(t) : t.status === q.status)) &&
    (!q.campaign || (q.campaign === "none" ? !t.campaign : String(t.campaign) === String(q.campaign))) &&
    (!q.country || normCountry(t.country) === normCountry(q.country)) && (!q.state || normState(t.state) === normState(q.state)) && (!q.city || same(t.city, q.city)) &&
    (!q.type || same(t.category || t.niche, q.type)) && (!q.minScore || Number(t.ai_score) >= Number(q.minScore)));
  if (q.sort === "score") out = out.slice().sort((a, b) => (Number(b.ai_score) || 0) - (Number(a.ai_score) || 0));
  else if (q.sort === "recent") out = out.slice().sort((a, b) => String(b.last_sent || b.replied_at || "").localeCompare(String(a.last_sent || a.replied_at || "")));
  return out;
}
/** What the filter bar offers: how many leads are in each stage, and the places and business types that exist. */
function leadFacets(track, cfg, now = new Date(), clickMap = {}) {
  const stages = {};
  for (const k of STAGE_NAMES) stages[k] = leadQuery(track, { stage: k }, cfg, now, clickMap).length;
  return { stages, total: track.length, options: campaignOptions(track), campaigns: (cfg.campaigns || []).length };
}

/** The most common countries, states, cities and business types among your leads, to build campaigns from. */
function campaignOptions(track = store.loadTracking()) {
  const top = (f) => { const m = new Map(); for (const t of track) { const v = f(t); if (v) m.set(v, (m.get(v) || 0) + 1); } return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([value, count]) => ({ value, count })); };
  return { countries: top((t) => normCountry(t.country)), states: top((t) => normState(t.state)), cities: top((t) => String(t.city || "").trim()), types: top((t) => String(t.category || t.niche || "").trim()), total: track.length };
}
/** How many leads a set of filters would catch, and how many of those another campaign already claims. */
function campaignPreview(filters, cfg, id) {
  const c = sanitizeCampaigns([{ ...filters, id: 99 }])[0];
  const camps = cfg.campaigns || [], at = camps.findIndex((x) => String(x.id) === String(id));
  const earlier = at < 0 ? camps : camps.slice(0, at);
  const hit = store.loadTracking().filter((t) => leadMatches(t, c));
  const waiting = hit.filter((t) => t.status === "new");
  const allowed = cfg.sending.countries.map((x) => x.toUpperCase());
  return { total: hit.length, waiting: waiting.length, blocked: hit.filter((t) => t.status === "skipped-country" || (t.status === "new" && !allowed.includes(normCountry(t.country)))).length, claimed: waiting.filter((t) => earlier.some((x) => leadMatches(t, x))).length,
    sample: hit.slice(0, 6).map((t) => ({ store: t.store || t.domain, place: [t.city, t.state, t.country].filter(Boolean).join(", "), type: t.category || t.niche })) };
}

/** 0-100 mailbox health: bounces hurt most, then a pause, then warm-up mail landing in spam. */
function healthScore({ bounceRate = 0, paused = false, spamRate = 0 }) {
  return Math.max(0, Math.round(100 - Math.min(60, bounceRate * 12) - (paused ? 25 : 0) - Math.min(30, spamRate * 60)));
}

/** Reply and meeting numbers for the dashboard: by AI label, by email step, and the totals that matter (positive replies, meetings). */
function analytics(track, started) {
  const labels = {}, byStep = {};
  for (const t of track) if (t.reply_label) labels[t.reply_label] = (labels[t.reply_label] || 0) + 1;
  for (const s of [1, 2, 3, 4]) byStep[s] = { reached: started.filter((t) => Number(t.step || 0) >= s).length, replied: 0, positive: 0 };
  for (const t of started) {
    const st = Number(t.replied_step || t.step || 0);
    if (!byStep[st] || !(t.status === "replied" || t.reply_label)) continue; // someone who wrote back, counted at the email they answered
    byStep[st].replied++;
    if (ai.POSITIVE.includes(t.reply_label)) byStep[st].positive++;
  }
  return { labels, byStep, positive: track.filter((t) => ai.POSITIVE.includes(t.reply_label)).length,
    meetings: track.filter((t) => ["meeting_booked", "won"].includes(t.outcome)).length, won: track.filter((t) => t.outcome === "won").length,
    scored: track.filter((t) => t.ai_score).length, referrals: track.filter((t) => t.referred_by).length, snoozed: track.filter((t) => t.status === "active" && t.snooze_until && t.snooze_until >= today(loadConfig())).length };
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
      const r = tpl.render(1, sample, cfgFor(cfg, box), variant);
      await box.send({ to, subject: "[TEST] " + r.subject, text: r.text, html: cfg.sending.html_emails ? r.html : undefined, unsubscribeUrl: unsub.urlFor(to, cfg) }, { saveCopy: false });
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

// ---------------------------------------------------------------- replies from the dashboard + scheduled messages
const SCHEDULE_FILE = "scheduled.json";
const SCHEDULE_MAX_DAYS = 366;
const SCHEDULE_TRIES = 3;
const BLOCKED_FOR_REPLY = ["unsubscribed", "bounced", "do-not-contact"];

function findLead(email) {
  return store.loadTracking().find((t) => t.email.toLowerCase() === String(email || "").trim().toLowerCase());
}
// html (from the dashboard's rich editor) wins over text; prepared = already-sanitised { html, attachments } of a scheduled item.
const SINGLE_EMAIL_RE = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/;
// compose = a new message to any address (not only a lead); leads who opted out or bounced are still blocked.
function checkReply({ email, subject, text, html, files, attachments, compose }, prepared = false) {
  let lead = findLead(email);
  if (compose) {
    email = String(email || "").trim();
    if (!SINGLE_EMAIL_RE.test(email) || email.length > 254) throw new Error("Enter a valid email address in To.");
    if (!lead) lead = { email: email.toLowerCase(), store: "", domain: "", status: "", mailbox: "" };
  }
  if (!lead) throw new Error("That address is not in your lead list.");
  if (BLOCKED_FOR_REPLY.includes(lead.status)) throw new Error(`Not sending: this lead is ${lead.status}.`);
  subject = String(subject || "").replace(/[\r\n]+/g, " ").trim().slice(0, 300);
  if (!subject) {
    if (compose) throw new Error("Add a subject.");
    subject = `Re: ${lead.subject || "your free video for " + lead.domain}`;
  }
  let rich = null;
  if (prepared && html) rich = { html: String(html), text: richtext.htmlToText(html), attachments: Array.isArray(attachments) ? attachments : [] };
  else if (html && String(html).trim()) rich = richtext.prepare(html, files);
  else if (Array.isArray(files) && files.length) rich = richtext.prepare(esc(String(text || "")).replace(/\r?\n/g, "<br>"), files);
  if (rich) text = rich.text;
  text = String(text || "").replace(/\r\n/g, "\n").trim();
  if (!text && !(rich && rich.attachments.length)) throw new Error("Write a message first.");
  if (text.length > 20000) throw new Error("The message is too long (20,000 characters at most).");
  return { lead, subject, text, html: rich ? rich.html : "", attachments: rich ? rich.attachments : [] };
}
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Sends one personal reply to a lead from the mailbox that emailed them, inside the same thread. deps.mailboxes is for tests. */
async function sendReply(input, cfg = loadConfig(), deps = {}, prepared = false) {
  const { lead, subject, text, html, attachments } = checkReply(input, prepared);
  // From: the mailbox picked in the window; otherwise the one that emailed the lead.
  const pick = String(input.from || "").trim().toLowerCase();
  const want = pick || String(lead.mailbox || "").toLowerCase();
  if (input.compose && !want) throw new Error("Choose which mailbox to send from.");
  const pool = deps.mailboxes || cfg.mailboxes.filter((m) => m.email).map((m) => new Mailbox(m));
  const box = pool.find((b) => (b.addr || b.email || "").toLowerCase() === want) || (want ? null : pool[0]);
  if (!box) throw new Error(`The mailbox ${pick || lead.mailbox} is not set up in Settings, so this message can't be sent from it.`);
  if (box.hasPassword && !box.hasPassword()) throw new Error(`No password is set on the server for ${box.addr}.`);
  const refs = input.compose ? [] : [...new Set([lead.first_message_id, lead.last_message_id].filter(Boolean))];
  let body = html ? richtext.wrapEmail(html) : undefined;
  if (body && cfg.sending.track_clicks) {
    try { body = clicks.trackHtml(body, { email: lead.email, source: "reply", cfg }); } catch (e) { log(`(click tracking off for this reply: ${e.message})`); }
  }
  try {
    await box.send({ to: lead.email, subject, text, html: body, attachments: attachments.length ? richtext.forMail(attachments) : undefined,
      inReplyTo: refs[refs.length - 1], references: refs.length ? refs : undefined, listUnsubscribe: false });
  } finally { box.close && box.close(); }
  log(`${input.compose ? "MESSAGE" : "REPLY"} sent ${box.addr} -> ${lead.email} (${lead.store})`);
  try { store.appendSentLog({ date: new Date().toISOString(), mode: input.compose ? "compose" : "reply", mailbox: box.addr, email: lead.email, store: lead.store, step: input.compose ? "compose" : "reply", variant: "", subject }); } catch (e) { /* the log is optional */ }
  return { mailbox: box.addr };
}

/** What the person wrote, as stored on the lead: a short preview, the full text and the subject. */
function replyFields(change) {
  const text = String(change.text || change.snippet || "").replace(/\r\n/g, "\n").trim().slice(0, 3000);
  return { reply_snippet: String(change.snippet || text.replace(/\s+/g, " ")).slice(0, 300), reply_text: text, reply_subject: String(change.subject || "").replace(/\s+/g, " ").trim().slice(0, 200) };
}

/**
 * The message a lead replied with. Returns what was saved when the reply arrived; for older replies
 * (saved before this existed) it reads the message from the mailbox they wrote to and keeps it.
 * deps.mailboxes can replace the real mailboxes (tests).
 */
async function fetchReplyMessage(email, cfg = loadConfig(), deps = {}) {
  const key = String(email || "").trim().toLowerCase();
  const lead = store.loadTracking().find((t) => t.email.toLowerCase() === key);
  if (!lead) throw new Error("Lead not found.");
  if (lead.reply_text) return { text: lead.reply_text, subject: lead.reply_subject || "", stored: true };
  if (lead.status !== "replied") throw new Error("This lead has not replied.");
  const want = String(lead.mailbox || "").toLowerCase();
  const pool = deps.mailboxes || cfg.mailboxes.filter((m) => m.email).map((m) => new Mailbox(m));
  const box = pool.find((b) => (b.addr || b.email || "").toLowerCase() === want) || (want ? null : pool[0]);
  if (!box) throw new Error(`The mailbox ${lead.mailbox} is not set up in Settings, so their message can't be loaded from it.`);
  if (box.hasPassword && !box.hasPassword()) throw new Error(`No password is set on the server for ${box.addr}, so their message can't be loaded.`);
  let found;
  try { found = await box.findReplyFrom(lead.email, { sinceDays: 180 }); } finally { box.close && box.close(); }
  if (!found || !found.text) throw new Error(`Couldn't find their message in the inbox of ${box.addr}. It may have been moved or deleted.`);
  const fields = replyFields({ text: found.text, subject: found.subject, snippet: lead.reply_snippet });
  store.updateLead(lead.email, fields);
  return { text: fields.reply_text, subject: fields.reply_subject, date: found.date || "", stored: false };
}

function readScheduled() { const d = store.readJson(SCHEDULE_FILE, { items: [] }); return Array.isArray(d.items) ? d.items : []; }
function writeScheduled(items) {
  const cut = Date.now() - 30 * 864e5;
  const keep = items.filter((i) => i.status === "pending" || i.status === "sending" || Date.parse(i.sentAt || i.createdAt) > cut).slice(-500);
  store.writeJson(SCHEDULE_FILE, { items: keep });
}
const publicItem = (i) => ({ id: i.id, email: i.email, subject: i.subject, text: i.text, sendAt: i.sendAt, status: i.status, error: i.error || "", sentAt: i.sentAt || "",
  files: (i.attachments || []).filter((a) => !a.cid).map((a) => a.filename), images: (i.attachments || []).filter((a) => a.cid).length });
/** Pending and recent messages, soonest first. */
function listScheduled() {
  return readScheduled().map(publicItem).sort((a, b) => (a.status === "pending" ? 0 : 1) - (b.status === "pending" ? 0 : 1) || a.sendAt.localeCompare(b.sendAt));
}
function scheduleReply({ email, subject, text, html, files, sendAt, from, compose }, now = new Date()) {
  const { lead, subject: subj, text: body, html: rich, attachments } = checkReply({ email, subject, text, html, files, compose });
  const when = new Date(sendAt);
  if (isNaN(when)) throw new Error("Pick a date and time to send.");
  if (when.getTime() < now.getTime() - 60 * 1000) throw new Error("That time is in the past. Pick a later time, or send it now.");
  if (when.getTime() > now.getTime() + SCHEDULE_MAX_DAYS * 864e5) throw new Error("Pick a date within the next year.");
  const item = { id: require("crypto").randomBytes(6).toString("hex"), email: lead.email, subject: subj, text: body, ...(from ? { from: String(from).trim() } : {}), ...(compose ? { compose: true } : {}), ...(rich ? { html: rich } : {}), ...(attachments.length ? { attachments } : {}), sendAt: when.toISOString(), status: "pending", tries: 0, createdAt: now.toISOString() };
  writeScheduled(readScheduled().concat(item));
  log(`Scheduled a reply to ${lead.email} for ${item.sendAt}`);
  return publicItem(item);
}
function cancelScheduled(id) {
  const items = readScheduled(), i = items.find((x) => x.id === id && x.status === "pending");
  if (!i) return false;
  writeScheduled(items.filter((x) => x !== i));
  return true;
}
/** Drops every message still waiting to be sent (their leads are gone). Returns how many. */
function cancelAllScheduled() {
  const items = readScheduled(), pending = items.filter((x) => x.status === "pending");
  if (pending.length) writeScheduled(items.filter((x) => x.status !== "pending"));
  return pending.length;
}
// Once a message is finished its file contents are no longer needed; keep only the names for the list.
const lighten = (i) => (i.attachments ? { attachments: i.attachments.map((a) => ({ filename: a.filename, contentType: a.contentType, content: "", ...(a.cid ? { cid: a.cid } : {}) })) } : {});
let processing = false;
/** Sends every scheduled message that is due. Safe to call often. Returns how many were sent. */
async function processScheduled(cfg = loadConfig(), deps = {}, now = new Date()) {
  if (processing) return 0;
  processing = true;
  let sent = 0;
  try {
    for (const due of readScheduled().filter((i) => i.status === "pending" && Date.parse(i.sendAt) <= now.getTime())) {
      const update = (patch) => writeScheduled(readScheduled().map((x) => (x.id === due.id ? { ...x, ...patch } : x)));
      update({ status: "sending" }); // write-ahead: a crash mid-send never causes a second send
      try {
        await sendReply(due, cfg, deps, true);
        update({ status: "sent", sentAt: new Date().toISOString(), error: "", ...lighten(due) });
        sent++;
      } catch (e) {
        const unsure = ["ETIMEDOUT", "ESOCKET"].includes(e.code);
        const tries = (due.tries || 0) + 1, msg = String(e.message).slice(0, 160);
        if (unsure) update({ status: "failed", tries, ...lighten(due), error: `Unsure whether it was sent (${e.code}). Check your Sent folder before resending.` });
        else if (tries < SCHEDULE_TRIES && !/not in your lead list|Not sending|not set up|No password/.test(msg)) update({ status: "pending", tries, error: msg });
        else update({ status: "failed", tries, ...lighten(due), error: msg });
        log(`Scheduled reply to ${due.email} not sent: ${msg}`);
      }
    }
  } finally { processing = false; }
  return sent;
}

module.exports = { sendReply, fetchReplyMessage, replyFields, scheduleReply, cancelScheduled, cancelAllScheduled, listScheduled, processScheduled, autoRunDue, MAX_PER_MAILBOX_PER_DAY, RESCAN_MS, logTail, markInterrupted, readLastRun, windowState, inWindow, campaignDate, domainReceivesMail, nextEmail, sendTest, dnsHealth, resolveHeld, DEFAULT_CONFIG, loadConfig, saveConfig, sanitizeConfig, importLeads, classify, dueFollowups, runOnce,
  startRun, requestStop, previewNext, status, markSetup, bulkLeads, leadQuery, leadFacets, STAGE_NAMES, campaignOptions, campaignPreview, assignCampaigns, leadMatches, queueOrder, cfgFor, healthScore, analytics, loadState, tzParts, isSendDay, today, run, log };
