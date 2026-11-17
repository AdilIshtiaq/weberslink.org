/*
 * One-click unsubscribe (RFC 8058). Every cold email carries
 *   List-Unsubscribe: <https://site/u/TOKEN>, <mailto:...>   and   List-Unsubscribe-Post: List-Unsubscribe=One-Click
 * which Gmail and Yahoo require from bulk senders and which shows the "Unsubscribe" button in the inbox.
 * The token is the address plus an HMAC made with this install's secret key, so it can't be forged or guessed.
 * A GET only shows a confirm button (mail scanners that open links must not unsubscribe people); a POST unsubscribes.
 */
const crypto = require("crypto");
const store = require("./store");
const clicks = require("./clicks");

const b64 = (s) => Buffer.from(s, "utf8").toString("base64url");
const mac = (email, key) => crypto.createHmac("sha256", key).update("unsub:" + email).digest("hex").slice(0, 24);

/** "" when no https site address or no secret key is available (the email then carries only the mailto: link). */
function urlFor(email, cfg, env = process.env) {
  const base = clicks.baseUrl(cfg, env), key = store.sessionKey(), e = String(email || "").trim().toLowerCase();
  return base && key && store.isEmail(e) ? `${base}/u/${b64(e)}.${mac(e, key)}` : "";
}

/** The address a token is valid for, or null. */
function parse(token) {
  const m = /^([A-Za-z0-9_-]{1,400})\.([0-9a-f]{24})$/.exec(String(token || ""));
  const key = store.sessionKey();
  if (!m || !key) return null;
  let email;
  try { email = Buffer.from(m[1], "base64url").toString("utf8"); } catch (e) { return null; }
  if (!store.isEmail(email) || email !== email.toLowerCase()) return null;
  const want = Buffer.from(mac(email, key)), got = Buffer.from(m[2]);
  return want.length === got.length && crypto.timingSafeEqual(want, got) ? email : null;
}

/** Never email this address again, and stop its sequence. */
function apply(email) {
  if (!store.loadSuppression().has(email)) store.addSuppression(email);
  const row = store.loadTracking().find((t) => t.email.toLowerCase() === email);
  if (row && !["bounced", "do-not-contact", "unsubscribed"].includes(row.status)) {
    store.updateLead(row.email, { status: "unsubscribed", note: `one-click unsubscribe ${new Date().toISOString().slice(0, 10)}` });
  }
  return true;
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const page = (body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Unsubscribe</title></head>` +
  `<body style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:12vh auto;padding:0 20px;color:#222">${body}</body></html>`;

function handle(req, res, url) {
  const email = parse(decodeURIComponent(url.pathname.slice(3)));
  const html = (code, body) => { res.writeHead(code, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" }); res.end(req.method === "HEAD" ? undefined : page(body)); };
  if (!email) return html(404, "<h2>This link is not valid</h2><p>If you want to stop receiving emails, just reply with the word &ldquo;unsubscribe&rdquo;.</p>");
  if (req.method === "POST") {
    req.resume();
    apply(email);
    return html(200, `<h2>You are unsubscribed</h2><p>${esc(email)} will not receive any more emails from us.</p>`);
  }
  return html(200, `<h2>Unsubscribe</h2><p>Stop all emails to <b>${esc(email)}</b>?</p><form method="post"><button type="submit" style="padding:10px 18px;font-size:16px;cursor:pointer">Yes, unsubscribe me</button></form>`);
}

module.exports = { urlFor, parse, apply, handle };
