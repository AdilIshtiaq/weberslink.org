// Stripe deposits: connect a business, deposit rules, pay on Checkout, return + signed webhook, holds, refunds.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "booking-pay-"));
process.env.BOOKING_DATA_DIR = path.join(DIR, "booking");
process.env.OUTREACH_DATA_DIR = DIR;
process.env.BOOKING_PUBLIC_URL = "https://example.test";
process.env.STRIPE_SECRET_KEY = "sk_test_fake";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
const core = require("../booking/core");
const mail = require("../booking/mail");
const store = require("../booking/store");
const stripe = require("../booking/stripe");
const booking = require("../booking");
const fake = require("./helpers/fake-stripe");
const inbox = [];
mail.setSender(async (m, kind) => { inbox.push({ kind, to: m.to, text: m.text }); });
booking.setSiteAdminCheck(() => true);

let sv, S;
test.before(async () => {
  S = await fake.start(); process.env.STRIPE_API_BASE = S.url;
  await new Promise((r) => { sv = http.createServer((req, res) => { if (!booking.handle(req, res)) { res.writeHead(404); res.end(); } }); sv.listen(0, r); });
});
test.after(() => { sv.close(); S.close(); fs.rmSync(DIR, { recursive: true, force: true }); });
let n = 0;
const ip = () => ({ "x-forwarded-for": "10.5." + Math.floor(++n / 250) + "." + (n % 250) });
async function call(method, url, body, cookie, extra = {}) {
  const res = await fetch(`http://127.0.0.1:${sv.address().port}${url}`, { method, headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}), ...ip(), ...extra }, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
  const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch (e) {}
  return { status: res.status, json, text, cookie: (res.headers.get("set-cookie") || "").split(";")[0] };
}
const tick = () => new Promise((r) => setTimeout(r, 40));
const A = "/api/booking/pay-shop";
let C;
async function slot(skip = 3, i = 0) { const days = (await call("GET", `${A}/slots?service=s1&days=14`)).json.days; return days.slice(skip).filter((d) => d.slots.length)[0].slots[i * 2].t; }
const customer = (o = {}) => ({ serviceId: "s1", staffId: "any", name: "Ann Lee", email: "ann@x.test", phone: "555 123 4567", ...o });
async function webhook(event, secret = "whsec_test") { const raw = JSON.stringify(event); return call("POST", "/api/booking-stripe/webhook", raw, null, { "stripe-signature": stripe.signForTest(raw, secret) }); }

test("deposit rules and currency codes", () => {
  const svc = (deposit, price = 80) => ({ price, deposit: core.cleanDeposit(deposit) });
  assert.strictEqual(core.depositFor(svc({ type: "fixed", value: 20 })), 20);
  assert.strictEqual(core.depositFor(svc({ type: "percent", value: 25 })), 20);
  assert.strictEqual(core.depositFor(svc({ type: "full" })), 80);
  assert.strictEqual(core.depositFor(svc({ type: "none" })), 0);
  assert.deepStrictEqual(core.cleanDeposit({ type: "fixed", value: 0 }), { type: "none", value: 0 });
  assert.deepStrictEqual(core.cleanDeposit({ type: "percent", value: 500 }), { type: "percent", value: 100 });
  assert.strictEqual(core.sanitizeSettings({ services: [{ name: "A" }], staff: [{ name: "P" }], currency: "£" }).currencyCode, "gbp");
  assert.strictEqual(core.sanitizeSettings({ services: [{ name: "A" }], staff: [{ name: "P" }], currency: "$", currencyCode: "PKR" }).currencyCode, "pkr");
  assert.strictEqual(stripe.toMinor(12.5, "usd"), 1250); assert.strictEqual(stripe.toMinor(1000, "jpy"), 1000);
});

test("webhook signatures: right secret accepted, wrong or stale refused", () => {
  const raw = '{"type":"x"}';
  assert.deepStrictEqual(stripe.verifyWebhook(raw, stripe.signForTest(raw, "s1"), "s1"), { type: "x" });
  assert.throws(() => stripe.verifyWebhook(raw, stripe.signForTest(raw, "s2"), "s1"), /Bad signature/);
  assert.throws(() => stripe.verifyWebhook(raw, stripe.signForTest(raw, "s1", Math.floor(Date.now() / 1000) - 3600), "s1"), /too old/);
  assert.throws(() => stripe.verifyWebhook(raw, "", "s1"), /Missing/);
});

test("owner connects Stripe; until Stripe enables charges, deposits aren't taken", async () => {
  const made = await call("POST", "/api/booking-admin/create", { slug: "pay-shop", name: "Pay Shop", ownerEmail: "o@pay.test", preset: "other", tz: "UTC", currency: "$" });
  C = (await call("POST", `${A}/login`, { password: made.json.password })).cookie;
  const d = (await call("GET", `${A}/admin/data`, undefined, C)).json;
  assert.deepStrictEqual({ a: d.payments.available, c: d.payments.connected }, { a: true, c: false });
  const st = { ...d.settings, setupDone: true, services: d.settings.services.map((s) => ({ ...s, price: 80, deposit: { type: "percent", value: 25 } })) };
  assert.strictEqual((await call("PUT", `${A}/admin/settings`, { settings: st }, C)).json.settings.services[0].deposit.value, 25);
  const con = await call("POST", `${A}/admin/stripe/connect`, {}, C);
  assert.strictEqual(con.status, 200, con.text); assert.match(con.json.url, /^https:\/\/connect\.stripe\.test\/setup\/acct_/);
  const acct = Object.keys(S.state.accounts)[0];
  assert.strictEqual(S.state.requests.find((r) => r.url === "/v1/accounts").params.type, "express");
  // not enabled yet -> booking goes through without payment
  const b = await call("POST", `${A}/book`, customer({ start: await slot(3, 0) }));
  assert.strictEqual(b.status, 200); assert.strictEqual(b.json.payUrl, undefined); assert.strictEqual(b.json.booking.status, "booked");
  // Stripe finishes onboarding
  S.enableAccount(acct);
  const status = await call("POST", `${A}/admin/stripe/status`, {}, C);
  assert.strictEqual(status.json.payments.chargesEnabled, true);
  assert.strictEqual((await call("GET", `${A}/config`)).json.settings.payments, true);
});

test("customer pays the deposit: booking held, sent to Checkout, confirmed on return; emails only after paying", async () => {
  inbox.length = 0;
  const t = await slot(3, 1);
  const b = await call("POST", `${A}/book`, customer({ start: t, email: "pay@x.test" }));
  assert.strictEqual(b.status, 200, b.text);
  assert.strictEqual(b.json.booking.status, "pending"); assert.deepStrictEqual(b.json.booking.payment, { amount: 20, currency: "usd", status: "pending" });
  assert.match(b.json.payUrl, /^https:\/\/checkout\.stripe\.test\/pay\/cs_test_/);
  const sess = Object.values(S.state.sessions).pop();
  assert.strictEqual(sess.amount_total, 2000); assert.strictEqual(sess.currency, "usd"); assert.strictEqual(sess.metadata.code, b.json.booking.code);
  assert.strictEqual(sess.account, Object.keys(S.state.accounts)[0]); // charged on the business's own account
  assert.match(sess.success_url, /\/book\/pay-shop\?paid=.*&session_id=\{CHECKOUT_SESSION_ID\}$/);
  // the time is held: nobody else can take it
  assert.match((await call("POST", `${A}/book`, customer({ start: t, email: "other@x.test" }))).json.error, /taken/);
  await tick(); assert.strictEqual(inbox.length, 0); // no confirmation before paying
  // returning without paying does nothing
  assert.strictEqual((await call("POST", `${A}/payment`, { code: b.json.booking.code, sessionId: sess.id })).json.paid, false);
  // pay, come back
  S.pay(sess.id);
  const back = await call("POST", `${A}/payment`, { code: b.json.booking.code, sessionId: sess.id });
  assert.strictEqual(back.json.paid, true); assert.strictEqual(back.json.booking.status, "booked");
  await tick(); assert.deepStrictEqual(inbox.map((m) => m.kind).sort(), ["confirm", "owner-new"]);
  assert.match(inbox.find((m) => m.kind === "confirm").text, /Paid online: \$20 \(pay \$60 at your appointment\)/);
  // the webhook arriving afterwards changes nothing (idempotent), and sends no second email
  const again = await webhook({ type: "checkout.session.completed", account: sess.account, data: { object: sess } });
  assert.strictEqual(again.status, 200); await tick(); assert.strictEqual(inbox.length, 2);
});

test("the webhook alone confirms a payment (customer closed the tab); events from another account are ignored", async () => {
  const t = await slot(4, 0);
  const b = await call("POST", `${A}/book`, customer({ start: t, email: "web@x.test" }));
  const sess = S.pay(Object.values(S.state.sessions).pop().id);
  assert.strictEqual((await webhook({ type: "checkout.session.completed", account: "acct_someone_else", data: { object: sess } })).status, 200);
  assert.strictEqual(store.loadBiz("pay-shop").bookings.find((x) => x.code === b.json.booking.code).status, "pending");
  assert.strictEqual((await webhook({ type: "checkout.session.completed", account: sess.account, data: { object: sess } }, "whsec_wrong")).status, 400);
  await webhook({ type: "checkout.session.completed", account: sess.account, data: { object: sess } });
  const saved = store.loadBiz("pay-shop").bookings.find((x) => x.code === b.json.booking.code);
  assert.strictEqual(saved.status, "booked"); assert.strictEqual(saved.payment.status, "paid"); assert.ok(saved.payment.paymentIntent);
});

test("unpaid holds expire and free the time; a Checkout failure doesn't leave a hold", async () => {
  const t = await slot(5, 0);
  const b = await call("POST", `${A}/book`, customer({ start: t, email: "late@x.test" }));
  const biz = store.loadBiz("pay-shop"); const x = biz.bookings.find((y) => y.code === b.json.booking.code);
  x.holdUntil = new Date(Date.now() - 1000).toISOString(); store.saveBiz("pay-shop", biz);
  const other = await call("POST", `${A}/book`, customer({ start: t, email: "next@x.test" })); // time is free again
  assert.strictEqual(other.status, 200, other.text);
  assert.strictEqual(store.loadBiz("pay-shop").bookings.find((y) => y.code === b.json.booking.code).status, "expired");
  S.state.failNext = { status: 500, message: "Stripe is down" };
  const t2 = await slot(5, 1);
  const f = await call("POST", `${A}/book`, customer({ start: t2, email: "fail@x.test" }));
  assert.strictEqual(f.status, 502); assert.match(f.json.error, /Online payment isn't available/);
  assert.strictEqual((await call("POST", `${A}/book`, customer({ start: t2, email: "fail2@x.test" }))).status, 200); // not held
});

test("refunds: customer cancels in time, owner cancels (or not), manual refund, no-show keeps it", async () => {
  const paid = async (skip, email) => { const b = await call("POST", `${A}/book`, customer({ start: await slot(skip, 0), email })); const s = S.pay(Object.values(S.state.sessions).pop().id); await call("POST", `${A}/payment`, { code: b.json.booking.code, sessionId: s.id }); return b.json.booking.code; };
  const before = S.state.refunds.length;
  const c1 = await paid(6, "r1@x.test");
  assert.strictEqual((await call("POST", `${A}/cancel`, { code: c1, email: "r1@x.test" })).json.booking.payment.status, "refunded");
  assert.strictEqual(S.state.refunds.length, before + 1); assert.strictEqual(S.state.refunds.at(-1).account, Object.keys(S.state.accounts)[0]);
  const c2 = await paid(7, "r2@x.test"), c3 = await paid(8, "r3@x.test");
  const list = (await call("GET", `${A}/admin/data`, undefined, C)).json.bookings;
  const id2 = list.find((b) => b.code === c2).id, id3 = list.find((b) => b.code === c3).id;
  await call("POST", `${A}/admin/status`, { id: id2, status: "cancelled", refund: false }, C);
  assert.strictEqual(S.state.refunds.length, before + 1); // owner chose to keep it
  assert.strictEqual((await call("POST", `${A}/admin/refund`, { id: id2 }, C)).status, 200);
  assert.strictEqual(S.state.refunds.length, before + 2);
  assert.strictEqual((await call("POST", `${A}/admin/refund`, { id: id2 }, C)).status, 400); // only once
  await call("POST", `${A}/admin/status`, { id: id3, status: "no-show" }, C);
  assert.strictEqual(S.state.refunds.length, before + 2);
  const pendingId = (await call("GET", `${A}/admin/data`, undefined, C)).json.bookings.find((b) => b.status === "expired").id;
  assert.match((await call("POST", `${A}/admin/status`, { id: pendingId, status: "done" }, C)).json.error, /deposit/);
});

test("platform fee is added when configured; Stripe Express dashboard link; account.updated webhook", async () => {
  process.env.STRIPE_PLATFORM_FEE_PERCENT = "5";
  await call("POST", `${A}/book`, customer({ start: await slot(9, 0), email: "fee@x.test" }));
  assert.strictEqual(Object.values(S.state.sessions).pop().fee, "100"); // 5% of $20.00
  delete process.env.STRIPE_PLATFORM_FEE_PERCENT;
  assert.match((await call("POST", `${A}/admin/stripe/dashboard`, {}, C)).json.url, /express\/acct_/);
  const acct = Object.keys(S.state.accounts)[0];
  await webhook({ type: "account.updated", data: { object: { id: acct, charges_enabled: false, details_submitted: true } } });
  assert.strictEqual(store.loadBiz("pay-shop").stripe.chargesEnabled, false);
  const b = await call("POST", `${A}/book`, customer({ start: await slot(10, 0), email: "off@x.test" }));
  assert.strictEqual(b.json.booking.status, "booked"); // payments paused by Stripe -> book without deposit
});

test("without STRIPE_SECRET_KEY: connect explains, everything else works", async () => {
  const key = process.env.STRIPE_SECRET_KEY; delete process.env.STRIPE_SECRET_KEY;
  try {
    assert.strictEqual((await call("POST", `${A}/admin/stripe/connect`, {}, C)).status, 503);
    assert.strictEqual((await call("GET", `${A}/config`)).json.settings.payments, false);
  } finally { process.env.STRIPE_SECRET_KEY = key; }
});
