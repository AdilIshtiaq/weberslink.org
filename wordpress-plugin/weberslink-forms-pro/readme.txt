=== Weberslink Forms Pro ===
Contributors: weberslink
Tags: form builder, contact form, multi step form, payment form, conditional logic, file upload, stripe, paypal
Requires at least: 5.8
Tested up to: 6.8
Requires PHP: 7.4
Stable tag: 1.1.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Drag-and-drop form builder with conditional logic, multi-step forms, calculations, payments, file uploads, spam protection, entries manager and integrations. Blends into any theme.

== Description ==

**Weberslink Forms Pro** is a complete form builder for WordPress.

**Builder**
* Drag & drop editor, 35+ field types, 9 ready-made templates, duplicate/reorder fields, 5 width options per row
* New in 1.1: toggle switch, image choice (picture options), ranking, date range, emoji rating, terms box (scroll-to-agree), US state, dynamic dropdown (posts / pages / custom post types / taxonomy terms), image and video/oEmbed blocks
* Text, paragraph, email, number, phone, URL, password, date/time/date-time, colour, hidden, dropdown, multi-select, radio, checkboxes (with "Other"), consent, name, address, country
* File & image upload, star rating, net-promoter score, range slider, Likert matrix, signature pad, repeater rows, calculation, section, HTML, divider, shortcode, CAPTCHA
* Multi-step forms with progress bar or step tabs
* Conditional logic (show/hide fields, conditional emails and integrations, 12 operators, ALL/ANY)
* Calculations with a safe formula engine (client and server)
* Input masks, character counters, default values & merge tags, URL prefill, browser auto-save

**Works with every theme**
* Fonts and text colour are inherited from your theme; borders are translucent so fields read on light and dark backgrounds
* Scoped CSS with CSS variables, RTL support, six style presets, per-form colours, custom CSS
* Shortcode, Gutenberg block, classic widget, Elementor widget, PHP template tag, works in page builders, popups and block themes
* Accessible markup (labels, aria-live errors, keyboard friendly)

**Entries & reporting**
* Entries manager: search, filter by date/status, star, spam, trash, bulk actions, notes, edit entry, activity log, print/PDF view, CSV export (spreadsheet-formula safe)
* Reports: views, conversion rate, entries per day, revenue; weekly digest email; dashboard widget

**Emails**
* Unlimited notifications and auto-responders, merge tags ({all_data}, {field:key}…), CC/BCC/Reply-To, attachments, per-notification conditions, resend

**Payments**
* Stripe Checkout, PayPal, or offline; fixed / custom-amount / priced-option products, quantity, coupons, tax, order summary; server-side totals; Stripe webhook verification

**Integrations**
* Webhooks (Zapier, Make, n8n, Google Sheets via Apps Script), Slack, Discord, Microsoft Teams, Telegram, Mailchimp, create WordPress user, developer hooks for custom feeds

**Spam protection**
* Honeypot, time trap, per-IP rate limit, blocked words, link limit, Akismet, Google reCAPTCHA v2/v3, hCaptcha, Cloudflare Turnstile

**Privacy**
* Optional IP anonymisation or no IP storage, auto-delete old entries, WordPress personal-data exporter/eraser integration, uploads protected from script execution

**Tools**
* Import/export forms (JSON), form duplication, activity logs, email test, system status, cache-safe nonces

== Installation ==

1. Upload the `weberslink-forms-pro` folder to `/wp-content/plugins/` (or use Plugins → Add New → Upload Plugin).
2. Activate the plugin.
3. Go to **Weberslink Forms → Add new**, pick a template and edit it.
4. Embed with the shortcode `[weberslink_form id="1"]`, the *Weberslink Form* block, the widget, or Elementor.

== Frequently Asked Questions ==

= How do I send emails reliably? =
Install an SMTP/mailer plugin and set a From address on your own domain in Settings. Use Tools → Send test email.

= How do I connect Stripe? =
Settings → Payments: add your secret key, then add the webhook URL shown there in Stripe (events: checkout.session.completed, checkout.session.expired, charge.refunded).

= How do I send entries to Google Sheets? =
Add a Webhook integration pointing at a Google Apps Script web app, Zapier, Make or n8n.

= Can I restyle forms? =
Yes: Form → Settings → Appearance, CSS variables (`.wlfp-wrap{--wlfp-primary:#e11d48}`) or the per-form custom CSS box.

== Changelog ==

= 1.1.0 =
* New fields: toggle, image choice, ranking, date range, emoji rating, terms (scroll-to-agree), US state, dynamic dropdown from posts/terms, image block, video/oEmbed embed.
* New field options: duplicate (unique) check, read-only, confirm email / password, max words.
* Quiz scoring: per-option scores with {score}, {score_max}, {score_percent}, {quiz_result} tags and pass mark.
* Conditional confirmations (different message or redirect depending on answers).
* Create post / page / custom post type feed.
* Entries: reply to the submitter by email from the entry screen, re-run integrations on an entry.
* Shortcodes: [weberslink_my_entries] (a logged-in user's own submissions) and [weberslink_entry_count] (live counter, e.g. "12 of 50 seats taken").
* New templates: scored quiz, hotel/rental booking request, priorities survey.

= 1.0.1 =
* Fix: Edit/Form builder page was blocked for administrators.
* New: 25+ templates in categories with search; templates shown on the empty Forms screen.

= 1.0.0 =
* Initial release.
