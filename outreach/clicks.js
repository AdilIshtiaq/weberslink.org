/*
 * Link click tracking for outreach emails and dashboard replies.
 *
 * Before a live email is sent, each http(s) link in its HTML part is swapped for https://<your site>/r/<token>, a token
 * unique to that lead and that link. Opening it records the click and redirects straight to the real address.
 *  - No open redirect: a token only ever leads to the address stored for it; unknown tokens go to the home page.
 *  - No IP addresses are stored. The browser name is used only to tell people from link scanners, then dropped.
 *  - Mail security scanners (Outlook Safe Links, Mimecast, Proofpoint, Gmail's checks...) "click" links by themselves,
 *    usually within seconds of delivery. Clicks from known scanners, HEAD requests and clicks in the first minute after
 *    sending are counted separately as "scanner" and not shown as a person clicking.
 *  - The plain-text copy keeps the real links (it is what spam filters and text-only mail apps read).
 */
const crypto = require("crypto");
const store = require("./store");

const LINKS = "links.json";
const CLICKS = "clicks.json";
const RECENT_MAX = 300;
const SCANNER_WINDOW_MS = 60 * 1000;
const TOKEN_RE = /^[A-Za-z0-9]{10,24}$/;
const BOT_UA = /bot|crawl|spider|slurp|preview|scan|check|monitor|proofpoint|mimecast|barracuda|forcepoint|symantec|trend ?micro|sophos|fortinet|cisco|ironport|zscaler|safelinks|microsoft office|ms-office|outlook-ios|google-?(safety|read-aloud)|feedfetcher|headless|phantom|python|curl|wget|java\/|go-http|okhttp|axios|node-fetch|libwww|httpclient|facebookexternalhit|whatsapp|slack|discord|telegram|skype/i;

const readLinks = () => { const d = store.readJson(LINKS, {}); return d && d.tokens && typeof d.tokens === "object" ? d : { tokens: {} }; };
const readClicks = () => { const d = store.readJson(CLICKS, {}); return { leads: (d && d.leads) || {}, recent: Array.isArray(d && d.recent) ? d.recent : [] }; };
const newToken = () => { const b = crypto.randomBytes(16); let s = ""; for (const x of b) s += "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"[x % 57]; return s.slice(0, 12); };

/** Where the /r/ links live: OUTREACH_PUBLIC_URL, or the website in Settings > signature. "" = tracking can't work. */
function baseUrl(cfg, env = process.env) {
  const raw = String(env.OUTREACH_PUBLIC_URL || (cfg && cfg.signature && cfg.signature.website) || "").trim();
  if (!raw) return "";
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : "https://" + raw);
    return u.protocol === "https:" || u.hostname === "localhost" ? u.origin : "";
  } catch (e) { return ""; }
}

const decode = (s) => String(s).replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const escAttr = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function labelFor(inner, url) {
  const text = decode(String(inner || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  if (text) return text.slice(0, 60);
  if (/<img/i.test(inner || "")) return "logo / image";
  try { return new URL(url).hostname; } catch (e) { return url.slice(0, 60); }
}

/**
 * Rewrites the http(s) links in an email's HTML into tracked links for one lead. Returns the new HTML.
 * opts: { email, source ("email 1", "reply"...), cfg, now }. Links already pointing at /r/ and mailto: links are left alone.
 */
function trackHtml(html, { email, source = "", cfg, now = new Date(), env = process.env } = {}) {
  const base = baseUrl(cfg, env);
  if (!html || !email || !base) return html;
  const db = readLinks();
  const mine = new Map();
  for (const [tok, l] of Object.entries(db.tokens)) if (l.e === email.toLowerCase()) mine.set(l.u, tok);
  let changed = false;
  const out = String(html).replace(/<a\b([^>]*?)\bhref\s*=\s*"([^"]*)"([^>]*)>([\s\S]*?)<\/a>/gi, (all, pre, href, post, inner) => {
    const url = decode(href).trim();
    if (!/^https?:\/\/[^\s]+$/i.test(url) || url.startsWith(base + "/r/") || url.length > 2000) return all;
    let tok = mine.get(url);
    if (!tok) { do tok = newToken(); while (db.tokens[tok]); mine.set(url, tok); db.tokens[tok] = { e: email.toLowerCase(), u: url, l: labelFor(inner, url), s: source, c: now.toISOString() }; }
    db.tokens[tok].t = now.toISOString(); // last time this link was emailed: clicks right after it are scanners
    if (source) db.tokens[tok].s = source;
    changed = true;
    return `<a${pre}href="${escAttr(base + "/r/" + tok)}"${post}>${inner}</a>`;
  });
  if (changed) store.writeJson(LINKS, db);
  return out;
}

const recentHits = new Map(); // token|ua -> time, so a double-click or a refresh counts once
/**
 * Handles one visit to /r/<token>. Returns the address to send the visitor to, or "" for an unknown token.
 * req: { method, ua }. Never throws for bad input.
 */
function record(token, { method = "GET", ua = "", now = new Date() } = {}) {
  if (!TOKEN_RE.test(String(token || ""))) return "";
  const link = readLinks().tokens[token];
  if (!link) return "";
  if (method !== "GET") return link.u; // HEAD and friends: link checkers, not people
  const t = now.getTime();
  const key = token + "|" + String(ua).slice(0, 200);
  if (t - (recentHits.get(key) || 0) < 10 * 1000) return link.u;
  recentHits.set(key, t);
  if (recentHits.size > 5000) for (const [k, v] of recentHits) if (t - v > 60 * 1000) recentHits.delete(k);

  const scanner = !ua || BOT_UA.test(ua) || (link.t && t - Date.parse(link.t) >= 0 && t - Date.parse(link.t) < SCANNER_WINDOW_MS);
  const db = readClicks();
  const s = db.leads[link.e] || (db.leads[link.e] = { clicks: 0, scanner: 0, first: "", last: "", links: {} });
  const at = now.toISOString();
  if (scanner) s.scanner++;
  else {
    s.clicks++; s.first = s.first || at; s.last = at;
    const lbl = (link.l || link.u).slice(0, 60);
    s.links[lbl] = (s.links[lbl] || 0) + 1;
  }
  db.recent.unshift({ at, email: link.e, label: link.l || "", url: link.u, source: link.s || "", scanner: Boolean(scanner) });
  db.recent = db.recent.slice(0, RECENT_MAX);
  store.writeJson(CLICKS, db);
  return link.u;
}

/** Per-lead summary: { clicks, scanner, first, last, links: { label: count } } or null. */
function forLead(email) { return readClicks().leads[String(email || "").toLowerCase()] || null; }
function allLeads() { return readClicks().leads; }
/** Latest clicks by people (scanner hits left out unless withScanners). */
function recent(n = 30, withScanners = false) { return readClicks().recent.filter((r) => withScanners || !r.scanner).slice(0, n); }

/** HTTP handler for GET/HEAD /r/<token>. Returns true when it handled the request. */
function handle(req, res) {
  const m = /^\/r\/([^/?#]+)\/?$/.exec(String(req.url || "").split("?")[0]);
  if (!m) return false;
  let to = "";
  try { to = record(m[1], { method: req.method, ua: String(req.headers["user-agent"] || "") }); } catch (e) { console.error("outreach click:", e.message); }
  res.writeHead(302, { Location: to || "/", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" });
  res.end();
  return true;
}

module.exports = { baseUrl, trackHtml, record, forLead, allLeads, recent, handle, BOT_UA, SCANNER_WINDOW_MS };
