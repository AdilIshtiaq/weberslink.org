// FDE (forward-deployed engineering) offer pages: /offers/<slug>.
// Structure follows a problem -> system -> proof -> process -> FAQ -> CTA flow.
// Every factual claim here is already stated elsewhere on weberslink.org (pricing, timelines, features).
// Mockup rows are labelled as sample data on the page.

const STEPS = (build, live) => [
  ["Walkthrough", "A 20-minute call about your services, your area and how leads get handled today. You leave with a clear plan and a fixed setup price."],
  ["Build", build],
  ["Live and watched", live],
];

const GUARANTEE = {
  lead: "No lock-in.",
  text: "Month-to-month, no long-term contract. The design, code, content and domain are yours, and we hand over every login at launch. If you cancel, you keep your website.",
};

module.exports = [
  {
    path: "/offers/lead-command-center",
    slug: "lead-command-center",
    n: "01",
    name: "Lead Command Center",
    for: "For contractors & home-service businesses",
    price: "Part of the Lead System · $490/month + $1,490 setup",
    title: "Lead Command Center: Website + AI That Answers Every Lead in 60 Seconds | WebersLink",
    description: "A conversion website, an AI assistant on your site and WhatsApp, and estimates booked straight into your calendar. Built in-house by WebersLink for contractors and home-service businesses. Live in 2–3 weeks.",
    h1: "Sixty seconds. <em>That's your window to win the job.</em>",
    lead: "A website that converts, an AI assistant that replies on every channel, and a calendar that fills itself — built in-house and connected to the tools you already use.",
    card: { title: "Lead Command Center", blurb: "Website, AI assistant and booking, wired together so every enquiry is answered in 60 seconds." },
    cardLine: "Every enquiry caught, answered and booked.",
    cardPoints: ["AI replies on site and WhatsApp in under 60 seconds", "Estimates land straight in your calendar", "A website built around your services and areas"],
    pains: [
      ["Slow replies", "You're on the job when the form comes in. The homeowner has called someone else within minutes."],
      ["After-hours silence", "Evening and weekend enquiries wait until morning, and the booking is gone by then."],
      ["A site that looks fine and converts nothing", "Visitors scroll, can't find their service or area, and leave without asking."],
      ["Booking by phone tag", "Messages back and forth to find a time that works eat the day you're trying to work."],
    ],
    promise: { eyebrow: "The system", title: "Lead Command Center", line: "One system that catches every enquiry, answers it, and books the estimate." },
    mock: {
      title: "Lead Command Center",
      rows: [
        ["Website form", "Kitchen remodel enquiry", "Replied in 42s"],
        ["WhatsApp", "Asks for an estimate", "Booked Tue 10:00"],
        ["Website chat", "Service-area question", "Answered · lead saved"],
        ["Chat · after hours", "Emergency callout", "Handed to you"],
      ],
    },
    featuresTitle: "What's inside",
    features: [
      ["Conversion website", "Built around the services you sell and the areas you cover."],
      ["Service and area pages", "A page for each job you want more of, so visitors and Google find the right one."],
      ["AI assistant", "Trained on your services, prices and FAQs. Answers in seconds."],
      ["WhatsApp replies", "The same assistant on the channel your customers already use."],
      ["Calendar booking", "Estimates go straight into Google Calendar, Outlook, Cal.com or Calendly."],
      ["Smart hand-over", "When the assistant isn't sure, it passes the chat to you with the full conversation."],
      ["CRM and email connect", "Every lead lands, tagged, where you already track work."],
      ["Monthly tuning", "We review real conversations and improve the answers every month."],
    ],
    steps: STEPS(
      "We build the website, train the assistant on your services and FAQs, and connect your calendar, CRM, WhatsApp and email.",
      "We test it end to end and switch it on. Every month we review conversations, tune the assistant and fix what breaks."
    ),
    guarantee: GUARANTEE,
    faqs: [
      ["What exactly is the AI assistant?", "A chat assistant on your website, and optionally WhatsApp, trained on your services, prices and FAQs. It answers questions instantly, collects the visitor's details and books calls into your calendar. It hands over to you when it isn't sure."],
      ["Will it make things up?", "We write guardrails so it answers from your approved information, and we test it against the questions your customers really ask before it goes live."],
      ["How long does setup take?", "Most Lead Systems go live in 2–3 weeks. The biggest factor is how quickly we get your service details, photos and feedback. You get a dated plan up front."],
      ["Do I keep my website if I cancel?", "Yes. The design, code, content and domain are yours, and we hand over every login at launch."],
    ],
  },
  {
    path: "/offers/follow-up-engine",
    slug: "follow-up-engine",
    n: "02",
    name: "Follow-Up Engine",
    for: "For businesses that quote, then wait",
    price: "Included in the Lead System · $490/month + $1,490 setup",
    title: "Follow-Up Engine: Automatic Quote Follow-Up & Review Requests | WebersLink",
    description: "Automatic follow-up on every lead and quote, plus Google review requests after every job. Built in-house by WebersLink for contractors and service businesses. Included in the Lead System.",
    h1: "The quote went out. <em>Then nothing.</em>",
    lead: "Automatic follow-up on every lead and quote, and a review request after every job — so a maybe becomes a clear yes or no, and your Google rating keeps moving up.",
    card: { title: "Follow-Up Engine", blurb: "Automatic quote follow-up and review requests, in your voice, until the lead books or says no." },
    cardLine: "Chase every quote. Ask for every review.",
    cardPoints: ["Reminders on days 1, 3 and 7 until the lead books or says no", "Review requests linked to your Google page", "Stops the moment a lead replies"],
    pains: [
      ["Quotes nobody chases", "The estimate goes out and the next job starts. Nobody follows up."],
      ["A maybe that quietly becomes a no", "Without a nudge, a warm lead drifts away and never tells you."],
      ["Reviews left to memory", "You mean to ask. Then the week gets busy and you don't."],
      ["Leads that wait in an inbox", "Enquiries sit unanswered for hours, and the boring parts of follow-up fall on whoever has time."],
    ],
    promise: { eyebrow: "The system", title: "Follow-Up Engine", line: "Short, personal follow-ups that run themselves and stop when the lead responds." },
    mock: {
      title: "Follow-Up Engine",
      rows: [
        ["Quote sent", "Bathroom renovation", "Follow-up day 3 queued"],
        ["Lead replied", "Roof repair", "Sequence stopped"],
        ["Job completed", "Deck build", "Review request sent"],
        ["Enquiry", "Fence install", "Instant reply sent"],
      ],
    },
    featuresTitle: "What's inside",
    features: [
      ["Instant lead response", "A personalised email or text within seconds of every form submission."],
      ["Follow-up sequences", "Gentle reminders over days 1, 3 and 7 until the lead books or says no."],
      ["Quote chasers", "Automatic nudges after a quote is sent."],
      ["Review requests", "Sent after a job is completed, linking straight to your Google review page."],
      ["Appointment reminders", "By email, text or WhatsApp, to cut no-shows."],
      ["CRM sync", "Every lead lands in HubSpot, Pipedrive, Zoho, Airtable, Notion or Google Sheets with its source."],
      ["Weekly summary", "Leads, sources and bookings in your inbox every week."],
      ["You own it all", "Every account and every automation is yours."],
    ],
    steps: STEPS(
      "We write the messages in your voice and build the sequences on simple, reliable tools, connected to your CRM and calendar.",
      "We test every message, switch it on and watch it. New automations and fixes come as part of the monthly review."
    ),
    guarantee: GUARANTEE,
    faqs: [
      ["Do automated follow-ups feel spammy?", "Not when they're written well. We write short, personal messages in your voice and stop the sequence as soon as the lead replies or books."],
      ["Which CRM should I use?", "If you don't have one yet, we recommend one based on your team size and budget, often HubSpot's free CRM, Pipedrive or a simple Airtable base."],
      ["Can you automate WhatsApp messages?", "Yes, using the WhatsApp Business Platform with approved message templates."],
      ["What does it cost?", "Lead automation is included in the Lead System ($490/month plus a one-time $1,490 setup). Stand-alone automation projects are quoted after a short call."],
    ],
  },
  {
    path: "/offers/local-growth-engine",
    slug: "local-growth-engine",
    n: "03",
    name: "Local Growth Engine",
    for: "For businesses ready for more leads coming in",
    price: "Growth Engine · $990/month + $1,490 setup",
    title: "Local Growth Engine: Local SEO, Google Business Profile & Ads | WebersLink",
    description: "Local SEO, service-area pages, Google Business Profile management and Google & Meta ads, on top of the Lead System. Built in-house by WebersLink. Month-to-month, plain-English monthly reporting.",
    h1: "Get found by the people <em>ready to hire.</em>",
    lead: "Local SEO, Google Business Profile and ads aimed at the searches customers make when they want a job done now — landing on pages built to turn them into enquiries.",
    card: { title: "Local Growth Engine", blurb: "Local SEO, Google Business Profile and ads management on top of the Lead System." },
    cardLine: "More of the right searches, landing on pages that convert.",
    cardPoints: ["Local SEO and a page for every service and area", "Google Business Profile management", "Google and Meta ads management (ad spend separate)"],
    pains: [
      ["Invisible on the map", "Customers search \"near me\" and a competitor with a better profile gets the call."],
      ["One \"services\" page for everything", "A single combined page ranks worse than one focused page per service."],
      ["Traffic that doesn't turn into enquiries", "Ranking only matters if the page the visitor lands on gets them to ask."],
      ["SEO reports you can't read", "Charts and jargon, and no clear answer on what happened or what's next."],
    ],
    promise: { eyebrow: "The system", title: "Local Growth Engine", line: "Everything in the Lead System, plus more of the right searches coming in." },
    mock: {
      title: "Local Growth Engine",
      rows: [
        ["Google Business Profile", "Profile updated", "Posted this week"],
        ["Service page", "Emergency plumber, per city", "Published"],
        ["Ads", "Google and Meta campaigns", "Reviewed monthly"],
        ["Monthly report", "Rankings, traffic, enquiries", "Plain English"],
      ],
    },
    featuresTitle: "What's inside",
    features: [
      ["Everything in the Lead System", "Website, AI assistant, booking, follow-up and review requests."],
      ["Local SEO", "Location and service-area pages, consistent listings and a review strategy."],
      ["Google Business Profile", "Optimised and managed, because it often drives more calls than your website."],
      ["Technical SEO", "Site speed, Core Web Vitals, crawlability, structured data and sitemaps."],
      ["Service pages", "One focused page per service, which outperforms a combined page."],
      ["Helpful guides", "Content that answers the questions customers ask before they buy."],
      ["Ads management", "Google and Meta ads, with ad spend billed separately."],
      ["Monthly strategy call", "Rankings, traffic, enquiries and what we're doing next, in plain English."],
    ],
    steps: STEPS(
      "We fix the technical basics, set up your service and area pages, and optimise your Google Business Profile and listings.",
      "We publish, run and review it monthly with a strategy call. Technical fixes can show results in weeks; competitive terms usually take 3–6 months."
    ),
    guarantee: {
      lead: "No guarantees we can't keep.",
      text: "No honest team can promise a #1 ranking. We stand behind the work and show you realistic targets on your first call. Plans are month-to-month, and you can cancel anytime.",
    },
    faqs: [
      ["Can you guarantee first-page rankings?", "No. Google's results depend on competition and many factors outside anyone's control. We commit to the work: technical fixes, content and links, with transparent monthly reporting."],
      ["How long does local SEO take?", "Technical fixes can show results in weeks. Ranking for competitive terms usually takes 3–6 months of consistent work, longer in crowded markets."],
      ["Do you work with businesses in the US and UK?", "Yes. We optimise Google Business Profiles, build location and service-area pages and manage listings across the US, UK and Europe."],
      ["Is there a minimum contract?", "No. Plans are month-to-month and you can cancel anytime."],
    ],
  },
];
