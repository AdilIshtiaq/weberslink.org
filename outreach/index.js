/*
 * Outreach HTTP API, mounted by server.js under /api/outreach/*.
 *
 * Auth: set ADMIN_PASSWORD on the server. Without it every endpoint answers 503, so the feature is off by default.
 * Login gives a signed, HttpOnly, SameSite=Strict cookie (12 hours). The dashboard page itself is public HTML with
 * no data in it; all data comes through these endpoints.
 * Cron: set OUTREACH_CRON_TOKEN (16+ chars) and call GET/POST /api/outreach/cron?token=... from Hostinger cron.
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const store = require("./store");
const tpl = require("./templates");
const eng = require("./engine");

const PASSWORD = process.env.ADMIN_PASSWORD || "";
const CRON_TOKEN = process.env.OUTREACH_CRON_TOKEN || "";
const SECRET = process.env.ADMIN_SESSION_SECRET || crypto.createHash("sha256").update("wl-outreach:" + PASSWORD).digest("hex");
const COOKIE = "wl_admin";
const SESSION_MS = 12 * 3600 * 1000;
const enabled = PASSWORD.length >= 8;

const sha = (s) => crypto.createHash("sha256").update(String(s)).digest();
const safeEqual = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));
const sign = (v) => crypto.createHmac("sha256", SECRET).update(v).digest("hex");

function makeToken() {
  const exp = String(Date.now() + SESSION_MS);
  return `${exp}.${sign(exp)}`;
}
function validToken(tok) {
  const [exp, sig] = String(tok || "").split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const want = sign(exp);
  return sig.length === want.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want));
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

// ---- failed-login throttling (per IP and overall: X-Forwarded-For is easy to fake) ----
const fails = new Map();
let globalFails = [];
function recent(list) { const now = Date.now(); return list.filter((t) => now - t < 10 * 60 * 1000); }
function throttled(ip) {
  globalFails = recent(globalFails);
  return recent(fails.get(ip) || []).length >= 5 || globalFails.length >= 20;
}
function noteFail(ip) {
  fails.set(ip, recent(fails.get(ip) || []).concat(Date.now()));
  globalFails.push(Date.now());
  if (fails.size > 5000) fails.clear();
}

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
const clientIp = (req) => String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();

const LEAD_VIEW = ["email", "first_name", "store", "domain", "country", "category", "step", "status", "mailbox", "variant", "last_sent", "psi", "note", "loom_sent"];

async function route(req, res, url, method) {
  const p = url.pathname.replace(/^\/api\/outreach/, "") || "/";

  // --- cron (token auth, not cookie) ---
  if (p === "/cron" && (method === "GET" || method === "POST")) {
    const tok = url.searchParams.get("token") || req.headers["x-cron-token"] || "";
    if (CRON_TOKEN.length < 16 || !tok || !safeEqual(tok, CRON_TOKEN)) return send(res, 403, { ok: false, error: "Forbidden" });
    const r = eng.startRun({ source: "cron" });
    return send(res, r.started ? 202 : 409, { ok: r.started, ...(r.started ? {} : { error: r.reason }) });
  }

  // --- session ---
  if (p === "/login" && method === "POST") {
    const ip = clientIp(req);
    if (throttled(ip)) return send(res, 429, { ok: false, error: "Too many attempts. Try again in 10 minutes." });
    const body = await readJson(req, 2000);
    if (!body.password || !safeEqual(body.password, PASSWORD)) { noteFail(ip); return send(res, 401, { ok: false, error: "Wrong password." }); }
    const cookie = `${COOKIE}=${encodeURIComponent(makeToken())}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MS / 1000}${isHttps(req) ? "; Secure" : ""}`;
    return send(res, 200, { ok: true }, { "Set-Cookie": cookie });
  }
  if (p === "/logout" && method === "POST") {
    return send(res, 200, { ok: true }, { "Set-Cookie": `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0` });
  }
  if (p === "/session" && method === "GET") return send(res, 200, { ok: true, authed: authed(req) });

  // everything below needs a valid session
  if (!authed(req)) return send(res, 401, { ok: false, error: "Please sign in." });
  if (method !== "GET" && !/^application\/json\b/i.test(req.headers["content-type"] || "")) {
    return send(res, 415, { ok: false, error: "JSON required." }); // blocks cross-site form posts
  }

  if (p === "/status" && method === "GET") return send(res, 200, { ok: true, ...eng.status(), server: { cron: CRON_TOKEN.length >= 16 } });

  if (p === "/config" && method === "GET") return send(res, 200, { ok: true, config: eng.loadConfig() });
  if (p === "/config" && method === "PUT") {
    if (eng.run.running) return send(res, 409, { ok: false, error: "A run is in progress. Stop it before changing settings." });
    const body = await readJson(req);
    try {
      const cfg = eng.sanitizeConfig(body);
      eng.saveConfig(cfg);
      return send(res, 200, { ok: true, config: cfg });
    } catch (e) { return send(res, 400, { ok: false, error: e.message }); }
  }

  if (p === "/run" && method === "POST") {
    const body = await readJson(req);
    const r = eng.startRun({ source: "dashboard", forceDry: body.dry === true });
    return send(res, r.started ? 202 : 409, { ok: r.started, ...(r.started ? {} : { error: r.reason }) });
  }
  if (p === "/stop" && method === "POST") { eng.requestStop(); return send(res, 200, { ok: true }); }

  if (p === "/preview" && method === "GET") {
    const n = Math.min(20, Math.max(1, parseInt(url.searchParams.get("n"), 10) || 5));
    try { return send(res, 200, { ok: true, emails: eng.previewNext(n) }); } catch (e) { return send(res, 400, { ok: false, error: e.message }); }
  }

  if (p === "/leads" && method === "GET") {
    const q = (url.searchParams.get("q") || "").toLowerCase();
    const st = url.searchParams.get("status") || "";
    const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get("limit"), 10) || 100));
    const offset = Math.max(0, parseInt(url.searchParams.get("offset"), 10) || 0);
    const all = store.loadTracking().filter((t) => (!st || t.status === st) && (!q || `${t.email} ${t.store} ${t.domain}`.toLowerCase().includes(q)));
    return send(res, 200, { ok: true, total: all.length, rows: all.slice(offset, offset + limit).map((t) => Object.fromEntries(LEAD_VIEW.map((f) => [f, t[f]]))) });
  }
  if (p === "/leads/import" && method === "POST") {
    const body = await readJson(req, 8 * 1024 * 1024);
    if (!Array.isArray(body.rows) || body.rows.length > 20000) return send(res, 400, { ok: false, error: "Send up to 20,000 rows." });
    return send(res, 200, { ok: true, ...eng.importLeads(body.rows, eng.loadConfig()) });
  }
  if (p === "/leads/action" && method === "POST") {
    const body = await readJson(req);
    const email = String(body.email || "");
    let r = null;
    if (body.action === "loom_sent") r = store.updateLead(email, { loom_sent: "1" });
    else if (body.action === "loom_unsent") r = store.updateLead(email, { loom_sent: "" });
    else if (body.action === "dnc") {
      const row = store.loadTracking().find((t) => t.email.toLowerCase() === email.toLowerCase());
      if (row) { store.addSuppression(row.email); r = store.updateLead(row.email, { status: "do-not-contact", note: "marked do-not-contact in dashboard" }); }
    } else return send(res, 400, { ok: false, error: "Unknown action." });
    return r ? send(res, 200, { ok: true }) : send(res, 404, { ok: false, error: "Lead not found." });
  }
  if (p === "/dnc" && method === "POST") {
    const v = String((await readJson(req)).value || "").trim().toLowerCase();
    if (!/^(@[a-z0-9.-]+\.[a-z]{2,}|[^\s@]+@[^\s@]+\.[^\s@]+)$/.test(v)) return send(res, 400, { ok: false, error: "Enter an email or @domain.com" });
    store.addSuppression(v);
    eng.loadState(eng.loadConfig());
    return send(res, 200, { ok: true });
  }

  if (p === "/templates" && method === "GET") {
    const bundled = new Set(fs.existsSync(path.join(__dirname, "templates")) ? fs.readdirSync(path.join(__dirname, "templates")) : []);
    const edited = new Set(fs.existsSync(tpl.OVERRIDE) ? fs.readdirSync(tpl.OVERRIDE) : []);
    return send(res, 200, { ok: true, templates: tpl.listTemplateFiles().map((t) => ({ name: t.name, step: t.step, variant: t.variant, text: fs.readFileSync(t.file, "utf8"), edited: edited.has(t.name), bundled: bundled.has(t.name) })),
      fields: Object.keys(tpl.fieldsFor(tpl.SAMPLE_LEAD, eng.loadConfig())) });
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
    const text = String(body.text || "").replace(/\r\n/g, "\n");
    try {
      const { subject, body: b } = tpl.parseTemplate(text, name);
      if (!subject || !b.trim()) throw new Error("Subject and body can't be empty");
      const left = (subject + b).match(/\[[A-Z]{3,}[^\]]*\]/);
      if (left) throw new Error(`Still contains the placeholder ${left[0]}`);
      tpl.render(Number(name[5]), tpl.SAMPLE_LEAD, eng.loadConfig(), "a", text);
    } catch (e) { return send(res, 400, { ok: false, error: e.message }); }
    fs.mkdirSync(tpl.OVERRIDE, { recursive: true });
    store.atomicWrite(path.join(tpl.OVERRIDE, name), text.endsWith("\n") ? text : text + "\n");
    return send(res, 200, { ok: true });
  }
  if (p === "/templates" && method === "DELETE") {
    const name = String(url.searchParams.get("name") || "");
    if (!tpl.FILE_RE.test(name)) return send(res, 400, { ok: false, error: "Bad template name." });
    try { fs.unlinkSync(path.join(tpl.OVERRIDE, name)); } catch (e) { return send(res, 404, { ok: false, error: "No edited copy to reset." }); }
    return send(res, 200, { ok: true });
  }

  if (p === "/export" && method === "GET") {
    const name = { tracking: "tracking.csv", sent: "sent_log.csv" }[url.searchParams.get("file")];
    if (!name) return send(res, 400, { ok: false, error: "Unknown file." });
    let data = "";
    try { data = fs.readFileSync(store.P(name), "utf8"); } catch (e) { /* empty export */ }
    res.writeHead(200, { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" });
    return res.end(data);
  }

  return send(res, 404, { ok: false, error: "Not found." });
}

/** Returns true if the request was for the outreach API (and has been answered). */
function handle(req, res) {
  let url;
  try { url = new URL(req.url, "http://x"); } catch (e) { return false; }
  if (url.pathname !== "/api/outreach" && !url.pathname.startsWith("/api/outreach/")) return false;
  if (!enabled) { send(res, 503, { ok: false, error: "Outreach is off. Set ADMIN_PASSWORD (8+ characters) on the server to turn it on." }); return true; }
  route(req, res, url, req.method).catch((e) => {
    if (!res.headersSent) send(res, e.status || 500, { ok: false, error: e.status ? e.message : "Server error" });
    if (!e.status) console.error("outreach error:", e);
  });
  return true;
}

/**
 * Optional in-process daily trigger (Hostinger cron is the reliable one; this is a bonus while the app is awake).
 * Set OUTREACH_AUTO_RUN_HOUR=0-23 (hour in the Settings time zone). Only runs when Settings is on Live.
 * Restarts can't cause extra sends: the per-mailbox daily budget counts what was already sent today.
 */
function startScheduler() {
  const raw = process.env.OUTREACH_AUTO_RUN_HOUR;
  if (!enabled || raw === undefined || raw === "") return;
  const hour = Number(raw);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return console.warn("OUTREACH_AUTO_RUN_HOUR must be 0-23 - auto-run disabled.");
  let lastDate = "";
  setInterval(() => {
    try {
      const cfg = eng.loadConfig();
      if (cfg.sending.dry_run) return;
      const t = eng.tzParts(new Date(), cfg.sending.timezone);
      if (t.date === lastDate || t.hour < hour) return;
      lastDate = t.date;
      const r = eng.startRun({ source: "auto" });
      if (!r.started) lastDate = ""; // try again next tick
    } catch (e) { console.error("outreach scheduler:", e.message); }
  }, 10 * 60 * 1000).unref();
  console.log(`Outreach auto-run on: daily after ${hour}:00.`);
}

module.exports = { handle, enabled, startScheduler };
