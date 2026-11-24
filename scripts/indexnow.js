/**
 * Tells Bing (and other IndexNow search engines) which pages changed, so new pages are picked up fast.
 * Run AFTER deploying (the key file must be live at SITE/KEY.txt):   node scripts/indexnow.js
 * Sends every URL in public/sitemap.xml. Needs internet access.
 */
const fs = require("fs");
const path = require("path");
const SITE = "https://weberslink.org";
const PUBLIC = path.join(__dirname, "..", "public");
const key = fs.readdirSync(PUBLIC).map((f) => f.match(/^([a-f0-9]{32})\.txt$/)).filter(Boolean).map((m) => m[1])[0];
if (!key) { console.error("No IndexNow key file (32 hex characters .txt) found in public/."); process.exit(1); }
const urls = [...fs.readFileSync(path.join(PUBLIC, "sitemap.xml"), "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
(async () => {
  const live = await fetch(`${SITE}/${key}.txt`).then((r) => r.text()).catch(() => "");
  if (live.trim() !== key) { console.error(`The key file is not live yet at ${SITE}/${key}.txt. Deploy first, then run this again.`); process.exit(1); }
  const r = await fetch("https://api.indexnow.org/indexnow", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ host: new URL(SITE).host, key, keyLocation: `${SITE}/${key}.txt`, urlList: urls }) });
  console.log(`IndexNow: ${r.status} ${r.statusText} (${urls.length} URLs)`);
  process.exit(r.status === 200 || r.status === 202 ? 0 : 1);
})();
