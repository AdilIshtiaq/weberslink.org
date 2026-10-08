/*
 * Real mailbox: SMTP send via nodemailer, inbox scan + Sent-folder copy via imapflow.
 * The engine only needs this small interface, so tests can pass a fake mailbox instead:
 *   { addr, name, send(msg), scanInbox(sinceDays), close() }
 */
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const MailComposer = require("nodemailer/lib/mail-composer");
const { freshReply } = require("./inbound");

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
        host: this.conf.smtp_host || "smtp.hostinger.com", port, secure: port === 465, requireTLS: port !== 465, // never fall back to plain text
        
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

  /**
   * New inbox messages, oldest first, in the shape classify() expects. Never marks anything as read.
   * opts: { sinceDays, afterUid, uidValidity, max } - with afterUid (and an unchanged uidValidity) only newer
   * messages are fetched, so each run reads each message once. Returns { messages, maxUid, uidValidity }.
   */
  async scanInbox(opts = {}) {
    const { simpleParser } = require("mailparser");
    const max = opts.max || 2000;
    const client = await this.imap();
    const messages = [];
    let maxUid = opts.afterUid || 0, uidValidity = opts.uidValidity;
    try {
      const lock = await client.getMailboxLock("INBOX", { readOnly: true });
      try {
        uidValidity = Number(client.mailbox.uidValidity);
        const incremental = opts.afterUid && String(opts.uidValidity) === String(uidValidity);
        const found = incremental
          ? await client.search({ uid: `${opts.afterUid + 1}:*` }, { uid: true })
          : await client.search({ since: new Date(Date.now() - (opts.sinceDays || 45) * 864e5) }, { uid: true });
        const uids = (found || []).filter((u) => !incremental || u > opts.afterUid).sort((a, b) => a - b).slice(0, max);
        if (!incremental) maxUid = 0;
        for (const uid of uids) {
          // Headers + text only: attachments are cut off at 150 KB so one huge message can't stall a run.
          const m = await client.fetchOne(String(uid), { source: { maxLength: 150000 } }, { uid: true });
          maxUid = Math.max(maxUid, uid);
          if (!m || !m.source) continue;
          try { messages.push(await parseIncoming(await simpleParser(m.source))); } catch (e) { /* unreadable message: skip it */ }
        }
      } finally { lock.release(); }
    } finally { await client.logout().catch(() => {}); }
    return { messages, maxUid, uidValidity };
  }

  close() { try { this.transport && this.transport.close(); } catch (e) { /* ignore */ } this.transport = null; }
}

async function parseIncoming(p) {
  let body = p.text || "";
  // Bounce notices carry the failed address inside an attached delivery-status part.
  for (const a of p.attachments || []) {
    if (/^(message\/|text\/rfc822)/.test(a.contentType || "") && a.content) body += "\n" + a.content.toString("utf8", 0, 8000);
  }
  const fresh = freshReply(p.text || "");
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
