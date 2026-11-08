// Google AdSense. Paste your publisher ID below (it looks like "ca-pub-1234567890123456"), run `npm run build`,
// commit and deploy. While it is empty, nothing AdSense-related is added to the site.
//
// When set, the build:
//  - adds <meta name="google-adsense-account"> to every page (so Google can verify the site),
//  - writes public/ads.txt,
//  - loads the AdSense script ONLY on guides (/blog/...) and free plugin pages (/plugins/...), so Auto ads can
//    never appear on the homepage, service, offer, work or contact pages, where visitors decide to hire you.
// Turn on Auto ads and Google's consent message ("Privacy & messaging" -> European regulations) in your AdSense account.
module.exports = {
  client: "ca-pub-7735069817622962",
};
