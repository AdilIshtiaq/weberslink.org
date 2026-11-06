/*
 * Booking e-mails, sent with the site's SMTP account (SMTP_USER / SMTP_PASS / SMTP_HOST / SMTP_PORT).
 * From: "<Business name>" <SMTP_USER>, Reply-To: the business's own e-mail, so replies reach the business.
 * Without SMTP set, e-mails are logged and skipped (bookings still work).
 */
let transport = null;
function smtp() {
  if (transport !== null) return transport;
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return (transport = false);
  const nodemailer = require("nodemailer");
  const port = Number(process.env.SMTP_PORT || 465);
  transport = nodemailer.createTransport({ host: process.env.SMTP_HOST || "smtp.hostinger.com", port, secure: port === 465, requireTLS: port !== 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }, connectionTimeout: 20000, socketTimeout: 30000 });
  return transport;
}
let sender = null; // tests replace the transport
function setSender(fn) { sender = fn; }

const base = () => String(process.env.BOOKING_PUBLIC_URL || process.env.SITE_URL || "https://weberslink.org").replace(/\/+$/, "");
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const when = (s, iso) => new Intl.DateTimeFormat("en-US", { timeZone: s.tz, weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
const money = (s, n) => (n ? s.currency + Number(n).toLocaleString("en-US") : "Free");
const line = (v) => String(v || "").replace(/[\r\n]+/g, " ");

function icsText(s, b, slug) {
  const svc = s.services.find((x) => x.id === b.serviceId) || { name: "Appointment" };
  const who = s.staff.find((x) => x.id === b.staffId) || { name: "" };
  const d = (iso) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const clean = (v) => line(v).replace(/([,;\\])/g, "\\$1");
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Weberslink//Booking//EN", "METHOD:PUBLISH", "BEGIN:VEVENT",
    `UID:${b.id}@${slug}.booking.weberslink`, `DTSTAMP:${d(new Date().toISOString())}`, `DTSTART:${d(b.start)}`, `DTEND:${d(b.end)}`,
    `SUMMARY:${clean(svc.name + " – " + s.name)}`, `DESCRIPTION:${clean("With " + who.name + ". Booking code " + b.code + ".")}`,
    `LOCATION:${clean(b.address || s.tag)}`, "BEGIN:VALARM", "TRIGGER:-PT2H", "ACTION:DISPLAY", "DESCRIPTION:Reminder", "END:VALARM", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
}

/** Builds { to, subject, text, html, ics? } for one event: confirm | reminder | cancel | moved | owner-new | owner-cancel | owner-moved. */
function compose(kind, s, b, slug) {
  const svc = s.services.find((x) => x.id === b.serviceId) || { name: "Appointment", price: 0 };
  const who = s.staff.find((x) => x.id === b.staffId) || { name: "" };
  const first = line(b.name).split(" ")[0];
  const manage = `${base()}/book/${slug}?code=${encodeURIComponent(b.code)}`;
  const at = when(s, b.start);
  const details = [`${svc.name} with ${who.name}`, at, `Price: ${money(s, svc.price)}`, b.address ? `Address: ${line(b.address)}` : "", `Booking code: ${b.code}`].filter(Boolean);
  const owner = kind.startsWith("owner-");
  const T = {
    confirm: [`Confirmed: ${svc.name} on ${at}`, `Hi ${first},\n\nYou're booked in.`, `Need to change or cancel? ${manage}`],
    reminder: [`Reminder: ${svc.name} ${at}`, `Hi ${first},\n\nA reminder of your appointment.`, `Can't make it? Please let us know: ${manage}`],
    moved: [`Moved: ${svc.name} is now ${at}`, `Hi ${first},\n\nYour booking has been moved to a new time.`, `Need another change? ${manage}`],
    cancel: [`Cancelled: ${svc.name} on ${at}`, `Hi ${first},\n\nYour booking has been cancelled.`, `Book again any time: ${base()}/book/${slug}`],
    "owner-new": [`New booking: ${line(b.name)} – ${svc.name}, ${at}`, `New ${b.source === "online" ? "online " : ""}booking.`, `Customer: ${line(b.name)}, ${b.phone}, ${b.email}${b.notes ? `\nNotes: ${line(b.notes)}` : ""}\nDashboard: ${base()}/book/${slug}/admin`],
    "owner-cancel": [`Cancelled: ${line(b.name)} – ${svc.name}, ${at}`, "A customer cancelled online. The time is free again.", `Customer: ${line(b.name)}, ${b.phone}, ${b.email}`],
    "owner-moved": [`Moved: ${line(b.name)} – ${svc.name}, now ${at}`, "A customer moved their booking online.", `Customer: ${line(b.name)}, ${b.phone}, ${b.email}`],
  }[kind];
  if (!T) throw new Error("unknown e-mail " + kind);
  const policy = !owner && s.policy && kind !== "cancel" ? `\n\n${s.policy}` : "";
  const sign = owner ? "" : `\n\n${s.name}${s.phone ? "\n" + s.phone : ""}`;
  const text = `${T[1]}\n\n${details.join("\n")}\n\n${T[2]}${policy}${sign}`;
  const linkify = (t) => esc(t).replace(/(https:\/\/[^\s<]+)/g, `<a href="$1" style="color:${s.accent}">$1</a>`);
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#222;max-width:560px">` +
    `<p>${linkify(T[1]).replace(/\n/g, "<br>")}</p><div style="border-left:3px solid ${s.accent};padding:4px 0 4px 12px;margin:14px 0">${details.map((d, i) => (i === 0 ? `<b>${esc(d)}</b>` : esc(d))).join("<br>")}</div>` +
    `<p>${linkify(T[2]).replace(/\n/g, "<br>")}</p>${policy ? `<p style="color:#666;font-size:13px">${esc(s.policy)}</p>` : ""}${sign ? `<p>${esc(sign.trim()).replace(/\n/g, "<br>")}</p>` : ""}</div>`;
  return { to: owner ? s.notifyEmail : b.email, subject: T[0], text, html, ics: ["confirm", "moved"].includes(kind) ? icsText(s, b, slug) : null };
}

/** Sends one e-mail; never throws (returns false and logs). */
async function send(kind, s, b, slug) {
  let m;
  try { m = compose(kind, s, b, slug); } catch (e) { console.error("booking mail:", e.message); return false; }
  if (!m.to) return false;
  const msg = { from: { name: s.name, address: process.env.SMTP_USER || "no-reply@weberslink.org" }, to: m.to, replyTo: kind.startsWith("owner-") ? undefined : s.notifyEmail || undefined,
    subject: m.subject, text: m.text, html: m.html, attachments: m.ics ? [{ filename: "booking.ics", content: m.ics, contentType: "text/calendar; method=PUBLISH" }] : undefined };
  try {
    if (sender) { await sender(msg, kind); return true; }
    const t = smtp();
    if (!t) { console.log(`booking mail (SMTP not set, not sent): ${kind} -> ${m.to}`); return false; }
    await t.sendMail(msg);
    return true;
  } catch (e) { console.error(`booking mail ${kind} -> ${m.to} failed:`, e.message); return false; }
}

/** Can e-mail actually be sent (SMTP set, or a test sender)? */
function canSend() { return Boolean(sender) || Boolean(process.env.SMTP_USER && process.env.SMTP_PASS); }

/** Account e-mails to a business owner: verify | reset. Never throws; returns true when sent. */
async function sendAccount(kind, to, { name, link }) {
  const T = {
    verify: ["Confirm your email to finish your booking page", `Hi,\n\nThanks for creating a booking page for ${name}. Confirm your email to set it up:\n\n${link}\n\nThe link works for 48 hours. If this wasn't you, ignore this email and nothing happens.`],
    reset: ["Reset your booking dashboard password", `Hi,\n\nSomeone asked to reset the password for ${name}'s booking dashboard. Choose a new password here:\n\n${link}\n\nThe link works for 1 hour. If this wasn't you, ignore this email; your password stays the same.`],
  }[kind];
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#222;max-width:560px">${esc(T[1]).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#d9251c">$1</a>').replace(/\n/g, "<br>")}<p style="color:#888;font-size:12px">WebersLink online booking</p></div>`;
  const msg = { from: { name: "WebersLink Booking", address: process.env.SMTP_USER || "no-reply@weberslink.org" }, to, subject: T[0], text: T[1] + "\n\nWebersLink online booking", html };
  try {
    if (sender) { await sender(msg, kind); return true; }
    const t = smtp();
    if (!t) return false;
    await t.sendMail(msg);
    return true;
  } catch (e) { console.error(`booking account mail ${kind} -> ${to} failed:`, e.message); return false; }
}

/** A plain notification e-mail (e.g. a request from an owner to you). Never throws. */
async function sendPlain(to, subject, text) {
  const msg = { from: { name: "WebersLink Booking", address: process.env.SMTP_USER || "no-reply@weberslink.org" }, to, subject, text };
  try { if (sender) { await sender(msg, "plain"); return true; } const t = smtp(); if (!t) return false; await t.sendMail(msg); return true; }
  catch (e) { console.error("booking mail failed:", e.message); return false; }
}

module.exports = { compose, send, icsText, setSender, base, canSend, sendAccount, sendPlain };
