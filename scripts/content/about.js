// The About page (/about). Facts only: no invented team members, numbers or offices.
module.exports = {
  path: "/about",
  type: "hub",
  title: "About WebersLink: Your In-house Tech Team | UK, USA & Lahore",
  description: "WebersLink is an in-house tech team building automation, AI voice and chat agents, websites, software and CMS sites for businesses in the United Kingdom, the United States and beyond, with engineering in Lahore, Pakistan.",
  kicker: "About us",
  h1: "One team that builds <em>and stays.</em>",
  lead: "WebersLink is an in-house tech team for growing businesses. We design, build and look after the automation, AI agents, websites, software and CMS sites our clients run on, working with businesses in the United Kingdom and the United States from our engineering base in Lahore, Pakistan.",
  card: { title: "About WebersLink" },
  heroCta: `<div class="hero-cta"><a href="/#book" class="btn btn-light" data-track="Book CTA" data-loc="about-hero">Book a free call →</a><a href="/work/" class="btn btn-ghost">See our work</a></div>`,
  body: `
<h2>Who we are</h2>
<p>WebersLink started with a simple observation: most small and growing businesses don't need a big agency or a room full of freelancers. They need one dependable team that understands how their business works, builds the right tools, and is still there when something needs changing next month.</p>
<p>That is what we are. The same engineers who plan your project build it, connect it to the tools you already use, and keep improving it afterwards. You always know who to ask, and nothing gets lost in a hand-off.</p>

<h2>What we do</h2>
<p>We focus on five things, and we explain each of them in plain words:</p>
<ul>
  <li><a href="/services/automation"><strong>Automation</strong></a>: software that does repetitive work for you, such as reading emails and forms, updating your CRM, sending follow-ups and building reports.</li>
  <li><a href="/services/ai-voice-agents"><strong>AI voice and chat agents</strong></a>: an AI receptionist that answers calls, website chat and WhatsApp, answers questions and books appointments.</li>
  <li><a href="/services/in-house-tech-team"><strong>In-house tech team</strong></a>: your own engineering team, month to month, without recruiting.</li>
  <li><a href="/services/web-design"><strong>Web and software development</strong></a>: fast websites, web apps, portals, dashboards and online stores.</li>
  <li><a href="/services/cms-development"><strong>CMS design and development</strong></a>: websites your team can update without calling a developer, on WordPress or a headless CMS.</li>
</ul>

<h2>Where we work</h2>
<div class="about-locs">
  <div class="about-loc"><span class="about-flag" aria-hidden="true">🇬🇧</span><h3>United Kingdom</h3><p>We work with businesses across the UK, with calls scheduled in UK hours and GDPR-ready builds as standard.</p></div>
  <div class="about-loc"><span class="about-flag" aria-hidden="true">🇺🇸</span><h3>United States</h3><p>We work with businesses across the US, with calls arranged for Eastern, Central, Mountain and Pacific time.</p></div>
  <div class="about-loc"><span class="about-flag" aria-hidden="true">🇵🇰</span><h3>Lahore, Pakistan</h3><p>Our engineering team's home base. Being several hours ahead means work often moves forward while our UK and US clients sleep.</p></div>
</div>
<p>All of our work is done remotely. Progress lives on a shared board you can check at any time, we reply to messages within 24 hours, and we hold calls at times that suit you.</p>

<h2>What we've built</h2>
<p>We don't only build for clients; we build and run our own products, and we use the same skills on every client project:</p>
<ul>
  <li><a href="/work/outreach-engine"><strong>Outreach Engine</strong></a>: a cold-email platform that sends from several mailboxes with warm-up, stops when someone replies, tracks link clicks and reports everything on one dashboard.</li>
  <li><a href="/work/booking-platform"><strong>Online Booking Platform</strong></a>: booking pages, a staff dashboard, reminders, client records, team logins and Stripe deposits for appointment businesses.</li>
  <li><a href="/work/ai-assistant"><strong>WebersLink AI Assistant</strong></a>: the AI chat agent on this website, trained on our services and prices.</li>
  <li><a href="/plugins/"><strong>Free WordPress plugins</strong></a>: forms, SEO, security, email delivery, popups, cookie consent, image optimisation and redirects, free to download.</li>
</ul>
<p>Alongside our own products, we have shipped more than 50 websites for builders, home-service companies, retailers, manufacturers and agencies.</p>

<h2>How we work</h2>
<ul>
  <li><strong>Plain English.</strong> No jargon. If we can't explain it simply, we haven't understood it yet.</li>
  <li><strong>Fixed prices.</strong> You get one clear price before we start, and monthly plans are month to month.</li>
  <li><strong>You own everything.</strong> Code, accounts, content and domains are yours from day one.</li>
  <li><strong>Built to last.</strong> We test what we build, monitor it after launch and fix what breaks.</li>
  <li><strong>Privacy by default.</strong> Forms collect only what's needed, and EU and UK builds include consent and clear privacy notices.</li>
</ul>

<h2>Get in touch</h2>
<p>The fastest way to start is a <a href="/#book">free 20-minute call</a>: tell us what's slowing your business down and we'll tell you what we'd build and what it costs. You can also email <a href="mailto:hassan@weberslink.org">hassan@weberslink.org</a> or <a href="https://wa.me/message/2MT2JFO63P3LA1" target="_blank" rel="noopener">message us on WhatsApp</a>.</p>
`,
  faqs: [
    ["Where is WebersLink based?", "We work with clients in the United Kingdom and the United States, and our engineering team is based in Lahore, Pakistan. All of our work is done remotely, with calls scheduled in your time zone."],
    ["Do you work with businesses outside the UK and USA?", "Yes. Most of our clients are in the UK and the US, and we also work with businesses in Europe and elsewhere."],
    ["How do we communicate during a project?", "Through a shared progress board, written updates and calls when they're useful. We reply to messages within 24 hours, usually much sooner."],
    ["Who owns the work you build?", "You do. We hand over every login, and the code, content and domains belong to you."],
  ],
};
