/*
 * SMTP address verification (the "does this mailbox exist?" check paid verifiers sell). Connects to the recipient's
 * mail server, goes as far as RCPT TO (never sends a message), then asks about a random address that cannot exist:
 * if the server accepts that too, the domain is a catch-all and no answer about the real address can be trusted.
 *
 * Results: "valid" | "invalid" | "catch-all" | "unknown". Only a clear "no such user" answer is "invalid"; greylisting,
 * policy blocks, timeouts and closed port 25 (many hosts, Hostinger shared hosting included, block outgoing port 25)
 * are all "unknown" and never remove a lead. Free-mail providers are not probed.
 */
const net = require("net");
const dns = require("dns").promises;
const crypto = require("crypto");

const NO_SUCH_USER = /5\.1\.1|5\.1\.10|user unknown|unknown user|no such (user|recipient|mailbox)|does(n'?t| not) exist|mailbox (unavailable|not found)|invalid (recipient|mailbox)|recipient (address )?rejected|address rejected|not a valid mailbox/i;
const POLICY = /5\.7\.\d|blocked|blacklist|blocklist|spam|policy|denied|not allowed|reputation|relay/i;

/** One SMTP conversation. Resolves { code, text } for every command and ends the session on error. */
function session(host, port, timeoutMs, connect) {
  return new Promise((resolve, reject) => {
    const sock = connect ? connect(host, port) : net.connect({ host, port });
    let buf = "", waiter = null, done = false;
    const fail = (e) => { if (done) return; done = true; sock.destroy(); reject(e); if (waiter) waiter.reject(e); };
    sock.setTimeout(timeoutMs, () => fail(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })));
    sock.on("error", fail);
    sock.on("close", () => fail(new Error("closed")));
    sock.on("data", (d) => {
      buf += d.toString("latin1");
      const lines = buf.split(/\r?\n/);
      // A reply is complete when its last line is "NNN text" (a space, not "NNN-text", after the code).
      const last = lines.length > 1 ? lines[lines.length - 2] : "";
      if (buf.endsWith("\n") && /^\d{3} /.test(last) && waiter) {
        const text = lines.filter(Boolean).join(" ");
        buf = "";
        const w = waiter; waiter = null; w.resolve({ code: Number(last.slice(0, 3)), text });
      }
    });
    const next = () => new Promise((res, rej) => { waiter = { resolve: res, reject: rej }; });
    sock.once("connect", () => resolve({
      read: next,
      cmd: (line) => { const p = next(); sock.write(line + "\r\n"); return p; },
      end: () => { done = true; try { sock.write("QUIT\r\n"); } catch (e) { /* closing anyway */ } sock.destroy(); },
    }));
    // The banner can arrive before anyone calls read(): keep it.
  });
}

async function probe(email, { fromDomain = "example.com", timeoutMs = 8000, mxLookup, port = 25, connect } = {}) {
  const domain = String(email).split("@")[1] || "";
  let mx;
  try { mx = await (mxLookup || ((d) => dns.resolveMx(d)))(domain); } catch (e) { return "unknown"; }
  mx = [...(mx || [])].sort((a, b) => a.priority - b.priority).slice(0, 2);
  for (const host of mx) {
    let s;
    try {
      s = await session(host.exchange, port, timeoutMs, connect);
      const banner = await s.read();
      if (banner.code !== 220) { s.end(); continue; }
      const ehlo = await s.cmd(`EHLO verify.${fromDomain}`);
      if (ehlo.code !== 250) { s.end(); continue; }
      const from = await s.cmd(`MAIL FROM:<postmaster@${fromDomain}>`);
      if (from.code !== 250) { s.end(); return "unknown"; }
      const real = await s.cmd(`RCPT TO:<${email}>`);
      if (real.code >= 500 && real.code < 600) { s.end(); return NO_SUCH_USER.test(real.text) && !POLICY.test(real.text.replace(NO_SUCH_USER, "")) ? "invalid" : "unknown"; }
      if (real.code !== 250 && real.code !== 251) { s.end(); return "unknown"; } // 4xx: greylisting or busy
      const fake = await s.cmd(`RCPT TO:<zz-${crypto.randomBytes(6).toString("hex")}@${domain}>`);
      s.end();
      return fake.code === 250 || fake.code === 251 ? "catch-all" : "valid";
    } catch (e) { try { s && s.end(); } catch (x) { /* ignore */ } }
  }
  return "unknown";
}

module.exports = { probe };
