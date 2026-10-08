# Outreach dashboard

Cold-email sequencer built into the site. Open **https://weberslink.org/admin/outreach**
(on a phone or desktop, use "Install app" / "Add to Home screen" to get an icon).

It is **off until `ADMIN_PASSWORD` is set**, and every run is a **dry run until you switch on Live sending** in Settings.

## What it does
Each run: reads each sending mailbox's inbox (replies, opt-outs, bounces) and emails you a summary, pauses any
mailbox with a high bounce rate, sends follow-ups that are due (in the original thread, from the original mailbox),
then starts new leads with per-mailbox warm-up (10/20/30/40 a day by week). Emails 2-4 are replies in the same thread.
When someone replies the sequence stops for them (and for their colleagues). Send the free video audit within 24 hours;
the Replies tab tracks this.

## Server environment variables (Hostinger hPanel -> Node.js app -> Environment variables)
| Variable | Required | Purpose |
|---|---|---|
| `ADMIN_PASSWORD` | yes (8+ chars) | Dashboard login. Unset = feature off. |
| `ADMIN_USERNAME` | optional | If set, the sign-in page asks for this username too (not case-sensitive). If unset, the password alone is enough. |
| `OUTREACH_PASSWORD_1`, `_2`, ... | to send | Password of mailbox 1, 2, ... (numbers follow the order in Settings). |
| `OUTREACH_CRON_TOKEN` | for cron | 16+ random characters; lets a cron job start a run. |
| `OUTREACH_DATA_DIR` | recommended | Absolute path outside the app folder, e.g. `/home/USER/outreach-data`, so a Git deploy never wipes your leads. Default: `../outreach-data`. |
| `OUTREACH_AUTO_RUN_HOUR` | optional | 0-23, hour (Settings time zone) after which the app starts the daily run itself while awake. |
| `ADMIN_SESSION_SECRET` | optional | Signs login cookies; default is derived from the password. |

Passwords are never stored in files or in the dashboard, and `outreach-data/` is git-ignored (this repo is public).

## Daily run
Hostinger can stop idle Node apps, so use a cron job as the reliable trigger (hPanel -> Advanced -> Cron Jobs), weekdays:

    curl -fsS "https://weberslink.org/api/outreach/cron?token=YOUR_OUTREACH_CRON_TOKEN"

It returns immediately (202) and the run continues in the background (a day of sending takes up to about an hour
because emails are spaced 1.5-4 minutes apart). A second trigger while one is running is refused. Runs use the
Dry run / Live setting from Settings. Pick a time that is morning in the time zone of your leads.

## First-time checklist
1. Set the env variables above, restart the app, sign in.
2. Settings: your name, company, **postal address**, notify email, mailboxes (lookalike domains, not weberslink.org).
3. Leads: import your spreadsheet (sheet "Leads").
4. Emails: check the copy; use "Preview real leads".
5. Run (dry) and read the log. Send a real test from your own mailbox before going live.
6. Settings -> tick Live sending. Warm-up is automatic.

## Rules baked in
Email 1 never sells (no price, no links). Max 40/day per mailbox. Weekdays only. Canada excluded by default (CASL).
Every email carries the postal address and an opt-out line. A mailbox pauses itself above the bounce limit.
A/B versions share one body and differ only in subject; judge after about 100 leads each.

## Tests
`npm test` (engine and API; no network or real mailboxes needed).

## Not covered by tests
Live SMTP/IMAP against Hostinger, and Hostinger cron/outbound-port behaviour: try Run (dry), then a test email to
yourself, before going live. Live PageSpeed testing from the old Python tool was left out; PageSpeed scores already
in your spreadsheet are imported and used.
