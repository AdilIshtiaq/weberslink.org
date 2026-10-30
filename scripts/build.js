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

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const strip = (s) => String(s).replace(/<[^>]+>/g, "");

// ---------- Shared navigation ----------
const SERVICES = pages.filter((p) => p.type === "service");
const INDUSTRIES = pages.filter((p) => p.type === "industry");
const GUIDES = pages.filter((p) => p.type === "guide");

function nav() {
  return `<header class="nav scrolled" id="nav">
  <div class="wrap">
    <a href="/" class="logo"><img class="logo-img" src="/assets/logo.png" alt="WebersLink" width="187" height="33"></a>
    <nav class="nav-links" id="navLinks" aria-label="Main">
      <a href="/services/">Services</a>
      <a href="/industries/">Industries</a>
      <a href="/#work">Work</a>
      <a href="/#pricing">Pricing</a>
      <a href="/blog/">Guides</a>
      <a href="/plugins/">Plugins</a>
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
        <a href="/" class="logo"><img class="logo-img" src="/assets/logo.png" alt="WebersLink" width="187" height="33"></a>
        <p>Done-for-you lead systems — websites, AI that answers every lead in 60 seconds, and automatic follow-up — for contractors and service businesses in the US &amp; Europe.</p>
        <a href="/#book" class="btn btn-light" data-track="Book CTA" data-loc="footer">Book a free call</a>
      </div>
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
<meta name="theme-color" content="#0a0a0a">
<link rel="icon" href="/favicon.ico" sizes="any"><link rel="icon" href="/favicon-48.png" type="image/png" sizes="48x48"><link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32">
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
    ${p.heroCta || `<div class="hero-cta">
      <a href="/#book" class="btn btn-light" data-track="Book CTA" data-loc="${p.path}">Book a free strategy call →</a>
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
<script src="/assets/chat-widget.js" defer></script>
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

write("/plugins/", render({
  path: "/plugins/", type: "hub", kicker: "Plugins",
  title: "Free WordPress Plugins | WebersLink",
  description: "Free WordPress plugins from WebersLink: Weberslink Forms Pro (drag-and-drop form builder with payments and 35+ templates) and Weberslink SMTP & Email Log (reliable email with a searchable log).",
  h1: "Free WordPress plugins <em>you can download.</em>",
  lead: "Tools we build and use for our own client sites, packaged so you can install them in a minute.",
  card: { title: "Plugins" },
  software: SOFTWARE,
  heroCta: `<div class="hero-cta">
      <a href="${PLUGIN_ZIP}" class="btn btn-light" download data-track="Plugin download" data-loc="hero">Download Forms Pro ↓</a>
      <a href="${SMTP_ZIP}" class="btn btn-ghost" download data-track="Plugin download" data-loc="hero-smtp">Download SMTP &amp; Email Log ↓</a>
    </div>`,
  faqs: pluginFaqs,
  body: pluginCard("plugins-hub") + "\n" + smtpCard("plugins-hub"),
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
  ["/plugins/", "0.7"], ["/plugins/weberslink-forms-pro", "0.7"], ["/plugins/weberslink-smtp", "0.7"],
  ["/privacy", "0.2"],
];
fs.writeFileSync(path.join(PUBLIC, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(([u, pr]) => `  <url><loc>${SITE}${u}</loc><lastmod>${(byPath[u] && (byPath[u].updated || byPath[u].date)) || TODAY}</lastmod><priority>${pr}</priority></url>`).join("\n")}
</urlset>
`);

console.log(`Built ${pages.length + 6} pages and sitemap.xml (${urls.length} URLs).`);
