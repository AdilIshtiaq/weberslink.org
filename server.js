const http = require("http");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

let nodemailer = null;
try {
  nodemailer = require("nodemailer");
} catch (e) {
  console.warn("nodemailer not installed — leads will only be logged.");
}

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const LEADS_FILE = path.join(__dirname, "leads", "leads.jsonl");
const LEAD_TO = process.env.LEAD_TO || "hassan@weberslink.org";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".webmanifest": "application/manifest+json",
};
const COMPRESSIBLE = new Set([".html", ".css", ".js", ".json", ".xml", ".txt", ".svg", ".webmanifest"]);

// ---------- Email ----------
const smtpReady = nodemailer && process.env.SMTP_USER && process.env.SMTP_PASS;
const transporter = smtpReady
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.hostinger.com",
      port: Number(process.env.SMTP_PORT || 465),
      secure: Number(process.env.SMTP_PORT || 465) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  : null;
if (!smtpReady) console.warn("SMTP_USER/SMTP_PASS not set — leads will be logged, not emailed.");

const esc = (s) => String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function deliverLead(lead) {
  try {
    fs.mkdirSync(path.dirname(LEADS_FILE), { recursive: true });
    fs.appendFileSync(LEADS_FILE, JSON.stringify(lead) + "\n");
  } catch (e) {
    console.error("Could not write lead file:", e.message);
  }
  console.log("NEW LEAD:", JSON.stringify(lead));
  if (!transporter) return;

  const isAudit = lead.type === "audit";
  const rows = Object.entries(lead)
    .filter(([k]) => k !== "ip")
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#666">${esc(k)}</td><td style="padding:4px 0">${esc(v)}</td></tr>`)
    .join("");
  await transporter.sendMail({
    from: `"WebersLink Website" <${process.env.SMTP_USER}>`,
    to: LEAD_TO,
    replyTo: lead.email,
    subject: isAudit ? `New audit request — ${lead.website || lead.email}` : `New call request — ${lead.name} (${lead.service || "general"})`,
    html: `<h2>${isAudit ? "Free website audit request" : "Strategy call request"}</h2><table>${rows}</table>`,
  });
  await transporter.sendMail({
    from: `"WebersLink" <${process.env.SMTP_USER}>`,
    to: lead.email,
    subject: isAudit ? "Your free website audit is on its way" : "Thanks — let's find a time to talk",
    text: isAudit
      ? `Hi${lead.name ? " " + lead.name : ""},\n\nThanks for requesting a free audit of ${lead.website}. We'll review your site and send a short video walkthrough with the top improvements within 48 hours.\n\n— The WebersLink team\nhttps://weberslink.org`
      : `Hi ${lead.name},\n\nThanks for reaching out to WebersLink. We've received your details and will reply within 24 hours with a few times for your free strategy call (in your time zone: ${lead.timezone || "—"}).\n\nIf it's urgent, just reply to this email.\n\n— The WebersLink team\nhttps://weberslink.org`,
  });
}

// ---------- Lead API ----------
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  list.push(now);
  hits.set(ip, list);
  return list.length > 5;
}

function sendJson(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(obj));
}

function handleLead(req, res) {
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
    if (body.length > 20000) req.destroy();
  });
  req.on("end", async () => {
    let data;
    try {
      data = JSON.parse(body);
    } catch (e) {
      return sendJson(res, 400, { ok: false, error: "Invalid request." });
    }
    // Honeypot: real visitors never fill this hidden field
    if (data.fax) return sendJson(res, 200, { ok: true });

    const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
    if (rateLimited(ip)) return sendJson(res, 429, { ok: false, error: "Too many requests — please try again later." });

    const clip = (v, n = 300) => String(v || "").trim().slice(0, n);
    const lead = {
      type: data.type === "audit" ? "audit" : "call",
      name: clip(data.name, 100),
      email: clip(data.email, 200),
      website: clip(data.website, 300),
      service: clip(data.service, 100),
      budget: clip(data.budget, 100),
      timeline: clip(data.timeline, 100),
      package: clip(data.package, 100),
      message: clip(data.message, 3000),
      timezone: clip(data.timezone, 100),
      page: clip(data.page, 300),
      time: new Date().toISOString(),
      ip,
    };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) return sendJson(res, 400, { ok: false, error: "Please enter a valid email." });
    if (lead.type === "call" && !lead.name) return sendJson(res, 400, { ok: false, error: "Please enter your name." });
    if (lead.type === "audit" && !lead.website) return sendJson(res, 400, { ok: false, error: "Please enter your website." });

    try {
      await deliverLead(lead);
      sendJson(res, 200, { ok: true });
    } catch (e) {
      console.error("Lead email failed:", e.message);
      // Lead is already logged; still confirm to the visitor
      sendJson(res, 200, { ok: true });
    }
  });
}

// ---------- Static files ----------
function cacheHeader(ext, urlPath) {
  if (ext === ".html") return "no-cache";
  if (urlPath.startsWith("/vendor/") || urlPath.startsWith("/images/")) return "public, max-age=2592000";
  return "public, max-age=86400";
}

function serveStatic(req, res) {
  let urlPath;
  try {
    urlPath = decodeURIComponent(req.url.split("?")[0]);
  } catch (e) {
    res.writeHead(400);
    return res.end("Bad request");
  }
  let filePath = path.normalize(path.join(PUBLIC_DIR, urlPath));
  if (filePath !== PUBLIC_DIR && !filePath.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.stat(filePath, (err, stats) => {
    if (!err && stats.isDirectory()) filePath = path.join(filePath, "index.html");
    else if (err && !path.extname(filePath)) filePath += ".html"; // /privacy -> privacy.html

    fs.readFile(filePath, (readErr, data) => {
      if (readErr) {
        return fs.readFile(path.join(PUBLIC_DIR, "404.html"), (e404, page) => {
          res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
          res.end(e404 ? "404 Not Found" : page);
        });
      }
      const ext = path.extname(filePath).toLowerCase();
      const headers = {
        "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
        "Cache-Control": cacheHeader(ext, urlPath),
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "strict-origin-when-cross-origin",
      };
      if (COMPRESSIBLE.has(ext) && /\bgzip\b/.test(req.headers["accept-encoding"] || "")) {
        headers["Content-Encoding"] = "gzip";
        headers["Vary"] = "Accept-Encoding";
        res.writeHead(200, headers);
        return res.end(zlib.gzipSync(data));
      }
      res.writeHead(200, headers);
      res.end(data);
    });
  });
}

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api/lead") return handleLead(req, res);
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405);
    return res.end("Method not allowed");
  }
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
