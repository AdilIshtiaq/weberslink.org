=== Weberslink Cookie Consent ===
Contributors: weberslink
Tags: cookie consent, gdpr, cookie banner, consent mode, privacy, ccpa, cookie law
Requires at least: 5.9
Tested up to: 6.8
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

A cookie banner that holds back analytics and marketing scripts until visitors agree, with Google Consent Mode v2, embeds that wait for consent and an exportable consent log.

== Description ==

**Weberslink Cookie Consent** keeps tracking switched off until a visitor says yes.

**Banner**
* Accept all and Reject all with the same size and prominence, plus a Customise dialog with a switch per category
* Categories: Necessary (always on), Preferences, Analytics, Marketing: use only the ones you need
* Bar, corner box or centred dialog; your colours and your wording
* A small "Cookie settings" button (and a `[wlcc_settings]` shortcode) so visitors can change their mind at any time
* Keyboard and screen-reader friendly: focus trapped in the dialog, Escape closes it, visible focus rings

**Held-back scripts**
* Paste Google Analytics, Meta Pixel, TikTok, LinkedIn or any other tag into the matching category: it is held back and runs only after consent
* Iframes (YouTube, Maps) and tracking images stay blank until the visitor agrees
* Google Consent Mode v2: everything starts denied and is updated with the visitor's choice; a `wlcc_consent` event is pushed to the data layer
* A `wlcc:consent` browser event and `WLCC_API.has('analytics')` for your own code

**Proof and policy**
* Consent log of each choice (action, categories, policy version) without storing IP addresses; CSV export
* Ask everyone again with one tick when your cookies or policy change; choices also expire after the number of days you set
* `[wlcc_cookies]` prints a table of the cookies you declare, for your cookie policy page

== Installation ==

1. Upload the `weberslink-cookies` folder to `/wp-content/plugins/` and activate.
2. Open **Cookie Consent**, choose your categories and paste your analytics or marketing tags into the matching boxes.
3. Remove those same tags from your theme or other plugins, so they only load through the banner.

== Frequently Asked Questions ==

= Does installing this make my site GDPR compliant? =
It handles the consent part of cookie rules. You are still responsible for what your site sets, for a clear cookie policy and for the rest of the law. This is not legal advice.

= Why must I move my tracking tags into the plugin? =
A tag that is already in your theme or another plugin loads before the banner can stop it. Paste it into the matching box instead and the plugin releases it only after consent. Google tags that load themselves are controlled through Consent Mode.

= Does it work with Google Tag Manager? =
Yes. Put the GTM snippet in the Analytics or Marketing box, or leave it in your theme and rely on Consent Mode: GTM receives the default "denied" state and the update.

== Changelog ==

= 1.0.0 =
* Initial release: banner, categories, held-back scripts and embeds, Google Consent Mode v2, consent log with CSV export, cookie table and settings shortcodes.
