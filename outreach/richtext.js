/*
 * Rich-text replies from the dashboard: the reply editor sends HTML (so pasted links, bold, lists and images survive).
 * Everything here treats that HTML as untrusted: only a short list of tags/attributes is kept, links must be
 * http(s)/mailto, and inline images (data: URLs) are turned into real attachments referenced by cid:.
 */
const crypto = require("crypto");

const MAX_FILES = 10;
const MAX_TOTAL_BYTES = 10 * 1024 * 1024; // decoded size of all attachments and inline images together
const MAX_HTML_CHARS = 100000; // after inline images were taken out

const KEEP = new Set(["a", "b", "strong", "i", "em", "u", "s", "strike", "br", "p", "div", "span", "ul", "ol", "li", "blockquote", "img", "h1", "h2", "h3", "hr"]);
const VOID = new Set(["br", "img", "hr"]);
const DROP_WITH_CONTENT = new Set(["script", "style", "head", "title", "noscript", "template", "iframe", "object", "svg", "math", "textarea", "select"]);

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const decode = (s) => String(s)
  .replace(/&#x([0-9a-f]+);?/gi, (_, h) => safeChar(parseInt(h, 16)))
  .replace(/&#(\d+);?/g, (_, d) => safeChar(parseInt(d, 10)))
  .replace(/&(nbsp|amp|lt|gt|quot|apos|#39);/g, (_, n) => ({ nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'" }[n]));
function safeChar(n) { try { return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ""; } catch (e) { return ""; } }

function safeHref(v) {
  const s = decode(v).replace(/[\u0000- \u007f]+/g, "").trim();
  if (/^https?:\/\/[^\s]+$/i.test(s) || /^mailto:[^\s]+$/i.test(s)) return s;
  if (/^www\.[^\s]+$/i.test(s)) return "https://" + s;
  return "";
}
function parseAttrs(raw) {
  const out = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = re.exec(raw))) out[m[1].toLowerCase()] = m[3] ?? m[4] ?? m[5] ?? "";
  return out;
}

/** Whitelist-sanitises HTML. allowImg(src) decides which image sources are kept (others are dropped). */
function sanitize(html, { allowImg = (src) => /^cid:[\w.@-]+$/i.test(src) } = {}) {
  const out = [];
  const open = [];
  let skip = null; // tag name whose content is being dropped
  const re = /<!--[\s\S]*?(?:-->|$)|<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|<!?[^>]*>?|[^<]+|</g;
  let m;
  while ((m = re.exec(String(html || "")))) {
    const tok = m[0];
    if (!m[2]) {
      if (skip || tok.startsWith("<!")) continue;
      if (tok === "<") { out.push("&lt;"); continue; }
      if (tok.startsWith("<")) continue; // processing instructions, broken tags
      out.push(esc(decode(tok)));
      continue;
    }
    const close = m[1] === "/", name = m[2].toLowerCase();
    if (skip) { if (close && name === skip) skip = null; continue; }
    if (DROP_WITH_CONTENT.has(name)) { if (!close && !/\/\s*$/.test(m[3])) skip = name; continue; }
    if (!KEEP.has(name)) continue;
    if (close) {
      if (VOID.has(name)) continue;
      const at = open.lastIndexOf(name);
      if (at < 0) continue;
      while (open.length > at) out.push(`</${open.pop()}>`);
      continue;
    }
    const a = parseAttrs(m[3]);
    if (name === "a") {
      const href = safeHref(a.href || "");
      out.push(href ? `<a href="${esc(href)}" target="_blank" rel="noopener">` : "<a>");
    } else if (name === "img") {
      const src = decode(a.src || "").trim();
      if (!src || !allowImg(src)) continue;
      const dims = ["width", "height"].filter((k) => /^\d{1,4}$/.test(a[k] || "")).map((k) => ` ${k}="${a[k]}"`).join("");
      out.push(`<img src="${esc(src)}" alt="${esc(decode(a.alt || ""))}"${dims} style="max-width:100%;height:auto">`);
      continue;
    } else out.push(`<${name}>`);
    if (!VOID.has(name)) open.push(name);
  }
  while (open.length) out.push(`</${open.pop()}>`);
  return out.join("");
}

/** Plain-text version of (sanitised) HTML for the text/plain part: links become "text (url)". */
function htmlToText(html) {
  let s = String(html || "")
    .replace(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, inner) => {
      const label = inner.replace(/<[^>]+>/g, "").trim(), url = decode(href).replace(/^mailto:/i, "");
      return !label || decode(label) === url ? url : `${label} (${url})`;
    })
    .replace(/<img[^>]*alt="([^"]*)"[^>]*>/gi, (_, alt) => (alt ? `[${alt}]` : ""))
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<\/?div[^>]*>/gi, "\u0001") // one editor line = one <div>: a single line break, however they nest
    .replace(/<\/(p|h[1-3]|blockquote|ul|ol)>/gi, "\n")
    .replace(/<(p|h[1-3]|blockquote|ul|ol)[^>]*>/gi, "\n")
    .replace(/<hr[^>]*>/gi, "\n----\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n?\u0001(?:[ \t]*\u0001)*\n?/g, "\n");
  s = decode(s).replace(/ /g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

const IMG_TYPES = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" };
const DATA_IMG = /^data:(image\/(?:png|jpeg|gif|webp));base64,([a-z0-9+/=\s]+)$/i;
const cleanName = (n, fallback) => String(n || "").replace(/[\u0000-\u001f\u007f/\\:*?"<>|]+/g, "_").replace(/^\.+/, "").trim().slice(0, 120) || fallback;
const b64bytes = (b64) => { const s = b64.replace(/\s+/g, ""); return Math.floor((s.length * 3) / 4) - (s.endsWith("==") ? 2 : s.endsWith("=") ? 1 : 0); };

/**
 * Turns the editor's HTML + attachment list into what gets stored/sent:
 * { html (sanitised, inline images as cid:), text, attachments: [{ filename, contentType, content (base64), cid? }] }.
 * files: [{ name, type, data (base64) }] from the dashboard. Throws a friendly Error when something is too big.
 */
function prepare(html, files = []) {
  const attachments = [];
  let total = 0;
  const add = (a, bytes) => {
    if (attachments.length >= MAX_FILES) throw new Error(`At most ${MAX_FILES} attachments and images per message.`);
    total += bytes;
    if (total > MAX_TOTAL_BYTES) throw new Error("Attachments and images are too large together (10 MB at most).");
    attachments.push(a);
  };
  // Inline images first: <img src="data:..."> -> cid attachment.
  const withCids = String(html || "").replace(/(<img\b[^>]*?\bsrc\s*=\s*)("([^"]*)"|'([^']*)')/gi, (all, pre, _q, d1, d2) => {
    const src = decode(d1 ?? d2 ?? "").trim(), m = DATA_IMG.exec(src);
    if (!m) return all;
    const type = m[1].toLowerCase(), data = m[2].replace(/\s+/g, ""), cid = `img${crypto.randomBytes(6).toString("hex")}@weberslink`;
    add({ filename: `image-${attachments.length + 1}.${IMG_TYPES[type]}`, contentType: type, content: data, cid }, b64bytes(data));
    return `${pre}"cid:${cid}"`;
  });
  const clean = sanitize(withCids, { allowImg: (src) => /^cid:[\w.@-]+$/i.test(src) && attachments.some((a) => `cid:${a.cid}` === src) || /^https:\/\/[^\s"'<>]+$/i.test(src) });
  if (clean.length > MAX_HTML_CHARS) throw new Error("The message is too long.");
  for (const f of Array.isArray(files) ? files : []) {
    const data = String((f && f.data) || "").replace(/^data:[^,]*,/, "").replace(/\s+/g, "");
    if (!data || !/^[a-z0-9+/]+=*$/i.test(data)) throw new Error(`The file ${cleanName(f && f.name, "attachment")} could not be read.`);
    const type = /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test((f && f.type) || "") ? f.type.toLowerCase() : "application/octet-stream";
    add({ filename: cleanName(f.name, `attachment-${attachments.length + 1}`), contentType: type, content: data }, b64bytes(data));
  }
  return { html: clean, text: htmlToText(clean), attachments };
}

/** The HTML part as it is emailed (simple, readable in every mail app). */
const wrapEmail = (html) => `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#222">${html}</div>`;
/** nodemailer attachment objects. */
const forMail = (attachments = []) => attachments.map((a) => ({ filename: a.filename, contentType: a.contentType, content: Buffer.from(a.content, "base64"), ...(a.cid ? { cid: a.cid, contentDisposition: "inline" } : {}) }));

module.exports = { sanitize, htmlToText, prepare, wrapEmail, forMail, MAX_TOTAL_BYTES, MAX_FILES };
