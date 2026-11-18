# Outreach dashboard

Cold-email sequencer built into the site. Open **https://weberslink.org/admin/outreach** (the menu has a **Login** link;
on a phone or desktop use "Install app" / "Add to Home screen" for an icon).

It is **off until `ADMIN_PASSWORD` is set**, and every run is a **test (nothing is sent) until you switch the top-bar switch from Test mode to Live**.

## Finding leads, and what Gemini can do (v2.6)
**Lead filters** (Leads tab) use plain-language groups instead of raw statuses: stage (waiting, in sequence, replied, interested, paused for out-of-office,
finished, bounced or opted out, set aside, clicked, high fit, in no campaign, referred, needs your check; each with its count), place (country, state or city), business
type, campaign and sort (best fit first, latest activity first). Only stages that have leads are listed. **Ask AI** next to the search box turns a sentence like "roofers in
Texas we haven't emailed, best fit first" into those filters (it can only choose values that exist in your leads).

**Honest counts.** "Leads waiting" and "days to finish" count only leads that can actually be emailed: with campaigns, a lead in no campaign or in a paused one is not in the queue.
The Overview says so ("N waiting leads match no campaign"), warns when a campaign targets a country Settings does not allow, and warns when a campaign without its own
emails would send the default ones (which are written for roofing companies).

**Gemini tools** (all need `GEMINI_OUTREACH_KEY`; each call counts toward `GEMINI_OUTREACH_AI_DAILY_MAX`, default 300; none can send anything):
- **Describe a campaign** (Campaigns tab): "roofing companies in Texas and Florida" becomes a campaign with real places and business-type words from your leads; you see the live match count before saving.
- **Write the emails with Gemini** (Emails tab, or **Write with AI** on a campaign): a 4-email sequence from a short brief and a tone. Every email is checked: no links, only the
  allowed placeholders, sensible length, greeting and sign-off enforced, copy score shown. Nothing is saved until you press **Save these emails** (for that campaign, or for everyone).
- **Improve with AI** (Emails editor): shorter, friendlier, more direct, or less spammy; **Undo** brings the old text back.
- **AI brief** (Overview): a short read of your numbers and the one thing to do next, cached for 4 hours.
- The older tools (reply labels, suggested answers, lead scores, copy check, objection summary) are described above.

**Email layout.** Emails now look like a personal message: your text, a short signature (name, title, company, website, optional small logo), and a small footer with the postal
address and a real **unsubscribe here** link next to "reply unsubscribe". The default accent colour is the brand red (`#ef1421`); a colour you already saved is kept. The editor
shows each email with its timing ("Email 2 · 3 days later"), offers only the placeholders that make sense, and previews on desktop or phone width.

## Finding new leads (free)
**Leads -> Find new leads.** Pick a business type (roofing contractor, dentist, restaurant … or type your own when Gemini is connected) and a place
(a city or county, for example Austin, TX), and how many businesses. It then:
1. looks the place up on **OpenStreetMap** (Nominatim) and finds matching businesses (Overpass API), free and without a key;
2. reads each business's **own public website** (the homepage and a few contact pages, `robots.txt` respected) for a contact email, including emails hidden
   behind `mailto:` links, "name [at] site [dot] com" and Cloudflare's email protection;
3. verifies the result with the same list cleaner as imports (junk and system addresses removed, shared mailboxes like `info@` flagged), checks the domain has a mail server,
   and removes duplicates against your leads, your never-contact list and the rest of the search;
4. leaves the results in a **review table**. Usable ones are ticked; the rest say why not (no website, robots.txt asked not to be read, no mail server, already yours).
   **Import selected** adds them as normal leads with their place, business type and country, and they join the campaign that fits.

Limits and safety: free map data covers small businesses unevenly (many list no website or email), so expect a share of results to be unusable; UK and Europe are usually
better covered than the US. The reader only follows public web addresses (private, local and link-local addresses are refused, including through redirects), reads at most four pages per site, and
one search runs at a time. Daily caps: 400 websites (`FINDER_DAILY_SITES_MAX`) and 30 searches (`FINDER_DAILY_SEARCHES_MAX`). `FINDER_OVERPASS_URL` can point at another Overpass server.
Map data (c) OpenStreetMap contributors (ODbL). You remain responsible for emailing lawfully: honour opt-outs and include a postal address (both are built into every email).
Other sources (Google Places, Overture Maps, Apollo) can be added behind the same screen later.

## Using the dashboard
Six sections, left to right in the menu:
- **Overview:** what needs you right now. A **Get ready to send** checklist (sender details, mailbox, leads, optional campaigns, test email, domain check, go live)
  stays on top until you are set up and ticks itself off. Below it: **needs attention** (the most important problem or opportunity first, each with an Open
  button that takes you to the fix), six key numbers (sent today, last 7 days, replies, replies waiting for you, meetings), a 14-day chart of sends and replies, your campaigns and mailboxes.
- **Inbox:** people who replied, with Gemini's label and suggested answer. Reply, schedule, mark the outcome.
- **Campaigns:** groups of leads by place and business type, plus an **Emails** tab for the wording of each campaign.
- **Leads:** search, filter, import. **Tools** holds the list cleaner, Gemini helpers, never-contact list, exports.
- **Reports:** results by label, step and mailbox, subject-line test, link clicks, why people say no, and the run log.
- **Settings:** five tabs (Sender, Mailboxes, Sending, AI & automation, Checks & backup) with one **Save changes** bar. Sending speed is three plain choices
  (**Careful**, **Standard**, **Around the clock**) with a live estimate; every detailed number is under **Customize the details**.

The **Test mode / Live** switch in the top bar decides whether runs send real emails. It refuses to go Live while anything needed is missing (for example a mailbox password).

## Runs by itself (automatic running)
With the top-bar switch on **Live** and **Run automatically** ticked (Settings -> Sending; automatic is the default), the app starts
a run by itself, checking every 10 minutes and again 30 seconds after any restart. Nothing else is needed: no cron job and no
environment variable. Test runs never start by themselves. A run keeps going, waiting between emails, and re-reads the
inboxes at least every 10 minutes while it runs, so a reply, "unsubscribe" or bounce stops that lead's sequence within minutes
even in a run that lasts all day. If an inbox cannot be read mid-run, sending stops until the next run can read it.
To switch it off, untick **Run automatically** in Settings, or set `OUTREACH_AUTO_RUN=off` on the server.
Hostinger can stop idle Node apps, so keeping the cron job below as a wake-up call is still sensible.

## Sending 24/7 (one email every 15-20 minutes)
Settings -> Sending -> **Around the clock**, then **Save changes**. It turns the sending window off, selects every
day of the week, sets the wait between emails to 15-20 minutes (900-1200 seconds), and warms up at 25, 50, 75, then 100
emails a day. One email every 17.5 minutes on average is about 82 a day from one mailbox. The hard cap is **100 a day per
mailbox**. To skip the warm-up, set the warm-up field to `100`. Sending this many cold emails from one address, day and night,
risks spam filtering and a damaged domain reputation: keep the bounce pause on (3%) and watch replies and bounces.

## What it does
Each run: reads each mailbox's inbox (replies, opt-outs, bounces) and emails you a summary, pauses any mailbox with a
high bounce rate, sends follow-ups that are due (in the original thread, from the original mailbox), then starts new
leads with per-mailbox warm-up (set in Settings; the 24/7 preset uses 25/50/75/100 a day by week). Emails 2-4 are replies in the same thread.
When someone replies the sequence stops for them (and for their colleagues). Send the free video audit within 24 hours;
the Inbox tab tracks this. Click **Reply** there to write back from the dashboard: it is sent from the mailbox that
emailed them, in the same thread. The message box keeps links, bold/italic/underline and lists when you paste (from Google
Docs, Word, Gmail…); the toolbar adds links (Ctrl+K), lists, images and file attachments (10 MB in total), and bare
https:// addresses become links. It is sent as HTML with a plain-text copy. Tick **Send later** to schedule it; scheduled
messages are checked every minute while the server is awake (and on every cron call, which also wakes a sleeping app),
listed under the replies, and can be cancelled until they go out.

**Link clicks.** With *Track link clicks* on (Settings, on by default; needs HTML emails), every http(s) link in the HTML
part of live campaign emails and dashboard replies is swapped for `https://<your site>/r/<token>`, unique per lead and
link. A click is recorded and the visitor is sent straight on to the real address. You see it on the Dashboard (*Link
clicks*), on each reply (*Clicked "demo video" ×2*), and in the Leads table (*Clicks* column, filter *clicked a link*).
Web addresses written in templates become links in the HTML part so they can be tracked; the plain-text copy always
keeps the real addresses. Mail security scanners click links by themselves: clicks from known scanners, link checks
(HEAD) and clicks in the first minute after sending are counted as "scanner", not as a person. No IP addresses are
stored. The links use the website in Settings > signature (it must be this app's domain), or set `OUTREACH_PUBLIC_URL`.
Data: `links.json` (token -> address, needed for old links to keep working) and `clicks.json`; both are in backups. Leads who unsubscribe/bounce are never emailed.

Safety behaviour worth knowing:
- Before every send the lead is re-read from disk, so anyone you mark do-not-contact (or who replies) while a run is in
  progress is skipped.
- Only what a person wrote counts: quoted history and our own unsubscribe footer never decide whether they opted out.
  A stop request that can't be matched to a lead is added to the do-not-contact list and reported to you.
- "Delayed" delivery notices are not treated as bounces; temporary (4xx) refusals are retried on a later run.
- If the server dies mid-send, that lead is **held** (dashboard: "Needs your check") instead of being emailed twice.
  Look in the mailbox's Sent folder, then choose "not sent: allow retry" or "sent: never email again".
- Mailboxes send side by side, each pacing itself (1.5-4 min between its emails), so a day takes about as long as the
  busiest single mailbox (e.g. 40 emails ≈ 1.5-2 hours at the default pacing), not the sum of all of them.

## Server environment variables (Hostinger hPanel -> Websites -> Node.js -> Environment variables)
| Variable | Required | Purpose |
|---|---|---|
| `ADMIN_PASSWORD` | yes (10+ chars) | Dashboard login. Unset or shorter = feature off. |
| `ADMIN_USERNAME` | optional | If set, the sign-in page asks for this username too (not case-sensitive). |
| `OUTREACH_PASSWORD_<n>` | to send | Password of mailbox number `<n>`. The number is shown under each mailbox in Settings and never changes, even if you remove or reorder mailboxes. |
| `OUTREACH_PUBLIC_URL` | no | Address of this app for tracked links (default: the signature website). |
| `OUTREACH_CRON_TOKEN` | for cron | 16+ random characters; lets a cron job start a run. |
| `OUTREACH_DATA_DIR` | **strongly recommended** | Absolute path to a folder OUTSIDE the app folder, e.g. `/home/USER/outreach-data` (your home folder is shown in Hostinger's File Manager). This is where your settings, leads, history and login key live. Default if unset: `outreach-data` in the account's home folder. The dashboard shows the folder in use and warns if it is inside the app. |
| `OUTREACH_ALLOWED_HOSTS` | optional | Comma-separated mail servers allowed besides Hostinger's. Mailbox passwords are only ever sent to allowed servers. |
| `GEMINI_OUTREACH_KEY` | for Gemini | Free key from Google AI Studio, used only by "Personalise (Gemini)". Falls back to the website chat key (`GEMINI_API_KEY`), but then research shares the chat widget's quota, so use a separate key. |
| `GEMINI_OUTREACH_DAILY_MAX` | optional | Most Gemini lookups per day (default 150). |
| `GEMINI_OUTREACH_GAP_SECONDS` | optional | Pause between lookups (default 7), to stay inside free-tier rate limits. |
| `GEMINI_OUTREACH_MODEL` | optional | Model name (default `gemini-flash-latest`). |
| `OUTREACH_NOTIFY_EMAIL` | optional | Default address for reply notifications (so a private address never has to be written in the code). A value saved in Settings wins. |
| `OUTREACH_AUTO_RUN` | optional | Automatic running is on by default (see "Runs by itself"). Set to `off` to disable it on the server. |
| `ADMIN_SESSION_SECRET` | optional | Login-cookie signing key. Default: a random key stored in the data folder. |

Passwords are never stored in files or in the dashboard, and `outreach-data/` is git-ignored (this repo is public).
Signing out ends the session immediately. Wrong passwords are throttled (per address, plus a global slow-down).

## Sending window (for example overnight, 7pm to 7am)
Settings -> Sending -> Customize the details -> **Only send during a daily window**. Pick when it opens and closes in the time zone set above (the
**Use 7pm-7am Pakistan time** button fills in Asia/Karachi and 19:00-07:00).
- Between emails the app waits a random time between the minimum and maximum delay in Settings (default 10 to 20 minutes),
  but never longer than an even share of what is left of the window, so the day's emails always fit. The first goes out as soon as the window opens.
- A window can cross midnight: 7pm to 7am is ONE campaign day (one daily budget, one "send day" decision: Friday evening
  continues into Saturday's small hours; Saturday evening does not).
- Outside the window a run still reads your inbox (replies, opt-outs, bounces) but sends nothing. Emails that don't fit
  before the window closes wait for the next window; nothing is lost. Dry runs ignore the window.
- The dashboard shows whether the window is open and when it opens or closes.
- Keep it running with either a cron job every 30 minutes (below) or `OUTREACH_AUTO_RUN=window`. Extra triggers are harmless:
  a trigger while a run is active is refused, and each run only sends what the budget and pacing allow.
- Think about WHO is reading: 7pm-7am Pakistan time is 10am-10pm US Eastern (good for US leads) but 3pm-3am in the UK, so UK
  emails arrive overnight. Business hours in the recipient's morning tend to do better.

## Daily run
Hostinger can stop idle Node apps, so use a cron job as the reliable trigger (hPanel -> Advanced -> Cron Jobs), weekdays:

    curl -fsS -X POST -H "x-cron-token: YOUR_OUTREACH_CRON_TOKEN" https://weberslink.org/api/outreach/cron

With a sending window, schedule it every 30 minutes instead (cron: `*/30 * * * *`) so a run is always active while the window is
open and resumes after any restart; outside the window it only checks the inbox.

It returns immediately (202) and the run continues in the background. A second trigger while one is running is refused.
A crashed run's lock is taken over automatically. Runs use the Test mode / Live switch in the top bar. Pick a time that
is morning in the time zone of your leads.

## Defaults, and "why did my run stop?"
**Defaults.** A fresh install (or a wiped data folder) starts with the owner's settings (name, title, postal address, the
`hassan@weberslink.org` mailbox, a 7pm-7am window, cautious 5/10/15/20 warm-up, 3% bounce pause). They live in `DEFAULT_CONFIG`
in `outreach/engine.js`; anything saved in Settings wins. Live sending is always OFF by default, and nothing can send until the
mailbox password variable (`OUTREACH_PASSWORD_1`) is set. The notification address is deliberately not in the code (this
repository is public): set `OUTREACH_NOTIFY_EMAIL` in Hostinger.

**Why a run ended.** The dashboard's "Last run" panel says in plain words what happened and what to do, for example
"Nothing sent: outside the sending window (19:00-07:00 America/New_York); it opens in 8h 16m", "Nothing sent: every mailbox
has used its limit for today", "Stopped for safety: could not read the inbox of ... check OUTREACH_PASSWORD_1", or "The
server was restarted or stopped while this run was in progress". The record is saved on disk, and the run log shows history
after a restart (it is read from `run_log.txt` in the data folder).

**A run that "stops after 30 seconds"** almost always means one of: the sending window is closed (check the time zone
setting: 19:00 in New York is 04:00 in Pakistan), today isn't a send day, the daily limit is used up, no leads are waiting, or
the mailbox password/inbox login failed. The Last-run panel names which.

## Where your data lives, and backups
Everything you save (settings, leads and their progress, sent history, do-not-contact list, edited emails, the login key) is
kept in files in the data folder, not in the code. **If that folder is inside the app's folder, a redeploy can erase it**
(you would find your settings gone and be asked to log in again). So:
1. Set `OUTREACH_DATA_DIR` to a folder outside the app (see the table below) and restart. Settings -> Checks & backup
   and the startup log show which folder is in use; the dashboard warns if it is inside the app.
2. **Download a backup** (Settings -> Checks & backup) after any big change and at least weekly (the dashboard reminds you).
   It is one file with your settings, leads, history and email edits. It never contains passwords.
3. If data ever disappears: log in, go to Settings -> Checks & backup -> **Restore from backup**, choose the file. The current data is validated
   first, a safety copy of whatever was there is saved, and a bad or wrong file changes nothing.
After a redeploy you still need the environment variables (passwords etc.) in Hostinger; they are not part of the backup.

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
- **Settings -> Sending -> Careful** fills in a gentle plan for a single mailbox on your main domain: 5/10/15/20
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

## Three mailboxes, AI replies, warm-up (v2.5)
**Mailboxes.** A fresh install starts with `hassan@`, `adil_ishtiaq@` and `sienna_carter@weberslink.org`. If you already saved
settings, add the two new ones in Settings -> Mailboxes (they get numbers 2 and 3) and set `OUTREACH_PASSWORD_2` and
`OUTREACH_PASSWORD_3` on the server. A mailbox whose sender name differs from the Signature name signs emails as that
person, with no job title unless you fill one in. New leads rotate across the mailboxes; follow-ups stay with the mailbox that started the thread.

**Gemini on replies** (needs `GEMINI_OUTREACH_KEY`; `GEMINI_OUTREACH_AI_DAILY_MAX` caps calls, default 300). Every reply is
labelled: interested, question, not now, not interested, out of office, wrong person, unsubscribe, other. The word-list rules
still run first and decide who is stopped; Gemini can only make things safer (a high/medium-confidence "unsubscribe" the word
list missed stops the lead and adds the address to the never-contact list).
- **Out of office:** the return date snoozes follow-ups until the day after (Leads shows "Paused until...", with a **Resume now** button).
- **Wrong person with a named colleague:** that person is added as a new lead, marked "referred by", and is not blocked by the "a colleague replied" rule.
- **Suggested reply** for interested/question replies (Inbox, **Use suggested reply**): plain text, no links except your booking link
  (Settings -> AI & automation). A person always reviews and sends it; nothing is auto-sent.
- **Webhook:** set an https address in Settings and positive replies on live runs are posted there as JSON (CRM, Zapier, Slack).
- Mark each reply's **Outcome** (meeting booked / won / lost). The Dashboard's Results panel shows replies by label, by email step, by mailbox, and meetings.
- **Why people say no:** Reports -> Why people say no -> Summarise with Gemini groups the last 60 days of "no" and "not now" replies into themes with copy advice.

**Lead scoring.** Describe your ideal customer in Settings -> AI & automation, then Leads -> Tools -> **Score leads (Gemini)**. Waiting leads are then emailed
best-score first; "Skip leads scoring below" sets a floor. Scores come only from the lead's own fields (category, niche, country, PageSpeed).

**Copy tools.** Templates -> **Check copy** flags spam-filter words, pushy calls to action, long emails, too many links and ALL CAPS (add
"also ask Gemini" for a second opinion). Spintax works in subject and body: `{Hi|Hey|Hello} {first_name}`; the same lead always gets the same wording.

**One-click unsubscribe.** Every cold email carries `List-Unsubscribe` (https and mailto) and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`
(Gmail/Yahoo bulk-sender requirement). The https link lives at `/u/<token>` on your site (same address setting as click tracking). A GET only shows a
confirm button; a POST unsubscribes, suppresses the address and stops its sequence.

**SMTP check** (Leads -> tick "SMTP check", then Clean list). Asks each recipient's mail server whether the mailbox exists (never sends
mail) and spots catch-all domains. Only a clear "no such user" answer sets a lead aside. Many hosts, shared hosting included, block outgoing port 25; then
every answer is "unknown" and nothing changes. Free-mail addresses are not probed.

**Warm-up between your mailboxes** (Settings -> Mailboxes, off by default). Every 30 minutes in daytime, each mailbox sends a few short
messages to the others; the receiver opens them, moves any from spam back to the inbox, and answers a share. It never counts toward the cold-email limit and
the dashboard shows where each mailbox's warm-up mail landed (inbox vs spam), which doubles as a free placement test and feeds the **Health** score
(bounces, pauses, spam placement). With only three inboxes the effect is modest: keep ramp-up slow and lists clean. The IMAP part
(finding, opening and rescuing warm-up mail) is tested with fakes only, so run **Run warm-up now** once and check the result before relying on it.

**Not built:** LinkedIn/WhatsApp steps, built-in email finding (use Apollo to find addresses, then import), team roles and per-client workspaces, recipient-timezone sending, external seed-inbox placement tests.


## Campaigns (by place and business type)
**Campaigns** tab. A campaign is a group of leads defined by **countries, states, cities and business types** (leave a box empty
for "any"), with its own **mailboxes**, **daily limit** and, optionally, its own **email copy**. Examples: "Texas roofers", "UK dentists", "Florida HVAC".
- **Where the data comes from:** your spreadsheet's `country`, `state` and `city` columns; state and city are also read from a US street address
  ("12 Main St, Dallas, TX 75201"). "Texas", "texas" and "TX" are treated as the same. Business types match as words inside the lead's category,
  niche, store name or website, so "roof" catches "Roofing contractor". The page suggests the most common values in your leads; click one to add it.
- **Which campaign a lead joins:** the first campaign in your list (top to bottom) that fits it. Leads still waiting are re-sorted every time you save, so
  editing a campaign takes effect at once; leads already in a sequence keep theirs. A live count under each campaign shows how many leads match and how many
  another campaign above already claims.
- **Sending rules:** with no campaigns, every lead is emailed as before. Once any campaign exists, only leads in a campaign that is **On** are emailed
  (a paused campaign sends nothing, including follow-ups). Campaigns take turns in the queue so a big one never starves the others. A campaign's daily limit is shared across its mailboxes
  and counts across runs; the mailboxes' own limits and warm-up still apply. Follow-ups always come from the mailbox that sent the first email.
- **Own emails:** Emails tab -> "Emails for" -> pick the campaign, edit and save. Anything you don't change there uses your default emails. "Reset to default" removes the campaign's edit.
- **Dashboard:** a Campaigns table (waiting, in sequence, sent today, replies, positives, bounces, days to finish) and **Worth your attention**, which spells out problems
  and opportunities from your data: leads matching no campaign, a campaign with no mailbox or no leads, a paused mailbox or campaign, bounces, a campaign replying at twice the rate of another, replies waiting over 24 hours.
- Leads can be filtered by campaign; the table shows each lead's place and campaign. Campaigns and their email copy are included in backups.


## First-time checklist
1. Set the env variables above, restart the app, sign in.
2. Settings: your name, company, **postal address**, notify email, mailboxes (lookalike domains, not weberslink.org). Save.
3. Settings -> Checks & backup -> **Check now**: fix anything marked "Fix" (SPF/MX), and add DKIM/DMARC if flagged.
4. Settings -> Checks & backup -> **Send test email** to your own address; confirm it lands in the inbox, not spam.
5. Leads: import your spreadsheet (.xlsx sheet "Leads", or .csv).
6. Emails: check the copy; use "Preview real leads".
7. Run (dry) and read the log.
8. Switch the top bar from Test mode to **Live**. Warm-up is automatic. Add the cron job.

## Email copy
The bundled emails (`outreach/templates/email1.txt`, `email1b.txt`, `email2.txt`, `email3.txt`, `email4.txt`) introduce WebersLink as a
small team of engineers who build and run AI assistants and automation for online stores, and offer a free 3-minute video. Email 1
never sells (no price, no links) and A/B versions share one body and differ only in the subject. Emails 2-4 reuse the first
email's subject (as "Re: ..."), so changing a template never breaks a conversation that is already running; a lead who already got
email 1 simply receives the new wording for emails 2-4.
**Edits made in the Emails tab win over the bundled files**, so a server where the emails were edited keeps its old wording. Edited
emails are marked with a pencil in the Emails tab: open each one and click **Reset to default** to switch to the bundled copy.

## Rules baked in
Email 1 never sells (no price, no links). Max 100/day per mailbox. Weekdays only. Canada excluded by default (CASL).
Every email carries the postal address and an opt-out line. A mailbox pauses itself above the bounce limit.
A/B versions share one body and differ only in subject; judge after about 100 leads each.

## Tests
`npm test` (about 182 tests: engine, API, auth, regression tests for an independent code review; no network or real
mailboxes needed).

## Not covered by tests
Live SMTP/IMAP against Hostinger and Hostinger cron/outbound-port behaviour: use Send test email and a dry run before
going live. Live PageSpeed testing from the old Python tool was left out; scores in your spreadsheet are imported and used.
