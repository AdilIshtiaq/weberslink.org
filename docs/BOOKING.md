# Online booking for client businesses

A booking system you can give to any appointment-based business (salons, clinics, dentists, trades, coaches…).
It runs inside this website's Node app: no extra hosting, no database, no monthly fee per client.

| Page | Who | What |
|---|---|---|
| `/demos/booking/` | prospects | Public demo with three sample businesses (salon, dental clinic, home services). Bookings stay in the visitor's browser. Add `?type=clinic` / `?type=home` / `?view=admin` to open straight to one. |
| `/admin/booking.html` | you | Create businesses, reset an owner's password, switch a page off. Uses the Outreach login (`ADMIN_PASSWORD`). |
| `/book/<name>` | the business's customers | The real booking page. Can be linked or embedded in the business's own site (iframe). |
| `/book/<name>/admin` | the business owner | Their dashboard (password login). |

## Setting up a client (2 minutes)

1. Sign in on the Outreach dashboard, then open **/admin/booking.html**.
2. **Add a business**: name, web address (e.g. `glow-beauty`), owner's email, phone, type (sets example services and
   hours), time zone, currency. Click **Create booking page**.
3. Copy the message shown (link, dashboard link, password) and send it to the owner. The password is shown once;
   **New password** makes another (it signs the owner out everywhere).
4. The owner signs in at `/book/<name>/admin`, opens **Settings** and enters their real services, prices, team,
   working days and opening hours, then **Save changes**. **Share & emails** gives them the link and the embed code.

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
