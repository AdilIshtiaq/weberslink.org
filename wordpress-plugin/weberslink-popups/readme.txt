=== Weberslink Popups & Lead Capture ===
Contributors: weberslink
Tags: popup, email capture, lead generation, newsletter, exit intent, announcement bar, slide-in
Requires at least: 5.9
Tested up to: 6.8
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Popups, slide-ins and announcement bars that grow your email list, with smart triggers, targeting, frequency limits, spam protection, CSV export and a webhook.

== Description ==

**Weberslink Popups & Lead Capture** shows the right message to the right visitor at the right time.

**Three formats**
* Centred popup, corner slide-in and announcement bar (top or bottom)
* Your headline, text, colours and button; an email form (with optional name and consent checkbox) or a call-to-action button

**Smart triggers**
* After a delay, after scrolling a percentage, on exit intent (desktop), when a button is clicked (`.class` or `#id`), or straight away
* Show once per visit, once every N days or every time; people who subscribe are not asked again
* Pages: everywhere, home only or a list with wildcards; exclusions for checkout and thank-you pages
* Desktop or mobile only; logged-out visitors only; start and end dates for sales

**Collect leads safely**
* Spam protection: hidden honeypot field, per-visitor rate limits, duplicate emails ignored
* Consent checkbox when you need it
* Leads list with search, CSV export (spreadsheet formulas neutralised) and deletion
* Email notification (capped at 30 an hour) and a signed webhook to Zapier, Make, n8n or your CRM
* Views, sign-ups and conversion rate for the last 30 days

**Accessible**
* Focus moves into the dialog and stays there, Escape closes it, focus returns afterwards, large touch targets

== Installation ==

1. Upload the `weberslink-popups` folder to `/wp-content/plugins/` and activate.
2. Open **Popups → Add new**, write your message, choose when and where it shows, save, then click **Preview**.

== Frequently Asked Questions ==

= Does it send my leads to Mailchimp or other services? =
Use the webhook (Zapier, Make, n8n or a direct endpoint) or export a CSV. A signature header lets you verify requests.

= Will popups hurt my SEO? =
Popups that cover the page right after arrival on mobile can. Use a delay, a slide-in or a bar, and avoid full-screen popups on mobile.

= Does it work with caching plugins? =
Yes. Targeting by page happens on the server per URL, while triggers and frequency run in the browser.

== Changelog ==

= 1.0.0 =
* Initial release: popups, slide-ins and bars, triggers, targeting, frequency, lead capture with spam protection, leads list and CSV export, webhook, statistics.
