=== Weberslink Image Optimizer ===
Contributors: weberslink
Tags: image optimization, compress images, webp, resize images, performance, media library
Requires at least: 5.9
Tested up to: 6.8
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Compress and resize images on upload, straighten phone photos, strip location data, create WebP versions that browsers get automatically, optimise your existing media library and restore any original.

== Description ==

**Weberslink Image Optimizer** makes your pages load faster without a visible difference.

* Compresses JPEG, PNG and WebP uploads and every generated thumbnail; never makes a file bigger
* Scales huge camera photos down to the maximum size you choose (originals kept if you like)
* Turns phone photos upright and removes camera metadata such as GPS location
* Creates WebP versions and serves them with a `<picture>` tag: no server rules, safe with page caches
* Optimise the whole existing media library in small steps, with a progress bar
* Per-image "Optimize now" and "Restore original" in the media library, with the savings shown
* Skips files already at your quality, so running it twice never degrades an image
* Skips animated PNGs, GIFs and SVGs; keeps PNG transparency

Uses the PHP GD library that almost every host provides. No account, no API key and no image ever leaves your server.

== Installation ==

1. Upload the `weberslink-images` folder to `/wp-content/plugins/` and activate.
2. Open **Media → Image Optimizer**, check the settings and click **Optimise all images**.

== Frequently Asked Questions ==

= Is it lossless? =
PNG recompression is lossless. JPEG and WebP are compressed at the quality you choose; around 80–85 is normally indistinguishable from the original.

= Does it need an external service? =
No. Everything runs on your own server with PHP's GD library.

= What does Restore original do? =
It puts back the original upload and removes the WebP versions. Thumbnails stay optimised. Originals are only kept when "Keep originals" is on.

= My theme uses CSS like `.entry img > ...` =
WebP serving wraps images in `<picture>`. If a theme breaks, switch off "Serve WebP automatically": compression still works.

== Changelog ==

= 1.0.0 =
* Initial release: compression and resizing, orientation fix, metadata removal, WebP versions served through picture tags, bulk optimiser, restore, media library column.
