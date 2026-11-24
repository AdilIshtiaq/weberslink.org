/*
 * Outreach HTTP API, mounted by server.js under /api/outreach/*.
 *
 * Auth: set ADMIN_PASSWORD on the server (and optionally ADMIN_USERNAME, which then must be entered too).
 * Without a password every endpoint answers 503, so the feature is off by default.
 * Login gives a signed, HttpOnly, SameSite=Strict cookie (12 hours). The dashboard page itself is public HTML with
 * no data in it; all data comes through these endpoints.
 * Cron: set OUTREACH_CRON_TOKEN (16+ chars) and POST /api/outreach/cron with header x-cron-token (or ?token=) from Hostinger cron.
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const store = require("./store");
const tpl = require("./templates");
const eng = require("./engine");
const xlsx = require("./xlsx");
const cleaner = require("./cleaner");
const research = require("./research");
const clicks = require("./clicks");
const backup = require("./backup");
const ai = require("./ai");
const unsub = require("./unsub");
const warmup = require("./warmup");
const verify = require("./verify");
const { Mailbox } = require("./mail");

const PASSWORD = process.env.ADMIN_PASSWORD || "";
const USERNAME = (process.env.ADMIN_USERNAME || "").trim().toLowerCase();
const CRON_TOKEN = process.env.OUTREACH_CRON_TOKEN || "";
// Cookie signing key: explicit env var, else a random per-install key kept in the data folder (so a stolen cookie
// can't be used to crack the password offline), else (read-only disk) a key derived from the credentials.
const SECRET = process.env.ADMIN_SESSION_SECRET || store.sessionKey() || crypto.createHash("sha256").update("wl-outreach:" + (USERNAME ? USERNAME + ":" : "") + PASSWORD).digest("hex");
const COOKIE = "wl_admin";
const SESSION_MS = 12 * 3600 * 1000;
const enabled = PASSWORD.length >= 10;

const sha = (s) => crypto.createHash("sha256").update(String(s)).digest();
const safeEqual = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));
const sign = (v) => crypto.createHmac("sha256", SECRET).update(v).digest("hex");

// Token = expiry.nonce.signature. Logging out revokes the nonce (kept in memory until the token would have expired).
const revoked = new Map();
function makeToken() {
  const body = `${Date.now() + SESSION_MS}.${crypto.randomBytes(8).toString("hex")}`;
  return `${body}.${sign(body)}`;
}
function parseToken(tok) {
  const parts = String(tok || "").split(".");
  if (parts.length !== 3) return null;
  const [exp, nonce, sig] = parts;
  const want = sign(`${exp}.${nonce}`);
  if (!exp || !nonce || sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  return { exp: Number(exp), nonce };
}
function validToken(tok) {
  const t = parseToken(tok);
  if (!t || t.exp < Date.now()) return false;
  for (const [n, exp] of revoked) if (exp < Date.now()) revoked.delete(n);
  return !revoked.has(t.nonce);
}
function cookieOf(req, name) {
  for (const part of String(req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return "";
}
const isHttps = (req) => Boolean(req.socket.encrypted) || String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https";
const authed = (req) => validToken(cookieOf(req, COOKIE));

// ---- failed-login throttling ----
// Per IP: 5 wrong passwords in 10 minutes blocks that IP. Overall: if lots of wrong passwords arrive from many
// addresses, every attempt is slowed down and only a few run at once - brute force stays impractical, but nobody
// (including you) is ever locked out for good by someone else's bad guesses.
let testSends = [];
const fails = new Map();
let globalFails = [];
let inflightLogins = 0;
function recent(list) { const now = Date.now(); return list.filter((t) => now - t < 10 * 60 * 1000); }
const ipBlocked = (ip) => recent(fails.get(ip) || []).length >= 5;
const underPressure = () => { globalFails = recent(globalFails); return globalFails.length >= 20; };
function noteFail(ip) {
  fails.set(ip, recent(fails.get(ip) || []).concat(Date.now()));
  globalFails.push(Date.now());
  if (fails.size > 5000) fails.clear();
}
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- helpers ----
function send(res, code, obj, headers = {}) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers });
  res.end(JSON.stringify(obj));
}
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error("Request too large"), { status: 413 })); req.destroy(); } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
async function readJson(req, limit = 200 * 1024) {
  const raw = await readBody(req, limit);
  if (!raw.trim()) return {};
  try { return JSON.parse(raw); } catch (e) { throw Object.assign(new Error("Invalid JSON"), { status: 400 }); }
}
// Behind the host's proxy the real client is the LAST X-Forwarded-For entry (the one the proxy appended); earlier
// entries are written by the client and can be faked.
const clientIp = (req) => {
  const xff = String(req.headers["x-forwarded-for"] || "").split(",").map((x) => x.trim()).filter(Boolean);
  return xff.length ? xff[xff.length - 1] : String(req.socket.remoteAddress || "");
};

const LEAD_VIEW = ["email", "first_name", "store", "domain", "country", "category", "step", "status", "mailbox", "variant", "last_sent", "psi", "note", "loom_sent", "ai_score", "ai_score_reason", "reply_label", "snooze_until", "outcome", "smtp", "state", "city", "campaign"];

async function route(req, res, url, method) {
  const p = url.pathname.replace(/^\/api\/outreach/, "") || "/";

  // --- cron (token auth, not cookie) ---
  if (p === "/cron") {
    if (method !== "POST") return send(res, 405, { ok: false, error: "Use POST." }, { Allow: "POST" });
    const tok = url.searchParams.get("token") || req.headers["x-cron-token"] || "";
    if (CRON_TOKEN.length < 16 || !tok || !safeEqual(tok, CRON_TOKEN)) return send(res, 403, { ok: false, error: "Forbidden" });
    eng.processScheduled().catch((e) => console.error("outreach scheduled replies:", e.message)); // the cron call also wakes a sleeping app
    const r = eng.startRun({ source: "cron" });
    return send(res, r.started ? 202 : 409, { ok: r.started, ...(r.started ? {} : { error: r.reason }) });
  }

  // --- session ---
  if (p === "/login" && method === "POST") {
    const ip = clientIp(req);
    if (ipBlocked(ip)) return send(res, 429, { ok: false, error: "Too many attempts. Try again in 10 minutes." });
    if (underPressure()) {
      if (inflightLogins >= 3) return send(res, 429, { ok: false, error: "Busy. Try again in a minute." });
      inflightLogins++;
      try { await pause(1500); } finally { inflightLogins--; }
    }
    const body = await readJson(req, 2000);
    // Check both before answering so the reply never reveals which one was wrong.
    const userOk = !USERNAME || (typeof body.username === "string" && safeEqual(body.username.trim().toLowerCase(), USERNAME));
    const passOk = typeof body.password === "string" && body.password !== "" && safeEqual(body.password, PASSWORD);
    if (!(userOk && passOk)) { noteFail(ip); return send(res, 401, { ok: false, error: USERNAME ? "Wrong username or password." : "Wrong password." }); }
    const cookie = `${COOKIE}=${encodeURIComponent(makeToken())}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MS / 1000}${isHttps(req) ? "; Secure" : ""}`;
    return send(res, 200, { ok: true }, { "Set-Cookie": cookie });
  }
  if (p === "/logout" && method === "POST") {
    const t = parseToken(cookieOf(req, COOKIE));
    if (t) revoked.set(t.nonce, t.exp);
    return send(res, 200, { ok: true }, { "Set-Cookie": `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0` });
  }
  if (p === "/session" && method === "GET") return send(res, 200, { ok: true, authed: authed(req), usernameRequired: Boolean(USERNAME) });

  // everything below needs a valid session
  if (!authed(req)) return send(res, 401, { ok: false, error: "Please sign in." });
  if (method !== "GET" && !/^application\/json\b/i.test(req.headers["content-type"] || "")) {
    return send(res, 415, { ok: false, error: "JSON required." }); // blocks cross-site form posts
  }

  if (p === "/status" && method === "GET") return send(res, 200, { ok: true, ...eng.status(), data: store.info(), lastBackup: backup.lastBackup(), server: { cron: CRON_TOKEN.length >= 16 } });
  if (p === "/backup" && method === "GET") {
    const b = backup.create();
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="outreach-backup-${new Date().toISOString().slice(0, 10)}.json"`, "Cache-Control": "no-store" });
    return res.end(JSON.stringify(b));
  }
  if (p === "/backup/restore" && method === "POST") {
    const body = await readJson(req, 60 * 1024 * 1024);
    try { return send(res, 200, { ok: true, ...backup.restore(body.backup) }); } catch (e) { return send(res, e.status || 500, { ok: false, error: e.status ? e.message : "Restore failed." }); }
  }

  if (p === "/config" && method === "GET") return send(res, 200, { ok: true, config: eng.loadConfig() });
  if (p === "/config" && method === "PUT") {
    if (eng.run.running) return send(res, 409, { ok: false, error: "A run is in progress. Stop it before changing settings." });
    const body = await readJson(req);
    try {
      if (body.campaigns === undefined) body.campaigns = eng.loadConfig().campaigns; // the Settings form doesn't edit campaigns: keep them
      const cfg = eng.sanitizeConfig(body);
      eng.saveConfig(cfg);
      return send(res, 200, { ok: true, config: cfg });
    } catch (e) { return send(res, 400, { ok: false, error: e.message }); }
  }

  // --- campaigns (groups of leads by place and business type) ---
  if (p === "/campaigns" && method === "GET") return send(res, 200, { ok: true, campaigns: eng.loadConfig().campaigns, options: eng.campaignOptions(), mailboxes: eng.loadConfig().mailboxes.filter((m) => m.email).map((m) => ({ id: m.id, email: m.email })) });
  if (p === "/campaigns" && method === "PUT") {
    const body = await readJson(req);
    try {
      const cfg = eng.sanitizeConfig({ ...eng.loadConfig(), campaigns: body.campaigns });
      eng.saveConfig(cfg);
      eng.loadState(cfg); // waiting leads move into their new campaigns straight away
      return send(res, 200, { ok: true, campaigns: cfg.campaigns });
    } catch (e) { return send(res, 400, { ok: false, error: e.message }); }
  }
  if (p === "/campaigns/preview" && method === "POST") {
    const body = await readJson(req);
    return send(res, 200, { ok: true, ...eng.campaignPreview(body.filters || {}, eng.loadConfig(), body.id) });
  }
  if (p === "/run" && method === "POST") {
    const body = await readJson(req);
    const r = eng.startRun({ source: "dashboard", forceDry: body.dry === true });
    return send(res, r.started ? 202 : 409, { ok: r.started, ...(r.started ? {} : { error: r.reason }) });
  }
  if (p === "/reply" && method === "POST") {
    const body = await readJson(req, 15 * 1024 * 1024); // attachments and pasted images (10 MB, base64-encoded)
    try {
      if (body.sendAt) return send(res, 200, { ok: true, scheduled: eng.scheduleReply(body) });
      return send(res, 200, { ok: true, ...(await eng.sendReply(body)) });
    } catch (e) { return send(res, 400, { ok: false, error: String(e.message).slice(0, 300) }); }
  }
  if (p === "/replies/message" && method === "POST") {
    const body = await readJson(req);
    try { return send(res, 200, { ok: true, ...(await eng.fetchReplyMessage(String(body.email || ""))) }); }
    catch (e) { return send(res, 400, { ok: false, error: String(e.message).slice(0, 300) }); }
  }
  if (p === "/scheduled/cancel" && method === "POST") {
    return eng.cancelScheduled(String((await readJson(req)).id || "")) ? send(res, 200, { ok: true }) : send(res, 404, { ok: false, error: "That message is no longer waiting to be sent." });
  }
  if (p === "/stop" && method === "POST") { eng.requestStop(); return send(res, 200, { ok: true }); }

  if (p === "/test-email" && method === "POST") {
    testSends = recent(testSends);
    if (testSends.length >= 5) return send(res, 429, { ok: false, error: "Five test emails in 10 minutes is the limit. Try again shortly." });
    const body = await readJson(req);
    testSends.push(Date.now());
    try {
      const r = await eng.sendTest(String(body.to || "").trim());
      if (r.results && r.results.some((x) => x.ok)) eng.markSetup("test_sent");
      return send(res, 200, { ok: true, ...r });
    } catch (e) { return send(res, 400, { ok: false, error: e.message }); }
  }
  // --- Gemini: scoring, drafts, objections ---
  if (p === "/ai/status" && method === "GET") return send(res, 200, { ok: true, ...ai.status() });
  if (p === "/ai/score/start" && method === "POST") {
    const body = await readJson(req);
    const r = ai.startScoring({ limit: Math.max(1, Math.min(200, parseInt(body.limit, 10) || 25)), cfg: eng.loadConfig() });
    return send(res, r.started ? 202 : 400, { ok: r.started, ...(r.started ? {} : { error: r.reason }) });
  }
  if (p === "/ai/stop" && method === "POST") { ai.stopJob(); return send(res, 200, { ok: true }); }
  if (p === "/ai/draft" && method === "POST") {
    const body = await readJson(req);
    const lead = store.loadTracking().find((t) => t.email.toLowerCase() === String(body.email || "").toLowerCase());
    if (!lead) return send(res, 404, { ok: false, error: "Lead not found." });
    try {
      // Work from what they actually wrote; an older reply that wasn't saved is read from the mailbox first.
      let text = lead.reply_text || lead.reply_snippet || "";
      if (!text) { try { text = (await eng.fetchReplyMessage(lead.email)).text; } catch (e) { /* handled below */ } }
      if (!text) return send(res, 422, { ok: false, error: "The AI needs their message first, and it couldn't be loaded from the mailbox." });
      const draft = await ai.draftReply(lead, eng.loadConfig(), { text, label: lead.reply_label });
      if (!draft) return send(res, 422, { ok: false, error: "Gemini's draft didn't pass the safety checks (length or links). Try again." });
      store.updateLead(lead.email, { draft_reply: draft });
      return send(res, 200, { ok: true, draft });
    } catch (e) { return send(res, 400, { ok: false, error: String(e.message).slice(0, 200) }); }
  }
  if (p === "/ai/campaign" && method === "POST") {
    const body = await readJson(req);
    try {
      const cfg = eng.loadConfig(), track = store.loadTracking();
      const draft = await ai.buildCampaign(String(body.description || ""), eng.campaignOptions(track));
      const clean = eng.sanitizeConfig({ ...cfg, campaigns: [draft] }).campaigns[0];
      return send(res, 200, { ok: true, campaign: clean, note: draft.note, preview: eng.campaignPreview(clean, cfg) });
    } catch (e) { return send(res, 400, { ok: false, error: String(e.message).slice(0, 200) }); }
  }
  if (p === "/ai/templates" && method === "POST") {
    const body = await readJson(req);
    try {
      const cfg = eng.loadConfig(), camp = (cfg.campaigns || []).find((c) => String(c.id) === String(body.campaign));
      const r = await ai.writeSequence({ brief: String(body.brief || ""), tone: String(body.tone || ""), campaign: camp ? camp.name : "", sender: String(cfg.signature.name || "").split(/\s+/)[0], company: cfg.signature.company });
      const checked = r.emails.map((e) => { const rendered = tpl.render(e.step, { ...tpl.SAMPLE_LEAD, campaign: "" }, cfg, "a", e.text); return { ...e, check: tpl.copyCheck(rendered.subject, rendered.text.split("\n\n--\n")[0], { first: e.step === 1 }), preview: rendered.text.split("\n\n--\n")[0] }; });
      return send(res, 200, { ok: true, emails: checked, errors: r.errors });
    } catch (e) { return send(res, 400, { ok: false, error: String(e.message).slice(0, 200) }); }
  }
  if (p === "/ai/rewrite" && method === "POST") {
    const body = await readJson(req);
    try { return send(res, 200, { ok: true, ...(await ai.rewriteEmail({ text: String(body.text || ""), instruction: String(body.instruction || "shorter"), step: Number(body.step) || 1 })) }); }
    catch (e) { return send(res, 400, { ok: false, error: String(e.message).slice(0, 200) }); }
  }
  if (p === "/ai/filter" && method === "POST") {
    const body = await readJson(req);
    try {
      const facets = eng.leadFacets(store.loadTracking(), eng.loadConfig(), new Date(), clicks.allLeads());
      return send(res, 200, { ok: true, filter: await ai.parseLeadFilter(String(body.query || ""), facets, eng.STAGE_NAMES) });
    } catch (e) { return send(res, 400, { ok: false, error: String(e.message).slice(0, 200) }); }
  }
  if (p === "/ai/brief" && method === "GET") return send(res, 200, { ok: true, brief: ai.cachedBrief(), configured: ai.configured() });
  if (p === "/ai/brief" && method === "POST") {
    const body = await readJson(req);
    try {
      const st = eng.status();
      const { series, ...today } = st.overview;
      const snapshot = { today, sentPerDay: series.map((d) => d.sent).join(","), leadsWaiting: st.remaining, daysToFinish: st.daysLeft, mode: st.dryRun ? "test mode (nothing sent)" : "live", replyLabels: st.analytics.labels, positiveReplies: st.analytics.positive, meetings: st.analytics.meetings,
        campaigns: st.campaigns.map((c) => ({ name: c.name, on: c.enabled, waiting: c.waiting, started: c.started, replyRate: c.replyRate, positive: c.positive, bounceRate: c.bounceRate })), mailboxes: st.mailboxes.map((m) => ({ email: m.email, health: m.health, paused: m.paused, passwordSet: m.passwordSet })), attention: st.insights.map((i) => i.text).slice(0, 6) };
      return send(res, 200, { ok: true, brief: await ai.brief(snapshot, { force: body.force === true }) });
    } catch (e) { return send(res, 400, { ok: false, error: String(e.message).slice(0, 200) }); }
  }
  if (p === "/ai/objections" && method === "POST") {
    try { const r = await ai.mineObjections(); return send(res, r.ok ? 200 : 400, r); } catch (e) { return send(res, 400, { ok: false, error: String(e.message).slice(0, 200) }); }
  }
  if (p === "/warmup/run" && method === "POST") {
    if (eng.run.running) return send(res, 409, { ok: false, error: "A run is in progress. Try again when it finishes." });
    try { return send(res, 200, { ok: true, ...(await runWarmup({ force: true })) }); } catch (e) { return send(res, 400, { ok: false, error: String(e.message).slice(0, 200) }); }
  }
  if (p === "/dns" && method === "GET") {
    const domains = await eng.dnsHealth();
    if (domains.length && domains.every((d) => d.checks.every((c) => c.status !== "bad"))) eng.markSetup("dns_ok");
    return send(res, 200, { ok: true, domains });
  }

  if (p === "/preview" && method === "GET") {
    const n = Math.min(20, Math.max(1, parseInt(url.searchParams.get("n"), 10) || 5));
    try { return send(res, 200, { ok: true, emails: eng.previewNext(n) }); } catch (e) { return send(res, 400, { ok: false, error: e.message }); }
  }

  if (p === "/leads" && method === "GET") {
    const sp = url.searchParams;
    const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get("limit"), 10) || 100));
    const offset = Math.max(0, parseInt(url.searchParams.get("offset"), 10) || 0);
    const cl = clicks.allLeads();
    const cfg = eng.loadConfig();
    const all = eng.leadQuery(store.loadTracking(), { text: sp.get("q"), status: sp.get("status"), stage: sp.get("stage"), campaign: sp.get("campaign"), country: sp.get("country"), state: sp.get("state"),
      city: sp.get("city"), type: sp.get("type"), minScore: sp.get("minScore"), sort: sp.get("sort") }, cfg, new Date(), cl);
    return send(res, 200, { ok: true, total: all.length, rows: all.slice(offset, offset + limit).map((t) => ({ ...Object.fromEntries(LEAD_VIEW.map((f) => [f, t[f]])), next: eng.nextEmail(t, cfg), clicks: (cl[t.email.toLowerCase()] || {}).clicks || 0 })) });
  }
  if (p === "/leads/facets" && method === "GET") return send(res, 200, { ok: true, ...eng.leadFacets(store.loadTracking(), eng.loadConfig(), new Date(), clicks.allLeads()) });
  if (p === "/leads/import" && method === "POST") {
    const body = await readJson(req, 8 * 1024 * 1024);
    if (!Array.isArray(body.rows) || body.rows.length > 20000) return send(res, 400, { ok: false, error: "Send up to 20,000 rows." });
    return send(res, 200, { ok: true, ...eng.importLeads(body.rows, eng.loadConfig()) });
  }
  if (p === "/leads/import-file" && method === "POST") {
    const body = await readJson(req, 12 * 1024 * 1024);
    const name = String(body.name || "");
    const buf = Buffer.from(String(body.data || ""), "base64");
    if (!buf.length) return send(res, 400, { ok: false, error: "The file was empty." });
    let rows;
    if (/\.xlsx$/i.test(name)) rows = xlsx.readSheet(buf, "Leads");
    else if (/\.csv$/i.test(name)) rows = store.parseCsv(buf.toString("utf8"));
    else return send(res, 400, { ok: false, error: "Please choose an .xlsx or .csv file (in Excel: File > Save As)." });
    if (!rows.length) return send(res, 400, { ok: false, error: "No rows found in the file." });
    if (rows.length > 20000) return send(res, 400, { ok: false, error: "Up to 20,000 rows at a time." });
    return send(res, 200, { ok: true, ...eng.importLeads(rows, eng.loadConfig()) });
  }
  if (p === "/leads/research/status" && method === "GET") return send(res, 200, { ok: true, ...research.status() });
  if (p === "/leads/research/start" && method === "POST") {
    const body = await readJson(req);
    const r = research.startJob({ limit: Math.max(1, Math.min(100, parseInt(body.limit, 10) || 25)), retryFailed: body.retryFailed === true });
    return send(res, r.started ? 202 : r.reason && /already/.test(r.reason) ? 409 : 400, { ok: r.started, ...(r.started ? {} : { error: r.reason }) });
  }
  if (p === "/leads/research/stop" && method === "POST") { research.stopJob(); return send(res, 200, { ok: true }); }
  if (p === "/leads/research/pending" && method === "GET") return send(res, 200, { ok: true, rows: research.pending(Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit"), 10) || 50))) });
  if (p === "/leads/research/review" && method === "POST") {
    const body = await readJson(req);
    const r = research.review(String(body.email || ""), String(body.action || ""), body.line);
    return r.error ? send(res, 400, { ok: false, error: r.error }) : send(res, 200, { ok: true });
  }
  if (p === "/leads/research/approve-shown" && method === "POST") {
    const body = await readJson(req);
    return send(res, 200, { ok: true, approved: research.approveShown(body.items) });
  }
  if (p === "/leads/clean/start" && method === "POST") {
    const body = await readJson(req);
    const fromDomain = (eng.loadConfig().mailboxes.find((m) => m.email) || { email: "@example.com" }).email.split("@")[1];
    const r = cleaner.startScan({ mx: eng.domainReceivesMail, smtp: body.smtp === true ? (e) => verify.probe(e, { fromDomain }) : undefined });
    return send(res, r.started ? 202 : 409, { ok: r.started, ...(r.started ? {} : { error: r.reason }) });
  }
  if (p === "/leads/clean/status" && method === "GET") return send(res, 200, { ok: true, ...cleaner.jobStatus() });
  if (p === "/leads/clean/apply" && method === "POST") {
    const body = await readJson(req);
    const r = cleaner.applyScan({ skipRoles: body.skipRoles === true });
    return send(res, r.ok ? 200 : 400, r);
  }
  if (p === "/leads/remove-bounced" && method === "POST") {
    if (eng.status().running) return send(res, 409, { ok: false, error: "A run is in progress. Wait for it to finish, then try again." });
    return send(res, 200, cleaner.removeBounced());
  }
  if (p === "/leads/action" && method === "POST") {
    const body = await readJson(req);
    const email = String(body.email || "");
    let r = null;
    if (body.action === "restore") r = cleaner.restore(email);
    else if (body.action === "retry_held" || body.action === "skip_held") r = eng.resolveHeld(email, body.action === "retry_held" ? "retry" : "skip");
    else if (["meeting_booked", "won", "lost"].includes(body.action)) r = store.updateLead(email, { outcome: body.action });
    else if (body.action === "clear_outcome") r = store.updateLead(email, { outcome: "" });
    else if (body.action === "clear_snooze") r = store.updateLead(email, { snooze_until: "" });
    else if (body.action === "loom_sent") r = store.updateLead(email, { loom_sent: "1" });
    else if (body.action === "loom_unsent") r = store.updateLead(email, { loom_sent: "" });
    else if (body.action === "dnc") {
      const row = store.loadTracking().find((t) => t.email.toLowerCase() === email.toLowerCase());
      if (row) { store.addSuppression(row.email); r = store.updateLead(row.email, { status: "do-not-contact", note: "marked do-not-contact in dashboard" }); }
    } else return send(res, 400, { ok: false, error: "Unknown action." });
    return r ? send(res, 200, { ok: true }) : send(res, 404, { ok: false, error: "Lead not found." });
  }
  if (p === "/dnc" && method === "POST") {
    const v = String((await readJson(req)).value || "").trim().toLowerCase();
    if (!(/^@[a-z0-9.-]+\.[a-z]{2,}$/.test(v) || store.isEmail(v))) return send(res, 400, { ok: false, error: "Enter an email or @domain.com" });
    store.addSuppression(v);
    eng.loadState(eng.loadConfig());
    return send(res, 200, { ok: true });
  }

  if (p === "/templates" && method === "GET") {
    const bundled = new Set(fs.existsSync(path.join(__dirname, "templates")) ? fs.readdirSync(path.join(__dirname, "templates")) : []);
    const camp = url.searchParams.get("campaign") || "", cdir = tpl.campaignDir(camp);
    const dir = cdir || tpl.OVERRIDE; // "edited" means edited for the campaign being viewed, or for everyone when none is chosen
    const edited = new Set(fs.existsSync(dir) ? fs.readdirSync(dir) : []);
    return send(res, 200, { ok: true, gaps: eng.loadConfig().sending.followup_gaps_days, templates: tpl.listTemplateFiles(camp).map((t) => ({ name: t.name, step: t.step, variant: t.variant, text: fs.readFileSync(t.file, "utf8"), edited: edited.has(t.name), bundled: bundled.has(t.name) })),
      fields: Object.keys(tpl.fieldsFor(tpl.SAMPLE_LEAD, eng.loadConfig())) });
  }
  if (p === "/templates/check" && method === "POST") {
    const body = await readJson(req);
    try {
      const step = Math.min(4, Math.max(1, parseInt(body.step, 10) || 1));
      const r = tpl.render(step, tpl.SAMPLE_LEAD, eng.loadConfig(), "a", String(body.text || ""));
      const main = r.text.split("\n\n--\n")[0];
      const out = { ok: true, ...tpl.copyCheck(r.subject, main, { first: step === 1 }) };
      if (body.ai === true) {
        try { out.ai = await ai.reviewCopy(r.subject, main); } catch (e) { out.aiError = String(e.message).slice(0, 160); }
      }
      return send(res, 200, out);
    } catch (e) { return send(res, 400, { ok: false, error: e.message }); }
  }
  if (p === "/templates/preview" && method === "POST") {
    const body = await readJson(req);
    try {
      const lead = { ...tpl.SAMPLE_LEAD, ...(body.lead || {}) };
      const r = tpl.render(1, lead, eng.loadConfig(), "a", String(body.text || ""));
      return send(res, 200, { ok: true, ...r });
    } catch (e) { return send(res, 400, { ok: false, error: e.message }); }
  }
  if (p === "/templates" && method === "PUT") {
    const body = await readJson(req);
    const name = String(body.name || "");
    if (!tpl.FILE_RE.test(name)) return send(res, 400, { ok: false, error: "Template names look like email1.txt, email1b.txt ... email4.txt" });
    const saveDir = tpl.campaignDir(body.campaign) || tpl.OVERRIDE;
    const text = String(body.text || "").replace(/\r\n/g, "\n");
    try {
      const { subject, body: b } = tpl.parseTemplate(text, name);
      if (!subject || !b.trim()) throw new Error("Subject and body can't be empty");
      const left = (subject + b).match(/\[[A-Z]{3,}[^\]]*\]/);
      if (left) throw new Error(`Still contains the placeholder ${left[0]}`);
      tpl.render(Number(name[5]), tpl.SAMPLE_LEAD, eng.loadConfig(), "a", text);
    } catch (e) { return send(res, 400, { ok: false, error: e.message }); }
    fs.mkdirSync(saveDir, { recursive: true });
    store.atomicWrite(path.join(saveDir, name), text.endsWith("\n") ? text : text + "\n");
    return send(res, 200, { ok: true });
  }
  if (p === "/templates" && method === "DELETE") {
    const name = String(url.searchParams.get("name") || "");
    if (!tpl.FILE_RE.test(name)) return send(res, 400, { ok: false, error: "Bad template name." });
    try { fs.unlinkSync(path.join(tpl.campaignDir(url.searchParams.get("campaign")) || tpl.OVERRIDE, name)); } catch (e) { return send(res, 404, { ok: false, error: "No edited copy to reset." }); }
    return send(res, 200, { ok: true });
  }

  if (p === "/export" && method === "GET") {
    const name = { tracking: "tracking.csv", sent: "sent_log.csv" }[url.searchParams.get("file")];
    if (!name) return send(res, 400, { ok: false, error: "Unknown file." });
    let data = "";
    try { data = store.exportCsv(name); } catch (e) { /* empty export */ }
    res.writeHead(200, { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" });
    return res.end(data);
  }

  return send(res, 404, { ok: false, error: "Not found." });
}

let warming = false;
/** One warm-up pass between the enabled mailboxes that have a password. */
async function runWarmup({ force = false } = {}) {
  if (warming) return { skipped: "already running" };
  warming = true;
  const cfg = eng.loadConfig();
  const boxes = cfg.mailboxes.filter((m) => m.enabled && m.email).map((m) => new Mailbox(m)).filter((b) => b.hasPassword());
  try { return await warmup.tick({ cfg, boxes, force, log: eng.log }); } finally { for (const b of boxes) b.close(); warming = false; }
}

/** Returns true if the request was for the outreach API (and has been answered). */
function handle(req, res) {
  let url;
  try { url = new URL(req.url, "http://x"); } catch (e) { return false; }
  if (url.pathname.startsWith("/r/") && (req.method === "GET" || req.method === "HEAD")) return clicks.handle(req, res); // tracked email links
  if (url.pathname.startsWith("/u/") && ["GET", "HEAD", "POST"].includes(req.method)) { try { unsub.handle(req, res, url); } catch (e) { if (!res.headersSent) { res.writeHead(404); res.end(); } } return true; } // one-click unsubscribe
  if (url.pathname !== "/api/outreach" && !url.pathname.startsWith("/api/outreach/")) return false;
  if (!enabled) { send(res, 503, { ok: false, error: "Outreach is off. Set ADMIN_PASSWORD (10+ characters) on the server to turn it on." }); return true; }
  route(req, res, url, req.method).catch((e) => {
    if (!res.headersSent) send(res, e.status || 500, { ok: false, error: e.status ? e.message : "Server error" });
    if (!e.status) console.error("outreach error:", e);
  });
  return true;
}

/** In-process timers: automatic runs, scheduled replies and warm-up (Hostinger cron stays the reliable wake-up call). */
function startScheduler() {
  if (enabled) {
    const d = store.info();
    console.log(`Outreach data folder: ${d.dir} (${d.explicit ? "set by OUTREACH_DATA_DIR" : "default; set OUTREACH_DATA_DIR to choose it"})${d.insideApp ? " WARNING: inside the app folder, a redeploy can erase it" : ""}${d.writable ? "" : " WARNING: not writable"}`);
  }
  // Automatic running (on by default): while Live sending is on and sending is allowed right now (no window set, or the
  // window is open), start a run every 10 minutes if none is running. A run keeps going, pacing itself between emails and
  // re-reading the inbox as it goes, so a mailbox keeps sending around the clock. Extra triggers are harmless: a trigger
  // while a run is active is refused, and each run only sends what the day's budget and pacing allow.
  // Turn it off with the "Run automatically" tick in Settings, or OUTREACH_AUTO_RUN=off on the server.
  // (OUTREACH_AUTO_RUN=window / always are still accepted and mean the same as the default.)
  if (enabled && process.env.OUTREACH_AUTO_RUN !== "off") {
    const tick = () => {
      try {
        if (eng.autoRunDue(eng.loadConfig())) eng.startRun({ source: "auto" });
      } catch (e) { console.error("outreach scheduler:", e.message); }
    };
    setInterval(tick, 10 * 60 * 1000).unref();
    setTimeout(tick, 30 * 1000).unref(); // pick up again shortly after a restart
    console.log("Outreach auto-run on: starts by itself while Live sending is on and sending is allowed.");
  }
  // Scheduled replies: check every minute for messages whose time has come (independent of Live/dry-run, they are personal replies).
  if (enabled) {
    const due = () => eng.processScheduled().catch((e) => console.error("outreach scheduled replies:", e.message));
    setInterval(due, 60 * 1000).unref();
    setTimeout(due, 20 * 1000).unref();
  }
  // Warm-up between your own mailboxes: every 30 minutes, daytime only, only when switched on in Settings.
  if (enabled) {
    const wu = () => { try { if (eng.loadConfig().warmup.enabled && !eng.run.running) runWarmup().catch((e) => console.error("outreach warm-up:", e.message)); } catch (e) { console.error("outreach warm-up:", e.message); } };
    setInterval(wu, 30 * 60 * 1000).unref();
    setTimeout(wu, 2 * 60 * 1000).unref();
  }
}

module.exports = { handle, enabled, startScheduler, authed: (req) => enabled && authed(req) };
