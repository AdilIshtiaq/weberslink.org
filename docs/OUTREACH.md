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
`npm test` (about 54 tests: engine, API, auth, regression tests for an independent code review; no network or real
mailboxes needed).

## Not covered by tests
Live SMTP/IMAP against Hostinger and Hostinger cron/outbound-port behaviour: use Send test email and a dry run before
going live. Live PageSpeed testing from the old Python tool was left out; scores in your spreadsheet are imported and used.
