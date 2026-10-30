=== Weberslink SMTP & Email Log ===
Contributors: weberslink
Tags: smtp, email log, wp_mail, email deliverability, spf dkim dmarc, resend email, failed emails
Requires at least: 5.9
Tested up to: 6.8
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Send WordPress email through any SMTP provider, keep a searchable log of every email with preview and resend, retry failures automatically and check your SPF, DKIM and DMARC.

== Description ==

**Weberslink SMTP & Email Log** makes WordPress email reliable and visible.

**Send**
* Works with Gmail / Google Workspace, Microsoft 365, SendGrid, Mailgun, Amazon SES, Brevo, Postmark, Zoho, Mailtrap or any SMTP server (one-click provider presets)
* STARTTLS or SSL/TLS, optional authentication, certificate verification on by default
* Force the From email and name site-wide, set the return path for SPF alignment
* Password stored encrypted (libsodium), or keep every credential out of the database with constants in `wp-config.php`

**See**
* Searchable email log: recipient, subject, status, source (which plugin or theme sent it), attempts, date
* Rendered preview in a sandbox (no scripts, no remote images) or plain-text view
* Choose what to store: everything, recipients and subject only, or nothing
* Password-reset keys and tokens are replaced with [redacted] in stored messages
* Automatic clean-up after the number of days you choose; CSV export

**Fix**
* Resend any logged email, single or in bulk
* Automatic retries for failures (5 min, 30 min, 2 h)
* Failure alerts to Slack or Discord, because failed email cannot email you
* Dashboard widget and a warning banner when emails fail
* Test email tool shows the full SMTP conversation with credentials hidden
* Deliverability check: SPF (including DNS-lookup limit), DKIM and DMARC with plain-English advice

== Installation ==

1. Upload the `weberslink-smtp` folder to `/wp-content/plugins/` and activate.
2. Open **Weberslink Mail → SMTP settings**, pick your provider, enter the credentials and sender address, save.
3. Open **Tools → Send test**. Then check **Email log**.

== Frequently Asked Questions ==

= Where is my password stored? =
Encrypted in the options table using libsodium and keys derived from your site's secret salts. For the strongest setup define `WLSMTP_PASS` in wp-config.php and nothing is stored.

= Why did the log say "sent" but the email never arrived? =
"Sent" means the mail server accepted it. If it still does not arrive, run Tools → Deliverability check: missing SPF, DKIM or DMARC records are the usual cause.

= Can I resend emails that had attachments? =
No. Only file names are logged, never the files, so those emails cannot be resent or retried.

== Changelog ==

= 1.0.0 =
* Initial release: SMTP with provider presets, email log with preview, resend, retries, alerts, test tool and deliverability check.
