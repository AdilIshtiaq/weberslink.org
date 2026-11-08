// More guides (added November 2026), part 2. Facts only, no invented statistics.
const DATE = "2026-11-09";

module.exports = [
  // Primary: "how to choose a CMS" · Secondary: "best CMS for small business", "CMS checklist"
  {
    path: "/blog/how-to-choose-a-cms",
    type: "guide",
    date: DATE,
    readMins: 8,
    title: "How to Choose a CMS for Your Business: A Practical Checklist | WebersLink",
    description: "A step-by-step checklist for choosing the right content management system: who edits, what you publish, features, SEO, security, cost and how to avoid getting locked in.",
    kicker: "Guide · CMS",
    h1: "How to choose a CMS for your business: a practical checklist",
    lead: "The right CMS makes your website easy to keep fresh. The wrong one turns every small change into a support ticket. Use this checklist to choose with confidence.",
    card: { title: "How to Choose a CMS", blurb: "A practical checklist: editors, features, SEO, security, cost and lock-in." },
    crumbs: [["Guides", "/blog/"]],
    related: ["/services/cms-development", "/blog/headless-cms-vs-wordpress", "/blog/wordpress-vs-custom-website", "/services/website-redesign"],
    body: `
<h2>Start with people, not platforms</h2>
<p>Most CMS decisions go wrong because they start with a platform someone likes, instead of the people who'll use it every week. Before comparing WordPress, Webflow, Shopify or a headless CMS, answer the questions below. The right platform usually becomes obvious.</p>

<h2>1. Who will edit the website?</h2>
<p>List everyone who will change content and how comfortable they are with technology. A marketing team that wants to build landing pages needs a visual editor with flexible blocks. A single owner who updates prices twice a year needs something simple and hard to break. Developers editing in code have very different needs from non-technical staff.</p>
<ul>
  <li>How many editors, and do some need limited permissions?</li>
  <li>Do drafts need approval before they go live?</li>
  <li>Will people edit on a phone?</li>
</ul>

<h2>2. What will you publish?</h2>
<p>Write down every type of content: service pages, blog posts, case studies, team profiles, products, events, job listings, locations. Structured content (where each item has the same fields, like a team member's name, role and photo) is easier to manage in a CMS that supports custom content types. If you sell online, decide early whether the store lives in the same system.</p>

<h2>3. Which features do you need now, and in two years?</h2>
<p>Make two lists. "Now" might be forms, a blog and SEO settings. "Later" might be bookings, memberships, multiple languages or an online store. Choose a CMS that handles "now" simply and won't block "later". Check whether each feature is built in, needs a plugin or extension, or would need custom development.</p>

<h2>4. SEO and performance</h2>
<p>Your CMS should let you control page titles, meta descriptions, URLs, headings, image alt text, redirects and structured data, and produce a sitemap. It should also make it easy to build fast pages: compressed images, minimal scripts and good hosting. Slow, clumsy sites lose both visitors and rankings.</p>

<h2>5. Security and maintenance</h2>
<ul>
  <li>Who installs updates, and how often?</li>
  <li>Are backups automatic, and have you tested restoring one?</li>
  <li>Does it support two-factor login for editors?</li>
  <li>Is there a log of who changed what?</li>
</ul>
<p>Hosted platforms handle much of this for you. Self-hosted systems like WordPress give you more freedom but need someone responsible for updates and backups.</p>

<h2>6. Total cost of ownership</h2>
<p>Look beyond the build price. Add hosting, platform subscriptions, premium plugins or apps, maintenance time and the cost of future changes. A cheap build on a platform that needs a developer for every change can cost more over three years than a well-built site your team can update themselves.</p>

<h2>7. Avoid lock-in</h2>
<p>Ask how you would leave. Can you export all your content? Do you own the domain, hosting account and code? Are you relying on a proprietary page builder that only one agency understands? Owning your accounts and choosing widely used tools keeps your options open.</p>

<h2>Quick guide to common choices</h2>
<table>
<thead><tr><th>Platform</th><th>Good fit when…</th></tr></thead>
<tbody>
<tr><td><strong>WordPress</strong></td><td>You want flexibility, lots of ready-made features and a big pool of people who can help.</td></tr>
<tr><td><strong>Shopify</strong></td><td>Selling products is the main job of the website.</td></tr>
<tr><td><strong>Webflow</strong></td><td>Design-led marketing sites edited by a small, visual team.</td></tr>
<tr><td><strong>Headless CMS</strong></td><td>You need top performance, a custom front end or content shared with an app.</td></tr>
</tbody>
</table>

<h2>Your CMS checklist</h2>
<ol>
  <li>Editors and permissions listed</li>
  <li>Content types written down</li>
  <li>"Now" and "later" features listed</li>
  <li>SEO controls confirmed</li>
  <li>Updates, backups and two-factor login covered</li>
  <li>Three-year cost estimated</li>
  <li>Exit plan: content export and account ownership</li>
</ol>
<p>Want a second opinion? Our <a href="/services/cms-development">CMS design and development</a> team builds on WordPress and headless platforms and will recommend the simplest option that fits. For a deeper comparison, read <a href="/blog/headless-cms-vs-wordpress">headless CMS vs WordPress</a>.</p>
`,
    faqs: [
      ["What is the best CMS for a small business?", "For most small businesses, WordPress is a strong default: flexible, affordable and widely supported. Shopify is better if selling products is the main goal."],
      ["How long does it take to move to a new CMS?", "A small site can move in a couple of weeks. Larger sites with lots of content, custom features and SEO redirects take longer, so plan the migration carefully."],
      ["Do I need a developer to use a CMS?", "Not for everyday edits, if the site is built well. You'll want a developer for new features, design changes and maintenance."],
    ],
  },

  // Primary: "hire a developer vs agency" · Secondary: "dedicated development team", "freelancer vs agency vs in-house"
  {
    path: "/blog/developer-vs-agency-vs-dedicated-team",
    type: "guide",
    date: DATE,
    readMins: 8,
    title: "Hire a Developer, Use an Agency or a Dedicated Team? | WebersLink",
    description: "Compare hiring an in-house developer, using freelancers, working with an agency and using a dedicated tech team: cost, speed, skills, risk and which fits your business.",
    kicker: "Guide · In-house tech team",
    h1: "Hire a developer, use an agency, or get a dedicated team?",
    lead: "When your business needs ongoing tech work, there are four common ways to get it done. Each has real strengths and real risks. Here's an honest comparison to help you choose.",
    card: { title: "Developer vs Agency vs Dedicated Team", blurb: "Cost, speed, skills and risk of four ways to get tech work done." },
    crumbs: [["Guides", "/blog/"]],
    related: ["/services/in-house-tech-team", "/blog/zapier-vs-custom-automation", "/services/web-design", "/work/booking-platform"],
    body: `
<h2>The four options</h2>
<ol>
  <li><strong>Hire your own developer</strong> as an employee.</li>
  <li><strong>Use freelancers</strong> for individual projects.</li>
  <li><strong>Work with an agency</strong> on defined projects.</li>
  <li><strong>Use a dedicated team</strong>: an outside team that works on your business continuously, month to month.</li>
</ol>
<p>None is right for everyone. The best choice depends on how much work you have, how varied it is and how much management time you can give it.</p>

<h2>Option 1: Hire your own developer</h2>
<p><strong>Pros:</strong> they're fully yours, learn your business deeply and are available every day. <strong>Cons:</strong> recruiting takes time, salaries and benefits are a fixed cost even in quiet months, and one person rarely covers everything: design, front end, back end, AI, automation, SEO and hosting are different skills. If they leave, knowledge can leave with them.</p>
<p><strong>Best when:</strong> you have a steady, full-time workload in one main skill area and someone who can manage technical staff.</p>

<h2>Option 2: Freelancers</h2>
<p><strong>Pros:</strong> flexible, often affordable, and you can find specialists for specific jobs. <strong>Cons:</strong> availability varies, quality is hard to judge up front, and with several freelancers you become the project manager connecting their work. When something breaks months later, the person who built it may have moved on.</p>
<p><strong>Best when:</strong> you have small, well-defined, one-off tasks and the time to manage them.</p>

<h2>Option 3: An agency</h2>
<p><strong>Pros:</strong> a team with several skills, a defined process and accountability for a project. <strong>Cons:</strong> agencies usually work project by project, so after launch you may be handed over to "support" or quoted again for every change. The people who build your project may not be the ones you speak to later.</p>
<p><strong>Best when:</strong> you need a clearly scoped project, like a new website, with a fixed deadline and budget.</p>

<h2>Option 4: A dedicated team</h2>
<p><strong>Pros:</strong> the breadth of an agency with the continuity of an employee. The same people work on your business every month, learn your systems and handle design, development, AI and automation together. You avoid recruiting and can scale up or down. <strong>Cons:</strong> you're relying on an outside company, so choose one with clear communication, documentation and ownership terms.</p>
<p><strong>Best when:</strong> you have ongoing, varied tech work (a website, automations, an AI agent, internal tools) and don't want to build a tech department.</p>

<h2>Side-by-side</h2>
<table>
<thead><tr><th></th><th>Own developer</th><th>Freelancers</th><th>Agency</th><th>Dedicated team</th></tr></thead>
<tbody>
<tr><td><strong>Start time</strong></td><td>Slow (recruiting)</td><td>Fast</td><td>Medium</td><td>Fast</td></tr>
<tr><td><strong>Range of skills</strong></td><td>Narrow</td><td>Depends who you hire</td><td>Broad</td><td>Broad</td></tr>
<tr><td><strong>Continuity</strong></td><td>High while they stay</td><td>Low</td><td>Project-based</td><td>High</td></tr>
<tr><td><strong>Management needed</strong></td><td>High</td><td>High</td><td>Low</td><td>Low</td></tr>
<tr><td><strong>Cost shape</strong></td><td>Fixed salary</td><td>Per task</td><td>Per project</td><td>Monthly, adjustable</td></tr>
</tbody>
</table>

<h2>Questions to ask any outside team</h2>
<ul>
  <li>Who will actually do the work, and will it be the same people each month?</li>
  <li>How do we request work and track progress?</li>
  <li>Who owns the code, accounts and domains?</li>
  <li>How do you document what you build?</li>
  <li>What happens if we want to stop or move to someone else?</li>
  <li>How do you handle time zones and response times?</li>
</ul>

<h2>A note on time zones</h2>
<p>Working with a team in another time zone can be an advantage: work moves forward while you sleep, and you wake up to progress. It works well when there's a shared board for requests, regular written updates and calls scheduled at times that suit you.</p>

<h2>Making the decision</h2>
<p>If your work is steady and in one skill, hire. If it's small and occasional, use freelancers. If it's one big project, use an agency. If it's ongoing and varied, a dedicated team is often the most practical and cost-effective choice. Learn how our <a href="/services/in-house-tech-team">in-house tech team</a> works, or see products our team has built, like the <a href="/work/booking-platform">Online Booking Platform</a>.</p>
`,
    faqs: [
      ["Is a dedicated team cheaper than hiring?", "Often, for small and growing businesses, because you avoid recruiting costs and pay for the amount of work you have rather than a full-time salary. It depends on your workload."],
      ["Can we start with a small amount of work?", "With most dedicated teams, yes. Starting with a few days a month for one project is a good way to see how it works."],
      ["Will I own what the team builds?", "You should. Make sure your agreement says the code, content, accounts and domains belong to you."],
    ],
  },

  // Primary: "cold email deliverability" · Secondary: "email warm-up", "avoid spam folder cold email"
  {
    path: "/blog/cold-email-deliverability",
    type: "guide",
    date: DATE,
    readMins: 9,
    title: "Cold Email Deliverability: How to Stay Out of Spam | WebersLink",
    description: "A practical guide to cold email deliverability: domain setup (SPF, DKIM, DMARC), warm-up, sending limits, list cleaning, bounces, replies and writing emails that reach the inbox.",
    kicker: "Guide · Automation",
    h1: "Cold email deliverability: how to stay out of the spam folder",
    lead: "The best cold email in the world is worthless if it lands in spam. Here's what decides whether your emails reach the inbox, and the habits that protect your domain, from people who built their own outreach system.",
    card: { title: "Cold Email Deliverability", blurb: "Domain setup, warm-up, limits, bounces and writing for the inbox." },
    crumbs: [["Guides", "/blog/"]],
    related: ["/work/outreach-engine", "/services/automation", "/blog/business-automation-examples", "/blog/speed-to-lead"],
    body: `
<h2>What "deliverability" means</h2>
<p>Deliverability is whether your email reaches the inbox, lands in spam, or doesn't arrive at all. Email providers decide this using your domain's reputation, technical authentication, how recipients react to your emails and the content itself. Cold email is judged especially strictly, because recipients didn't ask to hear from you.</p>
<p>Before anything else: follow the law where your recipients are. Rules differ between countries, for example the CAN-SPAM Act in the US and GDPR and PECR in the UK and EU. Always identify yourself, give an easy way to opt out and honour it promptly.</p>

<h2>1. Set up your domain properly</h2>
<p>Three DNS records tell email providers that your emails are really from you:</p>
<ul>
  <li><strong>SPF</strong> lists the servers allowed to send email for your domain.</li>
  <li><strong>DKIM</strong> adds a digital signature that proves the email wasn't changed on the way.</li>
  <li><strong>DMARC</strong> tells providers what to do with emails that fail those checks, and sends you reports.</li>
</ul>
<p>Many teams send cold email from a separate domain similar to their main one, so any reputation problems don't affect everyday company email. Give that domain a real website and a real person behind each mailbox.</p>

<h2>2. Warm up new mailboxes</h2>
<p>A brand-new mailbox that suddenly sends hundreds of emails looks suspicious. Start small and increase gradually over several weeks, for example a handful of emails a day in the first week, rising week by week. Our own system uses a stepped warm-up per mailbox and never lets a single mailbox exceed a daily cap.</p>

<h2>3. Send like a person, not a machine</h2>
<ul>
  <li>Space emails out with natural, varied gaps of a few minutes, not bursts.</li>
  <li>Keep daily volume per mailbox modest; spread larger campaigns across several mailboxes.</li>
  <li>Send during sensible hours for the recipient's time zone.</li>
  <li>Send follow-ups as replies in the same thread, from the same mailbox.</li>
</ul>

<h2>4. Clean your list before you send</h2>
<p>Bounces damage your reputation quickly. Before sending, remove obviously invalid addresses, duplicates and role addresses that rarely belong to a decision-maker, and check that each domain can receive email. Keep a permanent do-not-contact list and check it before every send.</p>

<h2>5. Watch bounces and pause early</h2>
<p>Track your bounce rate per mailbox. If it rises above a few percent, stop and investigate: your list may be outdated or your data source poor. Distinguish between permanent bounces (address doesn't exist: never email again) and temporary ones (mailbox full or server busy: try later). Pausing a mailbox automatically when bounces spike is one of the best protections you can build.</p>

<h2>6. Stop the moment someone replies</h2>
<p>Nothing annoys people more than a "just following up" email after they've already replied, or after they asked you to stop. Read replies, opt-outs and bounces before every send, and stop the sequence for that person (and ideally their colleagues) immediately. Count only what the person actually wrote, not the quoted history or your own signature, when deciding whether someone opted out.</p>

<h2>7. Write emails that look personal</h2>
<ul>
  <li>Keep it short, plain and relevant to the recipient's business.</li>
  <li>Personalise the first line with something genuinely specific, not just their first name.</li>
  <li>Avoid heavy images, attachments, lots of links and spammy phrases.</li>
  <li>Make one clear, low-effort ask, like a quick reply.</li>
  <li>Test subject lines one change at a time, and give each version enough sends before judging.</li>
</ul>

<h2>8. Be careful with tracking</h2>
<p>Open tracking relies on hidden images and is increasingly unreliable. Link-click tracking is more useful, but be aware that email security scanners often click links automatically. Filter out clicks that happen within seconds of sending or come from known scanners, or you'll chase false signals.</p>

<h2>9. Build in safety</h2>
<p>If your sending system crashes mid-send, it should never email the same person twice. A good system re-checks each lead right before sending and holds anything uncertain for a human to check. These details sound small, but they're the difference between a trusted sender and a blocked one.</p>

<h2>A quick deliverability checklist</h2>
<ol>
  <li>SPF, DKIM and DMARC set up</li>
  <li>Separate sending domain with a real website</li>
  <li>Gradual warm-up and daily caps per mailbox</li>
  <li>Clean list and do-not-contact list</li>
  <li>Automatic pause on high bounces</li>
  <li>Sequences stop on reply or opt-out</li>
  <li>Short, personal, plain emails</li>
</ol>
<p>We built these rules into our own <a href="/work/outreach-engine">Outreach Engine</a>. If you'd like a system like it for your business, see our <a href="/services/automation">automation service</a>.</p>
`,
    faqs: [
      ["How many cold emails can I send per day?", "Start low with new mailboxes and increase gradually. Spreading volume across several warmed-up mailboxes at a natural pace is safer than sending a lot from one."],
      ["Do I need a separate domain for cold email?", "It's a common and sensible practice, so any reputation issues don't affect your main company email. Set it up with a real website and proper authentication."],
      ["Why do my emails go to spam?", "The usual causes are missing SPF, DKIM or DMARC records, sending too much too soon, high bounce rates, and emails that look like marketing blasts rather than personal messages."],
    ],
  },

  // Primary: "online booking system for small business" · Secondary: "appointment booking software", "how to choose booking software"
  {
    path: "/blog/online-booking-system-guide",
    type: "guide",
    date: DATE,
    readMins: 8,
    title: "How to Choose an Online Booking System for Your Business | WebersLink",
    description: "What to look for in online booking software for salons, clinics and service businesses: availability rules, staff, reminders, deposits, no-shows, integrations and pricing.",
    kicker: "Guide · Software",
    h1: "How to choose an online booking system for your business",
    lead: "Online booking can end phone tag, fill gaps in your diary and cut no-shows. But booking tools vary a lot. Here are the features that matter, the questions to ask, and the mistakes to avoid.",
    card: { title: "Choosing an Online Booking System", blurb: "Features that matter: availability, staff, reminders, deposits and more." },
    crumbs: [["Guides", "/blog/"]],
    related: ["/work/booking-platform", "/services/web-design", "/services/ai-voice-agents", "/blog/speed-to-lead"],
    body: `
<h2>Why online booking matters</h2>
<p>Customers increasingly expect to book the way they shop: on their phone, at any hour, in a couple of taps. If booking means calling during office hours and waiting for a call back, some will book with a competitor instead. Online booking captures those customers, saves your team time on the phone and, with reminders, reduces no-shows.</p>

<h2>Must-have features</h2>
<h3>Accurate availability</h3>
<p>The system should only ever show times you can genuinely do: your opening hours, each person's working days and breaks, the length of each service, gaps between appointments, and minimum notice. Most importantly, it must never allow two people to book the same slot.</p>
<h3>Staff and services</h3>
<p>If you have a team, customers should be able to choose a specific person or "anyone available". Each team member needs their own hours and the services they offer.</p>
<h3>Confirmations and reminders</h3>
<p>Customers should get an instant confirmation, ideally with a calendar file, and a reminder before the appointment. Reminders are one of the simplest ways to reduce no-shows.</p>
<h3>Self-service changes</h3>
<p>Letting customers move or cancel online, up to a cut-off you choose, saves calls and frees slots for someone else.</p>
<h3>A dashboard for your team</h3>
<p>You need a clear view of each day, the ability to add phone and walk-in bookings, mark appointments as done or no-show, and see each customer's history and notes.</p>

<h2>Features that make a real difference</h2>
<ul>
  <li><strong>Deposits or card details</strong> for services where no-shows are costly.</li>
  <li><strong>Booking questions</strong>, so you get the information you need up front (for example, the issue, the address or the car model).</li>
  <li><strong>Calendar sync</strong> with Google, Outlook or Apple, so appointments appear where your team already looks.</li>
  <li><strong>Embedding on your own website</strong>, so customers book without leaving your site.</li>
  <li><strong>Reports</strong>: busiest times, most booked services, no-show rate, new versus returning customers.</li>
  <li><strong>Client records</strong> with notes, tags and the option to block repeat no-shows from booking online.</li>
</ul>

<h2>Questions to ask before you choose</h2>
<ol>
  <li>How is pricing calculated: per staff member, per booking, or a flat fee?</li>
  <li>Which features are only on higher plans?</li>
  <li>Does it handle time zones correctly for online or travelling customers?</li>
  <li>Can I export my customer and booking data if I leave?</li>
  <li>Does the booking page match my brand, and does it work well on phones?</li>
  <li>How are reminders sent (email, SMS) and does SMS cost extra?</li>
  <li>Where is customer data stored, and is it privacy-compliant for my customers' countries?</li>
</ol>

<h2>Common mistakes</h2>
<ul>
  <li><strong>Showing times you can't actually do.</strong> Set up breaks, buffers and notice periods properly before going live.</li>
  <li><strong>Making customers create an account.</strong> Every extra step loses bookings. Ask only for what you need.</li>
  <li><strong>Hiding the booking link.</strong> Put it on your website's main pages, your Google Business Profile and your social profiles.</li>
  <li><strong>Forgetting the phone.</strong> Keep a way to add phone bookings so your diary is the single source of truth.</li>
</ul>

<h2>Off-the-shelf tool or custom booking system?</h2>
<p>For most businesses, a good off-the-shelf booking tool is the right start. A custom booking system makes sense when your rules are unusual (complex resources, multi-step services, special pricing), when you want booking fully built into your own website or app, or when per-staff fees become expensive as you grow.</p>
<p>We've built a complete booking product ourselves: customer booking pages, a staff dashboard, reminders, client records, reports, team logins and Stripe deposits. Read about the <a href="/work/booking-platform">Online Booking Platform</a> we built, or talk to us about <a href="/services/web-design">web and software development</a>.</p>

<h2>Pair booking with an AI agent</h2>
<p>Online booking works even better with an AI agent that answers questions on your website, WhatsApp or phone and books straight into the same calendar. Customers who'd rather talk still get booked instantly, at any hour. Learn more about <a href="/services/ai-voice-agents">AI voice and chat agents</a>.</p>
`,
    faqs: [
      ["Will online booking replace my phone bookings?", "Usually not entirely. Many customers will book online, but you'll still take some calls, so choose a system where your team can add phone bookings to the same diary."],
      ["How do I reduce no-shows?", "Send confirmations and reminders, let customers reschedule easily online, and consider deposits for longer or high-value appointments."],
      ["Can online booking work on my existing website?", "Yes. Most booking tools give you a link and an embed code you can add to any website."],
    ],
  },
];
