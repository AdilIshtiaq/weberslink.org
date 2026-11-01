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
  ...require("./content/offers"),
];
const byPath = Object.fromEntries(pages.map((p) => [p.path, p]));
const OFFERS = require("./content/fde");

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const strip = (s) => String(s).replace(/<[^>]+>/g, "");

// ---------- Icons, shared head metadata ----------
const SPRITE = '<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><symbol id="i-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></symbol><symbol id="i-arrow-down" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M6 13l6 6 6-6"/></symbol><symbol id="i-arrow-left" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 6l-6 6 6 6"/></symbol></svg>';
// Turns a trailing text arrow (end of a link, button or span) into an SVG icon. Arrows inside sentences are left alone.
function iconify(html) {
  const map = { "→": "arrow", "↓": "arrow-down", "←": "arrow-left" };
  let n = 0;
  html = html.replace(/\s*([→↓←])\s*(?=<\/(?:a|span|button)>)/g, (m, c) => {
    n++;
    return `<svg class="ico ico-${map[c]}" aria-hidden="true" focusable="false"><use href="#i-${map[c]}"/></svg>`;
  });
  if (n && !html.includes('id="i-arrow"')) html = html.replace(/<body([^>]*)>/, `<body$1>\n${SPRITE}`);
  return html;
}
// hreflang, locale, robots hints, manifest and feed links shared by every generated page.
function headExtra(url, noindex = false) {
  return `<link rel="alternate" hreflang="en" href="${url}">
<link rel="alternate" hreflang="x-default" href="${url}">
<meta name="robots" content="${noindex ? "noindex" : "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"}">
<meta property="og:locale" content="en_US">
<meta property="og:locale:alternate" content="en_GB">
<link rel="manifest" href="/site.webmanifest">
<link rel="alternate" type="application/rss+xml" title="WebersLink guides" href="${SITE}/feed.xml">`;
}
const SKIP = '<a class="skip" href="#main">Skip to content</a>';

// ---------- Shared navigation ----------
const SERVICES = pages.filter((p) => p.type === "service");
const INDUSTRIES = pages.filter((p) => p.type === "industry");
const GUIDES = pages.filter((p) => p.type === "guide");

function nav(cls = "nav scrolled", logoHref = "/") {
  return `<header class="${cls}" id="nav">
  <div class="wrap">
    <a href="${logoHref}" class="logo"><img class="logo-img" src="/assets/logo.png" alt="WebersLink" width="187" height="33"></a>
    <nav class="nav-links" id="navLinks" aria-label="Main">
      <div class="nav-dd"><a href="/offers/" class="dd-t">Offers <i aria-hidden="true"></i></a><div class="dd-menu">${OFFERS.map((o) => `<a href="${o.path}"><b>${o.n}</b>${esc(o.name)}</a>`).join("")}</div></div>
      <a href="/#work">Work</a>
      <a href="/#pricing">Pricing</a>
      <a href="/plugins/">Free resources</a>
      <a href="/blog/">Guides</a>
      <a href="/contact">Contact</a>
    </nav>
    <a href="/#book" class="btn btn-light" data-track="Book CTA" data-loc="nav">Book a walkthrough</a>
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
        <a href="/" class="logo"><img class="logo-img" src="/assets/logo.png" alt="WebersLink" width="187" height="33"></a>
        <p>Forward-deployed engineers for contractors and service businesses in the US &amp; Europe. We build and run your lead system in-house: website, AI replies in 60 seconds, follow-up and reporting.</p>
        <a href="/#book" class="btn btn-light" data-track="Book CTA" data-loc="footer">Book a walkthrough</a>
      </div>
      ${col("Offers", OFFERS)}
      ${col("Services", SERVICES)}
      ${col("Industries", INDUSTRIES)}
      ${col("Guides", GUIDES.slice(0, 5))}
    </div>
    <div class="foot-big" aria-hidden="true">WebersLink</div>
    <div class="copy"><span>© <span id="yr">${new Date().getFullYear()}</span> WebersLink · Lahore, Pakistan · Serving clients in the US &amp; Europe</span><span><a href="/plugins/">Plugins</a> · <a href="/privacy">Privacy</a> · <a href="mailto:hassan@weberslink.org">hassan@weberslink.org</a></span></div>
  </div>
</footer>`;
}

function stickyCta() {
  return `<aside aria-label="Quick contact">
<div class="sticky-cta" id="stickyCta">
  <a href="/#book" class="btn btn-light" data-track="Book CTA" data-loc="sticky">Book a walkthrough</a>
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
      image: SITE + "/og-fde.jpg",
    });
  }
  if (p.software) {
    graph.push({
      "@type": "SoftwareApplication",
      name: p.software.name,
      description: p.description,
      applicationCategory: "BusinessApplication",
      operatingSystem: "WordPress 5.8+",
      softwareVersion: p.software.version,
      downloadUrl: SITE + p.software.download,
      fileSize: p.software.size,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      publisher: org,
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
${headExtra(url)}
<meta name="theme-color" content="#090807">
<link rel="icon" href="/favicon.ico" sizes="any"><link rel="icon" href="/favicon-48.png" type="image/png" sizes="48x48"><link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta property="og:type" content="${p.type === "guide" ? "article" : "website"}">
<meta property="og:site_name" content="WebersLink">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${esc(p.title)}">
<meta property="og:description" content="${esc(p.description)}">
<meta property="og:image" content="${SITE}/og-fde.jpg">
<meta property="og:image:secure_url" content="${SITE}/og-fde.jpg">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="WebersLink: forward-deployed engineers for contractors and service businesses">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(p.title)}">
<meta name="twitter:description" content="${esc(p.description)}">
<meta name="twitter:image" content="${SITE}/og-fde.jpg">
<meta name="twitter:image:alt" content="WebersLink: forward-deployed engineers for contractors and service businesses">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Archivo:ital,wdth,wght@0,62..125,500..900;1,62..125,500..900&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400&display=swap" onload="this.onload=null;this.rel='stylesheet'">
<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:ital,wdth,wght@0,62..125,500..900;1,62..125,500..900&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400&display=swap"></noscript>
<link rel="stylesheet" href="/assets/site.css">
<script type="application/ld+json">
${schema(p)}
</script>
</head>
<body>
${SKIP}
${nav()}
<main id="main">
<section class="page-hero">
  <div class="hero-grid" aria-hidden="true"></div>
  <div class="wrap">
    <nav class="crumbs" aria-label="Breadcrumb">${crumbs.map(([n, h]) => `<a href="${h}">${esc(n)}</a>`).join("<span>/</span>")}<span>/</span><span aria-current="page">${esc(strip(p.card.title))}</span></nav>
    <div class="kicker">${esc(p.kicker)}</div>
    <h1>${p.h1}</h1>
    <p class="lead">${p.lead}</p>
    ${meta}
    ${p.heroCta || `<div class="hero-cta">
      <a href="/#book" class="btn btn-light" data-track="Book CTA" data-loc="${p.path}">Book a walkthrough →</a>
      <a href="/#audit" class="btn btn-ghost" data-track="Audit CTA" data-loc="${p.path}">Get a free website audit</a>
    </div>`}
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
    <div class="kicker">Next step</div>
    <h2 class="h2">Ready for more <em>booked jobs?</em></h2>
    <p class="sub">Book a free 20-minute walkthrough. We'll show you how to answer every lead in 60 seconds — no obligation.</p>
    <div class="hero-cta" style="margin-top:28px">
      <a href="/#book" class="btn btn-light" data-track="Book CTA" data-loc="band">Book a walkthrough →</a>
      <a href="/#pricing" class="btn btn-ghost">See pricing</a>
    </div>
  </div>
</section>
</main>
${footer()}
${stickyCta()}
<script src="/config.js"></script>
<script src="/assets/site.js" defer></script>
<script src="/assets/chat-widget.js" defer></script>
</body>
</html>
`;
}

// ---------- FDE offer pages (full-width sections) ----------
function pageShell(p, main) {
  const url = SITE + p.path;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(p.title)}</title>
<meta name="description" content="${esc(p.description)}">
<link rel="canonical" href="${url}">
${headExtra(url, p.noindex)}
<meta name="theme-color" content="#090807">
<link rel="icon" href="/favicon.ico" sizes="any"><link rel="icon" href="/favicon-48.png" type="image/png" sizes="48x48"><link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta property="og:type" content="website">
<meta property="og:site_name" content="WebersLink">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${esc(p.title)}">
<meta property="og:description" content="${esc(p.description)}">
<meta property="og:image" content="${SITE}/og-fde.jpg">
<meta property="og:image:secure_url" content="${SITE}/og-fde.jpg">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="WebersLink: forward-deployed engineers for contractors and service businesses">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(p.title)}">
<meta name="twitter:description" content="${esc(p.description)}">
<meta name="twitter:image" content="${SITE}/og-fde.jpg">
<meta name="twitter:image:alt" content="WebersLink: forward-deployed engineers for contractors and service businesses">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Archivo:ital,wdth,wght@0,62..125,500..900;1,62..125,500..900&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400&display=swap" onload="this.onload=null;this.rel='stylesheet'">
<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:ital,wdth,wght@0,62..125,500..900;1,62..125,500..900&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400&display=swap"></noscript>
<link rel="stylesheet" href="/assets/site.css">
<script type="application/ld+json">
${schema(p)}
</script>
</head>
<body>
${SKIP}
${nav()}
<main id="main">
${main}
</main>
${footer()}
${stickyCta()}
<script src="/config.js"></script>
<script src="/assets/site.js" defer></script>
<script src="/assets/chat-widget.js" defer></script>
</body>
</html>
`;
}

const ctaBand = (loc, h2, sub) => `<section class="dark pad cta-band final-cta">
  <div class="wrap">
    <div class="kicker">Next step</div>
    <h2 class="h2">${h2}</h2>
    <p class="sub">${sub}</p>
    <div class="hero-cta" style="margin-top:28px">
      <a href="/#book" class="btn btn-light" data-track="Book CTA" data-loc="${loc}">Book a walkthrough →</a>
      <a href="mailto:hassan@weberslink.org" class="btn btn-ghost" data-track="Email CTA" data-loc="${loc}">Or email us directly</a>
    </div>
  </div>
</section>`;

function renderOffer(o) {
  const p = { ...o, type: "service", serviceName: o.name, crumbs: [["Offers", "/offers/"]] };
  const others = OFFERS.filter((x) => x.path !== o.path).slice(0, 3);
  const main = `<section class="page-hero offer-hero">
  <div class="hero-grid" aria-hidden="true"></div>
  <div class="wrap">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><a href="/offers/">Offers</a><span>/</span><span aria-current="page">${esc(o.name)}</span></nav>
    <div class="kicker">${esc(o.for)}</div>
    <h1>${o.h1}</h1>
    <p class="lead">${o.lead}</p>
    <div class="hero-cta">
      <a href="/#book" class="btn btn-light" data-track="Book CTA" data-loc="${o.path}">Book a walkthrough →</a>
      <a href="/#audit" class="btn btn-ghost" data-track="Audit CTA" data-loc="${o.path}">Get a free website audit</a>
    </div>
    <p class="cta-note">${esc(o.price)} · ${esc(o.timeline || "Live in 2–3 weeks")}</p>
  </div>
</section>

<section class="dark pad" id="pain">
  <div class="wrap">
    <div class="kicker">The cost of waiting</div>
    <h2 class="h2">Four ways this <em>leaks money.</em></h2>
    <div class="pain-grid">
${o.pains.map((x, i) => `      <div class="pain"><span class="pain-n">PAIN/0${i + 1}</span><h3>${esc(x[0])}</h3><p>${esc(x[1])}</p></div>`).join("\n")}
    </div>
  </div>
</section>

<section class="light pad" id="system">
  <div class="wrap sys-grid">
    <div>
      <div class="kicker">${esc(o.promise.eyebrow)}</div>
      <h2 class="h2">${esc(o.promise.title)}<em>.</em></h2>
      <p class="sub">${esc(o.promise.line)}</p>
    </div>
    <div class="mock" role="img" aria-label="Illustration of the ${esc(o.name)} with sample data">
      <div class="mock-bar"><i></i><i></i><i></i><span>${esc(o.mock.title)}</span><b>LIVE</b></div>
      <div class="mock-rows">
${o.mock.rows.map((r) => `        <div class="mock-row"><span class="mock-src">${esc(r[0])}</span><span class="mock-what">${esc(r[1])}</span><span class="mock-res">${esc(r[2])}</span></div>`).join("\n")}
      </div>
      <p class="mock-note">Illustration with sample data.</p>
    </div>
  </div>
</section>

<section class="white pad" id="inside">
  <div class="wrap">
    <div class="kicker">${esc(o.featuresTitle)}</div>
    <h2 class="h2">Built in-house. <em>Connected to what you use.</em></h2>
    <div class="feat-grid">
${o.features.map((x, i) => `      <div class="feat"><span class="feat-n">${String(i + 1).padStart(2, "0")}</span><h3>${esc(x[0])}</h3><p>${esc(x[1])}</p></div>`).join("\n")}
    </div>
  </div>
</section>

${proofSection(o.proofStats)}

<section class="dark pad" id="process">
  <div class="wrap">
    <div class="kicker">How it works</div>
    <h2 class="h2">${o.processTitle || "Live in 2–3 weeks. <em>Watched every month after.</em>"}</h2>
    <div class="steps">
${o.steps.map((x, i) => `      <div class="step"><span class="step-n">0${i + 1}</span><h3>${esc(x[0])}</h3><p>${esc(x[1])}</p></div>`).join("\n")}
    </div>
    <div class="guarantee"><strong>${esc(o.guarantee.lead)}</strong> ${esc(o.guarantee.text)}</div>
  </div>
</section>

<section class="light pad-sm">
  <div class="wrap faq-grid">
    <div><div class="kicker">FAQ</div><h2 class="h2">Common <em>questions.</em></h2></div>
    <div class="faq">
${o.faqs.map(([q, a], i) => `      <details${i === 0 ? " open" : ""}><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("\n")}
    </div>
  </div>
</section>

<section class="white pad-sm">
  <div class="wrap">
    <div class="kicker">More systems</div>
    <h2 class="h2" style="margin-bottom:32px">Other things we <em>build and run.</em></h2>
    <div class="rel-grid">
${others.map((r) => `      <a class="rel" href="${r.path}"><span class="rel-k">SYS/${r.n}</span><h3>${esc(r.name)}</h3><p>${esc(r.card.blurb)}</p><span class="rel-go">See the system →</span></a>`).join("\n")}
    </div>
  </div>
</section>

${ctaBand(o.path, "Want this running on <em>your</em> leads?", "A 20-minute call about how your leads get handled today. You leave with a clear plan and a fixed price.")}`;
  return pageShell(p, main);
}

// Real, already-published facts only (see pricing, hero and process copy on the home page).
function proofSection(keys = ["sites", "reply", "weeks", "response"]) {
  const all = {
    sites: ["50", "+", "websites shipped"],
    reply: ["60", "s", "target reply time, every channel, day or night"],
    weeks: ["2–3", "", "weeks, typical time to go live"],
    response: ["24", "h", "reply to every message"],
  };
  // The 60s and 2–3 week figures describe the Lead System, so newer offers show only the two general ones.
  const stats = keys.map((k) => all[k]);
  return `<section class="light pad-sm proof" id="proof">
  <div class="wrap">
    <div class="kicker">The numbers we stand behind</div>
    <div class="proof-row" style="grid-template-columns:repeat(${stats.length},1fr)">
${stats.map((s) => `      <div class="stat"><b class="stat-n"${/^\d+$/.test(s[0]) ? ` data-count="${s[0]}" data-suffix="${s[1]}"` : ""}>${s[0]}${s[1]}</b><span>${s[2]}</span></div>`).join("\n")}
    </div>
    <p class="proof-note">From our own client work and service terms.</p>
  </div>
</section>`;
}

function offersHub() {
  const card = (o) => `      <a class="offer-card" href="${o.path}"><span class="offer-n">SYS/${o.n}</span><h2>${esc(o.name)}</h2><p class="offer-for">${esc(o.for)}</p><p>${esc(o.cardLine)}</p><ul>${o.cardPoints.map((t) => `<li>${esc(t)}</li>`).join("")}</ul><span class="offer-price">${esc(o.price)}</span><span class="rel-go">See the system →</span></a>`;
  const core = OFFERS.slice(0, 3), more = OFFERS.slice(3);
  const main = `<section class="page-hero offer-hero">
  <div class="hero-grid" aria-hidden="true"></div>
  <div class="wrap">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><span aria-current="page">Offers</span></nav>
    <div class="kicker">Offers</div>
    <h1>Systems we build and run. <em>One team behind all of them.</em></h1>
    <p class="lead">Each system is built in-house, connected to the tools you already use, and reviewed after launch. Start with the one that fixes your biggest leak.</p>
  </div>
</section>
<section class="dark pad">
  <div class="wrap">
    <div class="kicker">Core systems</div>
    <h2 class="h2" style="margin-bottom:40px">Lead systems for <em>service businesses.</em></h2>
    <div class="offer-cards">
${core.map(card).join("\n")}
    </div>
  </div>
</section>
<section class="dark pad" style="padding-top:0">
  <div class="wrap">
    <div class="kicker">And more</div>
    <h2 class="h2" style="margin-bottom:40px">Built on top, <em>when you're ready.</em></h2>
    <div class="offer-cards two">
${more.map(card).join("\n")}
    </div>
  </div>
</section>
${ctaBand("offers-hub", "Not sure which one <em>fits?</em>", "Book a 20-minute walkthrough. We'll recommend the right setup and give you a fixed price.")}`;
  return pageShell({
    path: "/offers/", type: "hub", title: "FDE Systems for Contractors & Service Businesses | WebersLink",
    description: "Forward-deployed engineers who build and run your systems in-house: lead response, follow-up, local growth, AI workflow agents, knowledge assistants, team rollout and document automation.",
    card: { title: "Offers" }, crumbs: [],
  }, main);
}

function contactPage() {
  const main = `<section class="page-hero offer-hero">
  <div class="hero-grid" aria-hidden="true"></div>
  <div class="wrap">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><span aria-current="page">Contact</span></nav>
    <div class="kicker">Contact</div>
    <h1>Fastest route: <em>a walkthrough.</em></h1>
    <p class="lead">Twenty minutes, free. Bring how your leads get handled today and leave with a clear plan and a fixed setup price.</p>
  </div>
</section>
<section class="dark pad">
  <div class="wrap">
    <div class="contact-cards">
      <a class="contact-card primary" href="/#book" data-track="Book CTA" data-loc="contact"><span class="offer-n">01 · Walkthrough</span><h2>Book a walkthrough</h2><p>20 minutes about your services, your area and how leads are handled today. We usually reply within 24 hours.</p><span class="rel-go">Pick a time →</span></a>
      <a class="contact-card" href="mailto:hassan@weberslink.org" data-track="Email CTA" data-loc="contact"><span class="offer-n">02 · Email</span><h2>Email us directly</h2><p>Describe what's breaking in one paragraph. hassan@weberslink.org</p><span class="rel-go">Write to us →</span></a>
      <a class="contact-card" href="https://wa.me/message/2MT2JFO63P3LA1" data-wa data-track="WhatsApp click" data-loc="contact" target="_blank" rel="noopener"><span class="offer-n">03 · WhatsApp</span><h2>Message on WhatsApp</h2><p>Quick question? Send it there. We reply within 24 hours.</p><span class="rel-go">Open WhatsApp →</span></a>
      <a class="contact-card" href="/#audit" data-track="Audit CTA" data-loc="contact"><span class="offer-n">04 · Free audit</span><h2>Get a free website audit</h2><p>We'll record a short video showing what's costing you enquiries, within 48 hours.</p><span class="rel-go">Request the audit →</span></a>
    </div>
    <p class="contact-note">Based in Lahore, Pakistan · Serving clients in the US &amp; Europe · Calls scheduled in your time zone.</p>
  </div>
</section>`;
  return pageShell({
    path: "/contact", type: "hub", title: "Contact WebersLink: Book a Walkthrough",
    description: "Book a free 20-minute walkthrough, email, or message WebersLink on WhatsApp. We reply within 24 hours.",
    card: { title: "Contact" }, crumbs: [],
  }, main);
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
  fs.writeFileSync(file, iconify(html));
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

// ---------- Plugins (/plugins/ and /plugins/<slug>) ----------
const PLUGIN_DIR = path.join(__dirname, "..", "wordpress-plugin", "weberslink-forms-pro");
const PLUGIN_ZIP = "/downloads/weberslink-forms-pro.zip";
const pluginVersion = (fs.readFileSync(path.join(PLUGIN_DIR, "weberslink-forms-pro.php"), "utf8").match(/^\s*\*\s*Version:\s*([\d.]+)/m) || [])[1] || "1.0.0";
const zipFile = path.join(PUBLIC, PLUGIN_ZIP);
const zipBytes = fs.existsSync(zipFile) ? fs.statSync(zipFile).size : 0;
const zipSize = zipBytes ? (zipBytes < 1048576 ? Math.round(zipBytes / 1024) + " KB" : (zipBytes / 1048576).toFixed(1) + " MB") : "";
const SOFTWARE = { name: "Weberslink Forms Pro", version: pluginVersion, download: PLUGIN_ZIP, size: zipSize };

// Changelog comes straight from the plugin's readme.txt so the site never drifts from the release.
const readmeTxt = fs.readFileSync(path.join(PLUGIN_DIR, "readme.txt"), "utf8");
const changelog = [];
{
  const sec = (readmeTxt.split(/==\s*Changelog\s*==/)[1] || "").trim();
  sec.split(/^=\s*([\d.]+)\s*=\s*$/m).slice(1).reduce((acc, part, i, arr) => {
    if (i % 2 === 0) changelog.push({ version: part, items: (arr[i + 1] || "").split("\n").map((l) => l.replace(/^\*\s*/, "").trim()).filter((l) => l && !l.startsWith("=")) });
    return acc;
  }, null);
}
const HIGHLIGHTS = {
  "1.4.0": ["Live appointment slots with calendar invites", "Entry workflow stages & assignment", "Excel export & branded emails", "REST API with keys", "Auto-retry for failed webhooks"],
};
const newBadge = HIGHLIGHTS[pluginVersion] ? `<p class="plugin-new"><strong>New in v${pluginVersion}:</strong> ${HIGHLIGHTS[pluginVersion].map(esc).join(" · ")}</p>` : "";
const changelogHtml = changelog.slice(0, 4).map((c) => `<h3>Version ${esc(c.version)}</h3>\n<ul>\n${c.items.map((i) => `  <li>${esc(i)}</li>`).join("\n")}\n</ul>`).join("\n");

const pluginFaqs = [
  ["Is Weberslink Forms Pro free?", "Yes. The download is free and licensed under the GPL, so you can use it on as many of your own WordPress sites as you like."],
  ["Will it look right on my theme?", "Yes. Forms inherit your theme's fonts and text colour, use translucent borders that read on light and dark backgrounds, and ship with six style presets plus per-form colour and custom CSS."],
  ["Which WordPress and PHP versions does it need?", "WordPress 5.8 or newer and PHP 7.4 or newer. It works with classic themes, block themes, Elementor and other page builders through a shortcode, a Gutenberg block, a widget and an Elementor widget."],
  ["How do I install it?", "In your WordPress admin go to Plugins → Add New → Upload Plugin, choose the ZIP you downloaded, install and activate. Then open Weberslink Forms → Add new and pick a template."],
  ["Can it take payments?", "Yes: Stripe Checkout (including subscriptions) and PayPal, with products, quantities, coupons and tax. Totals are always calculated on the server. You add your own Stripe or PayPal keys in the plugin settings."],
  ["Can visitors book appointments?", "Yes. The appointment-slots field lets people pick a date and a free time. You set opening hours, slot length, how many bookings per slot, closed weekdays, blocked dates and minimum notice. Booked times disappear for everyone else, and the confirmation email can include a calendar invite (.ics)."],
  ["Can I connect it to my own tools?", "Yes. Use signed webhooks (Zapier, Make, n8n, Google Sheets via Apps Script), Slack, Discord, Teams, Telegram or Mailchimp, export entries to Excel or CSV, or read forms and entries through the REST API with revocable API keys. Failed webhooks retry automatically."],
  ["Where is my data stored?", "In your own WordPress database. Nothing is sent to us. You can anonymise or disable IP storage, auto-delete old entries, and the plugin hooks into WordPress's personal-data export and erase tools for GDPR requests."],
];



// ---------- Screen-by-screen workflow (screenshots rendered from the plugins' real admin and front-end UI) ----------
const SHOT_DIMS = JSON.parse(fs.readFileSync(path.join(__dirname, "shots.json"), "utf8"));
// phases: [name, blurb]; steps: [id, tab label, title, text, phase index, address-bar text]
const workflow = (heading, intro, phases, steps) => {
  const firstOf = phases.map((_, pi) => steps.findIndex((st) => st[4] === pi));
  return `<h2>${heading}</h2>
<p>${intro}</p>
<section class="wf" data-wf aria-label="${esc(heading)}">
  <ol class="wf-phases">
${phases.map((ph, pi) => `    <li><button type="button" class="wf-phase-btn" data-go="${firstOf[pi]}" data-phase="${pi}"><span class="wf-pn">${pi + 1}</span><span><strong>${esc(ph[0])}</strong><em>${esc(ph[1])}</em></span></button></li>`).join("\n")}
  </ol>
  <div class="wf-tabs" role="tablist" aria-label="Screens">
${steps.map((st, i) => `    <button type="button" class="wf-tab" role="tab" data-i="${i}" data-phase="${st[4]}"><span class="wf-n">${i + 1}</span>${esc(st[1])}</button>`).join("\n")}
  </div>
  <div class="wf-stage">
${steps.map((st, i) => { const d = SHOT_DIMS[st[0]]; return `    <figure class="wf-step${d[0] < 1000 ? " wf-narrow" : ""}" data-i="${i}" data-phase="${st[4]}">
      <div class="wf-frame"><div class="wf-bar"><i></i><i></i><i></i><span class="wf-url">${esc(st[5])}</span></div><a href="/assets/plugins/${st[0]}.webp" target="_blank" rel="noopener" title="Open full size"><img src="/assets/plugins/${st[0]}.webp" width="${d[0]}" height="${d[1]}" alt="${esc(st[2])}" loading="lazy"></a></div>
      <figcaption><span class="wf-kick">Step ${i + 1} · ${esc(phases[st[4]][0])}</span><strong>${esc(st[2])}</strong><span>${esc(st[3])}</span></figcaption>
    </figure>`; }).join("\n")}
  </div>
  <div class="wf-ctrl" hidden><button type="button" class="wf-arrow" data-dir="-1" aria-label="Previous screen">←</button><div class="wf-prog" aria-hidden="true"><span></span></div><span class="wf-count" aria-live="polite"></span><button type="button" class="wf-arrow" data-dir="1" aria-label="Next screen">→</button></div>
</section>`;
};
const FORMS_SHOTS = workflow("See how it works, screen by screen", "From a blank form to money and entries in your inbox. Pick a step, or let it play. Click a screen to open it full size.",
  [["Build", "Drag in fields, set the rules"], ["Connect", "Emails, tools and payments"], ["Go live", "What your visitors get"]],
  [
    ["forms-1-builder", "Build", "Build the form", "Click or drag any of 50 field types into the canvas. Put fields side by side (half or third width) and reorder with the arrows or by dragging.", 0, "yoursite.com/wp-admin · Weberslink Forms"],
    ["forms-2-field-logic", "Field rules", "Fine-tune each field", "Set label, placeholder, width and options. Conditional logic shows or hides a field from earlier answers: here the phone number only appears when the visitor prefers a call.", 0, "yoursite.com/wp-admin · Form builder"],
    ["forms-3-emails", "Emails", "Send the right emails", "Unlimited notifications and auto-responders with merge tags like {field:name}, optional PDF attachment, and a “send only if” rule per email.", 1, "yoursite.com/wp-admin · Emails"],
    ["forms-4-integrations", "Integrations", "Connect your tools", "Signed webhooks with automatic retries (Zapier, Make, n8n, Google Sheets), Slack, Mailchimp and more run after every submission.", 1, "yoursite.com/wp-admin · Integrations"],
    ["forms-5-payments", "Payments", "Take payments", "Add product fields, then choose Stripe Checkout, PayPal or offline. Set currency, tax and coupons, and run emails only after payment succeeds.", 1, "yoursite.com/wp-admin · Payments"],
    ["forms-6-settings", "Settings", "Control the details", "Confirmation message or redirect, button text, multi-step, styling, entry limits and schedule, spam protection and more.", 1, "yoursite.com/wp-admin · Settings"],
    ["forms-7-form-step1", "Visitor form", "Visitors fill it in", "A clean, theme-proof front end with a progress bar, inline validation, live calculations and fields that appear only when needed.", 2, "yoursite.com/request-a-quote"],
    ["forms-8-form-payment", "Checkout", "Pay as part of the form", "Package choice, tax and total update live before the visitor submits.", 2, "yoursite.com/request-a-quote"],
    ["forms-9-conv-welcome", "Conversational", "Or one question at a time", "Conversational mode turns any form into a full-screen, one-question-per-slide flow with an optional welcome screen.", 2, "yoursite.com/quote"],
    ["forms-10-conv-question", "Keyboard flow", "Fast to answer", "Enter moves to the next question, a progress bar shows how far along the visitor is, and conditional questions are skipped automatically.", 2, "yoursite.com/quote"],
    ["forms-11-booking", "Bookings", "Take bookings", "The slot picker shows only open times, respects capacity and closed days, and sends a calendar invite with the confirmation.", 2, "yoursite.com/book"],
  ]);
const SMTP_SHOTS = workflow("See how it works, screen by screen", "From connecting a provider to knowing every email arrived. Pick a step, or let it play. Click a screen to open it full size.",
  [["Connect", "Provider, backup and routing"], ["Send & track", "Log, preview, resend"], ["Protect", "Alerts and deliverability"]],
  [
    ["smtp-3-settings", "Provider", "Connect your provider", "Pick SMTP with one-click presets, or send over the SendGrid, Brevo, Mailgun or Postmark API. Passwords and keys are stored encrypted.", 0, "yoursite.com/wp-admin · Mail settings"],
    ["smtp-4-backup", "Backup", "Add a backup connection", "If the primary connection fails, the email is re-sent through the backup straight away and the log shows which one delivered it.", 0, "yoursite.com/wp-admin · Mail settings"],
    ["smtp-5-routing", "Routing", "Route emails smartly", "Send some emails another way, for example shop receipts through a transactional service, based on plugin, subject, recipient domain or sender.", 0, "yoursite.com/wp-admin · Mail settings"],
    ["smtp-1-log", "Email log", "See every email", "Status, recipient, subject, the plugin or theme that sent it, how it was delivered and opens/clicks, with a 14-day sent and failed chart.", 1, "yoursite.com/wp-admin · Email log"],
    ["smtp-2-email", "Preview", "Preview and resend", "A safe, sandboxed preview of exactly what was sent, with full details and one-click resend.", 1, "yoursite.com/wp-admin · Email log"],
    ["smtp-6-controls", "Alerts", "Get alerts and reports", "Slack or Discord failure alerts, a weekly summary email, and switches to turn off WordPress notification emails you do not want.", 2, "yoursite.com/wp-admin · Mail settings"],
    ["smtp-7-tools", "Test & check", "Test and check deliverability", "Send a test through the primary or backup connection and see the SMTP conversation with credentials hidden, then check SPF, DKIM and DMARC with plain-English advice.", 2, "yoursite.com/wp-admin · Tools"],
  ]);

// ---------- Second plugin: Weberslink SMTP & Email Log ----------
const SMTP_DIR = path.join(__dirname, "..", "wordpress-plugin", "weberslink-smtp");
const SMTP_ZIP = "/downloads/weberslink-smtp.zip";
const smtpVersion = (fs.readFileSync(path.join(SMTP_DIR, "weberslink-smtp.php"), "utf8").match(/^\s*\*\s*Version:\s*([\d.]+)/m) || [])[1] || "1.0.0";
const smtpZipFile = path.join(PUBLIC, SMTP_ZIP);
const smtpBytes = fs.existsSync(smtpZipFile) ? fs.statSync(smtpZipFile).size : 0;
const smtpSize = smtpBytes ? (smtpBytes < 1048576 ? Math.round(smtpBytes / 1024) + " KB" : (smtpBytes / 1048576).toFixed(1) + " MB") : "";
const SMTP_SOFTWARE = { name: "Weberslink SMTP & Email Log", version: smtpVersion, download: SMTP_ZIP, size: smtpSize };
const smtpChangelog = [];
{
  const sec = (fs.readFileSync(path.join(SMTP_DIR, "readme.txt"), "utf8").split(/==\s*Changelog\s*==/)[1] || "").trim();
  sec.split(/^=\s*([\d.]+)\s*=\s*$/m).slice(1).forEach((part, i, arr) => {
    if (i % 2 === 0) smtpChangelog.push({ version: part, items: (arr[i + 1] || "").split("\n").map((l) => l.replace(/^\*\s*/, "").trim()).filter((l) => l && !l.startsWith("=")) });
  });
}
const smtpFaqs = [
  ["Is Weberslink SMTP & Email Log free?", "Yes. It is a free download under the GPL and works on as many of your own WordPress sites as you like."],
  ["Which email providers does it support?", "Any SMTP server, with one-click presets for Gmail / Google Workspace, Microsoft 365, SendGrid, Mailgun, Amazon SES, Brevo, Postmark, Zoho and Mailtrap. If your host blocks SMTP ports you can instead send over HTTPS through the SendGrid, Brevo, Mailgun or Postmark API."],
  ["Is my SMTP password safe?", "It is stored encrypted using libsodium with keys derived from your site's secret salts, and it is never shown again after saving. For the strongest setup, define the password as a constant in wp-config.php and nothing is stored in the database."],
  ["Does it store the content of my emails?", "You choose: everything (enables preview, resend and retries), recipients and subject only, or nothing. Password-reset keys and one-time tokens are replaced with [redacted] in stored messages, and old entries are deleted automatically after the number of days you set."],
  ["What happens when an email fails?", "The failure is logged with the exact error, the email is retried automatically (after 5 minutes, 30 minutes and 2 hours), you see a warning in the dashboard, and an alert can be sent to Slack or Discord."],
  ["What is the backup connection?", "A second connection (SMTP or an API) that takes over instantly when the primary one fails, so a provider outage does not lose email. Each email that fails over is re-sent once and the log shows which connection delivered it."],
  ["Is open and click tracking on by default?", "No. It is opt-in, signed so links cannot be abused as open redirects, and never touches emails with login or password-reset links. Tell your recipients if you enable it."],
  ["Which WordPress and PHP versions does it need?", "WordPress 5.9 or newer and PHP 7.4 or newer."],
];
const smtpCard = (loc) => `<div class="plugin-card">
  <div class="plugin-head"><span class="plugin-badge">WordPress plugin</span><span class="plugin-ver">v${smtpVersion}${smtpSize ? " · " + smtpSize : ""} · Free download</span></div>
  <h2>Weberslink SMTP &amp; Email Log</h2>
  <p>Make WordPress email reliable and visible: send through any SMTP provider, keep a searchable log of every email with preview and resend, retry failures and check your SPF, DKIM and DMARC.</p>
  <ul class="plugin-feats">
    <li>SMTP presets + SendGrid, Brevo, Mailgun &amp; Postmark APIs</li>
    <li>Backup connection with automatic failover</li>
    <li>Smart routing rules per plugin, subject or domain</li>
    <li>Searchable log, safe preview, resend &amp; retries</li>
    <li>Open &amp; click tracking (opt-in), weekly report</li>
    <li>Switch off WordPress notification emails</li>
    <li>SPF, DKIM &amp; DMARC deliverability check</li>
  </ul>
  <div class="plugin-actions">
    <a class="btn btn-dark" href="${SMTP_ZIP}" download data-track="Plugin download" data-loc="${loc}-smtp">Download ZIP ↓</a>
    <a class="btn btn-outline" href="/plugins/weberslink-smtp" data-track="Plugin details" data-loc="${loc}-smtp">Features &amp; install guide →</a>
  </div>
</div>`;

const pluginCard = (loc) => `<div class="plugin-card">
  <div class="plugin-head"><span class="plugin-badge">WordPress plugin</span><span class="plugin-ver">v${pluginVersion}${zipSize ? " · " + zipSize : ""} · Free download</span></div>
  <h2>Weberslink Forms Pro</h2>
  <p>A complete drag-and-drop form builder: 50 field types, multi-step and conversational forms, conditional logic, payments, file uploads, PDFs, spam protection and integrations — styled to blend into any theme.</p>
  <ul class="plugin-feats">
    <li>35+ ready-made templates</li>
    <li>Stripe, PayPal &amp; subscriptions</li>
    <li>Save &amp; resume by email link</li>
    <li>Seat / stock limits per option</li>
    <li>Live appointment booking with calendar invites</li>
    <li>Entry workflow, assignment &amp; Excel export</li>
    <li>Quizzes, calculations &amp; reports</li>
    <li>REST API, webhooks, Slack, Mailchimp &amp; more</li>
  </ul>
  ${newBadge}
  <div class="plugin-actions">
    <a class="btn btn-dark" href="${PLUGIN_ZIP}" download data-track="Plugin download" data-loc="${loc}">Download ZIP ↓</a>
    <a class="btn btn-outline" href="/plugins/weberslink-forms-pro" data-track="Plugin details" data-loc="${loc}">Features &amp; install guide →</a>
  </div>
</div>`;


// ---------- More plugins (data-driven): Redirects & 404 Monitor, Security Shield ----------
const readChangelog = (dir) => {
  const out = [];
  const sec = (fs.readFileSync(path.join(__dirname, "..", "wordpress-plugin", dir, "readme.txt"), "utf8").split(/==\s*Changelog\s*==/)[1] || "").trim();
  sec.split(/^=\s*([\d.]+)\s*=\s*$/m).forEach((part, i, arr) => {
    if (i % 2 === 1) out.push({ version: part, items: (arr[i + 1] || "").split("\n").map((l) => l.replace(/^\*\s*/, "").trim()).filter(Boolean) });
  });
  return out;
};
const pluginVer = (dir, file) => (fs.readFileSync(path.join(__dirname, "..", "wordpress-plugin", dir, file), "utf8").match(/^\s*\*\s*Version:\s*([\d.]+)/m) || [])[1] || "1.0.0";
const extraZipSize = (zip) => { const f = path.join(PUBLIC, zip); if (!fs.existsSync(f)) return ""; const b = fs.statSync(f).size; return b < 1048576 ? Math.round(b / 1024) + " KB" : (b / 1048576).toFixed(1) + " MB"; };
const EXTRA = [
  {
    slug: "weberslink-redirects", dir: "weberslink-redirects", file: "weberslink-redirects.php", name: "Weberslink Redirects & 404 Monitor", short: "Redirects & 404 Monitor", menu: "Redirects",
    title: "Weberslink Redirects & 404 Monitor: Free WordPress Redirect Plugin | WebersLink",
    description: "Download Weberslink Redirects & 404 Monitor: a free WordPress plugin for 301 redirects (exact, folder or regex), a 404 monitor with smart suggestions, automatic redirects when a URL changes, a URL tester and CSV import/export.",
    h1: "Weberslink Redirects &amp; 404 Monitor — <em>never lose a visitor to a dead link.</em>",
    lead: "Fix broken links in one click, keep SEO value when pages move, and see exactly where every address goes.",
    cardText: "Keep every old link working: 301/302/410 redirects (exact, folder or regex), a 404 monitor that suggests the right page, and automatic redirects when a post URL changes.",
    feats: ["Exact, folder & regex redirects", "404 monitor with smart suggestions", "Auto-redirect when a URL changes", "Test any URL, spot loops & chains", "CSV import and export", "Hit counts, bulk edit, 410 Gone"],
    inside: [
      ["Every kind of redirect", "301, 302, 303, 307, 308 plus 410 Gone and 451 for removed content. Match an exact URL, a whole folder (/blog/x → /news/{rest}) or a regular expression with $1, $2 in the target. Choose what happens to the query string."],
      ["404 monitor with smart suggestions", "See the addresses visitors asked for that do not exist, most requested first, with the page that linked to them. The plugin finds the closest published page (typos, renamed slugs) so one click fixes it. Bots and image requests are ignored."],
      ["Automatic redirects", "When a published post or page gets a new URL, a 301 from the old address is created for you, so shared links and search rankings keep working."],
      ["Safe by design", "Loops, unsafe targets such as javascript: links and broken regular expressions are rejected when you save. The URL tester shows the whole chain and warns about loops and chains that are too long."],
      ["Fast", "Active rules are compiled into one cached lookup that runs before WordPress loads the page. Thousands of redirects cost almost nothing."],
      ["Import, export, tidy up", "CSV import with line-by-line error reporting, CSV export (spreadsheet formulas neutralised), hit counts, enable/disable and bulk actions, automatic clean-up of old 404 entries."],
    ],
    phases: [["Fix", "Redirect old and broken URLs"], ["Catch", "Find 404s before visitors do"], ["Verify", "Test, import, export"]],
    steps: [
      ["redir-1-rules", "Redirects", "Manage every redirect", "Exact, folder and regex rules with status, hit counts, notes and bulk enable, disable or delete. Add one in seconds from the form at the top.", 0, "yoursite.com/wp-admin · Redirects"],
      ["redir-2-404", "404 monitor", "Fix 404s in one click", "The most requested missing addresses with where visitors came from. The closest published page is suggested, so Redirect is one click. Or answer 410 Gone, or ignore.", 1, "yoursite.com/wp-admin · 404 monitor"],
      ["redir-3-test", "URL tester", "Test before visitors do", "Trace any address through your rules: see each hop, and get warned about loops and long chains. Import and export CSV from the same page.", 2, "yoursite.com/wp-admin · Tools"],
    ],
    install: "Open <em>Redirects</em> in the admin menu and add your first redirect, or check <em>404 monitor</em> after a few days.",
    faqs: [
      ["Is Weberslink Redirects & 404 Monitor free?", "Yes. It is a free download under the GPL and works on as many of your own WordPress sites as you like."],
      ["Will it slow my site down?", "No. Rules are compiled into one cached structure and exact redirects are a single array lookup, run before WordPress loads the page."],
      ["How does the 404 monitor choose a suggestion?", "It compares the last part of the missing address with the slugs of your published pages and posts and offers the closest one when it is a confident match (for example /pricing-plan → /pricing-plans/). You always confirm before anything is created."],
      ["Does it create redirects when I change a page URL?", "Yes, for published posts, pages and other public content. A 301 from the old address to the new one is added automatically, and you can switch this off in Settings."],
      ["Can I move my redirects from another plugin?", "Export them from the old plugin as CSV with columns source and target (optionally code, match, query, enabled, note) and import the file under Redirects → Tools. Invalid rows are skipped and listed."],
      ["Which WordPress and PHP versions does it need?", "WordPress 5.9 or newer and PHP 7.4 or newer."],
    ],
  },
  {
    slug: "weberslink-security", dir: "weberslink-security", file: "weberslink-security.php", name: "Weberslink Security Shield", short: "Security Shield", menu: "Security Shield",
    title: "Weberslink Security Shield: Free WordPress Security & 2FA Plugin | WebersLink",
    description: "Download Weberslink Security Shield: a free WordPress security plugin with login attempt limiting, two-factor authentication (authenticator app and recovery codes), one-click hardening, an activity log and a security check-up.",
    h1: "Weberslink Security Shield — <em>lock the front door properly.</em>",
    lead: "Stop password guessing, add two-factor login, harden WordPress in one click and see a plain-English security score.",
    cardText: "Stop brute-force attacks and stolen passwords: login limiting, two-factor login with an authenticator app, one-click hardening, an activity log and a 0–100 security check-up.",
    feats: ["Login limiting with escalating lockouts", "Two-factor login + recovery codes", "Allow & block lists (CIDR, IPv6)", "One-click hardening switches", "Strong password policy", "Security check-up & activity log"],
    inside: [
      ["Login protection", "Lock an address out after repeated failures, with longer locks for repeat offenders (up to 24 hours). A locked address is refused even with the correct password. Always-allow and always-block lists accept ranges (203.0.113.0/24, IPv6 too). Email alert on lockouts."],
      ["Two-factor authentication", "Works with Google Authenticator, Authy, 1Password, Microsoft Authenticator and any TOTP app. Eight one-time recovery codes, codes that work only once, secrets stored encrypted. Each user switches it on from their own profile, so nobody is forced and nobody is locked out."],
      ["One-click hardening", "Strong password policy, disable XML-RPC, hide the WordPress version, block username scans (?author=1, the REST users list, the users sitemap), disable the code editors, send security headers and optional HSTS."],
      ["Security check-up", "A 0–100 score with plain-English advice, worst problems first: HTTPS, PHP version, an “admin” username, two-factor coverage, pending updates and more."],
      ["Activity log", "Logins, failures, lockouts, 2FA changes, password resets, new and deleted users, role changes and plugin or theme changes, with the address and details. Old entries clean themselves up."],
      ["Careful with your users", "Application passwords and the mobile app keep working, login errors never reveal whether a username exists, and a proxy header is only trusted when you choose it."],
    ],
    phases: [["Protect", "Limit logins, add 2FA"], ["Harden", "Lock down WordPress"], ["Watch", "Score and activity log"]],
    steps: [
      ["sec-7-login", "Login", "A second step at login", "Users who turned on two-factor enter the 6-digit code from their phone, or a recovery code. Everyone else logs in as usual.", 0, "yoursite.com/wp-login.php"],
      ["sec-5-2fa-setup", "2FA setup", "Set up in a minute", "Add the key to any authenticator app (or tap the link on your phone), enter a code to confirm, and you are protected.", 0, "yoursite.com/wp-admin · Profile"],
      ["sec-6-recovery", "Recovery codes", "Never get locked out", "Eight one-time recovery codes are shown once at setup, for the day a phone is lost. An administrator can also reset someone's two-factor login.", 0, "yoursite.com/wp-admin · Profile"],
      ["sec-3-settings", "Login rules", "Tune the login rules", "Attempts allowed, time window, lockout length and escalation, always-allow and always-block lists, and email alerts.", 1, "yoursite.com/wp-admin · Settings"],
      ["sec-4-hardening", "Hardening", "Harden with switches", "Two-factor options and hardening in plain language: password policy, XML-RPC, username protection, code editors, security headers and more.", 1, "yoursite.com/wp-admin · Settings"],
      ["sec-1-checkup", "Check-up", "See where you stand", "A 0–100 score and a prioritised list of what to fix, with the last seven days of logins, failures and lockouts.", 2, "yoursite.com/wp-admin · Check-up"],
      ["sec-2-log", "Activity log", "Know what happened", "Every login, failed attempt, lockout, role change and plugin change, filterable by event, user or address.", 2, "yoursite.com/wp-admin · Activity log"],
    ],
    install: "Open <em>Security Shield → Check-up</em> and follow the advice, then open your <em>Profile</em> to set up two-factor login.",
    faqs: [
      ["Is Weberslink Security Shield free?", "Yes. It is a free download under the GPL and works on as many of your own WordPress sites as you like."],
      ["Which authenticator apps work?", "Any app that supports time-based one-time passwords (TOTP, RFC 6238): Google Authenticator, Authy, 1Password, Microsoft Authenticator, Bitwarden and others."],
      ["What if I lose my phone?", "Use one of your eight recovery codes. If you have none left, another administrator can reset your two-factor login from your user page, and as a last resort you can rename the plugin folder over FTP."],
      ["Can it lock me out?", "Lockouts are temporary, you can add your own address to the always-allow list, and two-factor login is never forced on anyone. Application passwords and the WordPress mobile app keep working."],
      ["My site is behind Cloudflare. Does the limiter still work?", "Yes. Choose the CF-Connecting-IP header under Visitor address from, so the plugin sees the real visitor instead of the proxy."],
      ["Which WordPress and PHP versions does it need?", "WordPress 5.9 or newer and PHP 7.4 or newer."],
    ],
  },
  {
    slug: "weberslink-seo", dir: "weberslink-seo", file: "weberslink-seo.php", name: "Weberslink SEO Toolkit", short: "SEO Toolkit", menu: "SEO",
    title: "Weberslink SEO Toolkit: Free WordPress SEO Plugin | WebersLink",
    description: "Download Weberslink SEO Toolkit: a free WordPress SEO plugin with title and meta description templates, live SEO and readability analysis with a Google preview, Open Graph and Twitter cards, JSON-LD schema, robots and sitemap controls and an SEO audit.",
    h1: "Weberslink SEO Toolkit — <em>rank with confidence, not guesswork.</em>",
    lead: "Write better titles and descriptions, see exactly how your page looks in Google, and get a clear checklist for every post.",
    cardText: "Titles and meta descriptions with templates, a live SEO and readability check with a Google preview, social cards, schema, robots and sitemap controls, and a site-wide audit.",
    feats: ["Live SEO & readability analysis", "Google result preview", "Title & description templates", "Open Graph & Twitter cards", "JSON-LD schema graph", "Robots, sitemap & SEO audit"],
    inside: [
      ["Live analysis in the editor", "Set a focus keyword and get a checklist as you type: title and description length, keyword in the title, description, URL, introduction and subheadings, keyword density, content length, image alt text, internal and outbound links."],
      ["Readability", "Flesch reading ease, long sentences, paragraph length and subheadings, with plain-English advice. Both scores update while you write, using the same analyser everywhere."],
      ["Google preview", "See your title, address and description exactly as a search result, with a live character count that turns red when Google would cut it off."],
      ["Templates for the whole site", "Set one pattern such as %title% - %sitename% for posts, pages, categories, authors, search and 404, and override any page by hand. Variables for excerpt, category, author, date and page number."],
      ["Social cards and schema", "Open Graph and Twitter cards with a default image, and a clean JSON-LD graph: WebSite with search, Organization or Person, WebPage, Article and breadcrumbs. The output cannot break out of the page."],
      ["Robots, sitemap and audit", "Noindex or nofollow per page, hide search, date and author archives, keep noindex pages out of the WordPress sitemap, add the sitemap and your own rules to robots.txt, verify with Google, Bing, Yandex and Pinterest, and see which pages still lack a description."],
    ],
    phases: [["Write", "Optimise each page"], ["Configure", "Templates and schema"], ["Audit", "Find what is missing"]],
    steps: [
      ["seo-2-editor", "Editor", "Optimise as you write", "Focus keyword, SEO title and meta description with a live Google preview, character counts and an SEO and readability score with a checklist.", 0, "yoursite.com/wp-admin · Edit post"],
      ["seo-3-settings", "Templates", "Set the pattern once", "Title and description templates for every kind of page, with a separator of your choice. Override any single page in its own SEO box.", 1, "yoursite.com/wp-admin · SEO settings"],
      ["seo-4-schema", "Social & schema", "Be ready to share and be understood", "Open Graph and Twitter cards, a default social image, and structured data for your organization or yourself, plus search engine settings.", 1, "yoursite.com/wp-admin · SEO settings"],
      ["seo-1-audit", "Audit", "See what still needs work", "How many pages have no meta description or focus keyword, and a list of the pages to fix first, each one click from its SEO box.", 2, "yoursite.com/wp-admin · SEO audit"],
    ],
    install: "Open <em>SEO → Settings</em> to set your title templates and organization, then edit any post and fill in the new <em>SEO</em> box.",
    faqs: [
      ["Is Weberslink SEO Toolkit free?", "Yes. It is a free download under the GPL and works on as many of your own WordPress sites as you like."],
      ["Will it conflict with Yoast or Rank Math?", "Use one SEO plugin at a time. Deactivate the other before activating this one, because both would print titles, descriptions and schema."],
      ["Does it migrate my existing titles and descriptions?", "Not automatically. This version stores its own fields, so existing titles and descriptions from another plugin are not imported."],
      ["Does it guarantee rankings?", "No tool can. It checks the things you control (titles, descriptions, headings, links, readability, structured data) and shows what is missing."],
      ["Does it work with page builders and custom post types?", "Yes. The SEO box appears on every public post type. In page builders the analysis reads the editor content when it is available; the fields and front-end output work everywhere."],
      ["Which WordPress and PHP versions does it need?", "WordPress 5.9 or newer and PHP 7.4 or newer."],
    ],
  },
  {
    slug: "weberslink-cookies", dir: "weberslink-cookies", file: "weberslink-cookies.php", name: "Weberslink Cookie Consent", short: "Cookie Consent", menu: "Cookie Consent",
    title: "Weberslink Cookie Consent: Free WordPress Cookie Banner & GDPR Plugin | WebersLink",
    description: "Download Weberslink Cookie Consent: a free WordPress cookie banner that blocks analytics and marketing scripts until visitors agree, with Google Consent Mode v2, equal Accept and Reject buttons, a consent log and CSV export.",
    h1: "Weberslink Cookie Consent — <em>tracking only after a yes.</em>",
    lead: "A clear, accessible cookie banner that really holds back your analytics and marketing tags, and keeps proof of every choice.",
    cardText: "A cookie banner that holds back analytics and marketing until visitors agree: equal Accept and Reject buttons, Google Consent Mode v2, embeds that wait, and an exportable consent log.",
    feats: ["Equal Accept & Reject buttons", "Scripts, iframes & pixels held back", "Google Consent Mode v2", "Consent log with CSV export", "Reopen button & cookie table", "Accessible, keyboard friendly"],
    inside: [
      ["A banner people can use", "Accept all and Reject all with the same size and prominence, a Customise dialog with a switch per category, and your colours and wording. Bar, corner box or centred dialog, and a small button to reopen it."],
      ["Scripts really wait", "Paste Google Analytics, Meta Pixel, TikTok or any tag into its category: it is held back and released only after consent. Iframes (YouTube, Maps) and tracking images stay blank until the visitor agrees."],
      ["Google Consent Mode v2", "Everything starts denied and is updated with the visitor's choice, so Google tags (GA4, Ads, Tag Manager) behave correctly. A data layer event and a browser event are fired for your own code."],
      ["Proof of consent", "A log of each choice (action, categories, policy version) with a one-way fingerprint instead of an IP address, acceptance statistics, and CSV export. Ask everyone again with one tick when your policy changes."],
      ["Policy helpers", "A [wlcc_cookies] shortcode prints a table of the cookies you use, and [wlcc_settings] adds a “Cookie settings” link anywhere."],
      ["Accessible and light", "Focus is trapped in the dialog, Escape closes it, focus rings are visible, buttons are at least 44px tall, and the script is small and dependency free."],
    ],
    phases: [["Show", "The banner visitors see"], ["Control", "Categories and scripts"], ["Prove", "Log and statistics"]],
    steps: [
      ["cc-1-banner", "Banner", "A clear first choice", "Reject all and Accept all look alike, so declining is as easy as accepting. Nothing is tracked until a choice is made.", 0, "yoursite.com"],
      ["cc-3-modal", "Preferences", "Let visitors choose", "A switch per category, with Necessary always on. Choices are remembered and can be changed at any time from the reopen button.", 0, "yoursite.com"],
      ["cc-2-box", "Layouts", "Fit your design", "Choose a bottom bar, a corner box or a centred dialog, and set your own colours, wording and policy link.", 0, "yoursite.com"],
      ["cc-4-mobile", "Mobile", "Made for phones too", "Full-width buttons, nothing cut off, and a dialog that always fits the screen.", 0, "yoursite.com (mobile)"],
      ["cc-5-settings", "Scripts", "Hold back your tags", "Paste analytics, pixels and embeds into the matching category and turn on Google Consent Mode. They run only after consent.", 1, "yoursite.com/wp-admin · Cookie Consent"],
      ["cc-6-log", "Consent log", "Keep proof of every choice", "Acceptance rates for the last 30 days and a record of each choice with the policy version. Export it as CSV whenever you need it.", 2, "yoursite.com/wp-admin · Consent log"],
    ],
    install: "Open <em>Cookie Consent</em>, pick your categories and paste your analytics or marketing tags into the matching boxes (and remove them from your theme).",
    faqs: [
      ["Is Weberslink Cookie Consent free?", "Yes. It is a free download under the GPL and works on as many of your own WordPress sites as you like."],
      ["Does it make my site GDPR compliant?", "It handles the consent part of cookie rules: a clear choice, scripts held back until agreement, and a record. You are still responsible for what your site sets, for a clear cookie policy and for the rest of the law. This is not legal advice."],
      ["Why do I need to move my tracking tags into the plugin?", "A tag already in your theme or another plugin loads before the banner can stop it. Paste it into the matching box and the plugin releases it only after consent. Google tags that load themselves are controlled through Consent Mode."],
      ["Does it work with Google Tag Manager and GA4?", "Yes. Consent Mode v2 starts everything denied and updates it with the visitor's choice. You can also put the GTM snippet in the Analytics or Marketing box."],
      ["Does it store visitors' IP addresses?", "No. The consent log keeps the choice, the policy version and a one-way fingerprint used only to limit abuse, never the IP address itself."],
      ["Which WordPress and PHP versions does it need?", "WordPress 5.9 or newer and PHP 7.4 or newer."],
    ],
  },
  {
    slug: "weberslink-images", dir: "weberslink-images", file: "weberslink-images.php", name: "Weberslink Image Optimizer", short: "Image Optimizer", menu: "Image Optimizer",
    title: "Weberslink Image Optimizer: Free WordPress Image Compression & WebP Plugin | WebersLink",
    description: "Download Weberslink Image Optimizer: a free WordPress plugin that compresses and resizes images on upload, fixes phone rotation, removes location data, creates WebP versions and optimises your whole media library, with no external service.",
    h1: "Weberslink Image Optimizer — <em>lighter pages, same pictures.</em>",
    lead: "Shrink every image on your site without visible loss, serve modern WebP automatically, and keep your originals safe.",
    cardText: "Compress and resize images on upload, straighten phone photos, strip location data, serve WebP automatically, optimise your whole library and restore any original. Runs on your own server.",
    feats: ["Compress & resize on upload", "WebP versions served automatically", "Bulk-optimise the whole library", "Fixes phone rotation, strips GPS", "Restore any original", "No account, no external service"],
    inside: [
      ["Smaller files, same look", "Compresses JPEG, PNG and WebP uploads and every generated thumbnail at the quality you choose. It never makes a file bigger, skips files already at your quality so repeat runs cannot degrade them, and keeps PNG transparency."],
      ["Scales huge photos", "Camera originals of 4000 pixels and more are scaled down to the maximum you set. Generated thumbnails keep their sizes, and WordPress's own unscaled copy is compressed too."],
      ["Upright and private", "Phone photos are turned upright and camera metadata such as GPS location is removed, so a picture can no longer reveal where it was taken."],
      ["WebP without server rules", "Creates a WebP twin of each image and wraps images in a picture tag, so every browser picks the best format. It needs no .htaccess changes and is safe with page caches and CDNs."],
      ["Your whole library", "Optimise existing media in small steps with a progress bar, so it works on slow hosts too. See the savings per image in the media library, and optimise or restore any single image."],
      ["Safe and private", "Originals can be kept for one-click restore. Everything runs on your server with PHP's GD library: no account, no API key and no image ever leaves your site."],
    ],
    phases: [["Set up", "Choose quality and limits"], ["Optimise", "Bulk or on upload"], ["Check", "See the savings"]],
    steps: [
      ["img-1-optimizer", "Settings", "Set it and forget it", "Pick your quality and maximum size, switch on WebP and original backups, then optimise the whole library with one click. New uploads are handled automatically.", 0, "yoursite.com/wp-admin · Image Optimizer"],
      ["img-2-library", "Media library", "See what you saved", "Each image shows how much smaller it got and whether it has a WebP version. Optimise a single image, or restore its original, from the same list.", 2, "yoursite.com/wp-admin · Media Library"],
    ],
    install: "Open <em>Media → Image Optimizer</em>, check the settings and click <em>Optimise all images</em>.",
    faqs: [
      ["Is Weberslink Image Optimizer free?", "Yes. It is a free download under the GPL and works on as many of your own WordPress sites as you like."],
      ["Does it send my images to an outside service?", "No. Everything runs on your own server using PHP's GD library. There is no account, no API key and no monthly image quota."],
      ["Will my images look worse?", "PNG recompression is lossless. JPEG and WebP are compressed at the quality you choose; around 80 to 85 is normally indistinguishable from the original. Files already at that quality are skipped, so running it again never degrades them."],
      ["Can I get my original back?", "Yes, when Keep originals is on. Restore original puts the uploaded file back and removes its WebP versions. Thumbnails stay optimised."],
      ["How does it serve WebP?", "It wraps images in a picture tag with a WebP source, so each browser picks the best format. No server rules are needed and it is safe with caching plugins and CDNs. If a theme styles images in a way that conflicts, switch this option off and compression still works."],
      ["Which WordPress and PHP versions does it need?", "WordPress 5.9 or newer and PHP 7.4 or newer, with the GD extension (WebP support is needed only for the WebP files)."],
    ],
  },
  {
    slug: "weberslink-popups", dir: "weberslink-popups", file: "weberslink-popups.php", name: "Weberslink Popups & Lead Capture", short: "Popups & Lead Capture", menu: "Popups",
    title: "Weberslink Popups & Lead Capture: Free WordPress Popup & Email Capture Plugin | WebersLink",
    description: "Download Weberslink Popups & Lead Capture: a free WordPress plugin for popups, slide-ins and announcement bars with exit-intent, scroll and click triggers, targeting, frequency limits, spam-protected email capture, CSV export and a webhook.",
    h1: "Weberslink Popups &amp; Lead Capture — <em>turn visitors into subscribers.</em>",
    lead: "Show the right message at the right moment, collect emails safely, and see which popups actually work.",
    cardText: "Popups, slide-ins and announcement bars with exit-intent, scroll and click triggers, page and device targeting, frequency limits, spam-protected email capture, CSV export and a webhook.",
    feats: ["Popup, slide-in & announcement bar", "Delay, scroll, exit & click triggers", "Page, device & schedule targeting", "Spam-protected email capture", "Leads list, CSV export & webhook", "Views, sign-ups & conversion rate"],
    inside: [
      ["Three formats", "A centred popup, a corner slide-in and an announcement bar at the top or bottom, with your headline, text, colours and button. Collect an email (with optional name and consent checkbox) or show a call-to-action button."],
      ["Triggers that respect visitors", "Show after a delay, after scrolling a percentage, on exit intent (desktop), when a button is clicked, or straight away. Once per visit, once every N days or every time; people who subscribe are not asked again."],
      ["Precise targeting", "Everywhere, the home page only, or a list of pages with wildcards. Never on checkout or thank-you pages. Desktop or mobile only, logged-out visitors only, and start and end dates for sales."],
      ["Leads you can use", "Search the leads list, export CSV (spreadsheet formulas neutralised), or send each new lead as signed JSON to Zapier, Make, n8n or your CRM. Optional email notification, capped so bots cannot flood your inbox."],
      ["Spam protection", "A hidden honeypot field, per-visitor rate limits, duplicate emails ignored and an optional consent checkbox keep your list clean."],
      ["Measured and accessible", "Views, sign-ups and conversion rate for the last 30 days. Dialogs trap focus, close with Escape, return focus afterwards and have large touch targets."],
    ],
    phases: [["Design", "Message and colours"], ["Target", "When and who"], ["Collect", "Leads and results"]],
    steps: [
      ["pop-5-modal", "Popup", "A message with a purpose", "A centred popup with a headline, a short pitch, an email field and an optional consent checkbox.", 0, "yoursite.com"],
      ["pop-6-slide", "Slide-in", "Less intrusive", "A slide-in that appears in the corner while the page stays scrollable. A good fit for mobile and for returning readers.", 0, "yoursite.com"],
      ["pop-7-bar", "Announcement bar", "Tell everyone, quietly", "A bar across the top or bottom for shipping offers, sales and news, with a button to the page you want.", 0, "yoursite.com"],
      ["pop-8-mobile", "Mobile", "Built for phones", "Full-width fields, large touch targets and a dialog that always fits the screen.", 0, "yoursite.com (mobile)"],
      ["pop-2-editor", "Editor", "Write it in a minute", "Headline, text, form options, button, colours and thank-you message, with a one-click preview on your real site.", 1, "yoursite.com/wp-admin · Popups"],
      ["pop-3-targeting", "Targeting", "Right place, right time", "Triggers, frequency and who sees it: pages, devices, logged-out visitors and a date range.", 1, "yoursite.com/wp-admin · Popups"],
      ["pop-1-list", "Results", "See what works", "Views, sign-ups and conversion rate for each popup, with preview, on/off, duplicate and delete in one row.", 2, "yoursite.com/wp-admin · Popups"],
      ["pop-4-leads", "Leads", "Your list, your data", "Search, delete and export every lead as CSV, and send new leads to your tools with a webhook.", 2, "yoursite.com/wp-admin · Leads"],
    ],
    install: "Open <em>Popups → Add new</em>, write your message, choose when and where it shows, save, then click <em>Preview</em>.",
    faqs: [
      ["Is Weberslink Popups & Lead Capture free?", "Yes. It is a free download under the GPL and works on as many of your own WordPress sites as you like."],
      ["Can it send leads to Mailchimp, Klaviyo or my CRM?", "Use the webhook with Zapier, Make or n8n, or post straight to an endpoint that accepts JSON. A signature header lets you verify each request came from your site. You can also export a CSV at any time."],
      ["Will popups hurt my SEO?", "Large popups that cover the page right after arrival on mobile can. Use a delay, a slide-in or a bar, and limit full-screen popups on phones."],
      ["Is it GDPR friendly?", "You can require a consent checkbox with your own wording, and the leads list lets you delete any lead. Visitors' IP addresses are not stored, only a one-way fingerprint used for rate limiting. This is not legal advice."],
      ["Does it work with caching plugins?", "Yes. Page targeting is decided on the server for each URL, while triggers, devices and frequency run in the browser."],
      ["Which WordPress and PHP versions does it need?", "WordPress 5.9 or newer and PHP 7.4 or newer."],
    ],
  },
];
for (const x of EXTRA) {
  x.zip = `/downloads/${x.slug}.zip`;
  x.version = pluginVer(x.dir, x.file);
  x.size = extraZipSize(x.zip);
  x.changelog = readChangelog(x.dir);
  x.software = { name: x.name, version: x.version, download: x.zip, size: x.size };
  x.shots = workflow("See how it works, screen by screen", `Pick a step, or let it play. Click a screen to open it full size.`, x.phases, x.steps);
  x.card = (loc) => `<div class="plugin-card">
  <div class="plugin-head"><span class="plugin-badge">WordPress plugin</span><span class="plugin-ver">v${x.version}${x.size ? " · " + x.size : ""} · Free download</span></div>
  <h2>${esc(x.name).replace("&amp;", "&amp;")}</h2>
  <p>${esc(x.cardText)}</p>
  <ul class="plugin-feats">
${x.feats.map((f) => `    <li>${esc(f)}</li>`).join("\n")}
  </ul>
  <div class="plugin-actions">
    <a class="btn btn-dark" href="${x.zip}" download data-track="Plugin download" data-loc="${loc}-${x.slug}">Download ZIP ↓</a>
    <a class="btn btn-outline" href="/plugins/${x.slug}" data-track="Plugin details" data-loc="${loc}-${x.slug}">Features &amp; install guide →</a>
  </div>
</div>`;
}

write("/plugins/", render({
  path: "/plugins/", type: "hub", kicker: "Plugins",
  title: "Free WordPress Plugins | WebersLink",
  description: "Free WordPress plugins from WebersLink: Forms Pro, SMTP & Email Log, Redirects & 404 Monitor, Security Shield, SEO Toolkit, Cookie Consent, Image Optimizer and Popups & Lead Capture.",
  h1: "Free WordPress plugins <em>you can download.</em>",
  lead: "Tools we build and use for our own client sites, packaged so you can install them in a minute.",
  card: { title: "Plugins" },
  software: SOFTWARE,
  heroCta: `<div class="hero-cta">
      <a href="${PLUGIN_ZIP}" class="btn btn-light" download data-track="Plugin download" data-loc="hero">Download Forms Pro ↓</a>
      <a href="/plugins/weberslink-smtp" class="btn btn-ghost" data-track="Plugin details" data-loc="hero-all">Browse all 8 plugins</a>
    </div>`,
  faqs: pluginFaqs,
  body: pluginCard("plugins-hub") + "\n" + smtpCard("plugins-hub") + "\n" + EXTRA.map((x) => x.card("plugins-hub")).join("\n"),
}).replace('<div class="wrap prose-wrap">', '<div class="wrap prose-wrap hub">'));

write("/plugins/weberslink-forms-pro", render({
  path: "/plugins/weberslink-forms-pro", type: "plugin", kicker: "WordPress plugin",
  title: "Weberslink Forms Pro: Free WordPress Form Builder Plugin | WebersLink",
  description: "Download Weberslink Forms Pro: a free drag-and-drop WordPress form builder with multi-step and conversational forms, conditional logic, Stripe & PayPal payments, PDFs and 30+ templates.",
  h1: "Weberslink Forms Pro — the <em>form builder</em> that fits any theme.",
  lead: "Build contact, quote, booking, payment, quiz and survey forms visually. Free to download and use.",
  crumbs: [["Plugins", "/plugins/"]],
  card: { title: "Weberslink Forms Pro" },
  software: SOFTWARE,
  heroCta: `<div class="hero-cta">
      <a href="${PLUGIN_ZIP}" class="btn btn-light" download data-track="Plugin download" data-loc="hero">Download Weberslink Forms Pro ↓</a>
      <a href="/plugins/weberslink-forms-pro" class="btn btn-ghost" data-track="Plugin details" data-loc="hero">See features</a>
    </div>`,
  faqs: pluginFaqs,
  related: ["/services/web-design", "/services/automation"],
  body: `<p><a class="btn btn-dark" href="${PLUGIN_ZIP}" download data-track="Plugin download" data-loc="plugin-detail-top">Download ZIP ↓</a> <span class="plugin-ver">Version ${pluginVersion}${zipSize ? " · " + zipSize : ""} · WordPress 5.8+ · PHP 7.4+ · GPL-2.0-or-later</span></p>
${HIGHLIGHTS[pluginVersion] ? `<div class="plugin-new plugin-new-box"><strong>What's new in v${pluginVersion}</strong><ul>${HIGHLIGHTS[pluginVersion].map((h) => `<li>${esc(h)}</li>`).join("")}</ul></div>` : ""}
<h2>What's inside</h2>
<ul>
  <li><strong>Visual builder:</strong> drag &amp; drop, 50 field types (text, choice, image choice, ranking, date range, file &amp; image upload, signature, repeater, rating, NPS, calculation, dynamic dropdowns, embeds), 35+ templates, version history with one-click restore.</li>
  <li><strong>Smart forms:</strong> conditional logic, multi-step with progress, conversational one-question-at-a-time mode, calculations, quizzes with scoring, conditional confirmations, save &amp; resume by email.</li>
  <li><strong>Works with every theme:</strong> inherits your fonts and colours, readable on light and dark backgrounds, RTL ready. Shortcode, Gutenberg block, widget and Elementor widget.</li>
  <li><strong>Bookings:</strong> appointment-slot field with live availability, per-slot capacity, closed days, blocked dates, notice period and .ics calendar invites; per-option seat and stock limits.</li>
  <li><strong>Entries &amp; team workflow:</strong> custom stages (New → In progress → Done), assign entries to teammates with an email alert, search, filter, notes, edit, reply by email, PDF download, Excel and CSV export, answer-breakdown reports with NPS, conversion tracking.</li>
  <li><strong>Emails:</strong> unlimited notifications and auto-responders with merge tags, a branded layout with your logo and colours, PDF, calendar or file attachments, delayed follow-ups and reference numbers.</li>
  <li><strong>Payments:</strong> Stripe Checkout (one-time and subscriptions), PayPal, offline; products, quantities, coupons, tax, per-option seat or stock limits.</li>
  <li><strong>Integrations &amp; API:</strong> signed webhooks with automatic retries (Zapier, Make, n8n, Google Sheets via Apps Script), Slack, Discord, Teams, Telegram, Mailchimp, create WordPress users or posts, plus a read-only REST API with API keys.</li>
  <li><strong>Spam &amp; privacy:</strong> honeypot, time trap, rate limits, Akismet, reCAPTCHA, hCaptcha, Turnstile; IP anonymising, auto-delete, GDPR export and erase.</li>
</ul>
${FORMS_SHOTS}
<h2>Install in 3 steps</h2>
<ol>
  <li>Download the ZIP above.</li>
  <li>In WordPress go to <em>Plugins → Add New → Upload Plugin</em>, choose the ZIP, install and activate.</li>
  <li>Open <em>Weberslink Forms → Add new</em>, pick a template, then embed it with <code>[weberslink_form id="1"]</code>.</li>
</ol>
<p><a class="btn btn-dark" href="${PLUGIN_ZIP}" download data-track="Plugin download" data-loc="plugin-detail-bottom">Download ZIP ↓</a></p>
<h2>Changelog</h2>
${changelogHtml}
<p class="plugin-note">Need a custom form setup, payments wired up or a site built around it? <a href="/#book">Book a free call</a> and we'll sort it for you.</p>`,
}));


write("/plugins/weberslink-smtp", render({
  path: "/plugins/weberslink-smtp", type: "plugin", kicker: "WordPress plugin",
  title: "Weberslink SMTP & Email Log: Free WordPress SMTP Plugin | WebersLink",
  description: "Download Weberslink SMTP & Email Log: a free WordPress plugin to send email through any SMTP provider, log every email with preview and resend, retry failures and check SPF, DKIM and DMARC.",
  h1: "Weberslink SMTP &amp; Email Log — <em>email that just works.</em>",
  lead: "Stop losing contact-form and WooCommerce emails. Send through a real mail server, see every message, and fix failures fast.",
  crumbs: [["Plugins", "/plugins/"]],
  card: { title: "Weberslink SMTP & Email Log" },
  software: SMTP_SOFTWARE,
  heroCta: `<div class="hero-cta">
      <a href="${SMTP_ZIP}" class="btn btn-light" download data-track="Plugin download" data-loc="hero-smtp">Download SMTP &amp; Email Log ↓</a>
      <a href="/plugins/" class="btn btn-ghost" data-track="Plugin details" data-loc="hero-smtp">All plugins</a>
    </div>`,
  faqs: smtpFaqs,
  related: ["/services/ecommerce", "/services/automation"],
  body: `<p><a class="btn btn-dark" href="${SMTP_ZIP}" download data-track="Plugin download" data-loc="smtp-detail-top">Download ZIP ↓</a> <span class="plugin-ver">Version ${smtpVersion}${smtpSize ? " · " + smtpSize : ""} · WordPress 5.9+ · PHP 7.4+ · GPL-2.0-or-later</span></p>
<h2>What's inside</h2>
<ul>
  <li><strong>Send through any SMTP server:</strong> one-click presets for Gmail / Google Workspace, Microsoft 365, SendGrid, Mailgun, Amazon SES, Brevo, Postmark, Zoho and Mailtrap; STARTTLS or SSL/TLS; force the From email and name; set the return path.</li>
  <li><strong>API mailers for blocked ports:</strong> send over HTTPS with SendGrid, Brevo, Mailgun (US/EU) or Postmark: attachments, Cc/Bcc and Reply-To included. API keys are stored encrypted or set with a wp-config.php constant.</li>
  <li><strong>Backup connection &amp; failover:</strong> if the primary connection fails, the email is re-sent through your backup straight away, and the log records which one delivered it.</li>
  <li><strong>Smart routing:</strong> send some emails another way based on the sending plugin, subject, recipient domain or From address, for example WooCommerce receipts through a transactional service.</li>
  <li><strong>Open &amp; click tracking (opt-in):</strong> signed tracking links and a 1×1 image, never added to login or reset emails, with opens and clicks shown in the log.</li>
  <li><strong>Weekly report &amp; email controls:</strong> a Monday summary of sent, failed, delivery rate and failure sources, a 14-day chart in the log, and switches to stop WordPress notification emails you do not want.</li>
  <li><strong>Searchable email log:</strong> recipient, subject, status, the plugin or theme that sent it, number of attempts and date, with a sandboxed preview (no scripts, no remote images) and a plain-text view. CSV export.</li>
  <li><strong>Privacy first:</strong> log everything, only recipients and subject, or nothing. Password-reset keys and tokens are redacted, old entries are deleted automatically, and your password is stored encrypted (or kept out of the database with a wp-config.php constant).</li>
  <li><strong>Fix problems fast:</strong> resend any email, automatic retries for failures, a dashboard widget and warning banner, and Slack or Discord alerts, because a failed email cannot email you.</li>
  <li><strong>Test tool:</strong> sends a real test message and shows the full SMTP conversation with your credentials hidden, so you can see exactly where a connection breaks.</li>
  <li><strong>Deliverability check:</strong> looks up your domain's SPF (including the 10-lookup limit), DKIM and DMARC and explains what to fix in plain English.</li>
</ul>
${SMTP_SHOTS}
<h2>Install in 3 steps</h2>
<ol>
  <li>Download the ZIP above.</li>
  <li>In WordPress go to <em>Plugins → Add New → Upload Plugin</em>, choose the ZIP, install and activate.</li>
  <li>Open <em>Weberslink Mail → SMTP settings</em>, pick your provider, enter the details and save. Then run <em>Tools → Send test</em>.</li>
</ol>
<p><a class="btn btn-dark" href="${SMTP_ZIP}" download data-track="Plugin download" data-loc="smtp-detail-bottom">Download ZIP ↓</a></p>
<h2>Changelog</h2>
${smtpChangelog.slice(0, 4).map((c) => `<h3>Version ${esc(c.version)}</h3>\n<ul>\n${c.items.map((i) => `  <li>${esc(i)}</li>`).join("\n")}\n</ul>`).join("\n")}
<p class="plugin-note">Emails still not arriving, or need transactional email set up properly for a WooCommerce store? <a href="/#book">Book a free call</a> and we'll sort it for you.</p>`,
}));

for (const x of EXTRA) {
  write(`/plugins/${x.slug}`, render({
    path: `/plugins/${x.slug}`, type: "plugin", kicker: "WordPress plugin",
    title: x.title, description: x.description, h1: x.h1, lead: x.lead,
    crumbs: [["Plugins", "/plugins/"]], card: { title: x.name }, software: x.software,
    heroCta: `<div class="hero-cta">
      <a href="${x.zip}" class="btn btn-light" download data-track="Plugin download" data-loc="hero-${x.slug}">Download ${esc(x.short)} ↓</a>
      <a href="/plugins/" class="btn btn-ghost" data-track="Plugin details" data-loc="hero-${x.slug}">All plugins</a>
    </div>`,
    faqs: x.faqs, related: ["/services/ecommerce", "/services/automation"],
    body: `<p><a class="btn btn-dark" href="${x.zip}" download data-track="Plugin download" data-loc="${x.slug}-detail-top">Download ZIP ↓</a> <span class="plugin-ver">Version ${x.version}${x.size ? " · " + x.size : ""} · WordPress 5.9+ · PHP 7.4+ · GPL-2.0-or-later</span></p>
<h2>What's inside</h2>
<ul>
${x.inside.map((t) => `  <li><strong>${esc(t[0])}:</strong> ${esc(t[1])}</li>`).join("\n")}
</ul>
${x.shots}
<h2>Install in 3 steps</h2>
<ol>
  <li>Download the ZIP above.</li>
  <li>In WordPress go to <em>Plugins → Add New → Upload Plugin</em>, choose the ZIP, install and activate.</li>
  <li>${x.install}</li>
</ol>
<p><a class="btn btn-dark" href="${x.zip}" download data-track="Plugin download" data-loc="${x.slug}-detail-bottom">Download ZIP ↓</a></p>
<h2>Changelog</h2>
${x.changelog.slice(0, 4).map((c) => `<h3>Version ${esc(c.version)}</h3>\n<ul>\n${c.items.map((i) => `  <li>${esc(i)}</li>`).join("\n")}\n</ul>`).join("\n")}
<p class="plugin-note">Need this set up properly, or want something built for your site? <a href="/#book">Book a free call</a> and we'll help.</p>`,
  }));
}


// ---------- Privacy policy and 404 (shared shell, so nav, footer and metadata match every other page) ----------
const privacyBody = fs.readFileSync(path.join(__dirname, "content", "privacy.body.html"), "utf8");
write("/privacy", pageShell({
  path: "/privacy", type: "hub", title: "Privacy Policy | WebersLink",
  description: "How WebersLink collects, uses and protects personal data from enquiries and website audits, and your rights under GDPR and US privacy laws.",
  card: { title: "Privacy Policy" }, crumbs: [],
}, `<section class="page-hero">
  <div class="hero-grid" aria-hidden="true"></div>
  <div class="wrap">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><span aria-current="page">Privacy Policy</span></nav>
    <div class="kicker">Legal</div>
    <h1>Privacy <em>Policy.</em></h1>
    <p class="lead">Last updated: October 2026</p>
  </div>
</section>
<article class="white page-body">
  <div class="wrap legal-wrap"><div class="prose">
${privacyBody}
  </div></div>
</article>`));
write("/404", pageShell({
  path: "/404", type: "hub", noindex: true, title: "Page not found | WebersLink",
  description: "This page doesn't exist. Head back to the WebersLink home page.",
  card: { title: "Page not found" }, crumbs: [],
}, `<section class="page-hero error-hero">
  <div class="hero-grid" aria-hidden="true"></div>
  <div class="wrap">
    <div class="kicker">Error 404</div>
    <h1>This page <em>doesn't exist.</em></h1>
    <p class="lead">But your next client might be looking for you right now.</p>
    <div class="hero-cta">
      <a href="/" class="btn btn-light">Go to the homepage →</a>
      <a href="/offers/" class="btn btn-ghost">See our offers</a>
      <a href="/contact" class="btn btn-ghost">Contact us</a>
    </div>
  </div>
</section>`));

// ---------- FDE pages ----------
OFFERS.forEach((o) => write(o.path, renderOffer(o)));
write("/offers/", offersHub());
write("/contact", contactPage());

// ---------- Homepage: head metadata, skip link, structured data ----------
const decode = (t) => t.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
function enhanceHome(html) {
  const canon = `<link rel="canonical" href="${SITE}/">`;
  if (!html.includes('hreflang="x-default"')) html = html.replace(canon, () => `${canon}\n${headExtra(SITE + "/")}`);
  if (!html.includes('class="skip"')) html = html.replace(/<body>/, `<body>\n${SKIP}`);
  html = html.replace(/<main>/, '<main id="main">');
  const re = /<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/;
  const m = html.match(re);
  if (m) {
    const prev = JSON.parse(m[1]);
    const biz = { ...(prev["@graph"] ? prev["@graph"].find((n) => n["@type"] === "ProfessionalService") : prev) };
    delete biz["@context"];
    biz["@id"] = SITE + "/#business";
    biz.areaServed = ["United States", "United Kingdom", "Europe"];
    biz.availableLanguage = "English";
    const faqSec = (html.match(/<section class="white pad" id="faq">[\s\S]*?<\/section>/) || [""])[0];
    const faqs = [...faqSec.matchAll(/<details[^>]*><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)].map((x) => [decode(strip(x[1])), decode(strip(x[2]))]);
    const graph = [
      { "@type": "Organization", "@id": SITE + "/#org", name: "WebersLink", url: SITE + "/", logo: SITE + "/apple-touch-icon.png", email: "hassan@weberslink.org", address: biz.address, areaServed: biz.areaServed },
      { "@type": "WebSite", "@id": SITE + "/#website", url: SITE + "/", name: "WebersLink", inLanguage: "en", publisher: { "@id": SITE + "/#org" } },
      biz,
    ];
    if (faqs.length) graph.push({ "@type": "FAQPage", mainEntity: faqs.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) });
    const ldBlock = `<script type="application/ld+json">\n${JSON.stringify({ "@context": "https://schema.org", "@graph": graph }, null, 1)}\n</script>`;
    html = html.replace(re, () => ldBlock); // function form: the text contains "$1,490", which a string replacement would treat as a capture group
  }
  return html;
}

// ---------- Shared footer on the homepage ----------
const homeFile = path.join(PUBLIC, "index.html");
const home = fs.readFileSync(homeFile, "utf8");
const updated = home
  .replace(/<!-- NAV -->[\s\S]*?<!-- \/NAV -->/, `<!-- NAV -->\n${nav("nav", "#top")}\n<!-- /NAV -->`)
  .replace(/<!-- FOOTER -->[\s\S]*?<!-- \/FOOTER -->/, `<!-- FOOTER -->\n${footer()}\n<!-- /FOOTER -->`);
if (updated === home && !home.includes("<!-- FOOTER -->")) console.warn("Homepage footer markers not found.");
fs.writeFileSync(homeFile, iconify(enhanceHome(updated)));

// ---------- Sitemap ----------
const urls = [
  ["/", "1.0"], ["/offers/", "0.9"], ...OFFERS.map((o) => [o.path, "0.9"]), ["/contact", "0.6"], ["/services/", "0.9"], ["/industries/", "0.8"], ["/blog/", "0.8"],
  ...SERVICES.map((p) => [p.path, "0.9"]),
  ...INDUSTRIES.map((p) => [p.path, "0.8"]),
  ...GUIDES.map((p) => [p.path, "0.7"]),
  ["/plugins/", "0.7"], ["/plugins/weberslink-forms-pro", "0.7"], ["/plugins/weberslink-smtp", "0.7"], ["/plugins/weberslink-redirects", "0.7"], ["/plugins/weberslink-security", "0.7"], ["/plugins/weberslink-seo", "0.7"], ["/plugins/weberslink-cookies", "0.7"], ["/plugins/weberslink-images", "0.7"], ["/plugins/weberslink-popups", "0.7"],
  ["/privacy", "0.2"],
];
fs.writeFileSync(path.join(PUBLIC, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(([u, pr]) => `  <url><loc>${SITE}${u}</loc><lastmod>${(byPath[u] && (byPath[u].updated || byPath[u].date)) || TODAY}</lastmod><priority>${pr}</priority></url>`).join("\n")}
</urlset>
`);

// ---------- llms.txt (for AI assistants and AI search) and RSS feed ----------
const oneLine = (t) => strip(String(t)).replace(/\s+/g, " ").trim();
const llmLink = (p, name, desc) => `- [${oneLine(name)}](${SITE}${p}): ${oneLine(desc)}`;
fs.writeFileSync(path.join(PUBLIC, "llms.txt"), `# WebersLink

> WebersLink is a forward-deployed engineering team for contractors, home-service and other service businesses in the US, UK and Europe. We build and run lead systems in-house: websites, AI assistants that reply in 60 seconds, follow-up automation, local SEO and AI workflow automation. Based in Lahore, Pakistan. Plans are month-to-month. Lead System: $490/month plus a one-time $1,490 setup. Growth Engine: $990/month plus setup. Websites from $1,490 one-time.

## Offers
${OFFERS.map((o) => llmLink(o.path, o.name, o.description)).join("\n")}

## Services
${SERVICES.map((p) => llmLink(p.path, p.card.title, p.description)).join("\n")}

## Industries
${INDUSTRIES.map((p) => llmLink(p.path, p.card.title, p.description)).join("\n")}

## Guides
${GUIDES.map((p) => llmLink(p.path, p.card.title, p.description)).join("\n")}

## Free resources
- [Free WordPress plugins](${SITE}/plugins/): Free, GPL-licensed WordPress plugins for forms, email, redirects, security and SEO.

## Contact
- [Contact and booking](${SITE}/contact): Book a free 20-minute walkthrough, email hassan@weberslink.org, or message on WhatsApp.
- [Sitemap](${SITE}/sitemap.xml)
`);
const rfc822 = (d) => new Date(d).toUTCString();
const xmlEsc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
fs.writeFileSync(path.join(PUBLIC, "feed.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>WebersLink guides</title>
  <link>${SITE}/blog/</link>
  <description>Practical guides on website costs, AI chatbots, SEO and turning visitors into booked clients.</description>
  <language>en</language>
  <atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml"/>
${GUIDES.map((g) => `  <item>
    <title>${xmlEsc(oneLine(g.h1))}</title>
    <link>${SITE}${g.path}</link>
    <guid isPermaLink="true">${SITE}${g.path}</guid>
    <pubDate>${rfc822(g.updated || g.date)}</pubDate>
    <description>${xmlEsc(oneLine(g.description))}</description>
  </item>`).join("\n")}
</channel>
</rss>
`);

console.log(`Built ${pages.length + 6} pages and sitemap.xml (${urls.length} URLs).`);
