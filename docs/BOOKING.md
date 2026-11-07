# Online booking for client businesses

A booking system you can give to any appointment-based business (salons, clinics, dentists, trades, coaches…).
It runs inside this website's Node app: no extra hosting, no database, no monthly fee per client.

| Page | Who | What |
|---|---|---|
| `/demos/booking/` | prospects | Public demo with three sample businesses (salon, dental clinic, home services). Bookings stay in the visitor's browser. Add `?type=clinic` / `?type=home` / `?view=admin` to open straight to one. |
| `/admin/booking.html` | you | Create businesses, reset an owner's password, switch a page off. Uses the Outreach login (`ADMIN_PASSWORD`). |
| `/book/<name>` | the business's customers | The real booking page. Can be linked or embedded in the business's own site (iframe). |
| `/book/<name>/admin` | the business owner | Their dashboard (password login). |
| `/book/new`, `/book/login`, `/book/forgot` | business owners | Sign up, sign in with email, reset password. |

## Owner dashboard (phase 1 platform)

Tabs:
- **Calendar**: week strip and each person's day. Every booking shows the customer's answers and can be
  edited or moved (date, time, person, service, details), marked done or no-show, or cancelled. The customer
  is emailed when the time changes, unless the owner unticks it.
- **Add booking**: phone and walk-in bookings. Only free times are offered, phone-only services are included,
  and minimum notice doesn't apply.
- **Clients**: everyone who booked, plus imported clients. Shows visits, upcoming, no-shows, spend, last visit
  and tags. Each client has private notes, tags, a "block online booking" switch and their history. CSV import
  (columns name, email, phone, notes, tags) and CSV export.
- **Time off**: whole days or part of a day, for one person or the whole business. Clashing bookings are listed
  (they aren't cancelled).
- **Reports**: next 7 days, booked value, online share, after-hours bookings, no-show rate, cancellations; the
  last 30 days by person, new versus returning clients, most booked services; CSV of all bookings.
- **Settings**:
  - services: category, gap after, online or phone-only
  - team: own hours, daily break, days, services
  - opening hours, gaps, notice, booking window, change cut-off, reminder timing
  - booking questions: short or long answer, choose one, yes/no; required or optional
  - password; delete the page
- **Share**: booking link, embed code for their website, and a private calendar feed (subscribe in
  Google/Outlook/Apple, with a reset).
- **Plan & help**: usage meters, Free and Pro plans, and done-for-you setup or custom features. Each request is
  emailed to `BOOKING_ADMIN_EMAIL` (or `SMTP_USER`) and listed on /admin/booking.html, where you switch plans.

Plans, prices and limits are in `booking/plans.js`. Free: 1 team member, 100 online bookings a month,
2 questions, "Powered by WebersLink". Pro: unlimited, no branding. The limits are enforced on the server.
The browser runs the same scheduling engine as the server (`booking/core.js`, served as
`/demos/booking/core.js`), so the demo behaves exactly like the real thing. The full roadmap is in
`docs/BOOKING-PLAN.md`.

## Deposits (Stripe Connect)

- **You switch it on once:**
  - In your Stripe account, turn on Connect.
  - Set `STRIPE_SECRET_KEY` on the server.
  - Add a webhook endpoint for connected accounts pointing at `https://weberslink.org/api/booking-stripe/webhook`, with the events `checkout.session.completed`, `checkout.session.expired` and `account.updated`. Set its signing secret as `STRIPE_WEBHOOK_SECRET`.
  - Optional: `STRIPE_PLATFORM_FEE_PERCENT` (0–20), the share of each payment you keep.
  - Use `sk_test_…` keys first; the dashboard shows "test mode".
- **Each business:** Settings → Online payments → **Connect Stripe**. Stripe hosts the sign-up, identity check and bank details (Express account). The money goes straight to the business's own Stripe account. **Open your Stripe dashboard** shows their payouts.
- **Per service:** no deposit, a fixed amount, a % of the price, or the full price.
- **Customer:**
  - The summary shows "pay online now" and "pay at your appointment".
  - **Continue to payment** opens Stripe Checkout (card, Apple Pay, Google Pay).
  - The time is held for 35 minutes. The booking is confirmed when they return, or by the webhook if they close the tab.
  - Confirmation emails go out only after paying. Unpaid holds expire and the time frees up.
- **Refunds:** automatic when a customer cancels within the policy. When the owner cancels, they choose whether to refund (e.g. keep a late cancellation). No-shows keep the deposit. There's also a **Refund** button.
- **Fallback:** without Stripe connected (or while Stripe pauses an account), bookings go through without payment.
- **Demo:** the payment step is simulated; no card is charged.

## Team logins (Pro)

Owner → Settings → **Team logins**: invite by email as:
- **Manager:** everything except team logins, Stripe and deleting the page.
- **Staff:** linked to a team member's calendar. They see and change only their own appointments, clients and time off, and add bookings to their own calendar.

The invite link (valid 7 days) lets them set their password. After that they sign in at `/book/login` with their email, and "Forgot password" works for them too. Changing someone's role or removing their login signs them out at once. Every permission is enforced on the server; the dashboard also hides what a role can't use.

## Business owners sign up themselves

1. **/book/new**: business name, type (sets example services and hours), time zone, currency, email, password.
   Linked from the Demos page and the demo's top bar ("Create your booking page").
2. They get an email with a confirmation link (valid 48 hours, single use; "send it again" makes a new one).
   They can't sign in until they confirm. Unconfirmed sign-ups are deleted after 7 days.
3. The link signs them in and opens a **5-step setup**: business details, services, who takes bookings
   (real names, working days, services), opening hours, review. Each step is checked (e.g. a service nobody
   offers, a service longer than any opening day) and saved as they go.
4. **Go live**: until then their page shows "Online booking opens soon" and takes no bookings. After, they get
   their link, next steps, and their dashboard.

Later: **/book/login** (email + password), **/book/forgot** (reset link by email, 1 hour, single use; the same
answer is shown whether or not the email has an account), **Settings → Delete your booking page** (password
required; erases the settings and all bookings).

Limits: 3 sign-ups per connection per hour (10 a day), 60 a day in total, a hidden anti-bot field, throttled
sign-in. Sign-up refuses to start when the server can't send email (otherwise nobody could confirm).
Turn sign-ups off with `BOOKING_SIGNUP=off`.

## Setting up a client yourself (2 minutes)

1. Sign in on the Outreach dashboard, then open **/admin/booking.html**.
2. **Add a business**: name, web address (e.g. `glow-beauty`), owner's email, phone, type (sets example services and
   hours), time zone, currency. Click **Create booking page**.
3. Copy the message shown (link, dashboard link, password) and send it to the owner. The password is shown once;
   **New password** makes another (it signs the owner out everywhere).
4. The owner signs in at `/book/<name>/admin` and goes through the same 5-step setup; the page goes live when they finish.

## What customers can do

- Choose a service, a person (or "anyone available"), a date and a free time, then enter name, phone, email
  (and address for businesses that go to the customer).
- Times are always shown in the **business's** time zone and only free times are offered: opening hours, each
  person's working days and services, the gap between appointments, minimum notice and how far ahead booking is open
  are all applied. The server re-checks the time when the booking is made, so two people can never take the same slot.
- After booking: a booking code, an "Add to calendar" file and a Google Calendar link.
- Change or cancel online with the code and email (from the link in their confirmation email), until the cut-off
  the owner sets (default 24 hours before). After that they're asked to call.

## What the owner can do

- **Appointments**: week view, each person's day, new/changed bookings highlighted, call a customer with one tap,
  mark done / no-show, cancel (the customer is emailed), undo.
- **Add booking**: phone calls and walk-ins, only into free times; optional confirmation email.
- **Numbers**: bookings in the next 7 days and their value, share booked online, bookings made outside opening
  hours, no-show rate, cancellations, most booked services, **CSV download** of every booking.
- **Settings**: business details, time zone, brand colour, policy text, opening hours per day, gap between
  appointments, minimum notice, how far ahead, online change cut-off, reminder timing, start-time interval,
  services (name, description, length, price), team (role, working days, services), password.
- **Share & emails**: booking link, embed code for their website, and the email wording.

## Emails

Sent from the site's SMTP account (`SMTP_USER`, `SMTP_PASS`, optional `SMTP_HOST`, `SMTP_PORT`; the same ones the
contact form uses), with the business's name as sender and the owner's email as Reply-To:

- customer: confirmation (with calendar file), reminder (default 24 hours before), moved, cancelled
- owner: new booking, moved, cancelled online

Reminders are checked every 5 minutes while the app is awake and on every Outreach cron call, so keep that cron job.
Without SMTP everything still works; emails are skipped and logged.

## Settings on the server

| Variable | Needed | What |
|---|---|---|
| `ADMIN_PASSWORD` | yes | Your login for /admin/booking.html (shared with Outreach). |
| `SMTP_USER`, `SMTP_PASS` | for emails | Mailbox that sends booking emails. |
| `BOOKING_PUBLIC_URL` | no | Address used in email links (default `https://weberslink.org`). |
| `BOOKING_DATA_DIR` | no | Where booking data lives (default: `booking/` inside the Outreach data folder). |
| `BOOKING_ADMIN_EMAIL` | no | Where owners' upgrade / setup / custom requests are emailed (default `SMTP_USER`). |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | for deposits | Your Stripe platform key and the Connect webhook's signing secret. |
| `STRIPE_PLATFORM_FEE_PERCENT` | no | Your share of each deposit (default 0). |
| `BOOKING_SIGNUP` | no | `off` closes self sign-up (existing owners keep working). |
| `BOOKING_SECRET` | no | 32+ characters to sign owner logins (default: a random key saved in the data folder). |

## Data and safety

- Files: `<data>/booking/businesses.json` (accounts, scrypt-hashed passwords) and `b-<name>.json` per business.
  The Outreach **Download backup** includes them (not the login-signing key), and restoring puts them back.
  Writes are atomic. Bookings that ended more than 400 days ago are dropped.
- Owner logins are HttpOnly, SameSite=Strict cookies scoped to that business only, 12 hours; changing or resetting
  the password signs out every session. Login attempts are throttled.
- Customers see only free times, never other people's bookings. Booking, lookup and slot requests are rate-limited
  per connection, there is a hidden anti-bot field, and one email can hold at most 5 upcoming bookings.
- The owner dashboard can't be embedded in other sites; the booking page can (that's how it goes on their website).

## Tested

`npm test` runs `test/booking.test.js` and `test/booking-edge.test.js`: time zones and daylight-saving changes,
settings limits, availability (hours, notice, gaps, existing bookings), double-booking races, "anyone" sharing work,
validation, honeypot and rate limits, change/cancel cut-offs, rescheduling, owner sessions (isolation, logout,
password change), protected removal of booked services/people, phone bookings, CSV formula safety, page framing
rules, email escaping and time zone, reminders, backup/restore. The pages were also checked in a browser (demo,
customer, owner and admin flows; phone size; dark mode; embedding in another site; hostile input shown as text).

## Not included (yet)

Text-message (SMS) reminders (needs an SMS provider such as Twilio), online payments or deposits, and two-way sync
with Google/Outlook calendars. Each can be added per client.
