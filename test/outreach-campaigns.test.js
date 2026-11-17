const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "outreach-camp-"));
process.env.OUTREACH_DATA_DIR = DIR;
process.env.ADMIN_PASSWORD = "correct-horse-battery";
delete process.env.GEMINI_OUTREACH_KEY; delete process.env.GEMINI_API_KEY;
const store = require("../outreach/store");
const eng = require("../outreach/engine");
const tpl = require("../outreach/templates");
const backup = require("../outreach/backup");
const outreach = require("../outreach/index");

test.after(() => fs.rmSync(DIR, { recursive: true, force: true }));
const reset = () => { for (const f of fs.readdirSync(DIR)) fs.rmSync(path.join(DIR, f), { recursive: true, force: true }); };
const lead = (o) => Object.assign(Object.fromEntries(store.TRACK_FIELDS.map((f) => [f, ""])), o);
const BASE = {
  signature: { name: "Hassan Ali", title: "Founder", company: "WebersLink", website: "weberslink.org", postal_address: "1 Example St" },
  sending: { dry_run: false, send_days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], min_delay_seconds: 0, max_delay_seconds: 0, countries: ["US", "UK"], timezone: "UTC", ramp: "50", daily_limit: 50 },
  mailboxes: [{ id: 1, email: "a@x.com", from_name: "Hassan Ali" }, { id: 2, email: "b@x.com", from_name: "Hassan Ali" }],
};
const cfgWith = (campaigns) => eng.sanitizeConfig({ ...BASE, campaigns });
const fakeBox = (id, email) => ({ id, addr: email, sent: [], async send(m) { this.sent.push(m); return { messageId: `<${id}-${this.sent.length}@x>` }; }, async scanInbox() { return []; }, close() {}, hasPassword: () => true });
const run = (cfg, boxes) => eng.runOnce({ config: cfg }, { mailboxes: boxes, sleep: async () => {}, mx: async () => "yes" });
const L = (email, o) => lead({ email, store: email.split("@")[0], domain: email.split("@")[1], status: "new", country: "US", ...o });

test("import reads state and city from columns or from a US street address", () => {
  reset();
  const cfg = cfgWith([]);
  eng.importLeads([
    { Email: "a@roof1.com", Store: "Roof One", Website: "roof1.com", Country: "United States", State: "texas", City: "Austin", Category: "Roofing" },
    { Email: "b@roof2.com", Store: "Roof Two", Website: "roof2.com", Address: "12 Main St, Dallas, TX 75201", Category: "Roofing" },
    { Email: "c@roof3.com", Store: "Roof Three", Website: "roof3.com", Country: "UK", City: "Leeds" },
  ], cfg);
  const by = Object.fromEntries(store.loadTracking().map((t) => [t.email, t]));
  assert.deepStrictEqual([by["a@roof1.com"].state, by["a@roof1.com"].city], ["TX", "Austin"], "full state names become codes");
  assert.deepStrictEqual([by["b@roof2.com"].state, by["b@roof2.com"].city, by["b@roof2.com"].country], ["TX", "Dallas", "US"]);
  assert.strictEqual(by["c@roof3.com"].city, "Leeds");
});

test("campaign settings are validated and ids stay permanent", () => {
  const c = cfgWith([{ name: "  ", countries: "us, uk", states: "Texas, florida", cities: ["Austin", " austin "], types: "roof, hvac", mailboxes: [2, 2, "x", 500], daily_limit: 99999 }, { id: 7, name: "Plumbers", enabled: false }]).campaigns;
  assert.strictEqual(c[0].name, "Campaign 1");
  assert.deepStrictEqual([c[0].countries, c[0].states, c[0].types], [["US", "UK"], ["TX", "FL"], ["roof", "hvac"]]);
  assert.deepStrictEqual(c[0].cities, ["Austin", "austin"]);
  assert.deepStrictEqual(c[0].mailboxes, [2]);
  assert.strictEqual(c[0].daily_limit, 1000);
  assert.deepStrictEqual([c[1].id, c[1].enabled], [7, false]);
  assert.strictEqual(cfgWith(new Array(30).fill({})).campaigns.length, 20);
});

test("a lead goes to the first campaign it fits; waiting leads follow edits, leads in a sequence keep theirs", () => {
  reset();
  const cfg = cfgWith([{ id: 1, name: "Texas roofers", states: "TX", types: "roof" }, { id: 2, name: "All roofers", types: "roof" }, { id: 3, name: "UK", countries: "UK" }]);
  const track = [
    L("a@a.com", { state: "TX", category: "Roofing contractor" }), L("b@b.com", { state: "FL", category: "Roofing" }),
    L("c@c.com", { country: "UK", category: "Plumber" }), L("d@d.com", { category: "Dentist" }),
    L("e@e.com", { status: "active", step: "1", category: "Dentist", campaign: "3" }),
  ];
  assert.strictEqual(eng.assignCampaigns(track, cfg), true);
  assert.deepStrictEqual(track.map((t) => t.campaign), ["1", "2", "3", "", "3"]);
  const edited = cfgWith([{ id: 2, name: "All roofers", types: "roof" }]);
  eng.assignCampaigns(track, edited);
  assert.deepStrictEqual(track.map((t) => t.campaign), ["2", "2", "", "", "3"], "waiting leads re-sort; the active lead keeps its id but its campaign is gone");
  assert.strictEqual(eng.queueOrder(track, edited).length, 2);
  assert.deepStrictEqual(eng.dueFollowups([{ ...track[4], last_sent: "2000-01-01T00:00:00Z" }], edited), [], "a lead whose campaign was removed is paused, not mailed");
  assert.strictEqual(eng.assignCampaigns(track, edited), false, "stable once sorted");
});

test("with no campaigns everything is emailed as before; with campaigns only leads in an ON campaign are", async () => {
  reset();
  store.saveTracking([L("a@a.com", { state: "TX", category: "Roofing" }), L("d@d.com", { category: "Dentist" })]);
  const none = fakeBox(1, "a@x.com");
  await run(cfgWith([]), [none]);
  assert.strictEqual(none.sent.length, 2);
  reset(); store.saveTracking([L("a@a.com", { state: "TX", category: "Roofing" }), L("d@d.com", { category: "Dentist" })]);
  const only = fakeBox(1, "a@x.com");
  const cfg = cfgWith([{ id: 1, name: "Roofers", types: "roof" }]);
  const s = await run(cfg, [only]);
  assert.deepStrictEqual(only.sent.map((m) => m.to), ["a@a.com"], "the dentist matches no campaign");
  assert.strictEqual(s.sent, 1);
  reset(); store.saveTracking([L("a@a.com", { state: "TX", category: "Roofing" })]);
  const off = fakeBox(1, "a@x.com");
  await run(cfgWith([{ id: 1, name: "Roofers", types: "roof", enabled: false }]), [off]);
  assert.strictEqual(off.sent.length, 0, "a paused campaign sends nothing");
});

test("a campaign can use only some mailboxes and has its own daily cap; follow-ups stay with the original mailbox", async () => {
  reset();
  store.saveTracking(Array.from({ length: 6 }, (_, i) => L(`t${i}@tx${i}.com`, { state: "TX", category: "Roofing" })).concat(Array.from({ length: 4 }, (_, i) => L(`u${i}@uk${i}.com`, { country: "UK", category: "Plumber" }))));
  const a = fakeBox(1, "a@x.com"), b = fakeBox(2, "b@x.com");
  const cfg = cfgWith([{ id: 1, name: "TX roofers", states: "TX", mailboxes: [1], daily_limit: 3 }, { id: 2, name: "UK", countries: "UK", mailboxes: [2] }]);
  await run(cfg, [a, b]);
  assert.strictEqual(a.sent.length, 3, "capped at 3 a day for the campaign");
  assert.ok(a.sent.every((m) => /^t\d@/.test(m.to)));
  assert.strictEqual(b.sent.length, 4);
  assert.ok(b.sent.every((m) => /^u\d@/.test(m.to)), "mailbox 2 only mails the UK campaign");
  const again = fakeBox(1, "a@x.com");
  await run(cfg, [again, fakeBox(2, "b@x.com")]);
  assert.strictEqual(again.sent.length, 0, "the daily cap holds across runs");
});

test("campaigns take turns in the queue so a big one doesn't starve the others", () => {
  const cfg = cfgWith([{ id: 1, name: "A", types: "aaa" }, { id: 2, name: "B", types: "bbb" }]);
  const track = [...[1, 2, 3, 4].map((i) => L(`a${i}@a.com`, { category: "aaa" })), ...[1, 2].map((i) => L(`b${i}@b.com`, { category: "bbb" }))];
  eng.assignCampaigns(track, cfg);
  assert.deepStrictEqual(eng.queueOrder(track, cfg).map((t) => t.email), ["a1@a.com", "b1@b.com", "a2@a.com", "b2@b.com", "a3@a.com", "a4@a.com"]);
});

test("each campaign can have its own email copy, falling back to your emails and the bundled ones", () => {
  reset();
  const cfg = cfgWith([{ id: 1, name: "Roofers" }]);
  const raw = "Subject: Roof leads for {store}\n\nHi, we help roofers answer every call. A short video shows how it works for your business.\n\nHassan";
  fs.mkdirSync(tpl.campaignDir(1), { recursive: true });
  fs.writeFileSync(path.join(tpl.campaignDir(1), "email1.txt"), raw);
  const roofer = { ...tpl.SAMPLE_LEAD, email: "r@r.com", campaign: "1" }, other = { ...tpl.SAMPLE_LEAD, email: "r@r.com", campaign: "" };
  assert.match(tpl.render(1, roofer, cfg, "a").subject, /Roof leads for/);
  assert.doesNotMatch(tpl.render(1, other, cfg, "a").subject, /Roof leads/);
  assert.ok(tpl.render(2, roofer, cfg, "a").text.length > 50, "email 2 falls back to the default copy");
  assert.strictEqual(tpl.campaignDir("../x"), null);
  assert.strictEqual(tpl.campaignDir("1; rm"), null);
  const b = backup.create({ markDone: false });
  assert.ok(b.files["templates/campaign-1/email1.txt"], "campaign copy is in backups");
});

test("campaign stats and dashboard insights", async () => {
  reset();
  const cfg = cfgWith([{ id: 1, name: "Roofers", types: "roof" }, { id: 2, name: "Empty", types: "zzz" }, { id: 3, name: "Dentists", types: "dent", enabled: false }]);
  const track = [
    ...Array.from({ length: 30 }, (_, i) => L(`r${i}@r${i}.com`, { category: "Roofing", status: i < 3 ? "replied" : "active", step: "1", reply_label: i < 2 ? "interested" : "" })),
    ...Array.from({ length: 30 }, (_, i) => L(`p${i}@p${i}.com`, { category: "Plumber", status: "active", step: "1" })),
    L("d1@d.com", { category: "Dentist" }), L("n@n.com", { category: "Bakery" }),
  ];
  eng.assignCampaigns(track, cfg); store.saveTracking(track);
  const st = eng.status(cfg, new Date());
  const roof = st.campaigns.find((c) => c.name === "Roofers");
  assert.deepStrictEqual([roof.total, roof.started, roof.replied, roof.positive, roof.replyRate], [30, 30, 3, 2, 10]);
  assert.strictEqual(st.unassigned, 1, "the bakery");
  const text = st.insights.map((i) => i.text).join("\n");
  assert.match(text, /1 waiting lead matches no campaign/);
  assert.match(text, /"Empty" has no leads waiting/);
  assert.match(text, /"Dentists" is paused with 1 lead waiting/);
  assert.match(text, /part-way through a sequence but not in any campaign/, "plumbers are active but no campaign fits");
  const pinned = eng.status(cfgWith([{ id: 1, name: "Pinned", types: "roof", mailboxes: [9] }]), new Date()).insights.map((i) => i.text).join("\n");
  assert.match(pinned, /"Pinned" has no mailbox that can send/);
  const rank = st.insights.map((i) => ["bad", "warn", "info"].indexOf(i.level));
  assert.deepStrictEqual(rank, [...rank].sort(), "worst first");
  const opts = eng.campaignOptions();
  assert.strictEqual(opts.types[0].value, "Roofing");
  const pv = eng.campaignPreview({ types: "roof" }, cfg, 1);
  assert.strictEqual(pv.total, 30);
  assert.strictEqual(eng.campaignPreview({ types: "roof" }, cfg, 2).claimed, 0, "no waiting roofers");
});

test("API: campaigns are saved separately from Settings, survive a Settings save, and waiting leads are sorted at once", async () => {
  reset();
  store.saveTracking([L("a@a.com", { state: "TX", category: "Roofing" }), L("b@b.com", { category: "Dentist" })]);
  const server = http.createServer((req, res) => { if (!outreach.handle(req, res)) { res.writeHead(404); res.end(); } });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (m, u, b, c) => fetch(base + u, { method: m, headers: { "Content-Type": "application/json", ...(c ? { Cookie: c } : {}) }, body: b === undefined ? undefined : JSON.stringify(b) }).then(async (r) => ({ status: r.status, json: await r.json() }));
  try {
    assert.strictEqual((await call("GET", "/api/outreach/campaigns")).status, 401);
    const login = await fetch(base + "/api/outreach/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: process.env.ADMIN_PASSWORD }) });
    const c = login.headers.get("set-cookie").split(";")[0];
    const saved = await call("PUT", "/api/outreach/campaigns", { campaigns: [{ name: "Texas roofers", states: "texas", types: "roof" }] }, c);
    assert.strictEqual(saved.json.campaigns[0].states[0], "TX");
    assert.strictEqual(store.loadTracking().find((t) => t.email === "a@a.com").campaign, "1");
    assert.strictEqual(store.loadTracking().find((t) => t.email === "b@b.com").campaign, "");
    const cfg = (await call("GET", "/api/outreach/config", undefined, c)).json.config;
    assert.strictEqual((await call("PUT", "/api/outreach/config", { signature: cfg.signature, sending: cfg.sending, mailboxes: cfg.mailboxes }, c)).status, 200);
    assert.strictEqual((await call("GET", "/api/outreach/campaigns", undefined, c)).json.campaigns.length, 1, "saving Settings keeps campaigns");
    const pv = await call("POST", "/api/outreach/campaigns/preview", { filters: { types: "dent" } }, c);
    assert.strictEqual(pv.json.total, 1);
    const leads = await call("GET", "/api/outreach/leads?campaign=1", undefined, c);
    assert.deepStrictEqual(leads.json.rows.map((r) => r.email), ["a@a.com"]);
    assert.deepStrictEqual((await call("GET", "/api/outreach/leads?campaign=none", undefined, c)).json.rows.map((r) => r.email), ["b@b.com"]);
    await call("PUT", "/api/outreach/templates", { name: "email1.txt", campaign: 1, text: "Subject: For roofers\n\nHi {first_name}, a short video about answering every call for {store}. Would that be useful?\n\nHassan" }, c);
    const mine = await call("GET", "/api/outreach/templates?campaign=1", undefined, c), global = await call("GET", "/api/outreach/templates", undefined, c);
    assert.match(mine.json.templates.find((t) => t.name === "email1.txt").text, /For roofers/);
    assert.strictEqual(mine.json.templates.find((t) => t.name === "email1.txt").edited, true);
    assert.doesNotMatch(global.json.templates.find((t) => t.name === "email1.txt").text, /For roofers/);
    assert.strictEqual((await call("DELETE", "/api/outreach/templates?name=email1.txt&campaign=1", {}, c)).status, 200);
    assert.strictEqual((await call("DELETE", "/api/outreach/templates?name=email1.txt&campaign=1", {}, c)).status, 404);
  } finally { server.close(); }
});

test("overview: sends and replies per day, 7-day totals, and the setup checklist", async () => {
  reset();
  const cfg = cfgWith([]);
  const now = new Date();
  const at = (daysAgo) => new Date(now.getTime() - daysAgo * 864e5).toISOString();
  fs.writeFileSync(store.P("sent_log.csv"), "date,mode,mailbox,email,store,step,variant,subject\n" +
    [[0, "live"], [0, "live"], [1, "live"], [3, "live"], [10, "live"], [0, "dry"], [2, "reply"]].map(([d, m]) => `${at(d)},${m},a@x.com,x@y.com,S,1,a,Hi`).join("\n") + "\n");
  store.saveTracking([
    L("r1@a.com", { status: "replied", step: "1", replied_at: at(1), reply_label: "interested" }),
    L("r2@b.com", { status: "replied", step: "1", replied_at: at(2) }),
    L("r3@c.com", { status: "replied", step: "1", replied_at: at(12) }),
    L("w@d.com", { status: "new" }),
  ]);
  const o = eng.status(cfg, now).overview;
  assert.strictEqual(o.series.length, 14);
  assert.strictEqual(o.sentToday, 2, "dry-run and reply rows are not cold sends");
  assert.strictEqual(o.sent7, 4, "the send 10 days ago is outside the window");
  assert.deepStrictEqual([o.replies7, o.positive7, o.repliesWaiting], [2, 1, 3]);
  assert.strictEqual(o.series[13].sent, 2);
  assert.ok(o.series.reduce((a, d) => a + d.replies, 0) === 3);

  const su = eng.status(cfgWith([]), now).setup;
  const by = Object.fromEntries(su.steps.map((s) => [s.id, s]));
  assert.strictEqual(by.details.done, true);
  assert.strictEqual(by.leads.done, true);
  assert.strictEqual(by.campaign.optional, true);
  assert.strictEqual(by.mailboxes.done, false, "no password set in the test environment");
  assert.strictEqual(by.live.done, !cfg.sending.dry_run);
  assert.strictEqual(su.complete, false);
  eng.markSetup("test_sent"); eng.markSetup("dns_ok");
  const after = Object.fromEntries(eng.status(cfg, now).setup.steps.map((s) => [s.id, s]));
  assert.deepStrictEqual([after.test.done, after.dns.done], [true, true]);
  assert.ok(Array.isArray(eng.status(cfg, now).liveProblems));
});

test("insights tell you where to go to fix each problem", () => {
  reset();
  const cfg = cfgWith([{ id: 1, name: "Roofers", types: "roof" }]);
  store.saveTracking([L("n@n.com", { category: "Bakery" })]);
  const ins = eng.status(cfg, new Date()).insights;
  assert.strictEqual(ins.find((i) => /matches? no campaign/.test(i.text)).go, "campaigns");
});
