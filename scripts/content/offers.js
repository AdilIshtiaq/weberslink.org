// Offer landing pages linked from outreach emails.
module.exports = [
  // Primary: "AI shopping assistant for WooCommerce" · Secondary: "WooCommerce abandoned cart recovery", "WooCommerce chatbot"
  {
    path: "/woocommerce",
    type: "service",
    serviceName: "WooCommerce Sales Recovery Pilot",
    offerFrom: "290",
    title: "Free AI Shopping Assistant Pilot for WooCommerce | WebersLink",
    description: "Free 14-day pilot for WooCommerce stores: an AI shopping assistant that answers shoppers 24/7, automatic abandoned-cart follow-up, and mobile speed fixes. Set up in 48 hours.",
    kicker: "For WooCommerce stores",
    h1: "Turn more browsers into buyers. <em>Free for 14 days.</em>",
    lead: "An AI shopping assistant trained on your products, automatic abandoned-cart follow-up and mobile speed fixes — set up for you in 48 hours. Keep it only if it's clearly bringing in sales.",
    card: { title: "WooCommerce Sales Recovery Pilot", blurb: "AI shopping assistant + cart recovery for WooCommerce — free 14-day pilot." },
    crumbs: [["Services", "/services/"]],
    related: ["/services/ecommerce", "/services/ai-chatbots", "/blog/ai-chatbot-cost", "/blog/website-not-generating-leads"],
    body: `
<h2>Your store is open 24/7. Is anyone answering?</h2>
<p>A shopper finds a product they like at 11pm. They have one question — <em>will it fit, when will it arrive, can I return it?</em> — and nobody's there to answer. So they leave. Around <a href="https://baymard.com/lists/cart-abandonment-rate" target="_blank" rel="noopener">70% of online shopping carts are abandoned</a> before checkout, and unanswered questions are a big part of why.</p>

<h2>What the 14-day pilot includes</h2>
<ul>
  <li><strong>An AI shopping assistant</strong> on your store, trained on your products, sizing guides, shipping and returns policies. It answers in seconds, recommends products and sends shoppers to checkout — in your brand's voice.</li>
  <li><strong>WhatsApp too</strong>, if your customers prefer to message.</li>
  <li><strong>Abandoned-cart recovery</strong>: a short, friendly email sequence that brings shoppers back to the cart they left.</li>
  <li><strong>A mobile speed fix list</strong>: the top things slowing your store down on phones, in plain English.</li>
  <li><strong>A results report</strong> at the end of the pilot: conversations, questions asked, carts recovered and sales influenced.</li>
</ul>

<div class="callout"><i>🎁</i><div><strong>Founding store offer:</strong> we're taking 20 stores this month with no setup fee. The pilot is free for 14 days; after that it's <strong>$290/month</strong>, cancel anytime. If it isn't clearly paying for itself, you don't keep it.</div></div>

<h2>How it works</h2>
<ol>
  <li><strong>Reply or book a call</strong> — 15 minutes to understand your store and best sellers.</li>
  <li><strong>We set it up in 48 hours</strong> — assistant trained on your catalogue, cart emails written, installed on your WooCommerce store (no theme changes needed).</li>
  <li><strong>You approve it</strong> — test it yourself before it goes live to shoppers.</li>
  <li><strong>14 days live</strong> — we tune it as real questions come in.</li>
  <li><strong>You decide</strong> — continue at $290/month, or we remove it. No contract.</li>
</ol>

<h2>Built by a team that ships WooCommerce stores</h2>
<p>We've built WooCommerce stores like <a href="https://sharjahoptical.online/" target="_blank" rel="noopener">Sharjah Optical</a>, an eyewear store with product variations and one-tap WhatsApp ordering, plus 50+ other websites. The AI assistant on this page is the same technology — try asking it a question.</p>
`,
    faqs: [
      ["Is the pilot really free?", "Yes. 14 days, no card required to start, and founding stores pay no setup fee. After the pilot it's $290/month if you choose to continue, cancel anytime."],
      ["Will the AI give customers wrong answers?", "It only answers from your approved product information and policies, and hands over to you when it isn't sure. You test it before it goes live, and we review conversations during the pilot."],
      ["Do I need to change my theme or plugins?", "No. The assistant is added with a small script, and cart follow-ups use your existing WooCommerce setup. Nothing about your store's design changes."],
      ["Does it work for UK stores?", "Yes — we work with stores in the US and UK, set up GDPR-friendly consent for the chat, and invoice in USD, GBP or EUR."],
      ["What if I'm not on WooCommerce?", "Shopify and other platforms work too — mention it when you reply and we'll confirm the setup."],
    ],
  },
];
