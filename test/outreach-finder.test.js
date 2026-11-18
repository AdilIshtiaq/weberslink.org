const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "outreach-finder-"));
process.env.OUTREACH_DATA_DIR = DIR;
process.env.ADMIN_PASSWORD = "correct-horse-battery";
delete process.env.GEMINI_OUTREACH_KEY; delete process.env.GEMINI_API_KEY;
const store = require("../outreach/store");
const eng = require("../outreach/engine");
const finder = require("../outreach/finder");
const outreach = require("../outreach/index");

test.after(() => { finder.setTransport(null); fs.rmSync(DIR, { recursive: true, force: true }); });
finder.setSleep(async () => {});
const reset = () => { for (const f of fs.readdirSync(DIR)) fs.rmSync(path.join(DIR, f), { recursive: true, force: true }); };
const lead = (o) => Object.assign(Object.fromEntries(store.TRACK_FIELDS.map((f) => [f, ""])), { status: "new", country: "US", ...o });

const AUSTIN = [{ display_name: "Austin, Travis County, Texas, United States", boundingbox: ["30.0", "30.5", "-97.9", "-97.5"], address: { country_code: "us", "ISO3166-2-lvl4": "US-TX" } }];
function fakeWorld(extra = {}) {
  const pages = { "https://alpharoof.com/robots.txt": "User-agent: *\nDisallow: /private\n", "https://alpharoof.com/": '<a href="/contact-us">Contact</a><p>Welcome</p>', "https://alpharoof.com/contact-us": '<p>Write to <a href="mailto:Info@AlphaRoof.com?subject=Hi">us</a></p>',
    "https://robots.com/robots.txt": "User-agent: *\nDisallow: /\n", "https://robots.com/": "<p>info@robots.com</p>", ...extra.pages };
  const seen = { queries: [], pages: [] };
  finder.setTransport({
    nominatim: async () => extra.area || AUSTIN,
    overpass: async (q) => { seen.queries.push(q); return { elements: extra.elements || [
      { id: 1, tags: { name: "Alpha Roofing", website: "https://alpharoof.com", "addr:housenumber": "1", "addr:street": "Main St", "addr:city": "Austin" } },
      { id: 2, tags: { name: "Beta Roofing", email: "owner@betaroof.com", website: "betaroof.com" } },
      { id: 3, tags: { name: "No Site Roofing" } },
      { id: 4, tags: { name: "Dup Roofing", email: "dup@duproof.com" } },
      { id: 5, tags: { name: "Dead Domain Roofing", email: "x@dead.example" } },
      { id: 6, tags: { name: "Robots Roofing", website: "robots.com" } },
      { id: 7, tags: { name: "Free Roofing", email: "freeroof@gmail.com" } },
      { id: 8, tags: { name: "Junk Roofing", email: "noreply@junk.com" } },
    ] }; },
    page: async (url) => { seen.pages.push(url); return pages[url] ? { status: 200, body: pages[url] } : { status: 404, body: "" }; },
  });
  return seen;
}
const deps = (o = {}) => ({ mx: async (d) => (d === "dead.example" ? "no" : "yes"), leadEmails: new Set(["dup@duproof.com"]), leadDomains: new Set(), suppressed: () => false, ...o });

test("private, loopback and link-local addresses are recognised", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.0.9", "172.16.5.5", "172.31.255.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1", "not-an-ip"]) assert.strictEqual(finder.isPrivateIp(ip), true, ip);
  for (const ip of ["8.8.8.8", "93.184.216.34", "172.32.0.1", "2606:4700::1111"]) assert.strictEqual(finder.isPrivateIp(ip), false, ip);
});

test("the crawler refuses private targets, odd ports, credentials and non-web schemes", async () => {
  finder.setTransport(null);
  for (const url of ["http://127.0.0.1/", "http://localhost/", "http://[::1]/", "http://169.254.169.254/latest/meta-data", "http://10.0.0.5/admin", "ftp://example.com/", "file:///etc/passwd", "http://example.com:8080/", "http://user:pw@example.com/"]) {
    await assert.rejects(finder.fetchText(url, { timeoutMs: 2000 }), /not allowed|bad address/, url);
  }
  // a real local server proves nothing is fetched from it
  let hit = false; const srv = http.createServer((q, r) => { hit = true; r.end("secret"); }); await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  try { await assert.rejects(finder.fetchText(`http://127.0.0.1:${srv.address().port}/`, { timeoutMs: 2000 }), /not allowed/); } finally { srv.close(); }
  assert.strictEqual(hit, false);
});

test("emails are found in mailto links, Cloudflare-protected text, obfuscated text; junk is dropped; the business's own domain ranks first", () => {
  const enc = (e, k = 0x2a) => k.toString(16).padStart(2, "0") + [...e].map((c) => (c.charCodeAt(0) ^ k).toString(16).padStart(2, "0")).join("");
  const html = `<a href="mailto:Sales@Shop.com?subject=x">x</a><span data-cfemail="${enc("owner@shop.com")}">[protected]</span>
    <p>or info [at] shop [dot] com</p><img src="logo@2x.png"><p>pat@gmail.com</p><p>user@sentry.io you@example.com noreply@shop.com</p><script>var a="x@y.com"</script>`;
  const list = finder.emailsFromHtml(html, "www.shop.com");
  assert.deepStrictEqual(list.slice(0, 3), ["owner@shop.com", "sales@shop.com", "info@shop.com"].sort((a, b) => list.indexOf(a) - list.indexOf(b)));
  assert.ok(list.indexOf("owner@shop.com") < list.indexOf("sales@shop.com"), "a personal address beats a shared one");
  assert.ok(list.indexOf("sales@shop.com") < list.indexOf("pat@gmail.com"), "own domain beats free mail");
  for (const bad of ["logo@2x.png", "user@sentry.io", "you@example.com", "noreply@shop.com", "x@y.com"]) assert.ok(!list.includes(bad), bad);
});

test("robots.txt: disallow-all and path rules are honoured; a missing file allows everything", () => {
  assert.strictEqual(finder.robotsRules("User-agent: *\nDisallow: /")("/"), false);
  const r = finder.robotsRules("User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /private\nDisallow:\n");
  assert.strictEqual(r("/contact"), true); assert.strictEqual(r("/private/x"), false);
  assert.strictEqual(finder.robotsRules("")("/anything"), true);
});

test("finding an email on a site follows the contact link, stops early, and says why when it fails", async () => {
  const seen = fakeWorld();
  const a = await finder.findEmailOnSite("https://alpharoof.com");
  assert.strictEqual(a.email, "info@alpharoof.com");
  assert.ok(seen.pages.includes("https://alpharoof.com/contact-us"));
  assert.ok(seen.pages.length <= 4);
  assert.match((await finder.findEmailOnSite("robots.com")).reason, /robots/);
  assert.match((await finder.findEmailOnSite("https://www.facebook.com/somebiz")).reason, /social/);
  assert.match((await finder.findEmailOnSite("")).reason, /website/);
  assert.match((await finder.findEmailOnSite("nosuchsite.com")).reason, /did not answer|no public email/);
});

test("a full search: finds, reads websites, verifies, flags duplicates, and keeps the list for review", async () => {
  reset(); const seen = fakeWorld();
  const r = finder.startSearch({ type: "Roofing contractor", place: "Austin, TX", limit: 40 }, deps());
  assert.ok(r.started); await r.done;
  const res = finder.results(), by = Object.fromEntries(res.items.map((c) => [c.name, c]));
  assert.strictEqual(res.items.length, 8);
  assert.match(seen.queries[0], /nwr\["craft"="roofer"\]\["name"\]\(30,-97\.9,30\.5,-97\.5\)/);
  assert.deepStrictEqual([by["Alpha Roofing"].email, by["Alpha Roofing"].emailSource, by["Alpha Roofing"].usable], ["info@alpharoof.com", "website", true]);
  assert.deepStrictEqual([by["Beta Roofing"].email, by["Beta Roofing"].emailSource], ["owner@betaroof.com", "map"]);
  assert.strictEqual(by["Alpha Roofing"].city, "Austin"); assert.strictEqual(by["Alpha Roofing"].state, "TX"); assert.strictEqual(by["Alpha Roofing"].country, "US");
  assert.match(by["No Site Roofing"].reason, /no website/);
  assert.strictEqual(by["Dup Roofing"].duplicate, true); assert.strictEqual(by["Dup Roofing"].usable, false);
  assert.match(by["Dead Domain Roofing"].reason, /no mail server/);
  assert.match(by["Robots Roofing"].reason, /robots/);
  assert.deepStrictEqual([by["Free Roofing"].free, by["Free Roofing"].usable], [true, true]);
  assert.strictEqual(by["Junk Roofing"].usable, false);
  assert.strictEqual(finder.status().results.usable, 3);
  assert.match(finder.status().job.message, /8 businesses, 3 with a usable email/);
  assert.ok(!seen.pages.some((u) => u.includes("robots.com/") && !u.endsWith("robots.txt")), "a disallowed site's pages are never fetched");
});

test("unknown business types need Gemini, and its tags are only used when they look like real map tags", async () => {
  reset(); fakeWorld();
  const none = finder.startSearch({ type: "unicorn wrangling", place: "Austin, TX" }, deps()); await none.done;
  assert.match(finder.status().job.message, /don't know "unicorn wrangling"/);
  assert.deepStrictEqual(finder.safeTags([{ key: "craft", value: "roofer" }, { key: "evil", value: "x" }, { key: "shop", value: "A;DROP" }, { key: "amenity", value: "dentist" }]), [["craft", "roofer"], ["amenity", "dentist"]]);
  const seen = fakeWorld();
  const ok = finder.startSearch({ type: "gelato makers", place: "Austin, TX" }, deps({ mapType: async () => [{ key: "shop", value: "ice_cream" }] })); await ok.done;
  assert.match(seen.queries[0], /"shop"="ice_cream"/);
  assert.strictEqual(finder.tagsForType("we need HVAC help").label, "HVAC");
});

test("places that are too big or unknown are refused with a plain message", async () => {
  reset(); fakeWorld({ area: [{ display_name: "Texas", boundingbox: ["25", "36.5", "-106", "-93"], address: {} }] });
  await finder.startSearch({ type: "dentist", place: "Texas" }, deps()).done;
  assert.match(finder.status().job.message, /too large/);
  fakeWorld({ area: [] });
  await finder.startSearch({ type: "dentist", place: "Nowhereville" }, deps()).done;
  assert.match(finder.status().job.message, /Could not find/);
  await assert.rejects(finder.geocode(""), /Enter a city/);
});

test("daily limits stop runaway searching and website reading", async () => {
  reset(); fakeWorld(); process.env.FINDER_DAILY_SEARCHES_MAX = "1";
  try {
    await finder.startSearch({ type: "dentist", place: "Austin, TX" }, deps()).done;
    const again = finder.startSearch({ type: "dentist", place: "Austin, TX" }, deps());
    assert.strictEqual(again.started, false); assert.match(again.reason, /limit/);
  } finally { delete process.env.FINDER_DAILY_SEARCHES_MAX; }
  reset(); fakeWorld({ elements: Array.from({ length: 6 }, (_, i) => ({ id: 100 + i, tags: { name: `Site ${i}`, website: `https://site${i}.com` } })) }); process.env.FINDER_DAILY_SITES_MAX = "2";
  try {
    await finder.startSearch({ type: "dentist", place: "Austin, TX", limit: 40 }, deps()).done;
    const limited = finder.results().items.filter((c) => /daily website limit/.test(c.reason || ""));
    assert.strictEqual(limited.length, 4, "only 2 sites were read");
    assert.strictEqual(finder.usage().sites, 2);
  } finally { delete process.env.FINDER_DAILY_SITES_MAX; }
});

test("importing chosen results creates normal leads with place, type and country, once", async () => {
  reset(); fakeWorld();
  await finder.startSearch({ type: "Roofing contractor", place: "Austin, TX" }, deps()).done;
  const res = finder.results(), ids = res.items.filter((c) => c.usable).map((c) => c.id), bad = res.items.find((c) => !c.usable).id;
  const cfg = eng.sanitizeConfig({ signature: { name: "A", company: "B", website: "b.com", postal_address: "1 St" }, sending: { countries: ["US", "UK"] }, mailboxes: [{ id: 1, email: "a@x.com" }],
    campaigns: [{ id: 1, name: "Texas roofers", states: "TX", types: "roof" }] });
  const rows = finder.rowsFor([...ids, bad]);
  assert.strictEqual(rows.length, 3, "unusable results are never imported");
  const r = eng.importLeads(rows, cfg);
  assert.strictEqual(r.added, 3);
  const leads = store.loadTracking(), alpha = leads.find((t) => t.email === "info@alpharoof.com");
  assert.deepStrictEqual([alpha.store, alpha.domain, alpha.country, alpha.category, alpha.status], ["Alpha Roofing", "alpharoof.com", "US", "roofing contractor", "new"]);
  assert.strictEqual(alpha.city, "Austin"); assert.strictEqual(alpha.state, "TX");
  assert.strictEqual(alpha.campaign, "1", "lands in the matching campaign");
  assert.strictEqual(finder.markImported(ids), 3);
  assert.strictEqual(finder.rowsFor(ids).length, 0, "a second import adds nothing");
  assert.strictEqual(finder.status().results.imported, 3);
});

test("API: behind login, status and search and results and import and clear", async () => {
  reset(); fakeWorld({ elements: [1, 2, 3].map((i) => ({ id: i, tags: { name: `Biz ${i}`, email: `biz${i}owner@gmail.com` } })).concat([{ id: 9, tags: { name: "No Contact" } }]) });
  const server = http.createServer((req, res) => { if (!outreach.handle(req, res)) { res.writeHead(404); res.end(); } });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (m, u, b, c) => fetch(base + "/api/outreach" + u, { method: m, headers: { "Content-Type": "application/json", ...(c ? { Cookie: c } : {}) }, body: b === undefined ? undefined : JSON.stringify(b) }).then(async (r) => ({ status: r.status, json: await r.json() }));
  try {
    for (const [m, u] of [["GET", "/finder/status"], ["POST", "/finder/search"], ["GET", "/finder/results"], ["POST", "/finder/import"], ["POST", "/finder/clear"], ["POST", "/finder/stop"]]) assert.strictEqual((await call(m, u, m === "GET" ? undefined : {})).status, 401, u);
    const login = await fetch(base + "/api/outreach/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: process.env.ADMIN_PASSWORD }) });
    const c = login.headers.get("set-cookie").split(";")[0];
    assert.ok((await call("GET", "/finder/status", undefined, c)).json.types.includes("dentist"));
    assert.strictEqual((await call("POST", "/finder/import", { ids: ["nope"] }, c)).status, 400);
    assert.strictEqual((await call("POST", "/finder/search", { type: "Roofing contractor", place: "Austin, TX", limit: 40 }, c)).status, 202);
    for (let i = 0; i < 100 && finder.status().job.running; i++) await new Promise((r) => setTimeout(r, 50));
    const res = (await call("GET", "/finder/results", undefined, c)).json.results;
    assert.strictEqual(res.items.length, 4);
    const pick = res.items.filter((x) => x.usable).map((x) => x.id);
    const imp = await call("POST", "/finder/import", { ids: pick }, c);
    assert.strictEqual(imp.json.added, 3);
    assert.strictEqual(store.loadTracking().length, 3);
    assert.strictEqual((await call("POST", "/finder/import", { ids: pick }, c)).status, 400, "already imported");
    assert.strictEqual((await call("POST", "/finder/clear", {}, c)).status, 200);
    assert.strictEqual((await call("GET", "/finder/results", undefined, c)).json.results, null);
  } finally { server.close(); }
});
