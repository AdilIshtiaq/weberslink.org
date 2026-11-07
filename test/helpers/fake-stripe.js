// A small stand-in for the Stripe API, enough for the booking tests: accounts, account links, login links,
// checkout sessions (with a "pay" helper), and refunds. Records every request for assertions.
const http = require("http");
const qs = (body) => { const o = {}; for (const [k, v] of new URLSearchParams(body)) o[k] = v; return o; };
function start() {
  const st = { accounts: {}, sessions: {}, refunds: [], requests: [], failNext: null };
  let n = 0; const id = (p) => `${p}_${(++n).toString(36).padStart(8, "0")}`;
  const sv = http.createServer((req, res) => {
    let body = ""; req.on("data", (c) => (body += c)); req.on("end", () => {
      const p = qs(body), acct = req.headers["stripe-account"] || null, url = req.url.split("?")[0];
      st.requests.push({ method: req.method, url, params: p, account: acct, auth: req.headers.authorization });
      const send = (code, o) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); };
      if (!/^Bearer sk_/.test(req.headers.authorization || "")) return send(401, { error: { message: "Invalid API key" } });
      if (st.failNext) { const f = st.failNext; st.failNext = null; return send(f.status || 500, { error: { message: f.message || "boom" } }); }
      let m;
      if (req.method === "POST" && url === "/v1/accounts") { const a = { id: id("acct"), charges_enabled: false, details_submitted: false, email: p.email }; st.accounts[a.id] = a; return send(200, a); }
      if (req.method === "GET" && (m = /^\/v1\/accounts\/([^/]+)$/.exec(url))) return st.accounts[m[1]] ? send(200, st.accounts[m[1]]) : send(404, { error: { message: "No such account" } });
      if (req.method === "POST" && url === "/v1/account_links") return send(200, { url: `https://connect.stripe.test/setup/${p.account}?return=${encodeURIComponent(p.return_url)}` });
      if (req.method === "POST" && (m = /^\/v1\/accounts\/([^/]+)\/login_links$/.exec(url))) return send(200, { url: `https://connect.stripe.test/express/${m[1]}` });
      if (req.method === "POST" && url === "/v1/checkout/sessions") {
        const md = {}; for (const [k, v] of Object.entries(p)) { const mm = /^metadata\[(.+)\]$/.exec(k); if (mm) md[mm[1]] = v; }
        const s = { id: id("cs_test"), url: "", account: acct, payment_status: "unpaid", status: "open", metadata: md, amount_total: Number(p["line_items[0][price_data][unit_amount]"]), currency: p["line_items[0][price_data][currency]"], success_url: p.success_url, fee: p["payment_intent_data[application_fee_amount]"] };
        s.url = `https://checkout.stripe.test/pay/${s.id}`; st.sessions[s.id] = s; return send(200, s);
      }
      if (req.method === "GET" && (m = /^\/v1\/checkout\/sessions\/([^/]+)$/.exec(url))) { const s = st.sessions[m[1]]; return s && s.account === acct ? send(200, s) : send(404, { error: { message: "No such checkout.session" } }); }
      if (req.method === "POST" && url === "/v1/refunds") { const r = { id: id("re"), payment_intent: p.payment_intent, account: acct, status: "succeeded" }; st.refunds.push(r); return send(200, r); }
      send(404, { error: { message: "Unknown route " + url } });
    });
  });
  return new Promise((resolve) => sv.listen(0, () => resolve({
    url: `http://127.0.0.1:${sv.address().port}`, state: st, close: () => sv.close(),
    pay(sessionId) { const s = st.sessions[sessionId]; s.payment_status = "paid"; s.status = "complete"; s.payment_intent = "pi_" + sessionId.slice(-8); return s; },
    enableAccount(acctId) { st.accounts[acctId].charges_enabled = true; st.accounts[acctId].details_submitted = true; },
  })));
}
module.exports = { start };
