/*
 * Minimal, dependency-free .xlsx reader (zip + XML), used for lead import.
 * Reads one sheet into an array of objects keyed by the header row. Defensive against hostile files:
 * entry count, per-entry and total inflated size are capped before anything is decompressed.
 */
const zlib = require("zlib");

const MAX_ENTRIES = 300;
const MAX_ENTRY_BYTES = 40 * 1024 * 1024;
const MAX_TOTAL_BYTES = 80 * 1024 * 1024;
const MAX_ROWS = 20000;
const MAX_COLS = 200;

function fail(msg) { throw Object.assign(new Error(msg), { status: 400 }); }

function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) fail("That doesn't look like an .xlsx file (try Save As .xlsx or .csv).");
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  if (count > MAX_ENTRIES) fail("Spreadsheet has too many internal files.");
  const entries = new Map();
  let total = 0;
  for (let n = 0; n < count; n++) {
    if (off + 46 > buf.length || buf.readUInt32LE(off) !== 0x02014b50) fail("Damaged spreadsheet file.");
    const method = buf.readUInt16LE(off + 10), csize = buf.readUInt32LE(off + 20), usize = buf.readUInt32LE(off + 24);
    const nlen = buf.readUInt16LE(off + 28), elen = buf.readUInt16LE(off + 30), clen = buf.readUInt16LE(off + 32), lho = buf.readUInt32LE(off + 42);
    const name = buf.toString("utf8", off + 46, off + 46 + nlen);
    off += 46 + nlen + elen + clen;
    if (usize > MAX_ENTRY_BYTES) fail("Spreadsheet is too large.");
    total += usize;
    if (total > MAX_TOTAL_BYTES) fail("Spreadsheet is too large.");
    entries.set(name, { method, csize, usize, lho });
  }
  return {
    has: (name) => entries.has(name),
    read(name) {
      const e = entries.get(name);
      if (!e) return null;
      if (e.lho + 30 > buf.length || buf.readUInt32LE(e.lho) !== 0x04034b50) fail("Damaged spreadsheet file.");
      const start = e.lho + 30 + buf.readUInt16LE(e.lho + 26) + buf.readUInt16LE(e.lho + 28);
      const raw = buf.subarray(start, start + e.csize);
      if (e.method === 0) return raw.toString("utf8");
      if (e.method !== 8) fail("Unsupported compression in spreadsheet.");
      try { return zlib.inflateRawSync(raw, { maxOutputLength: MAX_ENTRY_BYTES }).toString("utf8"); } catch (err) { fail("Damaged spreadsheet file."); }
    },
  };
}

const unescapeXml = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, g) => {
  const l = g.toLowerCase();
  if (l === "amp") return "&"; if (l === "lt") return "<"; if (l === "gt") return ">"; if (l === "quot") return '"'; if (l === "apos") return "'";
  const code = l[1] === "x" ? parseInt(l.slice(2), 16) : parseInt(l.slice(1), 10);
  return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
});
const textOf = (xml) => { let out = ""; for (const m of xml.matchAll(/<t[^>]*>([^<]*)<\/t>/g)) out += unescapeXml(m[1]); return out; };
const attr = (tag, name) => { const m = new RegExp(`\\b${name}="([^"]*)"`).exec(tag); return m ? unescapeXml(m[1]) : ""; };

function colIndex(ref) {
  const m = /^([A-Z]+)/.exec(ref);
  if (!m) return -1;
  let n = 0;
  for (const ch of m[1]) n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
}

/** Returns rows (objects) from the sheet called `sheetName` (case-insensitive), else the first sheet. */
function readSheet(buf, sheetName = "Leads") {
  const zip = readZip(buf);
  const wb = zip.read("xl/workbook.xml");
  if (!wb) fail("That doesn't look like an .xlsx file (try Save As .xlsx or .csv).");
  const rels = zip.read("xl/_rels/workbook.xml.rels") || "";
  const sheets = [...wb.matchAll(/<sheet\b[^>]*>/g)].map((m) => ({ name: attr(m[0], "name"), rid: attr(m[0], "r:id") }));
  if (!sheets.length) fail("The spreadsheet has no sheets.");
  const chosen = sheets.find((s) => s.name.trim().toLowerCase() === sheetName.toLowerCase()) || sheets[0];
  let target = "";
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) if (attr(m[0], "Id") === chosen.rid) target = attr(m[0], "Target");
  target = target.startsWith("/") ? target.slice(1) : "xl/" + target.replace(/^\.?\//, "");
  const xml = zip.read(target);
  if (xml == null) fail("Could not find the sheet's data.");

  const shared = [];
  const sst = zip.read("xl/sharedStrings.xml");
  if (sst) for (const m of sst.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) shared.push(textOf(m[1]));

  const rows = [];
  for (const rm of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    if (rows.length > MAX_ROWS) fail(`Too many rows (limit ${MAX_ROWS}).`);
    const cells = [];
    for (const cm of rm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const idx = colIndex(attr(cm[1], "r"));
      if (idx < 0 || idx >= MAX_COLS) continue;
      const type = attr(cm[1], "t"), inner = cm[2] || "";
      let val = "";
      if (type === "inlineStr") val = textOf(inner);
      else {
        const v = /<v>([^<]*)<\/v>/.exec(inner);
        if (v) val = type === "s" ? shared[parseInt(v[1], 10)] || "" : unescapeXml(v[1]);
      }
      cells[idx] = String(val).trim();
    }
    if (cells.some((c) => c)) rows.push(Array.from(cells, (c) => c || ""));
  }
  if (!rows.length) return [];
  const header = rows[0];
  return rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] || ""]).filter(([h]) => h)));
}

module.exports = { readSheet };
