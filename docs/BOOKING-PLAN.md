# WebersLink Booking: product plan

Goal: a booking platform any appointment business can run on, sold three ways: **use it yourself**, **we set it up
for you**, or **we build custom features for you**. Benchmarked against Square Appointments, Fresha, Acuity,
SimplyBook.me, Setmore, Calendly, Vagaro, Booksy, Mindbody, Zoho Bookings and Cal.com (Nov 2026 study; prices from
search summaries of vendor pages, to re-check before publishing any comparison).

## 1. The customer journey (logical steps)

| Step | What the business owner does | Where |
|---|---|---|
| 1. Try | Click around a sample salon / clinic / home-services business, as a customer and as the owner. No sign-up. | `/demos/booking/` |
| 2. Register | Business name, type, time zone, currency, email, password. Confirm email. | `/book/new` |
| 3. Set up | Guided steps: business, services, team, hours, review. Industry defaults so it is never empty. | first sign-in |
| 4. Go live | Their page takes bookings; a checklist: test booking, share link, Google profile, embed on website. | dashboard |
| 5. Use daily | Calendar, clients, add phone bookings, reports, settings. | dashboard |
| 6. Grow | **Upgrade** to a paid plan, **Done-for-you setup** (we enter everything, import clients, add it to their site), or **Request a custom feature**. Requests reach you on `/admin/booking.html` and by email. | dashboard → Plan & help |

This matches the common pattern in the market (free plan or no-card trial → short questionnaire → hours, services,
staff → publish → upgrade when they need more staff, SMS, payments or branding removal). Done-for-you migration
(Vagaro, Mindbody) is a strong differentiator and suits an agency like WebersLink.

## 2. Plans (proposed; prices are yours to set in `booking/plans.js`)

| | Free | Pro | Done-for-you | Custom |
|---|---|---|---|---|
| Team members | 1 | Unlimited | Unlimited | — |
| Bookings a month | 100 | Unlimited | Unlimited | — |
| Clients, history, notes, tags, import/export | ✓ | ✓ | ✓ | — |
| Custom booking questions | 2 | Unlimited | Unlimited | — |
| "Powered by WebersLink" on the page | shown | removable | removable | — |
| Setup | self-serve | self-serve | we do it, incl. client import and website embed | — |
| Price | $0 | suggested $19/month | suggested one-time fee + Pro | quote |

Until online payments are connected, upgrades are **requested in the dashboard** and you switch the plan on
`/admin/booking.html` after the customer pays you (invoice, bank, card link). Stripe billing is a later phase.

## 3. Features: where we are and what comes next

Legend: ✅ have · 🔨 phase 1 (built, Nov 2026) · 2️⃣ phase 2 · 3️⃣ phase 3. "T" = table stakes in the market.

**Booking page & widget**
- ✅ Hosted page, embed code, mobile flow, brand colour, customer self-reschedule/cancel (T)
- 🔨 Service categories; services hidden from online booking (phone-only)

**Services**
- ✅ Price, duration, description (T)
- 🔨 Per-service buffer time
- 2️⃣ Group classes with capacity, add-ons
- 3️⃣ Packages, memberships

**Staff**
- ✅ Working days, "anyone available" (T)
- 🔨 Each person's own hours and breaks; time off and holidays (T)
- ✅ Staff logins with roles (owner / manager / staff) (phase 2, Nov 2026)
- 2️⃣ Per-staff prices
- 3️⃣ Commissions

**Scheduling rules**
- ✅ Buffers, minimum notice, booking window (T)
- 🔨 Business closures (public holidays) and blocked time
- 2️⃣ Recurring appointments, waitlist
- 3️⃣ Rooms/resources, multi-location

**Customers / CRM**
- 🔨 Client list with history, total spent, notes, tags, no-show count, block client, CSV import and export (T)
- 🔨 Custom booking questions (intake) (T)

**Owner tools**
- 🔨 Move or edit any booking from the dashboard
- 🔨 Calendar feed to subscribe in Google, Outlook or Apple Calendar (one-way sync)
- 3️⃣ Two-way Google/Outlook sync

**Payments**
- ✅ Stripe deposits / prepayment via Connect, refunds on cancel, no-shows keep the deposit (phase 2, Nov 2026)
- 2️⃣ No-show and late-cancel fees charged to a saved card, coupons
- 3️⃣ Gift cards, invoices, tax

**Notifications**
- ✅ Email confirmation, reminder, moved, cancelled, owner alerts (T)
- 2️⃣ SMS reminders (Twilio), editable templates, review request after the visit
- 3️⃣ WhatsApp

**Reports**
- ✅ Bookings, value, online share, no-shows, CSV export
- 🔨 Revenue by service and by person, new versus returning clients

**Marketing**
- 2️⃣ Instagram/Facebook "Book" button guide
- 3️⃣ Reserve with Google, email campaigns

**Platform**
- 🔨 Plans and limits, upgrade, done-for-you and custom-feature requests
- 🔨 Dashboard restyled in the WebersLink design (dark navigation, Archivo headings, red accent, mono labels)
- 3️⃣ API and webhooks, custom domains, white-label, HIPAA

## 4. Design rules

- **Platform screens** (sign-up, dashboard, plans, your admin) follow weberslink.org:
  - colours: near-black `#090807` and paper `#f4f2ed`, red `#d9251c`
  - fonts: Archivo expanded headings, Inter body, JetBrains Mono uppercase labels
  - pill buttons
- **Customer booking page** is the business's, not ours. It uses their brand colour, keeps a neutral clean layout,
  and on the Free plan shows a small "Powered by WebersLink".

## 5. Not in scope without your decision
- Charging cards (needs your Stripe account).
- Sending SMS (needs a Twilio account and per-message cost).
- Google/Microsoft calendar connections (need app registrations with Google and Microsoft).
- Final plan prices.
