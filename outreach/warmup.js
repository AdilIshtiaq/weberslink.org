/*
 * Warm-up between your own mailboxes. Each mailbox sends a few short, natural messages a day to the others; the
 * receiving mailbox opens them, rescues any that landed in spam, and answers some. That builds a positive history with
 * the mail providers, and counting where each message landed (inbox or spam) doubles as a free inbox-placement test.
 *
 * Limits of a home-made pool: with only a few mailboxes the signal is modest (paid warm-up networks use thousands of
 * inboxes), so keep it small (default 4 a day per mailbox), only in daytime hours, and never as a substitute for good
 * lists and slow ramping. Warm-up mail is tagged with an X-Warmup header, never counts toward a mailbox's daily
 * cold-email limit (it is logged as mode "warmup"), and never touches lead data.
 */
const crypto = require("crypto");
const store = require("./store");

const FILE = "warmup.json";
const DAY_START = 8, DAY_END = 20; // local hours (the Settings time zone) when warm-up mail goes out
const MAX_PER_TICK = 2;            // per mailbox, so a day's messages are spread across the half-hourly checks

const SUBJECTS = ["Quick question about Thursday", "Notes from today", "Re: draft", "Follow up on the schedule", "Checking in", "Can you look at this?", "Update for next week", "Small change to the plan", "Thanks for earlier", "Agenda for our catch-up"];
const BODIES = [
  "Hi {to},\n\nJust checking whether Thursday still works for the catch-up. If it does I'll send a short agenda beforehand.\n\nThanks,\n{from}",
  "Hi {to},\n\nI wrote up a few notes from today's call and will share them tomorrow morning. Let me know if there's anything you'd like me to add.\n\nBest,\n{from}",
  "Hi {to},\n\nCould you take a quick look at the draft when you get a moment? Nothing urgent, early next week is fine.\n\nThank you,\n{from}",
  "Hi {to},\n\nA small change to the plan: I'd like to move the review to the afternoon. Does that suit you?\n\nRegards,\n{from}",
  "Hi {to},\n\nThanks again for your help earlier, it saved me a lot of time. I'll let you know how it turns out.\n\nBest,\n{from}",
  "Hi {to},\n\nHere's the agenda for our catch-up: progress so far, open questions, and next steps. Tell me if I've missed anything.\n\nThanks,\n{from}",
];
const REPLIES = [
  "Hi {to},\n\nThanks, that works for me. Talk soon.\n\n{from}",
  "Hi {to},\n\nGot it, thank you. I'll take a look and get back to you shortly.\n\n{from}",
  "Hi {to},\n\nSounds good to me. Let me know if anything changes.\n\n{from}",
  "Hi {to},\n\nThanks for the update, much appreciated.\n\n{from}",
];

const stamp = (d) => d.toISOString().slice(0, 10);
const firstName = (box) => String(box.name || box.addr.split("@")[0]).split(/[\s._]+/)[0].replace(/^./, (c) => c.toUpperCase());
const pick = (arr, rand) => arr[Math.floor(rand() * arr.length) % arr.length];
const fill = (t, to, from) => t.replace("{to}", to).replace("{from}", from);
const read = () => { const d = store.readJson(FILE, {}); return { days: d.days || {}, placement: d.placement || {}, last: d.last || null }; };
const hourIn = (tz, now) => { try { return parseInt(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(now), 10); } catch (e) { return now.getUTCHours(); } };
const inDaytime = (tz, now) => { const h = hourIn(tz, now); return h >= DAY_START && h < DAY_END; };

/**
 * One pass: (1) every mailbox reads its warm-up mail (opens, rescues from spam, maybe answers), (2) mailboxes send their
 * share for the day. boxes: [{ addr, name, hasPassword(), send(msg, opts), warmupSweep(), close() }].
 * Returns { sent, replied, inbox, spam, skipped }.
 */
async function tick({ cfg, boxes, now = new Date(), rand = Math.random, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), log = () => {}, force = false }) {
  const w = (cfg && cfg.warmup) || {}, res = { sent: 0, replied: 0, inbox: 0, spam: 0, skipped: "" };
  const usable = boxes.filter((b) => !b.hasPassword || b.hasPassword());
  if (!w.enabled && !force) { res.skipped = "warm-up is off"; return res; }
  if (usable.length < 2) { res.skipped = "needs at least two mailboxes with passwords"; return res; }
  if (!force && !inDaytime((cfg.sending || {}).timezone || "UTC", now)) { res.skipped = "outside daytime hours"; return res; }
  const addrs = new Set(usable.map((b) => b.addr.toLowerCase()));
  const st = read(), day = (st.days[stamp(now)] ||= { sent: {}, replies: {} });
  const perDay = Math.max(1, Number(w.per_day) || 4), replyPct = Math.min(100, Math.max(0, Number(w.reply_percent) || 0));
  const save = () => { const keep = Object.keys(st.days).sort().slice(-30); st.days = Object.fromEntries(keep.map((k) => [k, st.days[k]])); st.last = now.toISOString(); store.writeJson(FILE, st); };
  const logRow = (box, to, subject) => { try { store.appendSentLog({ date: now.toISOString(), mode: "warmup", mailbox: box.addr, email: to, store: "(warm-up)", step: "warmup", variant: "", subject }); } catch (e) { /* optional */ } };

  // 1. read: open, rescue, answer
  for (const box of usable) {
    let found = [];
    try { found = await box.warmupSweep(); } catch (e) { log(`  warm-up: could not read ${box.addr} (${String(e.message).slice(0, 80)})`); continue; }
    const key = box.addr.toLowerCase(), pl = (st.placement[key] ||= { inbox: 0, spam: 0, last: "" });
    for (const m of found) {
      if (!addrs.has(m.from) || m.from === key) continue; // only messages from our own other mailboxes
      if (m.folder === "spam") { pl.spam++; res.spam++; } else { pl.inbox++; res.inbox++; }
      pl.last = now.toISOString();
      if (m.isReply) continue;
      const repliesToday = day.replies[key] || 0;
      if (repliesToday >= perDay || rand() * 100 >= replyPct) continue;
      try {
        await box.send({ to: m.from, subject: /^re:/i.test(m.subject) ? m.subject : "Re: " + m.subject, text: fill(pick(REPLIES, rand), firstName({ addr: m.from }), firstName(box)),
          inReplyTo: m.messageId || undefined, references: m.messageId ? [m.messageId] : undefined, listUnsubscribe: false, warmup: m.token }, { saveCopy: false });
        day.replies[key] = repliesToday + 1; res.replied++; logRow(box, m.from, "Re: " + m.subject);
      } catch (e) { log(`  warm-up: reply from ${box.addr} failed (${String(e.message).slice(0, 80)})`); }
    }
  }
  // 2. send
  for (const box of usable) {
    const key = box.addr.toLowerCase();
    const others = usable.filter((b) => b !== box);
    for (let i = 0; i < MAX_PER_TICK && (day.sent[key] || 0) < perDay; i++) {
      const to = pick(others, rand);
      const subject = pick(SUBJECTS, rand);
      try {
        await box.send({ to: to.addr, subject, text: fill(pick(BODIES, rand), firstName(to), firstName(box)), listUnsubscribe: false, warmup: crypto.randomBytes(8).toString("hex") }, { saveCopy: false });
        day.sent[key] = (day.sent[key] || 0) + 1; res.sent++; logRow(box, to.addr, subject);
      } catch (e) { log(`  warm-up: send from ${box.addr} failed (${String(e.message).slice(0, 80)})`); break; }
      await sleep(20000 + Math.floor(rand() * 70000)); // a human-looking gap between messages
    }
  }
  save();
  return res;
}

/** Per-mailbox totals for the dashboard: where warm-up mail landed, and today's counts. */
function status(now = new Date()) {
  const st = read(), day = st.days[stamp(now)] || { sent: {}, replies: {} };
  return { last: st.last, today: day, placement: st.placement };
}
const spamRate = (addr) => { const p = read().placement[String(addr).toLowerCase()]; const n = p ? p.inbox + p.spam : 0; return n >= 5 ? p.spam / n : 0; };

module.exports = { tick, status, spamRate };
