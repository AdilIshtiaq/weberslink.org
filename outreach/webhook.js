/*
 * Tells another system (a CRM, Zapier, Slack automation ...) when someone gives a positive reply.
 * The address comes from Settings > AI (https only, never a private or local address) and the call is best-effort:
 * a failure is logged and never affects sending. The payload holds the lead's own business details, nothing secret.
 */
const https = require("https");

const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|\[?f[cd][0-9a-f]{2}:)/i;
let sender = null; // tests replace the network call
const setSender = (fn) => { sender = fn; };

function post(urlStr, payload, timeoutMs = 8000) {
  let u;
  try { u = new URL(urlStr); } catch (e) { return Promise.resolve({ ok: false, error: "bad address" }); }
  if (u.protocol !== "https:" || PRIVATE_HOST.test(u.hostname)) return Promise.resolve({ ok: false, error: "address not allowed" });
  if (sender) return Promise.resolve(sender(u.toString(), payload));
  const body = JSON.stringify(payload);
  return new Promise((resolve) => {
    const req = https.request(u, { method: "POST", timeout: timeoutMs, headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } }, (res) => {
      res.resume(); res.on("end", () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode }));
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (e) => resolve({ ok: false, error: String(e.message).slice(0, 80) }));
    req.end(body);
  });
}

module.exports = { post, setSender, PRIVATE_HOST };
