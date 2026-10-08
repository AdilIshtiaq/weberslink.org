/*
 * Real mailbox: SMTP send via nodemailer, inbox scan + Sent-folder copy via imapflow.
 * The engine only needs this small interface, so tests can pass a fake mailbox instead:
 *   { addr, name, send(msg), scanInbox(sinceDays), close() }
 */
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const MailComposer = require("nodemailer/lib/mail-composer");

function passwordFor(box) {
  // Passwords only ever come from environment variables: never from files or the dashboard.
  return process.env[`OUTREACH_PASSWORD_${box.id}`] || (box.id === 1 ? process.env.OUTREACH_PASSWORD : "") || "";
}

class Mailbox {
  constructor(conf) {
    this.id = conf.id;
    this.addr = String(conf.email || "").trim();
    this.name = conf.from_name || "";
    this.conf = conf;
    this.pw = passwordFor(conf);
    this.transport = null;
  }

  hasPassword() { return Boolean(this.pw); }

  smtp() {
    if (!this.transport) {
      const port = Number(this.conf.smtp_port || 465);
      this.transport = nodemailer.createTransport({
        host: this.conf.smtp_host || "smtp.hostinger.com", port, secure: port === 465,
        auth: { user: this.addr, pass: this.pw }, connectionTimeout: 30000, socketTimeout: 60000,
      });
    }
    return this.transport;
  }

  /** msg: { to, subject, text, html, inReplyTo, references[], listUnsubscribe } -> adds messageId */
  build(msg) {
    const domain = this.addr.split("@")[1];
    return {
      from: { name: this.name, address: this.addr },
      to: msg.to, subject: msg.subject, text: msg.text, html: msg.html || undefined,
      messageId: `<${crypto.randomBytes(12).toString("hex")}@${domain}>`,
      date: new Date(),
      inReplyTo: msg.inReplyTo || undefined,
      references: msg.references && msg.references.length ? msg.references : undefined,
      headers: msg.listUnsubscribe === false ? {} : { "List-Unsubscribe": `<mailto:${this.addr}?subject=unsubscribe>` },
    };
  }

  async send(msg, { saveCopy = true } = {}) {
    const mail = this.build(msg);
    await this.smtp().sendMail(mail);
    if (saveCopy) await this.saveToSent(mail).catch((e) => { this.warn && this.warn(`could not save copy to Sent folder: ${e.message}`); });
    return { messageId: mail.messageId };
  }

  async imap() {
    const { ImapFlow } = require("imapflow");
    const client = new ImapFlow({
      host: this.conf.imap_host || "imap.hostinger.com", port: Number(this.conf.imap_port || 993), secure: true,
      auth: { user: this.addr, pass: this.pw }, logger: false,
    });
    client.on("error", () => {});
    await client.connect();
    return client;
  }

  async saveToSent(mail) {
    const raw = await new Promise((res, rej) => new MailComposer(mail).compile().build((e, b) => (e ? rej(e) : res(b))));
    const client = await this.imap();
    try {
      const sent = (await client.list()).find((b) => b.specialUse === "\\Sent") || (await client.list()).find((b) => /^(inbox\.)?sent( items| messages)?$/i.test(b.path));
      if (sent) await client.append(sent.path, raw, ["\\Seen"]);
    } finally { await client.logout().catch(() => {}); }
  }

  /** Recent inbox messages in the shape classify() expects. Never marks anything as read. */
  async scanInbox(sinceDays = 45, max = 600) {
    const { simpleParser } = require("mailparser");
    const client = await this.imap();
    const out = [];
    try {
      const lock = await client.getMailboxLock("INBOX", { readOnly: true });
      try {
        const since = new Date(Date.now() - sinceDays * 864e5);
        const uids = (await client.search({ since }, { uid: true })) || [];
        for (const uid of uids.slice(-max)) {
          const m = await client.fetchOne(String(uid), { source: true }, { uid: true });
          if (!m || !m.source) continue;
          out.push(await parseIncoming(await simpleParser(m.source)));
        }
      } finally { lock.release(); }
    } finally { await client.logout().catch(() => {}); }
    return out;
  }

  close() { try { this.transport && this.transport.close(); } catch (e) { /* ignore */ } this.transport = null; }
}

async function parseIncoming(p) {
  let body = p.text || "";
  // Bounce notices carry the failed address inside an attached delivery-status part.
  for (const a of p.attachments || []) {
    if (/^(message\/|text\/rfc822)/.test(a.contentType || "") && a.content) body += "\n" + a.content.toString("utf8", 0, 8000);
  }
  const fresh = (p.text || "").split(/\n\s*(?:On .{5,200}wrote:|-{2,}\s*Original Message|From: .*\n)/)[0];
  const from = p.from && p.from.value && p.from.value[0] ? p.from.value[0] : {};
  return {
    from: String(from.address || "").toLowerCase(),
    from_raw: p.from ? p.from.text : "",
    subject: p.subject || "",
    in_reply_to: p.inReplyTo || "",
    references: Array.isArray(p.references) ? p.references.join(" ") : p.references || "",
    body: body.slice(0, 8000),
    fresh: fresh.slice(0, 3000),
  };
}

module.exports = { Mailbox, passwordFor, parseIncoming };
