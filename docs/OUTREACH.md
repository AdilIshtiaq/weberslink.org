# Outreach dashboard

Cold-email sequencer built into the site. Open **https://weberslink.org/admin/outreach** (the menu has a **Login** link;
on a phone or desktop use "Install app" / "Add to Home screen" for an icon).

It is **off until `ADMIN_PASSWORD` is set**, and every run is a **dry run until you switch on Live sending** in Settings.

## What it does
Each run: reads each mailbox's inbox (replies, opt-outs, bounces) and emails you a summary, pauses any mailbox with a
high bounce rate, sends follow-ups that are due (in the original thread, from the original mailbox), then starts new
leads with per-mailbox warm-up (10/20/30/40 a day by week). Emails 2-4 are replies in the same thread.
When someone replies the sequence stops for them (and for their colleagues). Send the free video audit within 24 hours;
the Replies tab tracks this.

Safety behaviour worth knowing:
- Before every send the lead is re-read from disk, so anyone you mark do-not-contact (or who replies) while a run is in
  progress is skipped.
- Only what a person wrote counts: quoted history and our own unsubscribe footer never decide whether they opted out.
  A stop request that can't be matched to a lead is added to the do-not-contact list and reported to you.
- "Delayed" delivery notices are not treated as bounces; temporary (4xx) refusals are retried on a later run.
- If the server dies mid-send, that lead is **held** (dashboard: "Needs your check") instead of being emailed twice.
  Look in the mailbox's Sent folder, then choose "not sent: allow retry" or "sent: never email again".
- Mailboxes send side by side, each pacing itself (1.5-4 min between its emails), so a day takes about as long as the
  busiest single mailbox (e.g. 40 emails ≈ 1.5-2 hours), not the sum of all of them.

## Server environment variables (Hostinger hPanel -> Websites -> Node.js -> Environment variables)
| Variable | Required | Purpose |
|---|---|---|
| `ADMIN_PASSWORD` | yes (10+ chars) | Dashboard login. Unset or shorter = feature off. |
| `ADMIN_USERNAME` | optional | If set, the sign-in page asks for this username too (not case-sensitive). |
| `OUTREACH_PASSWORD_<n>` | to send | Password of mailbox number `<n>`. The number is shown under each mailbox in Settings and never changes, even if you remove or reorder mailboxes. |
| `OUTREACH_CRON_TOKEN` | for cron | 16+ random characters; lets a cron job start a run. |
| `OUTREACH_DATA_DIR` | recommended | Absolute path outside the app folder, e.g. `/home/USER/outreach-data`, so a Git deploy never wipes your leads. Default: `../outreach-data`. |
| `OUTREACH_ALLOWED_HOSTS` | optional | Comma-separated mail servers allowed besides Hostinger's. Mailbox passwords are only ever sent to allowed servers. |
| `OUTREACH_AUTO_RUN_HOUR` | optional | 0-23, hour (Settings time zone) after which the app starts the daily run itself while awake. |
| `GEMINI_OUTREACH_KEY` | for Gemini | Free key from Google AI Studio, used only by "Personalise (Gemini)". Falls back to the website chat key (`GEMINI_API_KEY`), but then research shares the chat widget's quota, so use a separate key. |
| `GEMINI_OUTREACH_DAILY_MAX` | optional | Most Gemini lookups per day (default 150). |
| `GEMINI_OUTREACH_GAP_SECONDS` | optional | Pause between lookups (default 7), to stay inside free-tier rate limits. |
| `GEMINI_OUTREACH_MODEL` | optional | Model name (default `gemini-flash-latest`). |
| `ADMIN_SESSION_SECRET` | optional | Login-cookie signing key. Default: a random key stored in the data folder. |

Passwords are never stored in files or in the dashboard, and `outreach-data/` is git-ignored (this repo is public).
Signing out ends the session immediately. Wrong passwords are throttled (per address, plus a global slow-down).

## Daily run
Hostinger can stop idle Node apps, so use a cron job as the reliable trigger (hPanel -> Advanced -> Cron Jobs), weekdays:

    curl -fsS -X POST -H "x-cron-token: YOUR_OUTREACH_CRON_TOKEN" https://weberslink.org/api/outreach/cron

It returns immediately (202) and the run continues in the background. A second trigger while one is running is refused.
A crashed run's lock is taken over automatically. Runs use the Dry run / Live setting from Settings. Pick a time that
is morning in the time zone of your leads.

## List cleaner (free, built in)
Keeps bad addresses out of the queue so bounces stay low:
- **At import**, clearly bad addresses are set aside automatically (status `skipped-bad-address`, with the reason): invalid
  or mistyped addresses (`gmial.com`, `.con`), throwaway domains, placeholder or scraped junk (`logo@2x.png`, `test@`),
  and system mailboxes that never reach a person or attract spam traps (`noreply@`, `abuse@`, `postmaster@`).
- **Leads -> Clean list** scans every lead still waiting, also checks each domain can receive mail, and shows a preview.
  Nothing changes until you click **Apply cleaning**. Shared mailboxes (`info@`, `sales@`, `support@`) are kept unless
  you tick "skip these too" (they are often read by the owner at small shops, but carry more spam-complaint risk).
- Every set-aside lead stays in the list with its reason and a **Restore** button.
- It cannot prove that one particular inbox exists (only paid verifiers can), so keep the bounce auto-pause on
  (default 3%) and start with a small first batch.
- **Settings -> Use cautious settings** fills in a gentle plan for a single mailbox on your main domain: 5/10/15/20
  emails a day by week, at most 20 per mailbox, pause at 3% bounces. Click Save settings afterwards.

## Personalise with Gemini (optional, free tier)
Leads -> **Personalise (Gemini)** asks Gemini to read each waiting store's own website and suggest ONE factual
opening line (for example "I saw that Lens Hub sells prescription sunglasses with free UK returns."). You review every
line; only **approved** lines go into emails.
- "Approve the N high-confidence shown" only approves the lines currently on screen, exactly as you see them (never
  new arrivals, never a line you've started editing). Lines the model writes must pass strict checks: one sentence
  starting "I saw that" or "I noticed that", no links or web addresses (even disguised), numbers, risky topics
  (security, legal, compliance) or pushy wording.
- Free-mail addresses (gmail.com ...) and platform sites (etsy.com ...) are not researched. A temporary Gemini outage
  never marks a lead as failed, and pauses the job after 3 problems in a row.
- Research runs slowly in the background in batches of 10-100 leads you choose, and stops cleanly when Gemini's quota
  or your daily limit is reached (nothing is lost; run it again later). "Retry failed" re-tries stores where nothing
  reliable was found.
- Safeguards: Google (not this server) fetches the site; the model is told to treat page text as data and never invent;
  suggestions must be one sentence with no links, addresses, markup or placeholders, and must cite a page on the store's
  own domain, otherwise they are dropped. You can edit a line before approving; an edited line gets the same checks.
- **Check each line against the store's site: Gemini can be wrong.** An invented detail in a sales email is deceptive.
- The approved line appears in email 1 where the template has `{custom_line_para}` (the bundled email 1 / 1B do, right
  after the greeting; blank means the normal email). If you edited those templates earlier, add the field from the
  Emails tab ("Insert" chips).
- You can also supply your own lines: put them in a spreadsheet column named "first line" (or "custom line"); they are
  checked and treated as approved.
- Only the store's name, website and category are sent to Google, never personal details. Free-tier limits and
  grounding quotas change; check your quota in Google AI Studio.

## First-time checklist
1. Set the env variables above, restart the app, sign in.
2. Settings: your name, company, **postal address**, notify email, mailboxes (lookalike domains, not weberslink.org). Save.
3. Settings -> **Check domain DNS**: fix anything marked "Fix" (SPF/MX), and add DKIM/DMARC if flagged.
4. Settings -> **Send test email** to your own address; confirm it lands in the inbox, not spam.
5. Leads: import your spreadsheet (.xlsx sheet "Leads", or .csv).
6. Emails: check the copy; use "Preview real leads".
7. Run (dry) and read the log.
8. Settings -> tick Live sending. Warm-up is automatic. Add the cron job.

## Rules baked in
Email 1 never sells (no price, no links). Max 40/day per mailbox. Weekdays only. Canada excluded by default (CASL).
Every email carries the postal address and an opt-out line. A mailbox pauses itself above the bounce limit.
A/B versions share one body and differ only in subject; judge after about 100 leads each.

## Tests
`npm test` (about 68 tests: engine, API, auth, regression tests for an independent code review; no network or real
mailboxes needed).

## Not covered by tests
Live SMTP/IMAP against Hostinger and Hostinger cron/outbound-port behaviour: use Send test email and a dry run before
going live. Live PageSpeed testing from the old Python tool was left out; scores in your spreadsheet are imported and used.
