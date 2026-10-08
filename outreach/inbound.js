/*
 * Helpers for reading replies. The goal is to look only at what the person actually wrote:
 * quoted history (including our own footer, which contains the word "unsubscribe") must never decide
 * whether someone opted out.
 */
const { OPT_OUT_TEXT } = require("./templates");

// "On Tue, 3 Mar 2026 at 10:15, Name <a@b.com> wrote:" - Gmail/Outlook often wrap it onto a second line.
const ATTRIBUTION = /(^|\n)[ \t]*(?:On\b[^\n]{0,250}(?:\n[^\n]{0,120})?[ \t]*wrote:|Le\b[^\n]{0,250}(?:\n[^\n]{0,120})?[ \t]*a écrit[ \t]*:|Am\b[^\n]{0,250}(?:\n[^\n]{0,120})?[ \t]*schrieb[^\n]{0,80}:|El\b[^\n]{0,250}(?:\n[^\n]{0,120})?[ \t]*escribió:|-{2,}[ \t]*Original Message|-{2,}[ \t]*Forwarded message|_{5,}[ \t]*\n[ \t]*From:|From:[^\n]*\n[ \t]*(?:Sent|Date):)/i;
const OUR_FOOTER = new RegExp(OPT_OUT_TEXT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+").replace(/["']/g, "[\"'\u2018\u2019\u201c\u201d]"), "gi");

/** The new part of a reply: everything before the quoted history, with quoted lines and our own footer removed. */
function freshReply(text) {
  let t = String(text || "").replace(/\r\n/g, "\n");
  const m = ATTRIBUTION.exec(t);
  if (m) t = t.slice(0, m.index);
  return stripOurFooter(t.split("\n").filter((l) => !/^[ \t]*>/.test(l)).join("\n")).trim();
}

function stripOurFooter(text) {
  return String(text || "").replace(OUR_FOOTER, " ").replace(/Prefer\s+not\s+to\s+hear\s+from\s+me\?[\s\S]{0,140}?off\s+my\s+list\.?/gi, " ");
}

module.exports = { freshReply, stripOurFooter };
