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

function listTemplateFiles() {
  const files = new Map();
  for (const dir of [BUNDLED, OVERRIDE]) {
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

function loadTemplate(step, variant = "a") {
  const list = listTemplateFiles().filter((t) => t.step === step);
  const t = list.find((x) => x.variant === variant) || list.find((x) => x.variant === "a");
  if (!t) throw new Error(`templates/email${step}.txt is missing`);
  return parseTemplate(fs.readFileSync(t.file, "utf8"), t.name);
}

function variantsFor(step) {
  return listTemplateFiles().filter((t) => t.step === step).map((t) => t.variant);
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
  return {
    domain,
    category: category ? category.toLowerCase().replace(/&/g, "and") : "online",
    niche: String(lead.niche || "").trim(),
    country: lead.country || "",
    currency: String(lead.country || "").toUpperCase() === "UK" ? "£" : "$",
    speed_note: speedNote,
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

const SAMPLE_LEAD = { store: "Example Store", domain: "example.com", psi: "34", lcp: "6.1", first_name: "", country: "US", category: "Apparel", niche: "Fashion & Apparel", email: "owner@example.com" };

function renderHtml(main, cfg) {
  const sig = cfg.signature;
  const accent = /^#[0-9a-f]{3,8}$/i.test(sig.accent_color || "") ? sig.accent_color : "#5B2EE5";
  const first = String(sig.name || "").trim().split(/\s+/)[0];
  let paras = main.trim().split(/\n\s*\n/).map((p) => p.replace(/^\n+|\n+$/g, "")).filter((p) => p.trim());
  if (paras.length && paras[paras.length - 1].trim() === first) paras = paras.slice(0, -1); // signature block replaces the sign-off
  const blocks = paras.map((p) => {
    const lines = p.split("\n");
    if (lines.every((l) => l.trim().startsWith("- "))) {
      return `<ul style="margin:0 0 16px 0;padding-left:20px;">${lines.map((l) => `<li style="margin:0 0 6px 0;">${esc(l.trim().slice(2))}</li>`).join("")}</ul>`;
    }
    return `<p style="margin:0 0 16px 0;">${lines.map(esc).join("<br>")}</p>`;
  });
  const site = String(sig.website || "").trim();
  const href = /^https?:/i.test(site) ? site : "https://" + site;
  const role = sig.title ? `${esc(sig.title)}, ${esc(sig.company)}` : esc(sig.company);
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#ffffff;">
<div style="max-width:580px;padding:8px 4px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#222222;">
${blocks.join("")}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:8px;border-collapse:collapse;">
<tr><td style="border-left:3px solid ${accent};padding:2px 0 2px 12px;font-family:Arial,Helvetica,sans-serif;">
<div style="font-size:15px;font-weight:bold;color:#111111;">${esc(sig.name)}</div>
<div style="font-size:13px;color:#555555;">${role}</div>
<div style="font-size:13px;"><a href="${esc(href)}" style="color:${accent};text-decoration:none;">${esc(site)}</a></div>
</td></tr></table>
<div style="margin-top:28px;padding-top:12px;border-top:1px solid #eeeeee;font-size:11px;line-height:1.5;color:#999999;">
${esc(sig.postal_address)}<br>${esc(OPT_OUT_TEXT)}
</div>
</div></body></html>`;
}

/** Returns { subject, text, html } for email `step` to `lead`. */
function render(step, lead, cfg, variant = "a", rawTemplate = null) {
  const { subject, body } = rawTemplate ? parseTemplate(rawTemplate) : loadTemplate(step, variant);
  const fields = fieldsFor(lead, cfg);
  const sig = cfg.signature;
  const main = fill(body, fields).trimEnd();
  const footer = `\n\n--\n${sig.company} | ${sig.website}\n${sig.postal_address}\n${OPT_OUT_TEXT}`;
  return { subject: fill(subject, fields), text: main + footer, html: renderHtml(main, cfg) };
}

/** Email 1 variants are shared out evenly, stably per address. */
function pickVariant(lead, step) {
  const vs = variantsFor(step).sort();
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

module.exports = { OPT_OUT_TEXT, OVERRIDE, listTemplateFiles, parseTemplate, loadTemplate, variantsFor, fill, prettyDomain, shopperQuestions,
  fieldsFor, render, renderHtml, pickVariant, templateProblems, SAMPLE_LEAD, FILE_RE };
