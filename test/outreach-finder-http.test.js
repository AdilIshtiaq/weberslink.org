// Real HTTP against a local fixture server (the finder's guard is relaxed for this file only via its test hook).
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "outreach-finder-http-"));
process.env.OUTREACH_DATA_DIR = DIR;
const finder = require("../outreach/finder");

const page = (b) => `<!doctype html><html><body>${b}</body></html>`;
const ROUTES = {
  "/ok/": page('<a href="/ok/contact-us/">Contact</a>'), "/ok/contact-us/": page('<p>Email <a href="mailto:hello@okshop.com">us</a></p>'),
  "/jsonld/": page('<script type="application/ld+json">{"@type":"Roofer","email":"office@jsonld.com"}</script>'),
  "/entity/": page('<a href="&#109;&#97;ilto:&#111;wner&#64;entity.com">mail</a>'), "/wp/": page("<footer>write to <span>sales&#64;wpsite.com</span> <img src='a@2x.png'></footer>"),
  "/plus/": page("<p>Info: Owner+Leads@Plus.Shopsite.com.</p>"), "/big/": "x".repeat(900 * 1024) + "late@bigsite.com", "/bigearly/": "early@bigsite.com " + "x".repeat(900 * 1024),
  "/empty/": page("<p>nothing</p>"), "/binary/": Buffer.from([0, 255, 254, 1, 2, 3]).toString("latin1"),
  "/robots/": page("<p>blocked@robots.com</p>"),
};
let base = "", srv;
test.before(async () => {
  srv = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    if (u.pathname === "/robots/robots.txt" || u.pathname === "/robots.txt") { if (req.headers.host && u.pathname === "/robots.txt" && !process.env.ROBOTS) { res.writeHead(404); return res.end(); } res.writeHead(200); return res.end("User-agent: *\nDisallow: /robots/\n"); }
    if (u.pathname === "/redir1") { res.writeHead(302, { Location: "/redir2" }); return res.end(); }
    if (u.pathname === "/redir2") { res.writeHead(301, { Location: "/ok/" }); return res.end(); }
    if (u.pathname === "/loop") { res.writeHead(302, { Location: "/loop" }); return res.end(); }
    if (u.pathname === "/slow") return setTimeout(() => res.end("late"), 4000);
    if (u.pathname === "/hang") { res.write("<p>partial"); return; }
    if (u.pathname === "/trickle") { res.writeHead(200); const t = setInterval(() => res.write("."), 100); res.on("close", () => clearInterval(t)); return; }
    if (u.pathname === "/boom") { res.writeHead(500); return res.end("err"); }
    const body = ROUTES[u.pathname]; if (body == null) { res.writeHead(404); return res.end("no"); }
    res.writeHead(200, { "Content-Type": "text/html" }); res.end(body);
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${srv.address().port}`;
});
test.after(() => { srv.close(); fs.rmSync(DIR, { recursive: true, force: true }); });

test("by default nothing local can be reached, even a server that is really there", async () => {
  await assert.rejects(finder.fetchText(base + "/ok/"), /not allowed/);
});

test("HTTP behaviour: redirects followed, loops stopped, slow and hanging and trickling servers cut off, big pages truncated, errors passed through", async () => {
  finder._test.allowPrivate = true;
  assert.strictEqual((await finder.fetchText(base + "/redir1")).status, 200, "two redirects");
  await assert.rejects(finder.fetchText(base + "/loop"), /too many redirects/);
  for (const p of ["/slow", "/hang"]) {
    const t0 = Date.now();
    await assert.rejects(finder.fetchText(base + p, { timeoutMs: 600 }), /timeout|closed/, p);
    assert.ok(Date.now() - t0 < 2500, p + " was cut off quickly");
  }
  const t1 = Date.now();
  await finder.fetchText(base + "/trickle", { timeoutMs: 5000, deadlineMs: 700 }).catch(() => {});
  assert.ok(Date.now() - t1 < 2500, "a trickling server hits the overall deadline");
  const big = await finder.fetchText(base + "/big/", { maxBytes: 400 * 1024 });
  assert.ok(big.status === 200 && big.body.length < 500 * 1024, "a huge page is cut off, not failed");
  assert.strictEqual((await finder.fetchText(base + "/boom")).status, 500);
});

test("real websites: contact link, structured data, entity-hidden mailto and text, plus-addresses, huge pages, junk pages", async () => {
  finder._test.allowPrivate = true;
  const find = (p) => finder.findEmailOnSite(base + p);
  assert.strictEqual((await find("/ok/")).email, "hello@okshop.com");
  assert.strictEqual((await find("/jsonld/")).email, "office@jsonld.com");
  assert.strictEqual((await find("/entity/")).email, "owner@entity.com");
  assert.strictEqual((await find("/wp/")).email, "sales@wpsite.com");
  assert.strictEqual((await find("/plus/")).email, "owner+leads@plus.shopsite.com");
  assert.strictEqual((await find("/bigearly/")).email, "early@bigsite.com", "found at the top of a huge page");
  assert.match((await find("/big/")).reason, /no public email/, "an address beyond the size cap is not read");
  for (const p of ["/empty/", "/binary/", "/boom"]) assert.match((await find(p)).reason, /no public email/, p);
  assert.match((await finder.findEmailOnSite("http://127.0.0.1:1/")).reason, /did not answer/);
});

test("a complete search that reads real (local) websites over HTTP, honours robots.txt, and ends with a clean review list", async () => {
  finder._test.allowPrivate = true; process.env.ROBOTS = "1";
  finder.setSleep(async () => {});
  finder.setTransport({
    nominatim: async () => [{ display_name: "Testville", boundingbox: ["1", "1.2", "2", "2.2"], address: { country_code: "gb" } }],
    overpass: async () => ({ elements: [
      { id: 1, tags: { name: "Shop OK", website: base + "/ok/" } }, { id: 2, tags: { name: "Shop JSON", website: base + "/jsonld/" } },
      { id: 3, tags: { name: "Shop Robots", website: base + "/robots/" } }, { id: 4, tags: { name: "Shop Empty", website: base + "/empty/" } },
      { id: 5, tags: { name: "Shop Map", email: "map@mapshop.com" } }, { id: 6, tags: { name: "Shop Down", website: "http://127.0.0.1:1/" } } ] }),
    page: (u) => finder.fetchText(u),
  });
  const r = finder.startSearch({ type: "dentist", place: "Testville", limit: 25 }, { mx: async () => "yes" });
  assert.ok(r.started); await r.done;
  const by = Object.fromEntries(finder.results().items.map((c) => [c.name, c]));
  assert.deepStrictEqual([by["Shop OK"].email, by["Shop JSON"].email, by["Shop Map"].email], ["hello@okshop.com", "office@jsonld.com", "map@mapshop.com"]);
  assert.match(by["Shop Robots"].reason, /robots/);
  assert.match(by["Shop Empty"].reason, /no public email/);
  assert.match(by["Shop Down"].reason, /did not answer/);
  assert.strictEqual(by["Shop OK"].country, "UK");
  assert.strictEqual(finder.status().results.usable, 3);
  finder.setTransport(null); delete process.env.ROBOTS;
});

function server(handler) { return new Promise((resolve) => { const s = http.createServer(handler); s.listen(0, "127.0.0.1", () => resolve(s)); }); }
const urlOf = (s, p = "/") => `http://127.0.0.1:${s.address().port}${p}`;

test("map search service errors are explained: rate limit, refusal, HTML instead of data, and a good answer", async () => {
  finder._test.allowPrivate = true; finder.setTransport(null); finder.setSleep(async () => {});
  const answers = { "/ok": [200, JSON.stringify([{ display_name: "Leeds", boundingbox: ["53.7", "53.9", "-1.7", "-1.4"], address: { country_code: "gb" } }])], "/429": [429, "slow down"], "/403": [403, "blocked"], "/html": [200, "<html>Welcome</html>"] };
  const s = await server((req, res) => { const a = answers[new URL(req.url, "http://x").pathname] || [404, ""]; res.writeHead(a[0]); res.end(a[1]); });
  try {
    process.env.FINDER_NOMINATIM_URL = urlOf(s, "/ok");
    assert.strictEqual((await finder.geocode("Leeds")).country, "UK");
    process.env.FINDER_NOMINATIM_URL = urlOf(s, "/429"); await assert.rejects(finder.geocode("Leeds"), /rate-limiting/);
    process.env.FINDER_NOMINATIM_URL = urlOf(s, "/403"); await assert.rejects(finder.geocode("Leeds"), /refused this server/);
    process.env.FINDER_NOMINATIM_URL = urlOf(s, "/html"); await assert.rejects(finder.geocode("Leeds"), /did not answer with map data/);
    process.env.FINDER_NOMINATIM_URL = "http://127.0.0.1:1/search"; await assert.rejects(finder.geocode("Leeds"), /Could not look up the place.*could not connect/);
  } finally { delete process.env.FINDER_NOMINATIM_URL; s.close(); }
});

test("if the first Overpass server is busy or broken, the next one is used, in order", async () => {
  finder._test.allowPrivate = true; finder.setTransport(null);
  const hits = [];
  const busy = await server((req, res) => { hits.push("busy"); req.resume(); res.writeHead(429); res.end("busy"); });
  const junk = await server((req, res) => { hits.push("junk"); req.resume(); res.writeHead(200); res.end("<html>overloaded</html>"); });
  const slowMsg = await server((req, res) => { hits.push("timeout-remark"); req.resume(); res.writeHead(200); res.end(JSON.stringify({ remark: "runtime error: Query timed out", elements: [] })); });
  const good = await server((req, res) => { hits.push("good"); req.resume(); res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ elements: [{ id: 1, tags: { name: "Test Dental" } }] })); });
  try {
    process.env.FINDER_OVERPASS_URL = [busy, junk, slowMsg, good].map((x) => urlOf(x)).join(",");
    const data = await finder.overpass("[out:json];out;");
    assert.deepStrictEqual(hits, ["busy", "junk", "timeout-remark", "good"]);
    assert.strictEqual(data.elements[0].tags.name, "Test Dental");
    hits.length = 0;
    const bad = await server((req, res) => { hits.push("syntax"); req.resume(); res.writeHead(400); res.end("parse error"); });
    process.env.FINDER_OVERPASS_URL = [bad, good].map((x) => urlOf(x)).join(",");
    await assert.rejects(finder.overpass("broken"), /rejected the search/);
    assert.deepStrictEqual(hits, ["syntax"], "a rejected query is not retried elsewhere");
    bad.close();
  } finally { delete process.env.FINDER_OVERPASS_URL; for (const x of [busy, junk, slowMsg, good]) x.close(); }
});

test("network failures are put in words a person can act on", () => {
  const e = (code, message) => Object.assign(new Error(message || code), { code });
  assert.match(finder.explain(e("ENOTFOUND"), "overpass-api.de"), /look up overpass-api\.de.*outgoing connections/);
  assert.match(finder.explain(e("ETIMEDOUT"), "x.org"), /could not connect to x\.org.*may block outgoing/);
  assert.match(finder.explain(new Error("timeout"), "x.org"), /could not connect/);
  assert.match(finder.explain(e("EBLOCKED", "address not allowed"), "x.org"), /private address/);
  assert.match(finder.explain(new Error("weird"), "x.org"), /x\.org: weird/);
});

test("the connection test checks each step and names the one that fails", async () => {
  finder.setTransport({ nominatim: async () => [{ display_name: "Leeds", boundingbox: ["53.7", "53.9", "-1.7", "-1.4"], address: { country_code: "gb" } }], overpass: async () => ({ elements: [{ id: 1 }, { id: 2 }] }), page: async () => ({ status: 200, body: "ok" }) });
  let steps = await finder.diagnose();
  assert.deepStrictEqual(steps.map((s) => s.ok), [true, true, true, true]);
  assert.match(steps[2].detail, /2 businesses/);
  finder.setTransport({ nominatim: async () => { throw new Error("Could not look up the place: could not connect to nominatim.openstreetmap.org (ETIMEDOUT)."); }, overpass: async () => ({ elements: [] }), page: async () => ({ status: 503, body: "" }) });
  steps = await finder.diagnose();
  assert.deepStrictEqual(steps.map((s) => s.ok), [true, false, true, false]);
  assert.match(steps[1].detail, /ETIMEDOUT/); assert.match(steps[3].detail, /HTTP 503/);
  finder.setTransport(null);
});
