const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "outreach-aitools-"));
process.env.OUTREACH_DATA_DIR = DIR;
process.env.ADMIN_PASSWORD = "correct-horse-battery";
delete process.env.GEMINI_OUTREACH_KEY; delete process.env.GEMINI_API_KEY;
const store = require("../outreach/store");
const eng = require("../outreach/engine");
const ai = require("../outreach/ai");
const tpl = require("../outreach/templates");
const outreach = require("../outreach/index");

test.after(() => { ai.setGenerator(null); fs.rmSync(DIR, { recursive: true, force: true }); });
const reset = () => { for (const f of fs.readdirSync(DIR)) fs.rmSync(path.join(DIR, f), { recursive: true, force: true }); ai.setGenerator(null); };
const lead = (o) => Object.assign(Object.fromEntries(store.TRACK_FIELDS.map((f) => [f, ""])), { status: "new", country: "US", ...o });
const answer = (obj) => ai.setGenerator(async () => JSON.stringify(obj));
const BASE = { signature: { name: "Hassan Ali", title: "Founder", company: "WebersLink", website: "weberslink.org", postal_address: "1 Example St" }, sending: { countries: ["US", "UK"], timezone: "UTC" }, mailboxes: [{ id: 1, email: "a@x.com" }] };
const cfgWith = (campaigns, ai2) => eng.sanitizeConfig({ ...BASE, campaigns, ai: ai2 });

const GOOD = (n) => ({ subject: `quick question ${n}`, body: `{greeting}\n\n${n === 1 ? "{custom_line_para}" : ""}When a customer calls {store} and nobody answers, they usually ring the next ${"company on the list and "}that is a lost job. We build and run an assistant that answers every call and books the visit for you, day or night, and texts you the details afterwards.\n\nWould a short video of it for {store} be useful?\n\n{sender_first_name}` });

test("lead filters work by plain-language stage, place, business type, score and sort", () => {
  const cfg = cfgWith([]), now = new Date();
  const track = [
    lead({ email: "a@a.com", store: "A", status: "new", state: "TX", city: "Austin", category: "Roofing", ai_score: "9" }),
    lead({ email: "b@b.com", store: "B", status: "new", state: "FL", city: "Miami", category: "HVAC", ai_score: "4" }),
    lead({ email: "c@c.com", store: "C", status: "active", step: "1", country: "UK", category: "Roofing", last_sent: "2026-11-10T10:00:00Z" }),
    lead({ email: "d@d.com", store: "D", status: "replied", reply_label: "interested", replied_at: "2026-11-12T10:00:00Z" }),
    lead({ email: "e@e.com", store: "E", status: "bounced" }), lead({ email: "f@f.com", store: "F", status: "skipped-bad-address" }),
    lead({ email: "g@g.com", store: "G", status: "active", step: "1", snooze_until: "2999-01-01" }),
    lead({ email: "h@h.com", store: "H", status: "new", referred_by: "d@d.com" }),
  ];
  const q = (o) => eng.leadQuery(track, o, cfg, now).map((t) => t.store).join("");
  assert.strictEqual(q({ stage: "waiting" }), "ABH");
  assert.strictEqual(q({ stage: "sequence" }), "CG");
  assert.strictEqual(q({ stage: "snoozed" }), "G");
  assert.strictEqual(q({ stage: "interested" }), "D");
  assert.strictEqual(q({ stage: "stopped" }), "E");
  assert.strictEqual(q({ stage: "aside" }), "F");
  assert.strictEqual(q({ stage: "referral" }), "H");
  assert.strictEqual(q({ stage: "highfit" }), "A");
  assert.strictEqual(q({ country: "uk" }), "C");
  assert.strictEqual(q({ state: "texas" }), "A", "full state names work");
  assert.strictEqual(q({ type: "roofing" }), "AC");
  assert.strictEqual(q({ stage: "waiting", minScore: 5 }), "A");
  assert.strictEqual(q({ stage: "waiting", sort: "score" }), "ABH".split("").sort((x, y) => ({ A: 9, B: 4, H: 0 }[y] - { A: 9, B: 4, H: 0 }[x])).join(""));
  assert.strictEqual(q({ sort: "recent" }).slice(0, 2), "DC");
  assert.strictEqual(q({ text: "miami" }), "B", "city is searchable");
  assert.strictEqual(q({ status: "bounced" }), "E", "the old status filter still works");
  const f = eng.leadFacets(track, cfg, now);
  assert.deepStrictEqual([f.stages.waiting, f.stages.sequence, f.stages.stopped, f.total], [3, 2, 1, 8]);
  assert.strictEqual(f.options.types[0].value, "Roofing");
});

test("waiting counts only leads that can actually be emailed, and campaigns warn about blocked countries and default copy", () => {
  reset();
  const cfg = cfgWith([{ id: 1, name: "Bakers", types: "bak", countries: "CA" }, { id: 2, name: "Dentists", types: "dent" }]);
  store.saveTracking([lead({ email: "a@a.com", category: "Bakery", country: "US" }), lead({ email: "b@b.com", category: "Dentist" }), lead({ email: "c@c.com", category: "Plumber" })]);
  eng.saveConfig(cfg); eng.loadState(cfg);
  const st = eng.status(cfg, new Date());
  assert.strictEqual(st.remaining, 1, "only the dentist is in an ON campaign");
  assert.strictEqual(st.waitingBlocked, 2);
  const text = st.insights.map((i) => i.text).join("\n");
  assert.match(text, /"Bakers" targets CA, which Settings does not allow/);
  assert.match(text, /"Dentists" would send your default emails, which are written for roofing/);
  fs.mkdirSync(tpl.campaignDir(2), { recursive: true }); fs.writeFileSync(path.join(tpl.campaignDir(2), "email1.txt"), "Subject: x y z\n\nHi there, a note with enough words to be fine here.\n");
  assert.doesNotMatch(eng.status(cfg, new Date()).insights.map((i) => i.text).join("\n"), /"Dentists" would send your default/);
  assert.strictEqual(eng.status(cfg, new Date()).campaigns.find((c) => c.id === 2).ownEmails, true);
  const pv = eng.campaignPreview({ countries: "CA" }, cfg, 1);
  assert.strictEqual(typeof pv.blocked, "number");
});

test("campaign builder only keeps values that exist in your leads", async () => {
  reset();
  answer({ name: "Texas roofers", countries: ["US", "ZZ"], states: ["TX", "Narnia"], cities: ["Austin"], types: ["Roof", "x"], note: "Roofers in Texas" });
  const r = await ai.buildCampaign("roofing companies in texas", { countries: [{ value: "US" }], states: [{ value: "TX" }], cities: [{ value: "Austin" }, { value: "Dallas" }], types: [{ value: "Roofing" }] });
  assert.deepStrictEqual([r.countries, r.states, r.cities, r.types], [["US"], ["TX"], ["Austin"], ["roof"]]);
  assert.strictEqual(r.name, "Texas roofers");
});

test("email writer: placeholders are checked, the personal line and greeting are enforced, links and unknown fields are refused", async () => {
  reset();
  answer({ emails: [GOOD(1), GOOD(2), GOOD(3), GOOD(4)] });
  const r = await ai.writeSequence({ brief: "roofers", sender: "Hassan", company: "WebersLink" });
  assert.strictEqual(r.emails.length, 4);
  assert.deepStrictEqual(r.errors, []);
  assert.match(r.emails[0].text, /^Subject: quick question 1\n\n\{greeting\}\n\n\{custom_line_para\}/);
  assert.doesNotMatch(r.emails[1].text, /custom_line_para/, "only email 1 carries the personal line");
  assert.match(r.emails[3].text, /\n\n\{sender_first_name\}\n$/);
  // every generated email renders with no leftover fields
  for (const e of r.emails) assert.doesNotMatch(tpl.render(e.step, tpl.SAMPLE_LEAD, cfgWith([]), "a", e.text).text, /[{}]/);
  const bad = [GOOD(1), { subject: "see our site", body: "{greeting}\n\nVisit https://x.com " + "word ".repeat(30) + "\n\n{sender_first_name}" }, { subject: "hello there", body: "{greeting}\n\n{phone} " + "word ".repeat(30) + "\n\n{sender_first_name}" }, { subject: "short", body: "{greeting} hi" }];
  answer({ emails: bad });
  const r2 = await ai.writeSequence({ brief: "x" });
  assert.strictEqual(r2.emails.length, 1);
  assert.strictEqual(r2.errors.length, 3);
  assert.match(r2.errors.join(" "), /link/); assert.match(r2.errors.join(" "), /unknown placeholder \{phone\}/);
  assert.match(ai.checkedEmail("a subject", "Hi, " + "word ".repeat(30), 2).text, /^Subject: a subject\n\n\{greeting\}\n\nword/, "a missing greeting is added");
});

test("email rewrite keeps placeholders, refuses unsafe output, and needs a Subject line", async () => {
  reset();
  const original = "Subject: missed calls at {store}?\n\n{greeting}\n\n{custom_line_para}" + "Words go here and here and here and there and everywhere so it is long enough to count as an email. ".repeat(2) + "\n\n{sender_first_name}";
  answer({ subject: "calls at {store}", body: "{greeting}\n\n{custom_line_para}We answer every call for {store} and book the visit, day or night, so you never lose a job to voicemail again. Want a short video?\n\n{sender_first_name}" });
  const r = await ai.rewriteEmail({ text: original, instruction: "shorter", step: 1 });
  assert.match(r.text, /^Subject: calls at store|^Subject: calls at /);
  answer({ subject: "ok subject", body: "{greeting}\n\nGo to https://evil.example.com now " + "word ".repeat(30) });
  await assert.rejects(ai.rewriteEmail({ text: original }), /safety checks/);
  await assert.rejects(ai.rewriteEmail({ text: "no subject line here" }), /Subject/);
});

test("plain-English lead search maps to real stages and values only", async () => {
  reset();
  answer({ stage: "waiting", country: "US", state: "Texas?", city: "Austin", type: "roofing", minScore: 99, sort: "score", text: "", summary: "Roofers in Austin, best fit first" });
  const facets = { options: { countries: [{ value: "US" }], states: [{ value: "TX" }], cities: [{ value: "Austin" }], types: [{ value: "Roofing" }] } };
  const f = await ai.parseLeadFilter("best roofers in austin that we haven't emailed", facets, eng.STAGE_NAMES);
  assert.deepStrictEqual([f.stage, f.country, f.state, f.city, f.type, f.minScore, f.sort], ["waiting", "US", "", "Austin", "Roofing", 0, "score"]);
  answer({ stage: "delete_all" });
  assert.strictEqual((await ai.parseLeadFilter("x", facets, eng.STAGE_NAMES)).stage, "");
});

test("daily brief is cached for four hours and can be forced", async () => {
  reset();
  let n = 0; ai.setGenerator(async () => JSON.stringify({ headline: `Brief ${++n}`, bullets: ["a", "b"], next_action: "Do x" }));
  const t0 = new Date("2026-11-17T10:00:00Z");
  assert.strictEqual((await ai.brief({ x: 1 }, { now: t0 })).headline, "Brief 1");
  assert.strictEqual((await ai.brief({ x: 1 }, { now: new Date(t0.getTime() + 3 * 36e5) })).headline, "Brief 1", "cached");
  assert.strictEqual((await ai.brief({ x: 1 }, { now: new Date(t0.getTime() + 5 * 36e5) })).headline, "Brief 2", "stale after 4 hours");
  assert.strictEqual((await ai.brief({ x: 1 }, { force: true, now: t0 })).headline, "Brief 3");
  assert.strictEqual(ai.cachedBrief().headline, "Brief 3");
});

test("emails: the new layout has a signature, a real unsubscribe link and the postal address; plain text mirrors it", () => {
  const cfg = cfgWith([]);
  const lead1 = { ...tpl.SAMPLE_LEAD, email: "o@shop.com" };
  const withLink = tpl.render(1, lead1, cfg, "a", null, { unsubscribeUrl: "https://weberslink.org/u/abc.def" });
  assert.match(withLink.html, /unsubscribe here/);
  assert.match(withLink.html, /href="https:\/\/weberslink\.org\/u\/abc\.def"/);
  assert.match(withLink.text, /Unsubscribe: https:\/\/weberslink\.org\/u\/abc\.def/);
  assert.match(withLink.text, /Prefer not to hear from me\?/);
  assert.match(withLink.html, /1 Example St/);
  assert.match(withLink.html, /Hassan Ali/);
  assert.match(withLink.html, /border-left:3px solid #EF1421|border-left:3px solid #ef1421/i);
  const without = tpl.render(1, lead1, cfg, "a");
  assert.doesNotMatch(without.html, /unsubscribe here/);
  assert.doesNotMatch(without.text, /Unsubscribe:/);
  assert.doesNotMatch(withLink.html.replace(/<style[\s\S]*<\/style>/, ""), /\{|\}/);
  assert.ok(withLink.html.length < 7000, "light HTML");
});

test("API: the new AI endpoints refuse without a key, facets and filters are served, and everything is behind login", async () => {
  reset();
  store.saveTracking([lead({ email: "a@a.com", store: "A", category: "Roofing", state: "TX" }), lead({ email: "b@b.com", store: "B", category: "HVAC", state: "FL" })]);
  const server = http.createServer((req, res) => { if (!outreach.handle(req, res)) { res.writeHead(404); res.end(); } });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (m, u, b, c) => fetch(base + u, { method: m, headers: { "Content-Type": "application/json", ...(c ? { Cookie: c } : {}) }, body: b === undefined ? undefined : JSON.stringify(b) }).then(async (r) => ({ status: r.status, json: await r.json() }));
  try {
    for (const [m, u] of [["POST", "/ai/campaign"], ["POST", "/ai/templates"], ["POST", "/ai/rewrite"], ["POST", "/ai/filter"], ["GET", "/ai/brief"], ["POST", "/ai/brief"], ["GET", "/leads/facets"]]) {
      assert.strictEqual((await call(m, "/api/outreach" + u, m === "GET" ? undefined : {})).status, 401, u);
    }
    const login = await fetch(base + "/api/outreach/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: process.env.ADMIN_PASSWORD }) });
    const c = login.headers.get("set-cookie").split(";")[0];
    for (const [u, b] of [["/ai/campaign", { description: "roofers" }], ["/ai/templates", { brief: "x" }], ["/ai/rewrite", { text: "Subject: a\n\nb" }], ["/ai/filter", { query: "x" }], ["/ai/brief", {}]]) {
      const r = await call("POST", "/api/outreach" + u, b, c);
      assert.strictEqual(r.status, 400, u); assert.match(r.json.error, /not configured/i, u);
    }
    assert.strictEqual((await call("GET", "/api/outreach/ai/brief", undefined, c)).json.configured, false);
    const f = await call("GET", "/api/outreach/leads/facets", undefined, c);
    assert.strictEqual(f.json.stages.waiting, 2); assert.strictEqual(f.json.options.states.length, 2);
    assert.deepStrictEqual((await call("GET", "/api/outreach/leads?stage=waiting&state=TX", undefined, c)).json.rows.map((r) => r.email), ["a@a.com"]);
    // with a (fake) model the whole chain works
    answer({ name: "Texas roofers", countries: [], states: ["TX"], cities: [], types: ["roof"], note: "n" });
    const camp = await call("POST", "/api/outreach/ai/campaign", { description: "roofers in texas" }, c);
    assert.strictEqual(camp.status, 200); assert.deepStrictEqual(camp.json.campaign.states, ["TX"]); assert.strictEqual(camp.json.preview.total, 1);
    answer({ emails: [GOOD(1), GOOD(2), GOOD(3), GOOD(4)] });
    const seq = await call("POST", "/api/outreach/ai/templates", { brief: "roofers" }, c);
    assert.strictEqual(seq.json.emails.length, 4); assert.ok(seq.json.emails[0].check.score >= 1); assert.match(seq.json.emails[0].preview, /Hi there/);
    answer({ stage: "waiting", country: "", state: "TX", city: "", type: "", minScore: 0, sort: "", text: "", summary: "Texas" });
    assert.strictEqual((await call("POST", "/api/outreach/ai/filter", { query: "texas" }, c)).json.filter.state, "TX");
  } finally { server.close(); }
});
