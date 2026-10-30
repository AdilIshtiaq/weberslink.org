=== Weberslink Security Shield ===
Contributors: weberslink
Tags: security, two factor authentication, 2fa, limit login attempts, hardening, activity log, brute force
Requires at least: 5.9
Tested up to: 6.8
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Protect WordPress logins with attempt limiting and two-factor authentication, switch on hardening in one click, keep an activity log and get a plain-English security check-up.

== Description ==

**Weberslink Security Shield** covers the basics that stop most attacks.

**Protect logins**
* Lock an address out after repeated failed logins; repeat offenders are locked longer (up to 24 hours)
* A locked address is refused even with the correct password
* Always-allow and always-block lists, with ranges (203.0.113.0/24, IPv6 too)
* Email alert on lockouts (at most one every 15 minutes)
* Generic login errors: attackers cannot tell whether a username exists

**Two-factor authentication**
* Works with Google Authenticator, Authy, 1Password, Microsoft Authenticator and any TOTP app (RFC 6238)
* Eight one-time recovery codes in case a phone is lost
* Codes work once; secrets are stored encrypted
* Each user turns it on from their own profile; nobody is forced, so nobody gets locked out
* Application passwords and the mobile app keep working

**Harden**
* Strong password policy (12+ characters, varied, not common, not the username)
* Disable XML-RPC, hide the WordPress version, block username scans (?author=1, REST users list, users sitemap)
* Disable the theme and plugin code editors
* Security headers and optional HSTS; optionally disable application passwords

**See**
* Security check-up: a 0–100 score with plain-English advice, worst problems first
* Activity log: logins, failures, lockouts, 2FA changes, password resets, new and deleted users, role changes, plugin and theme changes

== Installation ==

1. Upload the `weberslink-security` folder to `/wp-content/plugins/` and activate.
2. Open **Security Shield** → **Check-up** and follow the advice.
3. Open your **Profile** and set up two-factor login.

== Frequently Asked Questions ==

= I locked myself out. =
Wait for the lockout to end, or add your address to "Always allow" first next time. If you lose your phone, use a recovery code, or ask another administrator to reset your two-factor login from your user page. As a last resort, rename the plugin folder over FTP.

= Does the QR code work? =
This version shows the setup key and a tap-to-add link for phones instead of a QR image; every authenticator app accepts a typed key.

= My site is behind Cloudflare. =
Choose "CF-Connecting-IP" under "Visitor address from", otherwise every visitor looks like the proxy. Only do this when the site is reachable through the proxy.

== Changelog ==

= 1.0.0 =
* Initial release: login limiting, allow/block lists, two-factor login with recovery codes, password policy, hardening switches, security check-up and activity log.
