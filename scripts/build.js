/*
 * Static page generator for weberslink.org SEO pages.
 *
 *   npm run build
 *
 * Reads page content from scripts/content/*.js and writes HTML into public/,
 * plus public/sitemap.xml. Generated files are committed so Hostinger only
 * needs `npm start`.
 */
const fs = require("fs");
const path = require("path");

const SITE = "https://weberslink.org";
const PUBLIC = path.join(__dirname, "..", "public");
const TODAY = new Date().toISOString().slice(0, 10);

const pages = [
  ...require("./content/services"),
  ...require("./content/industries"),
  ...require("./content/guides"),
];
const byPath = Object.fromEntries(pages.map((p) => [p.path, p]));

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const strip = (s) => String(s).replace(/<[^>]+>/g, "");

// ---------- Shared navigation ----------
const SERVICES = pages.filter((p) => p.type === "service");
const INDUSTRIES = pages.filter((p) => p.type === "industry");
const GUIDES = pages.filter((p) => p.type === "guide");

function nav() {
  return `<header class="nav scrolled" id="nav">
  <div class="wrap">
    <a href="/" class="logo"><span class="logo-mark" aria-hidden="true">W</span>WebersLink</a>
    <nav class="nav-links" id="navLinks" aria-label="Main">
      <a href="/services/">Services</a>
      <a href="/industries/">Industries</a>
      <a href="/#work">Work</a>
      <a href="/#pricing">Pricing</a>
      <a href="/blog/">Guides</a>
    </nav>
    <a href="/#book" class="btn btn-light" data-track="Book CTA" data-loc="nav">Book a free call</a>
    <button class="menu-btn" id="menuBtn" aria-label="Open menu" aria-expanded="false"><span></span><span></span></button>
  </div>
</header>`;
}

function footer() {
  const col = (title, list) =>
    `<div class="fcol"><h2>${title}</h2>${list.map((p) => `<a href="${p.path}">${esc(p.card.title)}</a>`).join("")}</div>`;
  return `<footer>
  <div class="wrap">
    <div class="foot-cols">
      <div class="fcol fcol-brand">
        <a href="/" class="logo"><span class="logo-mark" aria-hidden="true">W</span>WebersLink</a>
        <p>Done-for-you lead systems — websites, AI that answers every lead in 60 seconds, and automatic follow-up — for contractors and service businesses in the US &amp; Europe.</p>
        <a href="/#book" class="btn btn-light" data-track="Book CTA" data-loc="footer">Book a free call</a>
      </div>
      ${col("Services", SERVICES)}
      ${col("Industries", INDUSTRIES)}
      ${col("Guides", GUIDES.slice(0, 5))}
    </div>
    <div class="foot-big" aria-hidden="true">WebersLink</div>
    <div class="copy"><span>© <span id="yr">${new Date().getFullYear()}</span> WebersLink · Lahore, Pakistan · Serving clients in the US &amp; Europe</span><span><a href="/privacy">Privacy</a> · <a href="mailto:hassan@weberslink.org">hassan@weberslink.org</a></span></div>
  </div>
</footer>`;
}

function stickyCta() {
  return `<aside aria-label="Quick contact">
<div class="sticky-cta" id="stickyCta">
  <a href="/#book" class="btn btn-light" data-track="Book CTA" data-loc="sticky">Book a free call</a>
  <a href="https://wa.me/message/2MT2JFO63P3LA1" class="btn btn-ghost" data-wa data-track="WhatsApp click" data-loc="sticky" target="_blank" rel="noopener">WhatsApp</a>
</div>
</aside>`;
}

// ---------- Structured data ----------
function schema(p) {
  const url = SITE + p.path;
  const crumbs = [["Home", "/"], ...(p.crumbs || []), [strip(p.card.title), p.path]];
  const graph = [
    {
      "@type": "BreadcrumbList",
      itemListElement: crumbs.map(([name, href], i) => ({ "@type": "ListItem", position: i + 1, name, item: SITE + href })),
    },
  ];
  const org = { "@type": "Organization", name: "WebersLink", url: SITE + "/", logo: SITE + "/apple-touch-icon.png" };
  if (p.type === "service" || p.type === "industry") {
    graph.push({
      "@type": "Service",
      name: p.serviceName || strip(p.card.title),
      description: p.description,
      url,
      provider: org,
      areaServed: ["United States", "Europe", "United Kingdom"],
      ...(p.offerFrom ? { offers: { "@type": "Offer", price: p.offerFrom, priceCurrency: "USD" } } : {}),
    });
  }
  if (p.type === "guide") {
    graph.push({
      "@type": "Article",
      headline: strip(p.h1),
      description: p.description,
      datePublished: p.date,
      dateModified: p.updated || p.date,
      author: org,
      publisher: org,
      mainEntityOfPage: url,
      image: SITE + "/og.png",
    });
  }
  if (p.faqs && p.faqs.length) {
    graph.push({
      "@type": "FAQPage",
      mainEntity: p.faqs.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: strip(a) } })),
    });
  }
  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph }, null, 1);
}

// ---------- Page template ----------
function render(p) {
  const url = SITE + p.path;
  const crumbs = [["Home", "/"], ...(p.crumbs || [])];
  const related = (p.related || []).map((r) => byPath[r]).filter(Boolean);
  const meta = p.type === "guide" ? `<p class="ph-meta">Updated ${new Date(p.updated || p.date).toLocaleDateString("en-US", { month: "long", year: "numeric" })} · ${p.readMins} min read</p>` : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(p.title)}</title>
<meta name="description" content="${esc(p.description)}">
<link rel="canonical" href="${url}">
<meta name="theme-color" content="#0a0a0a">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta property="og:type" content="${p.type === "guide" ? "article" : "website"}">
<meta property="og:site_name" content="WebersLink">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${esc(p.title)}">
<meta property="og:description" content="${esc(p.description)}">
<meta property="og:image" content="${SITE}/og.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(p.title)}">
<meta name="twitter:description" content="${esc(p.description)}">
<meta name="twitter:image" content="${SITE}/og.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400&display=swap" onload="this.onload=null;this.rel='stylesheet'">
<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400&display=swap"></noscript>
<link rel="stylesheet" href="/assets/site.css">
<script type="application/ld+json">
${schema(p)}
</script>
</head>
<body>
${nav()}
<main>
<section class="page-hero">
  <div class="hero-grid" aria-hidden="true"></div>
  <div class="wrap">
    <nav class="crumbs" aria-label="Breadcrumb">${crumbs.map(([n, h]) => `<a href="${h}">${esc(n)}</a>`).join("<span>/</span>")}<span>/</span><span aria-current="page">${esc(strip(p.card.title))}</span></nav>
    <div class="kicker">${esc(p.kicker)}</div>
    <h1>${p.h1}</h1>
    <p class="lead">${p.lead}</p>
    ${meta}
    <div class="hero-cta">
      <a href="/#book" class="btn btn-light" data-track="Book CTA" data-loc="${p.path}">Book a free strategy call →</a>
      <a href="/#audit" class="btn btn-ghost" data-track="Audit CTA" data-loc="${p.path}">Get a free website audit</a>
    </div>
  </div>
</section>

<article class="white page-body">
  <div class="wrap prose-wrap">
    <div class="prose">
${p.body.trim()}
    </div>
    <aside class="side-cta" aria-label="Get started">
      <div class="side-card">
        <p class="side-k">Free for ${p.type === "guide" ? "readers" : "new clients"}</p>
        <h2>Get a free website audit</h2>
        <p>We'll record a short video showing what's costing you enquiries — within 48 hours.</p>
        <a href="/#audit" class="btn btn-light" data-track="Audit CTA" data-loc="sidebar">Get my audit →</a>
        <a href="/#book" class="side-link" data-track="Book CTA" data-loc="sidebar">or book a 20-min call</a>
      </div>
    </aside>
  </div>
</article>
${
  p.faqs && p.faqs.length
    ? `
<section class="light pad-sm">
  <div class="wrap faq-grid">
    <div><div class="kicker">FAQ</div><h2 class="h2">Common <em>questions.</em></h2></div>
    <div class="faq">
${p.faqs.map(([q, a], i) => `      <details${i === 0 ? " open" : ""}><summary>${esc(q)}</summary><p>${a}</p></details>`).join("\n")}
    </div>
  </div>
</section>`
    : ""
}
${
  related.length
    ? `
<section class="white pad-sm">
  <div class="wrap">
    <div class="kicker">Keep reading</div>
    <h2 class="h2" style="margin-bottom:32px">Related <em>${p.type === "guide" ? "guides & services" : "services & guides"}.</em></h2>
    <div class="rel-grid">
${related.map((r) => `      <a class="rel" href="${r.path}"><span class="rel-k">${r.type === "guide" ? "Guide" : r.type === "industry" ? "Industry" : "Service"}</span><h3>${esc(r.card.title)}</h3><p>${esc(r.card.blurb)}</p><span class="rel-go">Read more →</span></a>`).join("\n")}
    </div>
  </div>
</section>`
    : ""
}
<section class="dark pad-sm cta-band">
  <div class="wrap">
    <h2 class="h2">Ready for more <em>booked jobs?</em></h2>
    <p class="sub">Book a free 20-minute call. We'll show you how to answer every lead in 60 seconds — no obligation.</p>
    <div class="hero-cta" style="margin-top:28px">
      <a href="/#book" class="btn btn-light" data-track="Book CTA" data-loc="band">Book a free strategy call →</a>
      <a href="/#pricing" class="btn btn-ghost">See pricing</a>
    </div>
  </div>
</section>
</main>
${footer()}
${stickyCta()}
<script src="/config.js"></script>
<script src="/assets/site.js" defer></script>
</body>
</html>
`;
}

// ---------- Hub pages (/services/, /industries/, /blog/) ----------
function hub({ path: hp, title, description, h1, lead, kicker, items }) {
  const body = `<div class="hub-grid">
${items.map((r) => `<a class="rel" href="${r.path}"><span class="rel-k">${r.type === "guide" ? r.readMins + " min read" : r.type === "industry" ? "Industry" : "Service"}</span><h2>${esc(r.card.title)}</h2><p>${esc(r.card.blurb)}</p><span class="rel-go">${r.type === "guide" ? "Read guide" : "Learn more"} →</span></a>`).join("\n")}
</div>`;
  return render({
    path: hp, type: "hub", title, description, h1, lead, kicker,
    card: { title: kicker },
    body,
  }).replace('<div class="wrap prose-wrap">', '<div class="wrap prose-wrap hub">');
}

// ---------- Write files ----------
function write(urlPath, html) {
  const file = urlPath.endsWith("/") ? path.join(PUBLIC, urlPath, "index.html") : path.join(PUBLIC, urlPath + ".html");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
  return file;
}

pages.forEach((p) => write(p.path, render(p)));
write("/services/", hub({
  path: "/services/", kicker: "Services",
  title: "Web Design, AI Chatbot & SEO Services | WebersLink",
  description: "Website design, AI chatbots, lead automation, SEO and e-commerce for service businesses in the US and Europe. Fixed prices, booked-call focused.",
  h1: "Services built to get you <em>booked clients.</em>",
  lead: "Every service we offer has one job: turn more of your visitors into enquiries, calls and paying clients.",
  items: SERVICES,
}));
write("/industries/", hub({
  path: "/industries/", kicker: "Industries",
  title: "Websites for Contractors & Service Industries | WebersLink",
  description: "Industry-specific websites and AI lead capture for contractors, home builders, home service companies, healthcare suppliers and e-commerce brands.",
  h1: "Websites built for <em>your industry.</em>",
  lead: "We've shipped sites for builders, contractors, manufacturers and retailers — here's how we approach each one.",
  items: INDUSTRIES,
}));
write("/blog/", hub({
  path: "/blog/", kicker: "Guides",
  title: "Website & AI Guides for Small Businesses | WebersLink",
  description: "Practical guides on website costs, AI chatbots, SEO and turning website visitors into booked clients — written for small business owners.",
  h1: "Guides for business owners who want <em>more clients.</em>",
  lead: "Straight answers to the questions we hear on every strategy call — costs, timelines, AI, SEO and what actually converts.",
  items: GUIDES,
}));

// ---------- Shared footer on the homepage ----------
const homeFile = path.join(PUBLIC, "index.html");
const home = fs.readFileSync(homeFile, "utf8");
const updated = home.replace(/<!-- FOOTER -->[\s\S]*?<!-- \/FOOTER -->/, `<!-- FOOTER -->\n${footer()}\n<!-- /FOOTER -->`);
if (updated === home && !home.includes("<!-- FOOTER -->")) console.warn("Homepage footer markers not found.");
fs.writeFileSync(homeFile, updated);

// ---------- Sitemap ----------
const urls = [
  ["/", "1.0"], ["/services/", "0.9"], ["/industries/", "0.8"], ["/blog/", "0.8"],
  ...SERVICES.map((p) => [p.path, "0.9"]),
  ...INDUSTRIES.map((p) => [p.path, "0.8"]),
  ...GUIDES.map((p) => [p.path, "0.7"]),
  ["/privacy", "0.2"],
];
fs.writeFileSync(path.join(PUBLIC, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(([u, pr]) => `  <url><loc>${SITE}${u}</loc><lastmod>${(byPath[u] && (byPath[u].updated || byPath[u].date)) || TODAY}</lastmod><priority>${pr}</priority></url>`).join("\n")}
</urlset>
`);

console.log(`Built ${pages.length + 3} pages and sitemap.xml (${urls.length} URLs).`);
