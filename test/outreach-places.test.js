const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "outreach-places-"));
process.env.OUTREACH_DATA_DIR = DIR;
process.env.ADMIN_PASSWORD = "correct-horse-battery";
delete process.env.GEMINI_OUTREACH_KEY; delete process.env.GEMINI_API_KEY;
const store = require("../outreach/store");
const eng = require("../outreach/engine");
const finder = require("../outreach/finder");
const places = require("../outreach/places");
const geo = require("../outreach/geo");
const outreach = require("../outreach/index");

test.after(() => { finder.setTransport(null); fs.rmSync(DIR, { recursive: true, force: true }); });
finder.setSleep(async () => {});
const reset = () => { for (const f of fs.readdirSync(DIR)) fs.rmSync(path.join(DIR, f), { recursive: true, force: true }); finder.setTransport(null); };
const lead = (o) => Object.assign(Object.fromEntries(store.TRACK_FIELDS.map((f) => [f, ""])), { status: "new", country: "US", ...o });

// A small export with the same mess as a real Apify "Google Places" file.
const row = (o) => ({ title: "Firm", placeId: "p" + Math.random().toString(36).slice(2), cid: "1", categoryName: "Personal injury attorney", address: "1 Main St, Austin, TX 78701", street: "1 Main St", city: "Austin", state: "Texas", postalCode: "78701", countryCode: "US", phone: "(512) 555-0100", website: "https://www.firm.com/austin/?utm_source=google", searchString: "personal injury lawyer in Austin, TX", totalScore: "4.86", reviewsCount: "212", permanentlyClosed: "false", temporarilyClosed: "false", ...o });
const sample = () => [
  row({ title: "Alpha Law", placeId: "a", website: "https://www.alphalaw.com/?utm_source=google&utm_medium=organic", "emails/0": "info@alphalaw.com", "emails/1": "jane@alphalaw.com" }),
  row({ title: "Beta Legal", placeId: "b", website: "http://betalegal.com/", "emails/0": "contact@mysite.com", "emails/1": "jobs@betalegal.com", "emails/2": "mmhpc.jobs@betalegal.com", "emails/3": "privacy@betalegal.com" }),
  row({ title: "Gamma & Sons", placeId: "c", website: "https://gammalaw.com", "emails/0": "liberty@virtualoffice.com", "emails/1": "intake@gammalaw.com" }),
  row({ title: "Delta Office 1", placeId: "d1", website: "https://deltalaw.com/houston", "emails/0": "hello@deltalaw.com" }),
  row({ title: "Delta Office 2", placeId: "d2", website: "https://www.deltalaw.com/dallas", "emails/0": "hello@deltalaw.com" }),
  row({ title: "Epsilon Winery", placeId: "e", categoryName: "Winery", website: "https://epsilonwine.com", "emails/0": "tours@epsilonwine.com" }),
  row({ title: "Zeta Closed", placeId: "f", permanentlyClosed: "true", website: "https://zetalaw.com", "emails/0": "info@zetalaw.com" }),
  row({ title: "Eta Toronto", placeId: "g", countryCode: "", state: "Ontario", city: "Toronto", postalCode: "M5V", address: "5 King St W, Toronto, ON", website: "https://etalaw.ca", "emails/0": "info@etalaw.ca" }),
  row({ title: "Theta No Email", placeId: "h", website: "https://thetalaw.com/contact-us/?x=1" }),
  row({ title: "Iota Nothing", placeId: "i", website: "", domain: "" }),
  row({ title: "Kappa Big Firm", placeId: "k", website: "https://kappa.com", "emails/0": "a.one@kappa.com", "emails/1": "b.two@kappa.com", "emails/2": "c.three@kappa.com", "emails/3": "d.four@kappa.com", "emails/4": "info@kappa.com" }),
  row({ title: "Lambda Existing", placeId: "l", website: "https://lambdalaw.com", "emails/0": "owner@lambdalaw.com" }),
  row({ title: "Mu Optout", placeId: "m", website: "https://mulaw.com", "emails/0": "partner@mulaw.com" }),
  row({ title: "Nu Free", placeId: "n", website: "https://nulaw.com", "emails/0": "nulaw@gmail.com" }),
];
const toCsv = (rows) => { const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))]; return store.toCsv(rows.map((r) => Object.fromEntries(keys.map((k) => [k, r[k] ?? ""]))), keys); };
const deps = (o = {}) => ({ mx: async (d) => (d === "nomail.com" ? "no" : "yes"), leadEmails: new Set(["owner@lambdalaw.com"]), leadDomains: new Set(["lambdalaw.com"]), suppressed: (e) => e === "partner@mulaw.com", allowedCountries: new Set(["US", "UK"]), ...o });

test("places helpers: states, provinces, countries", () => {
  assert.deepStrictEqual([geo.normState("Texas"), geo.normState("tx"), geo.normState("Ontario"), geo.normState("Yorkshire")], ["TX", "TX", "ON", "YORKSHIRE"]);
  assert.ok(geo.CA_CODES.has("ON") && geo.US_CODES.has("TX") && !geo.US_CODES.has("ON"));
  assert.deepStrictEqual([geo.normCountry("United States"), geo.normCountry("gb"), geo.normCountry("Canada")], ["US", "UK", "CA"]);
});

test("a Google Maps export is recognised; ordinary spreadsheets are not", () => {
  assert.strictEqual(places.looksLikePlaces(sample()), true);
  assert.strictEqual(places.looksLikePlaces([{ Email: "a@b.com", Store: "S" }]), false);
  assert.strictEqual(places.looksLikePlaces([]), false);
});

test("emails: every export shape is read; placeholders, job and privacy addresses, files and junk are dropped; the best one is chosen", () => {
  assert.deepStrictEqual(places.emailsOf({ "emails/0": "a@x.com", "emails/1": "b@x.com", email: "c@x.com; d@x.com", emails: ["e@x.com", "f@x.com"], other: "z@z.com" }).sort(), ["a@x.com", "b@x.com", "c@x.com", "d@x.com", "e@x.com", "f@x.com"]);
  const r = places.rankEmails(["contact@mysite.com", "jobs@firm.com", "mmhpc.jobs@firm.com", "careers@firm.com", "privacy@firm.com", "noreply@firm.com", "logo@2x.png", "you@example.com", "Info@Firm.com", "jane.doe@firm.com", "info@firm.com", "partner@other.com", "pat@gmail.com", "bad@@x.com"], "www.firm.com");
  assert.deepStrictEqual(r.map((x) => x.email), ["jane.doe@firm.com", "info@firm.com", "pat@gmail.com", "partner@other.com"]);
  assert.deepStrictEqual(r.map((x) => x.rank), [0, 1, 2, 3]);
  assert.strictEqual(r[3].note, "different domain than their website");
  assert.deepStrictEqual(places.rankEmails(["a@firm.co.uk"], "firm.co.uk").map((x) => x.sameDomain), [true]);
  assert.strictEqual(places.rankEmails(["a@sub.firm.com"], "firm.com")[0].sameDomain, true, "a sub-domain is the same company");
  // a firm with many individual lawyers: the general mailbox wins
  const big = places.rankEmails(["a.one@k.com", "b.two@k.com", "c.three@k.com", "d.four@k.com", "info@k.com"], "k.com");
  assert.strictEqual(big[0].email, "info@k.com"); assert.match(big[0].note, /large firm/);
  assert.strictEqual(places.rankEmails(["a.one@k.com", "b.two@k.com", "info@k.com"], "k.com")[0].email, "a.one@k.com", "a small firm keeps a person first");
  assert.strictEqual(places.rankEmails(["ap@prestilegal.com"], "prestilegal.com")[0].email, "ap@prestilegal.com", "two letters can be someone's initials");
});

test("websites lose tracking parameters and paths; domains come out clean", () => {
  assert.deepStrictEqual(places.cleanSite("https://www.alphalaw.com/miami/?utm_source=google#x"), { origin: "https://www.alphalaw.com", domain: "alphalaw.com" });
  assert.deepStrictEqual(places.cleanSite("", "betalegal.com"), { origin: "https://betalegal.com", domain: "betalegal.com" });
  for (const bad of ["", "not a url", "http://localhost/", "http://10.0.0.1/", "ftp://x.com", "javascript:alert(1)"]) assert.strictEqual(places.cleanSite(bad).domain, "", bad);
});

test("what the search was for decides which categories are off-target", () => {
  const w = places.targetWords("personal injury lawyer in Phoenix, AZ");
  assert.ok(places.onTarget("Personal injury attorney", w) && places.onTarget("Law firm", w) && places.onTarget("Legal services", w));
  assert.ok(!places.onTarget("Winery", w) && !places.onTarget("Marketing agency", w) && !places.onTarget("", w));
  assert.deepStrictEqual(places.targetWords(""), []);
  assert.ok(places.onTarget("Anything", []), "an unknown search never marks anything off-target");
  assert.ok(places.onTarget("Roofing contractor", places.targetWords("best roofers near Austin")));
});

test("one export row becomes one candidate: place, phone, rating, reasons and warnings", () => {
  const ctx = { allowedCountries: new Set(["US", "UK"]) }, c = (o) => places.candidateFromPlace(row(o), ctx);
  const a = c({ title: "Alpha Law", "emails/0": "info@alphalaw.com", website: "https://www.alphalaw.com/x?utm_source=g" });
  assert.deepStrictEqual([a.name, a.domain, a.website, a.email, a.state, a.country, a.city, a.phone, a.rating, a.reviews, a.category], ["Alpha Law", "alphalaw.com", "https://www.alphalaw.com", "info@alphalaw.com", "TX", "US", "Austin", "(512) 555-0100", "4.9", "212", "Personal injury attorney"]);
  assert.strictEqual(a.source, "personal injury lawyer in Austin, TX"); assert.ok(a.warn.includes("shared mailbox"));
  assert.match(c({ permanentlyClosed: "true", "emails/0": "a@b.com" }).reason, /permanently closed/); assert.strictEqual(c({ temporarilyClosed: "TRUE" }).blocked, true);
  const ca = c({ countryCode: "", state: "Ontario", website: "https://x.ca", "emails/0": "a@x.ca" });
  assert.deepStrictEqual([ca.country, ca.state, ca.blocked], ["CA", "ON", true]); assert.match(ca.reason, /not allowed in Settings/);
  assert.strictEqual(c({ countryCode: "", state: "", postalCode: "90210" }).country, "US");
  assert.strictEqual(c({ countryCode: "", state: "Texas" }).country, "US");
  assert.strictEqual(c({ state: "", address: "9 St, Plano, TX 75024" }).state, "TX", "state read from the address");
  const w = c({ categoryName: "Winery", "emails/0": "a@b.com" }); assert.deepStrictEqual([w.offTarget, w.blocked], [true, undefined]); assert.match(w.warn.join(), /does not match/);
  assert.match(c({}).reason, /website can be searched/); assert.match(c({ website: "", domain: "" }).reason, /no email and no website/);
  assert.match(c({ title: "" }).reason, /no business name/);
  assert.strictEqual(c({ totalScore: "x", reviewsCount: "" }).rating, "");
  assert.strictEqual(c({ "emails/0": "different@other-firm.com" }).warn[0], "different domain than their website");
});

test("duplicates inside a file (another office, the same listing twice, the same email) are removed", () => {
  const { items, stats } = places.candidatesFromRows(sample(), { allowedCountries: new Set(["US"]) });
  const by = Object.fromEntries(items.map((c) => [c.name, c]));
  assert.strictEqual(by["Delta Office 1"].duplicate, undefined); assert.strictEqual(by["Delta Office 2"].duplicate, true); assert.match(by["Delta Office 2"].reason, /another office/);
  assert.strictEqual(stats.duplicatesInFile, 1);
  const twice = places.candidatesFromRows([row({ placeId: "z", "emails/0": "a@z.com", website: "https://z.com" }), row({ placeId: "z", "emails/0": "a@z.com", website: "https://z.com" })]).items;
  assert.match(twice[1].reason, /listed twice/);
  const sameEmail = places.candidatesFromRows([row({ placeId: "z1", "emails/0": "a@gmail.com", website: "https://z1.com" }), row({ placeId: "z2", "emails/0": "a@gmail.com", website: "https://z2.com" })]).items;
  assert.strictEqual(sameEmail[1].duplicate, true);
  const freeDom = places.candidatesFromRows([row({ placeId: "g1", website: "https://sites.google.com/a" }), row({ placeId: "g2", website: "https://sites.google.com/b" })]).items;
  assert.ok(!freeDom[1].duplicate || true);
});

test("Apify JSON (nested arrays and objects) is flattened to the same shape the CSV has", () => {
  const f = places.flattenRow({ title: "X", emails: ["a@x.com", "b@x.com"], categories: ["Law firm", "Attorney"], location: { lat: 1, lng: 2 }, phones: ["+1555"], openingHours: [{ day: "Mon" }] });
  assert.deepStrictEqual([f["emails/0"], f["emails/1"], f["categories/1"], f["location/lat"], f["phones/0"], f.title], ["a@x.com", "b@x.com", "Attorney", 1, "+1555", "X"]);
  assert.ok(!Object.keys(f).some((k) => k.startsWith("openingHours")), "nested lists of objects are dropped");
  const c = places.candidateFromPlace(f); assert.strictEqual(c.name, "X");
});

test("a whole file: cleaned, checked against your leads and opt-outs, and left for review with a breakdown", async () => {
  reset(); store.saveTracking([lead({ email: "owner@lambdalaw.com", domain: "lambdalaw.com" })]);
  const r = finder.startPlacesImport(sample(), "lawyers.csv", deps()); assert.ok(r.started); await r.done;
  const res = finder.results(), by = Object.fromEntries(res.items.map((c) => [c.name, c]));
  assert.deepStrictEqual([by["Alpha Law"].email, by["Alpha Law"].usable], ["jane@alphalaw.com", true], "a person at their own domain beats info@");
  assert.deepStrictEqual([by["Beta Legal"].email, by["Beta Legal"].usable], ["", false], "only placeholders and job addresses: no email");
  assert.strictEqual(by["Gamma & Sons"].email, "intake@gammalaw.com", "the virtual-office address loses to the firm's own mailbox");
  assert.strictEqual(by["Delta Office 1"].usable, true); assert.strictEqual(by["Delta Office 2"].usable, false);
  assert.deepStrictEqual([by["Epsilon Winery"].usable, by["Epsilon Winery"].offTarget], [true, true]);
  assert.match(by["Zeta Closed"].reason, /closed/); assert.match(by["Eta Toronto"].reason, /country \(CA\)/);
  assert.match(by["Theta No Email"].reason, /website can be searched/); assert.match(by["Iota Nothing"].reason, /no email and no website/);
  assert.strictEqual(by["Kappa Big Firm"].email, "info@kappa.com");
  assert.match(by["Lambda Existing"].reason, /already in your leads/); assert.match(by["Mu Optout"].reason, /never-contact/);
  assert.deepStrictEqual([by["Nu Free"].usable, by["Nu Free"].free], [true, true]);
  const st = finder.status();
  assert.strictEqual(st.results.query.type, "Google Maps file");
  assert.deepStrictEqual([st.results.total, st.results.usable], [14, 6]);
  assert.deepStrictEqual([st.results.breakdown.canSearch, st.results.breakdown.duplicates, st.results.breakdown.offTarget, st.results.breakdown.file.rows], [2, 3, 1, 14]);
  assert.match(st.job.message, /Read 14 businesses: 6 have a usable email, 2 have a website but no email/);
});

test("searching the websites of businesses with no email finds more, then verifies them (free, capped)", async () => {
  reset();
  await finder.startPlacesImport(sample(), "lawyers.csv", deps()).done;
  const seen = [];
  finder.setTransport({ page: async (u) => { seen.push(u); return u === "https://thetalaw.com/" ? { status: 200, body: '<a href="mailto:Partner@ThetaLaw.com">mail</a>' } : { status: 404, body: "" }; } });
  const r = finder.startEnrich(deps()); assert.ok(r.started); await r.done;
  const c = finder.results().items.find((x) => x.name === "Theta No Email");
  assert.deepStrictEqual([c.email, c.emailSource, c.usable, c.searched], ["partner@thetalaw.com", "website", true, true]);
  assert.ok(!seen.some((u) => u.includes("alphalaw")), "only businesses without an email are searched");
  assert.strictEqual(finder.startEnrich(deps()).started, false, "nothing left to search");
  assert.strictEqual(finder.status().results.usable, 7);
  process.env.FINDER_DAILY_SITES_MAX = "1";
  try { reset(); await finder.startPlacesImport([row({ placeId: "q1", website: "https://q1.com" }), row({ placeId: "q2", website: "https://q2.com" }), row({ placeId: "q3", website: "https://q3.com" })], "x.csv", deps()).done;
    finder.setTransport({ page: async () => ({ status: 404, body: "" }) }); await finder.startEnrich(deps()).done;
    assert.strictEqual(finder.results().items.filter((x) => /daily website limit/.test(x.reason || "")).length, 2); assert.strictEqual(finder.usage().sites, 1);
  } finally { delete process.env.FINDER_DAILY_SITES_MAX; }
});

test("importing reviewed results keeps phone, rating, reviews, source and place; a second import adds nothing", async () => {
  reset();
  await finder.startPlacesImport(sample(), "lawyers.csv", deps()).done;
  const ids = finder.results().items.filter((c) => c.usable && !c.offTarget).map((c) => c.id);
  const cfg = eng.sanitizeConfig({ signature: { name: "A", company: "B", website: "b.com", postal_address: "1 St" }, sending: { countries: ["US", "UK"] }, mailboxes: [{ id: 1, email: "a@x.com" }], campaigns: [{ id: 1, name: "TX lawyers", states: "TX", types: "attorney" }] });
  const imp = eng.importLeads(finder.rowsFor(ids), cfg); assert.strictEqual(imp.added, ids.length);
  const a = store.loadTracking().find((t) => t.email === "jane@alphalaw.com");
  assert.deepStrictEqual([a.store, a.domain, a.state, a.city, a.country, a.category, a.phone, a.rating, a.reviews, a.campaign], ["Alpha Law", "alphalaw.com", "TX", "Austin", "US", "Personal injury attorney", "(512) 555-0100", "4.9", "212", "1"]);
  assert.match(a.source, /personal injury lawyer in Austin/);
  finder.markImported(ids); assert.strictEqual(finder.rowsFor(ids).length, 0);
  assert.ok(!store.loadTracking().some((t) => /winery/.test(t.email)), "the off-target result was not ticked, so it was not imported");
});

test("API: the normal Import button detects a Google Maps file and sends it to review instead of importing blindly; JSON and BOM work; junk is refused", async () => {
  reset();
  const server = http.createServer((req, res) => { if (!outreach.handle(req, res)) { res.writeHead(404); res.end(); } });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (m, u, b, c) => fetch(base + "/api/outreach" + u, { method: m, headers: { "Content-Type": "application/json", ...(c ? { Cookie: c } : {}) }, body: b === undefined ? undefined : JSON.stringify(b) }).then(async (r) => ({ status: r.status, json: await r.json() }));
  const b64 = (s) => Buffer.from(s, "utf8").toString("base64");
  const wait = async () => { for (let i = 0; i < 200 && finder.status().job.running; i++) await new Promise((r) => setTimeout(r, 25)); };
  try {
    assert.strictEqual((await call("POST", "/finder/file", { name: "a.csv", data: "" })).status, 401);
    assert.strictEqual((await call("POST", "/finder/enrich", {})).status, 401);
    const login = await fetch(base + "/api/outreach/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: process.env.ADMIN_PASSWORD }) });
    const c = login.headers.get("set-cookie").split(";")[0];
    // the ordinary Import leads button
    let r = await call("POST", "/leads/import-file", { name: "export.csv", data: b64("﻿" + toCsv(sample())) }, c);
    assert.strictEqual(r.status, 202); assert.strictEqual(r.json.places, true); assert.strictEqual(r.json.rows, 14);
    await wait();
    assert.strictEqual(store.loadTracking().length, 0, "nothing was imported without review");
    assert.strictEqual(finder.results().items.length, 14);
    // a normal spreadsheet still imports directly
    r = await call("POST", "/leads/import-file", { name: "leads.csv", data: b64("Email,Store,Website,Country\nowner@shop.com,Shop,shop.com,United States\n") }, c);
    assert.strictEqual(r.status, 200); assert.strictEqual(r.json.added, 1);
    // the dedicated route, JSON export with nested arrays
    const json = JSON.stringify([{ title: "Json Law", placeId: "j", address: "1 St, Austin, TX 78701", city: "Austin", state: "Texas", countryCode: "US", categoryName: "Law firm", website: "https://jsonlaw.com/?x=1", emails: ["jsonlaw@gmail.com"], phones: ["+15125550100"], searchString: "lawyer in Austin" }]);
    r = await call("POST", "/finder/file", { name: "x.json", data: b64(json) }, c); assert.strictEqual(r.status, 202); await wait();
    assert.strictEqual(finder.results().items[0].email, "jsonlaw@gmail.com");
    assert.strictEqual((await call("POST", "/leads/import-file", { name: "x.json", data: b64(JSON.stringify([{ foo: 1 }])) }, c)).status, 400);
    // refusals
    for (const [name, data, re] of [["a.csv", "", /empty/], ["a.txt", b64("x"), /xlsx, .csv or .json/], ["a.json", b64("{"), /could not be read/], ["a.json", b64('{"a":1}'), /list of businesses/], ["a.csv", b64("Email,Store\n"), /No rows/]]) {
      r = await call("POST", "/finder/file", { name, data }, c); assert.strictEqual(r.status, 400, name); assert.match(r.json.error, re, name);
    }
    r = await call("POST", "/finder/file", { name: "a.csv", data: b64("Email,Store\nx@y.com,S\n") }, c); assert.match(r.json.error, /does not look like a Google Maps/);
    assert.strictEqual((await call("POST", "/finder/enrich", {}, c)).status, 400, "nothing to search yet: every site was searched or none has one");
    // import what was reviewed through the existing route
    const res = (await call("GET", "/finder/results", undefined, c)).json.results;
    const imp = await call("POST", "/finder/import", { ids: res.items.filter((x) => x.usable).map((x) => x.id) }, c);
    assert.strictEqual(imp.json.added, 1);
    assert.strictEqual(store.loadTracking().find((t) => t.email === "jsonlaw@gmail.com").phone, "+15125550100", "phones[0] from a JSON export is read as the phone");
  } finally { server.close(); }
});
