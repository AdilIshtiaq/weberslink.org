=== Weberslink Redirects & 404 Monitor ===
Contributors: weberslink
Tags: redirect, 301 redirect, 404 monitor, broken links, seo, regex redirect, redirection manager
Requires at least: 5.9
Tested up to: 6.8
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Manage redirects, catch and fix 404 errors with smart suggestions, redirect automatically when a post URL changes, test any URL and import or export CSV.

== Description ==

**Weberslink Redirects & 404 Monitor** keeps every old link working.

**Redirect**
* 301, 302, 303, 307, 308 redirects plus 410 Gone and 451 for removed content
* Match an exact URL, a whole folder (`/blog/x` → `/news/{rest}`) or a regular expression (`$1`, `$2` in the target)
* Choose what happens to the query string: ignore it, pass it on, or require it
* Ignore case and trailing slashes (both optional)
* Fast: rules are compiled into one cached lookup, so thousands of redirects cost almost nothing
* Count hits and see when each redirect was last used; enable, disable and bulk-edit

**Fix 404s**
* Logs the addresses visitors asked for that do not exist, most requested first, with the page that linked to them
* Smart suggestions: the plugin finds the closest published page (typos, renamed slugs) so one click fixes it
* Redirect, answer 410 Gone, or ignore: all from the list
* Bots, images and other noise are ignored; old entries clean themselves up

**Stay safe**
* Creates a 301 automatically when a published post or page gets a new URL
* Rejects loops, unsafe targets (`javascript:` and similar) and broken regular expressions when you save
* Test any URL: see the whole chain, loops and chains that are too long
* CSV import and export (spreadsheet formulas are neutralised)

== Installation ==

1. Upload the `weberslink-redirects` folder to `/wp-content/plugins/` and activate.
2. Open **Redirects** in the admin menu and add your first redirect, or open **404 monitor** after a few days.

== Frequently Asked Questions ==

= Does it slow the site down? =
No. Active rules are compiled into one cached structure, exact redirects are a single array lookup, and the check runs before WordPress loads the page.

= Will it work with caching plugins? =
Redirects run in PHP. If a full-page cache serves a page before PHP runs, clear the cache after adding a redirect for a URL that used to exist.

= Can I redirect an old domain? =
Rules match the path, not the host. Point the old domain at the same WordPress site and the redirects apply.

== Changelog ==

= 1.0.0 =
* Initial release: exact, folder and regex redirects, 404 monitor with suggestions, automatic redirect on slug change, URL tester, CSV import and export.
