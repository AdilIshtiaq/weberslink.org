/*
 * Email templates + rendering (port of the Python outreach tool's template code).
 *
 * Template files: outreach/templates/email1.txt (variant "a"), email1b.txt ("b"), email2.txt ...
 * Edits made in the dashboard are saved to OUTREACH_DATA_DIR/templates/ and win over the bundled ones.
 * First line must be "Subject: ...". Fields look like {domain}.
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const store = require("./store");

const BUNDLED = path.join(__dirname, "templates");
const OVERRIDE = store.P("templates");
const FILE_RE = /^email([1-4])([b-z]?)\.txt$/;
const OPT_OUT_TEXT = 'Prefer not to hear from me? Reply "unsubscribe" and I\'ll take you off my list.';

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Folder holding one campaign's own email copy (campaign ids are small whole numbers), or null. */
const campaignDir = (id) => (/^\d{1,2}$/.test(String(id == null ? "" : id)) ? path.join(OVERRIDE, "campaign-" + id) : null);

/** Bundled emails, overridden by your edits, overridden by the campaign's own edits (when a campaign id is given). */
function listTemplateFiles(campaign) {
  const files = new Map();
  for (const dir of [BUNDLED, OVERRIDE, campaignDir(campaign)].filter(Boolean)) {
    let names = [];
    try { names = fs.readdirSync(dir); } catch (e) { continue; }
    for (const n of names) if (FILE_RE.test(n)) files.set(n, path.join(dir, n));
  }
  return [...files.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, file]) => {
    const m = FILE_RE.exec(name);
    return { name, file, step: Number(m[1]), variant: m[2] || "a" };
  });
}

function parseTemplate(raw, name = "template") {
  const text = String(raw).replace(/\r\n/g, "\n").replace(/^\n+|\n+$/g, "");
  const nl = text.indexOf("\n");
  const first = nl < 0 ? text : text.slice(0, nl);
  if (!/^subject:/i.test(first)) throw new Error(`${name} must start with a "Subject:" line`);
  return { subject: first.slice(8).trim(), body: (nl < 0 ? "" : text.slice(nl + 1)).replace(/^\n+/, "") };
}

function loadTemplate(step, variant = "a", campaign) {
  const list = listTemplateFiles(campaign).filter((t) => t.step === step);
  const t = list.find((x) => x.variant === variant) || list.find((x) => x.variant === "a");
  if (!t) throw new Error(`templates/email${step}.txt is missing`);
  return parseTemplate(fs.readFileSync(t.file, "utf8"), t.name);
}

function variantsFor(step, campaign) {
  return listTemplateFiles(campaign).filter((t) => t.step === step).map((t) => t.variant);
}

/**
 * Spintax: "{Hi|Hey|Hello} there" becomes one of the options, chosen by a hash of `seed` (the lead's address and the step), so
 * no two leads get identical wording but the same lead always gets the same text (previews and resends never change).
 */
function spin(text, seed) {
  let n = 0;
  return String(text).replace(/\{([^{}|]*\|[^{}]*)\}/g, (m, inner) => {
    const opts = inner.split("|");
    return opts[crypto.createHash("sha1").update(`${seed}:${n++}`).digest().readUInt32BE(0) % opts.length];
  });
}

/** Fill {field} placeholders. Unknown fields throw so a typo can never reach a real email. */
function fill(text, fields) {
  return text.replace(/\{(\w+)\}/g, (m, k) => {
    if (!(k in fields)) throw new Error(`unknown field {${k}}`);
    return fields[k];
  });
}

function prettyDomain(d) {
  return String(d || "").trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0].replace(/^www\./, "");
}

const QUESTION_RULES = [
  [/eyewear|glasses|sunglass|contact lens/, "frame sizes, lenses, shipping or returns"],
  [/jewel|watch/, "sizes, materials, shipping or returns"],
  [/accessor|headwear|hat|bag|belt|scarf/, "sizes, materials, shipping or returns"],
  [/apparel|cloth|formal ?wear|footwear|shoe|undergarment|costume|sporting/, "sizing, fit, shipping or returns"],
  [/cosmetic|make-up|makeup|skin|face|body|hair|hygiene|toiletr|oil/, "ingredients, skin types, shipping or returns"],
  [/vitamin|supplement|cbd|nutrition|tea|herbal|wellness|health/, "ingredients, dosage, shipping or returns"],
];
function shopperQuestions(lead) {
  const cat = String(lead.category || "").toLowerCase();
  const text = `${lead.niche || ""} ${cat}`.toLowerCase();
  for (const [re, q] of QUESTION_RULES) if (re.test(cat)) return q;
  for (const [re, q] of QUESTION_RULES) if (re.test(text)) return q;
  return "products, shipping or returns";
}

function fieldsFor(lead, cfg) {
  const sig = cfg.signature;
  const domain = prettyDomain(lead.domain);
  const category = String(lead.category || lead.niche || "").trim();
  const psi = String(lead.psi || "");
  const lcp = String(lead.lcp || "");
  let speedNote = "";
  const score = parseInt(psi, 10);
  if (psi && !Number.isNaN(score) && score < 70) {
    speedNote = `\n\nAlso, Google's mobile test gives ${domain} ${score}/100, so pages are slow on phones too. I'll cover that in the video.`;
  }
  const firstName = String(lead.first_name || "").trim();
  // Only a line a person approved (or supplied in the spreadsheet) is ever used. Pending or rejected AI drafts stay out.
  const customLine = lead.research_status === "approved" ? String(lead.custom_line || "").replace(/\s+/g, " ").trim() : "";
  return {
    domain,
    category: category ? category.toLowerCase().replace(/&/g, "and") : "online",
    niche: String(lead.niche || "").trim(),
    country: lead.country || "",
    currency: String(lead.country || "").toUpperCase() === "UK" ? "£" : "$",
    speed_note: speedNote,
    custom_line: customLine,
    custom_line_para: customLine ? customLine + "\n\n" : "",
    questions: shopperQuestions(lead),
    store: lead.store || domain,
    psi,
    lcp,
    speed_line: lcp ? `It scores ${psi}/100 on mobile, and the main content takes about ${lcp}s to appear.` : `It scores ${psi}/100 on mobile.`,
    greeting: firstName ? `Hi ${firstName.split(/\s+/)[0]},` : "Hi there,",
    first_name: firstName,
    sender_first_name: String(sig.name || "").trim().split(/\s+/)[0] || "",
    sender_name: sig.name || "",
    company: sig.company || "",
    website: sig.website || "",
  };
}

const SAMPLE_LEAD = { custom_line: "I saw that Example Store sells organic cotton basics with free returns.", research_status: "approved", store: "Example Store", domain: "example.com", psi: "34", lcp: "6.1", first_name: "", country: "US", category: "Apparel", niche: "Fashion & Apparel", email: "owner@example.com" };

// Web addresses written in a template become real links in the HTML part (so they can be click-tracked).
const URL_IN_TEXT = /\b(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]])/gi;
const linkify = (escaped, accent) => escaped.replace(URL_IN_TEXT, (u) => `<a href="${u}" style="color:${accent};">${u}</a>`);

/**
 * The HTML part. Deliberately close to a personal email (cold email lands better that way): your words, a short signature,
 * a small footer with the postal address and a real unsubscribe link. Table-based and inline-styled for Outlook and Gmail;
 * a media query only enlarges the text on phones, so clients that strip <style> still get a clean layout.
 */
function renderHtml(main, cfg, { unsubscribeUrl = "" } = {}) {
  const sig = cfg.signature;
  const accent = /^#[0-9a-f]{3,8}$/i.test(sig.accent_color || "") ? sig.accent_color : "#EF1421";
  const first = String(sig.name || "").trim().split(/\s+/)[0];
  let paras = main.trim().split(/\n\s*\n/).map((p) => p.replace(/^\n+|\n+$/g, "")).filter((p) => p.trim());
  if (paras.length && paras[paras.length - 1].trim() === first) paras = paras.slice(0, -1); // the signature block replaces the sign-off
  const blocks = paras.map((p) => {
    const lines = p.split("\n");
    if (lines.every((l) => l.trim().startsWith("- "))) {
      return `<ul style="margin:0 0 16px 0;padding-left:20px;">${lines.map((l) => `<li style="margin:0 0 6px 0;">${linkify(esc(l.trim().slice(2)), accent)}</li>`).join("")}</ul>`;
    }
    return `<p style="margin:0 0 16px 0;">${lines.map((l) => linkify(esc(l), accent)).join("<br>")}</p>`;
  });
  const site = String(sig.website || "").trim();
  const href = /^https?:/i.test(site) ? site : "https://" + site;
  let logoUrl = "";
  if (sig.logo !== false) { try { logoUrl = new URL(href).origin + "/assets/email-logo.png"; } catch (e) { /* no valid website: no logo */ } }
  const role = sig.title ? `${esc(sig.title)} · ${esc(sig.company)}` : esc(sig.company);
  const logoRow = logoUrl ? `<tr><td style="padding:14px 0 0 0;"><a href="${esc(href)}"><img src="${esc(logoUrl)}" width="132" height="22" class="wl-logo" alt="${esc(sig.company)}" style="display:block;border:0;width:132px;max-width:100%;height:auto;"></a></td></tr>` : "";
  const optOut = unsubscribeUrl
    ? `Prefer not to hear from me? Reply &ldquo;unsubscribe&rdquo; or <a href="${esc(unsubscribeUrl)}" style="color:#8a8a8f;text-decoration:underline;">unsubscribe here</a>.`
    : esc(OPT_OUT_TEXT);
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<style>
  body{margin:0;padding:0;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
  img{border:0;max-width:100%;height:auto;}
  a{word-break:break-word;}
  @media only screen and (max-width:480px){
    .wl-wrap{padding:18px 16px !important;}
    .wl-body{font-size:16px !important;line-height:1.6 !important;}
    .wl-foot{font-size:12px !important;}
  }
</style></head>
<body style="margin:0;padding:0;background:#ffffff;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;background:#ffffff;"><tr><td align="left" style="padding:0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:580px;border-collapse:collapse;"><tr><td class="wl-wrap" style="padding:20px 20px 28px 20px;">
<div class="wl-body" style="font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:#1f1f23;word-wrap:break-word;overflow-wrap:break-word;">
${blocks.join("")}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:4px;border-collapse:collapse;max-width:100%;">
<tr><td style="border-left:3px solid ${accent};padding:1px 0 1px 12px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<div style="font-size:15px;font-weight:600;color:#111114;line-height:1.4;">${esc(sig.name)}</div>
<div style="font-size:13px;color:#5f5f66;line-height:1.5;">${role}</div>
<div style="font-size:13px;line-height:1.5;"><a href="${esc(href)}" style="color:${accent};text-decoration:none;">${esc(site.replace(/^https?:\/\//i, "").replace(/\/$/, ""))}</a></div>
</td></tr>
${logoRow}</table>
<div class="wl-foot" style="margin-top:30px;padding-top:12px;border-top:1px solid #ececee;font-size:11px;line-height:1.6;color:#8a8a8f;">
${esc(sig.postal_address)}<br>${optOut}
</div>
</div>
</td></tr></table>
</td></tr></table>
</body></html>`;
}

/** Returns { subject, text, html } for email `step` to `lead`. */
function render(step, lead, cfg, variant = "a", rawTemplate = null, { unsubscribeUrl = "" } = {}) {
  const { subject, body } = rawTemplate ? parseTemplate(rawTemplate) : loadTemplate(step, variant, lead.campaign);
  const fields = fieldsFor(lead, cfg);
  const sig = cfg.signature;
  const seed = `${String(lead.email || "").toLowerCase()}|${step}`;
  const main = fill(spin(body, seed), fields).trimEnd();
  const footer = `\n\n--\n${sig.company} | ${sig.website}\n${sig.postal_address}\n${OPT_OUT_TEXT}${unsubscribeUrl ? `\nUnsubscribe: ${unsubscribeUrl}` : ""}`;
  return { subject: fill(spin(subject, seed + "|s"), fields), text: main + footer, html: renderHtml(main, cfg, { unsubscribeUrl }) };
}

// ---------------------------------------------------------------- copy check (before launch, no AI needed)
const SPAMMY = /\b(act now|buy now|order now|limited time|risk[- ]free|100% (free|guaranteed)|guarantee[ds]?|winner|congratulations|cash|make money|earn \$|urgent|click here|no obligation|special promotion|exclusive deal|lowest price|cheap|discount|amazing deal|incredible|once in a lifetime|dear friend)\b/gi;
const PUSHY_CTA = /\b(reply now|call me (now|today)|book (now|today)|don'?t miss|last chance|asap|hurry)\b/gi;
/** Deliverability and quality check of one email. Returns { score 1-10, issues: [{ level: "bad"|"warn", text }], stats }. */
function copyCheck(subject, body, { first = true } = {}) {
  const issues = [], b = String(body || ""), sub = String(subject || "");
  const words = (b.match(/\S+/g) || []).length;
  const links = (b.match(/https?:\/\/\S+|\bwww\.\S+/gi) || []).length;
  const bad = (text) => issues.push({ level: "bad", text }), warn = (text) => issues.push({ level: "warn", text });
  const hits = [...new Set([...(sub.match(SPAMMY) || []), ...(b.match(SPAMMY) || [])].map((x) => x.toLowerCase()))];
  if (hits.length) (hits.length > 1 ? bad : warn)(`Spam-filter trigger words: ${hits.join(", ")}`);
  const cta = [...new Set((b.match(PUSHY_CTA) || []).map((x) => x.toLowerCase()))];
  if (cta.length) warn(`Pushy call to action: ${cta.join(", ")}. A soft question gets more replies.`);
  if (sub.length > 60) warn(`Subject is ${sub.length} characters; under 50 shows fully on phones.`);
  if (!sub.trim()) bad("The subject is empty.");
  if (/[A-Z]{4,}/.test(sub.replace(/\b(US|UK|AI|SEO|CBD|PSI|LCP|FAQ)\b/g, ""))) warn("Subject has ALL-CAPS words.");
  if ((sub.match(/!/g) || []).length) warn("Avoid exclamation marks in the subject.");
  if ((b.match(/!/g) || []).length > 1) warn("More than one exclamation mark in the body.");
  if (first && links > 1) (links > 2 ? bad : warn)(`${links} links in the first email; use none or one.`);
  else if (!first && links > 2) warn(`${links} links; keep follow-ups to one.`);
  if (first && words > 150) (words > 220 ? bad : warn)(`${words} words is long for a first cold email; under 120 reads best.`);
  if (words < 25) warn("Very short; add one specific detail so it doesn't look automated.");
  if (/<[a-z][\s\S]*>/i.test(b)) warn("Contains HTML-looking text; cold email works best as plain text.");
  const score = Math.max(1, 10 - 3 * issues.filter((i) => i.level === "bad").length - issues.filter((i) => i.level === "warn").length);
  return { score, issues, stats: { words, links, subjectLength: sub.length } };
}

/** Email 1 variants are shared out evenly, stably per address. */
function pickVariant(lead, step) {
  const vs = variantsFor(step, lead.campaign).sort();
  if (step > 1) return vs.includes(lead.variant) ? lead.variant : "a";
  const h = crypto.createHash("sha1").update(String(lead.email).toLowerCase()).digest().readUInt32BE(0);
  return vs[h % vs.length];
}

/** Everything wrong with the templates/signature that must be fixed before sending. */
function templateProblems(cfg) {
  const problems = [];
  for (const t of listTemplateFiles()) {
    try {
      const { subject, body } = parseTemplate(fs.readFileSync(t.file, "utf8"), t.name);
      const left = (subject + body).match(/\[[A-Z]{3,}[^\]]*\]/g) || [];
      for (const m of left) problems.push(`${t.name} still contains ${m}`);
      render(t.step, SAMPLE_LEAD, cfg, t.variant);
    } catch (e) { problems.push(`${t.name}: ${e.message}`); }
  }
  for (const step of [1, 2, 3, 4]) if (!variantsFor(step).includes("a")) problems.push(`templates/email${step}.txt is missing`);
  return problems;
}

module.exports = { OPT_OUT_TEXT, OVERRIDE, campaignDir, listTemplateFiles, parseTemplate, loadTemplate, variantsFor, fill, prettyDomain, fieldsFor, render, renderHtml, pickVariant, spin, copyCheck, templateProblems, SAMPLE_LEAD, FILE_RE };
