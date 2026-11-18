/*
 * Lead finder: free, no key. Finds local businesses on OpenStreetMap (Overpass API, with Nominatim to turn a place name into
 * an area), then looks for a public contact email on each business's own website, verifies it, removes duplicates and leaves
 * the result for a person to review and import.
 *
 * Safe by design:
 *  - Only a business's own public pages are read (homepage plus a few contact pages); robots.txt is respected.
 *  - Every request is pinned to a vetted public IP address (no private, loopback or link-local targets), so a hostile web page
 *    or redirect can't make this server call its own network.
 *  - Politeness limits: one search at a time, small concurrency, per-day caps on searches and websites read, a clear User-Agent.
 *  - Nothing is imported until you choose it, and imports go through the normal list cleaner and country rules.
 * Map data: (c) OpenStreetMap contributors, ODbL.
 */
const dns = require("dns").promises;
const net = require("net");
const http = require("http");
const https = require("https");
const crypto = require("crypto");
const store = require("./store");
const cleaner = require("./cleaner");

const UA = "WebersLinkLeadFinder/1.0 (business contact research; respects robots.txt)";
const RESULTS = "finder_results.json", STATE = "finder_state.json";
const env = () => process.env;
const capSites = () => { const n = parseInt(env().FINDER_DAILY_SITES_MAX, 10); return Number.isFinite(n) && n > 0 ? Math.min(n, 5000) : 400; };
const capQueries = () => { const n = parseInt(env().FINDER_DAILY_SEARCHES_MAX, 10); return Number.isFinite(n) && n > 0 ? Math.min(n, 200) : 30; };
const MAX_ITEMS = 100;

// ---------------------------------------------------------------- what you can search for
// Plain business types -> OpenStreetMap tags. Anything else is mapped by Gemini (checked against an allow-list) when it is connected.
const TYPES = [
  ["roofing contractor", ["roof", "roofer", "roofing"], [["craft", "roofer"]]], ["HVAC", ["hvac", "heating", "air conditioning", "furnace"], [["craft", "hvac"]]],
  ["plumber", ["plumb"], [["craft", "plumber"]]], ["electrician", ["electric"], [["craft", "electrician"]]], ["painter", ["painter", "painting"], [["craft", "painter"]]],
  ["carpenter", ["carpent", "joiner"], [["craft", "carpenter"]]], ["locksmith", ["locksmith"], [["craft", "locksmith"]]], ["landscaper", ["landscap", "gardener", "lawn"], [["craft", "gardener"]]],
  ["auto repair", ["auto repair", "mechanic", "car repair", "garage"], [["shop", "car_repair"]]], ["car dealer", ["car dealer", "dealership"], [["shop", "car"]]],
  ["dentist", ["dentist", "dental"], [["amenity", "dentist"]]], ["doctor", ["doctor", "physician", "gp "], [["amenity", "doctors"]]], ["clinic", ["clinic"], [["amenity", "clinic"], ["healthcare", "clinic"]]],
  ["veterinarian", ["vet", "veterinar"], [["amenity", "veterinary"]]], ["pharmacy", ["pharmac", "chemist"], [["amenity", "pharmacy"]]], ["optician", ["optician", "eyewear", "glasses"], [["shop", "optician"]]],
  ["lawyer", ["lawyer", "attorney", "solicitor", "law firm"], [["office", "lawyer"]]], ["accountant", ["accountant", "accounting", "bookkeep"], [["office", "accountant"]]],
  ["real estate agent", ["real estate", "estate agent", "realtor"], [["office", "estate_agent"]]], ["insurance agent", ["insurance"], [["office", "insurance"]]],
  ["hair salon", ["hair", "barber"], [["shop", "hairdresser"]]], ["beauty salon", ["beauty", "nail", "spa"], [["shop", "beauty"]]], ["gym", ["gym", "fitness"], [["leisure", "fitness_centre"]]],
  ["restaurant", ["restaurant"], [["amenity", "restaurant"]]], ["cafe", ["cafe", "coffee"], [["amenity", "cafe"]]], ["bakery", ["bakery", "bakeries"], [["shop", "bakery"]]],
  ["clothing store", ["clothing", "apparel", "boutique", "fashion"], [["shop", "clothes"]]], ["jewelry store", ["jewel"], [["shop", "jewelry"]]], ["furniture store", ["furniture"], [["shop", "furniture"]]],
  ["florist", ["florist", "flower"], [["shop", "florist"]]], ["photographer", ["photograph"], [["craft", "photographer"]]], ["hotel", ["hotel", "motel", "b&b"], [["tourism", "hotel"], ["tourism", "guest_house"]]],
];
const typeNames = () => TYPES.map((t) => t[0]);
/** Tags for a plain business type, or null when it isn't one we know (the caller may ask Gemini). */
function tagsForType(text) {
  const t = String(text || "").toLowerCase();
  const hit = TYPES.find((x) => x[0].toLowerCase() === t) || TYPES.find((x) => x[1].some((k) => t.includes(k)));
  return hit ? { label: hit[0], tags: hit[2] } : null;
}
const TAG_KEYS = new Set(["craft", "shop", "amenity", "office", "healthcare", "leisure", "tourism"]);
/** Gemini's suggestions are only used when they look like real OpenStreetMap keys and values. */
const safeTags = (list) => (Array.isArray(list) ? list : []).map((x) => [String(x && x.key), String(x && x.value)]).filter(([k, v]) => TAG_KEYS.has(k) && /^[a-z0-9_]{2,40}$/.test(v)).slice(0, 6);

// ---------------------------------------------------------------- safe HTTP
const testHooks = { allowPrivate: false }; // tests only: lets the HTTP code talk to a local fixture server. Never set by the app.
function isPrivateIp(ip) {
  if (testHooks.allowPrivate) return false;
  const v = net.isIP(ip);
  if (v === 4) {
    const [a, b, c] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 0 && c === 0) ||
      (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (v === 6) {
    const x = ip.toLowerCase();
    if (x === "::" || x === "::1") return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(x);
    if (mapped) return isPrivateIp(mapped[1]);
    return /^f[cd]/.test(x) || /^fe[89ab]/.test(x) || /^ff/.test(x);
  }
  return true; // not an IP at all: refuse
}
/** DNS lookup that only ever returns a public address. Used as the connection's own lookup so the check can't be raced. */
function publicLookup(hostname, opts, cb) {
  if (typeof opts === "function") { cb = opts; opts = {}; }
  dns.lookup(hostname, { all: true }).then((list) => {
    const ok = list.filter((a) => !isPrivateIp(a.address));
    if (!ok.length || ok.length !== list.length) return cb(Object.assign(new Error("address not allowed"), { code: "EBLOCKED" }));
    if (opts && opts.all) return cb(null, ok);
    cb(null, ok[0].address, ok[0].family);
  }, cb);
}
let transport = null; // tests replace the network: { overpass(query), nominatim(q), page(url) -> { status, body } }
const setTransport = (t) => { transport = t; };

function fetchText(urlStr, { method = "GET", body, headers = {}, timeoutMs = 9000, maxBytes = 400 * 1024, redirects = 3, deadlineMs = 20000 } = {}) {
  return new Promise((resolveRaw, rejectRaw) => {
    let settled = false, deadline = null;
    const resolve = (v) => { if (!settled) { settled = true; clearTimeout(deadline); resolveRaw(v); } };
    const reject = (e) => { if (!settled) { settled = true; clearTimeout(deadline); rejectRaw(e); } };
    let u;
    try { u = new URL(urlStr); } catch (e) { return reject(new Error("bad address")); }
    if (!/^https?:$/.test(u.protocol) || u.username || u.password) return reject(new Error("address not allowed"));
    if (u.port && !testHooks.allowPrivate && !["80", "443", ""].includes(u.port)) return reject(new Error("address not allowed"));
    // Node does not call a custom lookup for a literal IP address, so a literal is vetted here (names are vetted in publicLookup).
    const literal = u.hostname.replace(/^\[|\]$/g, "");
    if (net.isIP(literal) && isPrivateIp(literal)) return reject(new Error("address not allowed"));
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(u, { method, lookup: publicLookup, timeout: timeoutMs, headers: { "User-Agent": UA, Accept: "text/html,application/json;q=0.9,*/*;q=0.5", ...headers } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (!redirects) return reject(new Error("too many redirects"));
        let next; try { next = new URL(res.headers.location, u).toString(); } catch (e) { return reject(new Error("bad redirect")); }
        return resolve(fetchText(next, { method: "GET", headers, timeoutMs, maxBytes, redirects: redirects - 1 }));
      }
      const chunks = []; let n = 0;
      const finish = () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") });
      // A very large page is cut off at maxBytes and what we have is used (the contact details are almost always near the top).
      res.on("data", (d) => { n += d.length; chunks.push(d); if (n >= maxBytes) { finish(); res.destroy(); } });
      res.on("end", finish);
      res.on("error", (e) => (n ? finish() : reject(e)));
      res.on("close", () => { if (!settled) (n ? finish() : reject(new Error("connection closed"))); });
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    deadline = setTimeout(() => req.destroy(new Error("timeout")), deadlineMs); // a server that trickles data forever can't hold us either
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}
const getPage = (url) => (transport ? transport.page(url) : fetchText(url));

// ---------------------------------------------------------------- e-mail finding
const FILE_EXT = /\.(png|jpe?g|gif|webp|svg|ico|css|js|woff2?|ttf|pdf|zip)$/i;
const NOT_REAL = /(sentry|wixpress|godaddy|example\.|yourname|your-?email|youremail|domain\.com|@2x|noreply|no-reply|donotreply|u003e|%20)/i;
const FREE = /^(gmail|googlemail|yahoo|ymail|hotmail|outlook|live|msn|aol|icloud|me|proton|protonmail|gmx|mail)\./i;
const ROLE = /^(info|contact|hello|hi|office|admin|sales|support|enquiries|inquiries|service|services|team|mail|booking|bookings|reception|accounts|help)$/i;
const decodeCf = (hex) => { try { const k = parseInt(hex.slice(0, 2), 16); let out = ""; for (let i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ k); return out; } catch (e) { return ""; } };
/** Every plausible email on a page, best first. domain: the business's own domain, used to rank. */
function emailsFromHtml(html, domain = "") {
  const found = new Set();
  const src = String(html || "").replace(/&#x([0-9a-f]{1,6});/gi, (m, h) => String.fromCodePoint(Math.min(parseInt(h, 16), 0x10ffff))).replace(/&#(\d{1,7});/g, (m, d) => String.fromCodePoint(Math.min(Number(d), 0x10ffff))).replace(/&(commat|period);/gi, (m, n) => (n.toLowerCase() === "commat" ? "@" : ".")); // entity-hidden addresses
  for (const m of src.matchAll(/data-cfemail="([0-9a-f]{6,})"/gi)) found.add(decodeCf(m[1]));
  for (const m of src.matchAll(/"(?:email|contactEmail|e-mail)"\s*:\s*"(?:mailto:)?([^"\s]{3,120})"/gi)) found.add(m[1]); // JSON-LD / structured data
  for (const m of src.matchAll(/mailto:([^"'?\s<>#]+)/gi)) { try { found.add(decodeURIComponent(m[1])); } catch (e) { found.add(m[1]); } }
  const text = src.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&#64;|&commat;/gi, "@").replace(/\s*[\[(]\s*at\s*[\])]\s*/gi, "@").replace(/\s*[\[(]\s*dot\s*[\])]\s*/gi, ".");
  for (const m of text.matchAll(/[A-Za-z0-9._%+\-]{1,64}@[A-Za-z0-9.\-]{1,190}\.[A-Za-z]{2,24}/g)) found.add(m[0]);
  const base = String(domain).toLowerCase().replace(/^www\./, "");
  const list = [...found].map((e) => String(e).trim().toLowerCase().replace(/[.,;:)>\]]+$/, "")).filter((e) => store.isEmail(e) && !FILE_EXT.test(e) && !NOT_REAL.test(e) && cleaner.assess(e).action !== "remove");
  const rank = (e) => { const [l, d] = e.split("@"), same = base && (d === base || d.endsWith("." + base) || base.endsWith("." + d)); return (same ? 0 : FREE.test(d) ? 2 : 3) + (ROLE.test(l.split("+")[0]) ? 0.5 : 0); };
  return [...new Set(list)].sort((a, b) => rank(a) - rank(b));
}
/** robots.txt for "*": returns a function path -> allowed? (a missing or unreadable file allows everything). */
function robotsRules(text) {
  const rules = []; let active = false;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim(), m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const k = m[1].toLowerCase();
    if (k === "user-agent") { active = m[2].trim() === "*" || /webers/i.test(m[2]); }
    else if (active && k === "disallow" && m[2].trim()) rules.push(m[2].trim());
  }
  return (p) => !rules.some((r) => r === "/" || p.startsWith(r.replace(/\*.*$/, "")));
}
const homepageOf = (site) => { try { const u = new URL(/^https?:/i.test(site) ? site : "https://" + site); return /^https?:$/.test(u.protocol) ? u : null; } catch (e) { return null; } };
const bareDomain = (site) => { const u = homepageOf(site); return u ? u.hostname.toLowerCase().replace(/^www\./, "") : ""; };
const SOCIAL = /(^|\.)(facebook|instagram|linkedin|twitter|x|tiktok|youtube|yelp|google|pinterest|wa|linktr|squarespace|wixsite|business)\./i;
/** Reads a business's own pages for a public contact email. Returns { email, page } or { email: "", reason }. */
async function findEmailOnSite(site, { maxPages = 4 } = {}) {
  const home = homepageOf(site);
  if (!home) return { email: "", reason: "no usable website" };
  const domain = bareDomain(site);
  if (SOCIAL.test(domain)) return { email: "", reason: "website is a social or platform page" };
  let allowed = () => true;
  try { const r = await getPage(home.origin + "/robots.txt"); if (r.status === 200) allowed = robotsRules(r.body); } catch (e) { /* no robots.txt */ }
  const queue = [home.origin + (home.pathname === "/" ? "/" : home.pathname)], seen = new Set();
  let first = true, fetched = 0;
  while (queue.length && fetched < maxPages) {
    const url = queue.shift(); if (seen.has(url)) continue; seen.add(url);
    let path; try { path = new URL(url).pathname; } catch (e) { continue; }
    if (!allowed(path)) { if (first) return { email: "", reason: "its robots.txt asks not to be read" }; continue; }
    let r; try { r = await getPage(url); } catch (e) { if (first) return { email: "", reason: "website did not answer" }; continue; }
    fetched++;
    if (first) { // follow the site's own "contact" link, then the usual suspects
      first = false;
      for (const m of String(r.body).matchAll(/href=["']([^"'#]+)["']/gi)) {
        if (/contact|about|reach/i.test(m[1])) { try { const u = new URL(m[1], home); if (u.origin === home.origin) queue.push(u.origin + u.pathname); } catch (e) { /* bad link */ } }
      }
      for (const p of ["/contact", "/contact-us", "/about", "/about-us"]) queue.push(home.origin + p);
    }
    if (r.status === 200) { const e = emailsFromHtml(r.body, domain); if (e.length) return { email: e[0], alternatives: e.slice(1, 3), page: url }; }
  }
  return { email: "", reason: "no public email found on the website" };
}

// ---------------------------------------------------------------- the search
function stateOn() { const s = store.readJson(STATE, {}); const d = new Date().toISOString().slice(0, 10); return s.date === d ? s : { date: d, sites: 0, searches: 0 }; }
const bump = (k, n = 1) => { const s = stateOn(); s[k] = (s[k] || 0) + n; store.writeJson(STATE, s); return s; };
const usage = () => { const s = stateOn(); return { sites: s.sites || 0, sitesMax: capSites(), searches: s.searches || 0, searchesMax: capQueries() }; };

/** Turns a network failure into something a person can act on. */
function explain(e, host) {
  const code = e && e.code, msg = String((e && e.message) || e);
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return `could not look up ${host} (DNS). Check that your hosting allows outgoing connections`;
  if (["ECONNREFUSED", "ETIMEDOUT", "ENETUNREACH", "EHOSTUNREACH", "ECONNRESET", "EPIPE"].includes(code) || /timeout|closed/i.test(msg)) return `could not connect to ${host} (${code || msg}). Your hosting may block outgoing connections, or the service is down`;
  if (code === "EBLOCKED" || /not allowed/.test(msg)) return `${host} resolved to a private address`;
  return `${host}: ${msg.slice(0, 120)}`;
}
const NOMINATIM = () => (env().FINDER_NOMINATIM_URL || "https://nominatim.openstreetmap.org/search").split(",")[0].trim();
async function nominatim(q) {
  if (transport) return transport.nominatim(q);
  const url = NOMINATIM() + "?format=jsonv2&limit=1&addressdetails=1&q=" + encodeURIComponent(q), host = new URL(url).hostname;
  let last = null;
  for (let i = 0; i < 2; i++) { // one polite retry: the free service sometimes drops a request
    try {
      const r = await fetchText(url, { headers: { Accept: "application/json" } });
      if (r.status === 429) throw new Error("the map search service is rate-limiting this server, try again in a minute");
      if (r.status === 403) throw new Error("the map search service refused this server (HTTP 403). Set FINDER_NOMINATIM_URL to another Nominatim server");
      if (r.status !== 200) throw new Error("HTTP " + r.status);
      try { return JSON.parse(r.body); } catch (e) { throw new Error("it did not answer with map data"); }
    } catch (e) { last = e; if (!/rate-limiting|refused/.test(String(e.message))) await sleep(1200); else break; }
  }
  throw new Error("Could not look up the place: " + (/rate-limiting|refused|map data|HTTP/.test(String(last.message)) ? last.message : explain(last, host)) + ".");
}
async function geocode(place) {
  const q = String(place || "").trim();
  if (q.length < 2) throw new Error("Enter a city, county or region, for example Austin, TX.");
  const r = await nominatim(q);
  const hit = Array.isArray(r) ? r[0] : null;
  if (!hit || !hit.boundingbox) throw new Error(`Could not find "${q}" on the map. Try a city name with its state or country.`);
  const [s, n, w, e] = hit.boundingbox.map(Number);
  if (![s, n, w, e].every(Number.isFinite)) throw new Error("The map returned no usable area.");
  if (n - s > 2.5 || e - w > 2.5) throw new Error(`"${q}" is too large to search at once. Pick a city or county.`);
  const a = hit.address || {};
  return { name: String(hit.display_name || q).slice(0, 120), bbox: [s, w, n, e], country: String(a.country_code || "").toUpperCase().replace(/^GB$/, "UK"), state: a["ISO3166-2-lvl4"] ? String(a["ISO3166-2-lvl4"]).split("-").pop() : "" };
}
const overpassQuery = (tags, bbox, limit) => `[out:json][timeout:45];(${tags.map(([k, v]) => `nwr["${k}"="${v}"]["name"](${bbox.join(",")});`).join("")});out tags center ${Math.min(limit * 4, 400)};`;
// The free public Overpass servers are often busy, so several are tried in turn. FINDER_OVERPASS_URL may list your own (comma separated).
const overpassUrls = () => [...new Set([...(env().FINDER_OVERPASS_URL || "").split(",").map((x) => x.trim()).filter(Boolean), "https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"])];
async function overpass(query) {
  if (transport) return transport.overpass(query);
  const problems = [];
  for (const url of overpassUrls()) {
    const host = new URL(url).hostname;
    try {
      const r = await fetchText(url, { method: "POST", body: "data=" + encodeURIComponent(query), headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, timeoutMs: 60000, maxBytes: 4 * 1024 * 1024 });
      if (r.status === 400) throw Object.assign(new Error("the map server rejected the search (HTTP 400)"), { fatal: true });
      if (r.status !== 200) { problems.push(`${host}: ${r.status === 429 || r.status === 504 || r.status === 503 ? "busy" : "HTTP " + r.status}`); continue; }
      let data; try { data = JSON.parse(r.body); } catch (e) { problems.push(`${host}: unreadable answer (probably overloaded)`); continue; }
      if (data && data.remark && /runtime error|timed out/i.test(data.remark) && !(data.elements || []).length) { problems.push(`${host}: timed out`); continue; }
      return data;
    } catch (e) {
      if (e.fatal) throw e;
      problems.push(`${host}: ${explain(e, host).replace(/^could not (connect to|look up) [^ ]+ /, "unreachable ")}`);
    }
  }
  throw new Error(`The free map servers did not answer (${problems.join("; ")}). Try again in a few minutes, or set FINDER_OVERPASS_URL to your own Overpass server.`);
}
const cleanText = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
function candidateFrom(el, area, label) {
  const t = el.tags || {}, name = cleanText(t.name, 120);
  if (!name) return null;
  const site = cleanText(t.website || t["contact:website"] || t.url || "", 200), email = cleanText(t.email || t["contact:email"] || "", 120).split(/[;,\s]/)[0].toLowerCase();
  const street = [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ");
  const state = String(t["addr:state"] || area.state || "").trim();
  const d = bareDomain(site);
  return { id: crypto.createHash("sha1").update(`${d || name}|${t["addr:street"] || ""}|${el.id}`).digest("hex").slice(0, 10), name, website: site, domain: d, osmEmail: store.isEmail(email) ? email : "",
    phone: cleanText(t.phone || t["contact:phone"] || "", 40), address: cleanText([street, t["addr:city"], t["addr:postcode"]].filter(Boolean).join(", "), 160),
    city: cleanText(t["addr:city"] || "", 60), state: cleanText(state, 20), country: area.country, category: label };
}

const job = { running: false, stop: false, phase: "", done: 0, total: 0, found: 0, withEmail: 0, message: "", startedAt: null, query: null };
let sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const setSleep = (fn) => { sleep = fn; };

/**
 * Starts a search. deps: { mx(domain) -> "yes"|"no"|"unknown", mapType(text) -> Promise<[[key,value]]> (Gemini, optional), leadEmails:Set, leadDomains:Set, suppressed(email)->bool }
 * Returns { started } or { started:false, reason }.
 */
function startSearch({ type, place, limit = 40 }, deps = {}) {
  if (job.running) return { started: false, reason: "A search is already running." };
  const s = usage();
  if (s.searches >= s.searchesMax) return { started: false, reason: `Today's search limit (${s.searchesMax}) is used up. It resets tomorrow.` };
  limit = Math.max(5, Math.min(MAX_ITEMS, parseInt(limit, 10) || 40));
  Object.assign(job, { running: true, stop: false, phase: "Finding the area", done: 0, total: 0, found: 0, withEmail: 0, message: "", startedAt: new Date().toISOString(), query: { type: cleanText(type, 80), place: cleanText(place, 80), limit } });
  const done = (async () => {
    let known = tagsForType(type);
    if (!known && deps.mapType) {
      job.phase = "Working out the business type";
      const t = safeTags(await deps.mapType(String(type)).catch(() => []));
      if (t.length) known = { label: cleanText(type, 60), tags: t };
    }
    if (!known) throw new Error(`I don't know "${cleanText(type, 40)}" yet. Pick a type from the list, or connect Gemini so I can work out new ones.`);
    const area = await geocode(place);
    if (job.stop) return;
    bump("searches");
    job.phase = "Searching the map";
    const data = await overpass(overpassQuery(known.tags, area.bbox, limit));
    const seen = new Set(), all = [];
    for (const el of (data && data.elements) || []) {
      const c = candidateFrom(el, area, known.label);
      if (c && !seen.has(c.id)) { seen.add(c.id); all.push(c); }
    }
    // businesses with a website or email first: they are the ones we can use
    all.sort((a, b) => (b.osmEmail ? 2 : b.domain ? 1 : 0) - (a.osmEmail ? 2 : a.domain ? 1 : 0));
    const items = all.slice(0, limit);
    job.found = items.length; job.total = items.length; job.phase = "Reading business websites";
    const queue = [...items];
    const worker = async () => {
      while (queue.length && !job.stop) {
        const c = queue.shift();
        if (c.osmEmail) { c.email = c.osmEmail; c.emailSource = "map"; }
        else if (c.domain) {
          if (stateOn().sites >= capSites()) { c.reason = "daily website limit reached"; }
          else { bump("sites"); const r = await findEmailOnSite(c.website).catch(() => ({ email: "", reason: "website did not answer" })); if (r.email) { c.email = r.email; c.emailSource = "website"; c.alternatives = r.alternatives || []; } else c.reason = r.reason; }
        } else c.reason = "no website listed";
        job.done++;
        if (c.email) job.withEmail++;
        await sleep(250); // be gentle with every site
      }
    };
    await Promise.all(Array.from({ length: 3 }, worker));
    job.phase = "Checking the emails";
    const mx = deps.mx || (async () => "unknown"), emails = deps.leadEmails || new Set(), domains = deps.leadDomains || new Set(), mxCache = new Map(), inResults = new Set();
    for (const c of items) {
      if (!c.email) continue;
      const v = cleaner.assess(c.email);
      c.role = v.action === "flag";
      c.free = FREE.test(c.email.split("@")[1]);
      if (v.action === "remove") { c.reason = v.reason; c.email = ""; continue; }
      const dom = c.email.split("@")[1];
      if (!mxCache.has(dom)) mxCache.set(dom, c.free ? "yes" : await mx(dom).catch(() => "unknown"));
      if (mxCache.get(dom) === "no") { c.reason = "its domain has no mail server"; c.email = ""; continue; }
      if (emails.has(c.email) || (deps.suppressed && deps.suppressed(c.email))) { c.duplicate = true; c.reason = "already in your leads or never-contact list"; }
      else if (!c.free && c.domain && domains.has(c.domain)) { c.duplicate = true; c.reason = "that company is already in your leads"; }
      else if (inResults.has(c.email)) { c.duplicate = true; c.reason = "found twice in this search"; }
      inResults.add(c.email);
    }
    for (const c of items) { c.usable = Boolean(c.email) && !c.duplicate; delete c.osmEmail; }
    store.writeJson(RESULTS, { at: new Date().toISOString(), query: { type: known.label, place: area.name, country: area.country }, items });
    job.message = `Found ${items.length} businesses, ${items.filter((c) => c.usable).length} with a usable email.`;
  })().catch((e) => { job.message = String(e.message).slice(0, 200); job.failed = true; }).finally(() => { job.running = false; job.phase = ""; if (job.stop && !job.message) job.message = "Stopped."; });
  job.failed = false;
  return { started: true, done };
}
const stopSearch = () => { job.stop = true; };

/** Tests every link of the chain from this server and says exactly where it breaks. Returns [{ step, ok, ms, detail }]. */
async function diagnose() {
  const out = [], step = async (name, fn) => { const t0 = Date.now(); try { out.push({ step: name, ok: true, ms: Date.now() - t0, detail: String(await fn()) }); } catch (e) { out.push({ step: name, ok: false, ms: Date.now() - t0, detail: String(e.message || e).slice(0, 220) }); } };
  await step("Reach the internet (DNS)", async () => { if (transport) return "skipped"; const a = await dns.lookup("nominatim.openstreetmap.org"); return `nominatim.openstreetmap.org is ${a.address}`; });
  await step("Look up a place on the map", async () => { const a = await geocode("Leeds, UK"); return `found ${a.name.slice(0, 40)}`; });
  await step("Search for businesses", async () => { const d = await overpass(overpassQuery([["amenity", "dentist"]], [53.79, -1.56, 53.81, -1.53], 5)); return `${((d && d.elements) || []).length} businesses in a small test area`; });
  await step("Read a public website", async () => { const r = await getPage("https://example.com/"); if (r.status !== 200) throw new Error("HTTP " + r.status); return "example.com answered"; });
  return out;
}
const results = () => store.readJson(RESULTS, null);
const status = () => ({ job: { ...job }, usage: usage(), types: typeNames(), results: (() => { const r = results(); return r ? { at: r.at, query: r.query, total: r.items.length, usable: r.items.filter((c) => c.usable && !c.imported).length, imported: r.items.filter((c) => c.imported).length } : null; })() });
/** The chosen candidates as spreadsheet-style rows for importLeads(); marks nothing until markImported() is called. */
function rowsFor(ids) {
  const r = results(); if (!r) return [];
  const want = new Set(ids);
  return r.items.filter((c) => want.has(c.id) && c.usable && !c.imported).map((c) => ({ Email: c.email, Store: c.name, Website: c.domain, Country: c.country, State: c.state, City: c.city, Category: c.category, Address: c.address }));
}
function markImported(ids) {
  const r = results(); if (!r) return 0;
  const want = new Set(ids); let n = 0;
  for (const c of r.items) if (want.has(c.id) && c.usable && !c.imported) { c.imported = true; n++; }
  store.writeJson(RESULTS, r);
  return n;
}
const clearResults = () => store.writeJson(RESULTS, null);

module.exports = { overpass, diagnose, explain, startSearch, stopSearch, status, results, rowsFor, markImported, clearResults, tagsForType, safeTags, typeNames, emailsFromHtml, robotsRules, findEmailOnSite,
  isPrivateIp, publicLookup, fetchText, _test: testHooks, overpassQuery, candidateFrom, geocode, setTransport, setSleep, usage };
