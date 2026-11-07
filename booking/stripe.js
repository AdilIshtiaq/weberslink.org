/*
 * Stripe for booking deposits, using Stripe Connect (Express accounts).
 *
 * Each business connects its own Stripe account (Stripe hosts the sign-up and identity checks). Customers pay on
 * Stripe Checkout; the charge is made directly on the business's account, so the money goes to them. Optionally the
 * platform keeps a small fee per payment (STRIPE_PLATFORM_FEE_PERCENT, default 0).
 *
 * Settings on the server:
 *   STRIPE_SECRET_KEY            your platform's secret key (Connect enabled in the Stripe dashboard)
 *   STRIPE_WEBHOOK_SECRET        signing secret of a Connect webhook endpoint pointing at /api/booking-stripe/webhook
 *                                (events: checkout.session.completed, checkout.session.expired, account.updated)
 *   STRIPE_PLATFORM_FEE_PERCENT  optional, 0-20
 *   STRIPE_API_BASE              tests only (a fake Stripe)
 */
const crypto = require("crypto");

const env = () => process.env;
const enabled = () => /^sk_(test|live)_/.test(env().STRIPE_SECRET_KEY || "") || Boolean(env().STRIPE_API_BASE && env().STRIPE_SECRET_KEY);
const testMode = () => /^sk_test_/.test(env().STRIPE_SECRET_KEY || "");
const base = () => (env().STRIPE_API_BASE || "https://api.stripe.com").replace(/\/+$/, "");
const feePercent = () => { const n = Number(env().STRIPE_PLATFORM_FEE_PERCENT); return Number.isFinite(n) && n > 0 ? Math.min(n, 20) : 0; };

// Currencies Stripe counts in whole units (no cents).
const ZERO_DECIMAL = ["bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf"];
const toMinor = (amount, currency) => Math.round(Number(amount) * (ZERO_DECIMAL.includes(currency) ? 1 : 100));
const fromMinor = (minor, currency) => Number(minor) / (ZERO_DECIMAL.includes(currency) ? 1 : 100);

/** application/x-www-form-urlencoded with Stripe's nested keys: a[b][0][c]=v */
function form(obj, prefix = "", out = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object") form(v, key, out);
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return out.join("&");
}

class StripeError extends Error {}
/** Calls the Stripe API. account = connected account id for calls made on its behalf. */
async function api(method, pathname, params, account) {
  if (!enabled()) throw new StripeError("Online payments aren't switched on yet.");
  const headers = { Authorization: `Bearer ${env().STRIPE_SECRET_KEY}`, "Stripe-Version": "2024-06-20" };
  if (account) headers["Stripe-Account"] = account;
  let url = base() + pathname, body;
  if (params && method === "GET") url += "?" + form(params);
  else if (params) { body = form(params); headers["Content-Type"] = "application/x-www-form-urlencoded"; }
  if (method === "POST") headers["Idempotency-Key"] = crypto.randomBytes(12).toString("hex");
  let res;
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 20000);
  try { res = await fetch(url, { method, headers, body, signal: ctl.signal }); }
  catch (e) { throw new StripeError("Couldn't reach Stripe. Please try again in a moment."); }
  finally { clearTimeout(timer); }
  const j = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new StripeError((j.error && j.error.message) || `Stripe error ${res.status}`); e.status = res.status; e.code = j.error && j.error.code; throw e; }
  return j;
}

const createAccount = ({ email, name, url }) => api("POST", "/v1/accounts", {
  type: "express", email, business_profile: { name, url }, capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
});
const accountLink = (account, refreshUrl, returnUrl) => api("POST", "/v1/account_links", { account, refresh_url: refreshUrl, return_url: returnUrl, type: "account_onboarding" });
const getAccount = (account) => api("GET", `/v1/accounts/${encodeURIComponent(account)}`);
const loginLink = (account) => api("POST", `/v1/accounts/${encodeURIComponent(account)}/login_links`, {});

/** A Checkout page for one deposit. Returns { id, url }. Stripe's minimum expiry is 30 minutes. */
function createCheckout({ account, amount, currency, name, description, email, successUrl, cancelUrl, metadata }) {
  const minor = toMinor(amount, currency), fee = Math.floor(minor * feePercent() / 100);
  return api("POST", "/v1/checkout/sessions", {
    mode: "payment", success_url: successUrl, cancel_url: cancelUrl, customer_email: email || undefined,
    expires_at: Math.floor(Date.now() / 1000) + 31 * 60, metadata,
    line_items: [{ quantity: 1, price_data: { currency, unit_amount: minor, product_data: { name, description: description || undefined } } }],
    payment_intent_data: { metadata, description: description || undefined, ...(fee > 0 ? { application_fee_amount: fee } : {}) },
  }, account);
}
const getCheckout = (account, id) => api("GET", `/v1/checkout/sessions/${encodeURIComponent(id)}`, null, account);
const refund = (account, paymentIntent, amountMinor) => api("POST", "/v1/refunds", { payment_intent: paymentIntent, ...(amountMinor ? { amount: amountMinor } : {}), ...(feePercent() ? { refund_application_fee: true } : {}) }, account);

/** Checks a Stripe-Signature header (t=...,v1=...) against the raw body. Returns the parsed event or throws. */
function verifyWebhook(raw, header, secret = env().STRIPE_WEBHOOK_SECRET, now = Date.now()) {
  if (!secret) throw new StripeError("Webhook secret not set.");
  const parts = Object.fromEntries(String(header || "").split(",").map((p) => p.split("=")).filter((p) => p.length === 2).map(([k, v]) => [k.trim(), v.trim()]));
  const sigs = String(header || "").split(",").filter((p) => p.trim().startsWith("v1=")).map((p) => p.trim().slice(3));
  const t = Number(parts.t);
  if (!t || !sigs.length) throw new StripeError("Missing signature.");
  if (Math.abs(now / 1000 - t) > 300) throw new StripeError("Signature too old.");
  const want = crypto.createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");
  if (!sigs.some((s) => s.length === want.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(want)))) throw new StripeError("Bad signature.");
  return JSON.parse(raw);
}
/** For tests: the header Stripe would send. */
function signForTest(raw, secret, t = Math.floor(Date.now() / 1000)) { return `t=${t},v1=${crypto.createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex")}`; }

module.exports = { enabled, testMode, feePercent, toMinor, fromMinor, createAccount, accountLink, getAccount, loginLink, createCheckout, getCheckout, refund, verifyWebhook, signForTest, StripeError, ZERO_DECIMAL };
