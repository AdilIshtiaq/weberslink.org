// The Clipper product page (/clips). Honest about the stage: the tool is in development.
// When the app is live, set `appUrl` (e.g. "https://clips.weberslink.org"): the header button and this
// page then link straight to the app.
module.exports = {
  appUrl: "",
  page: {
    path: "/clips",
    type: "hub",
    title: "WebersLink Clipper: AI That Finds Viral Moments in Videos & Streams",
    description: "WebersLink Clipper finds the most viral moments in long videos and live streams and turns them into vertical clips with captions, for streamers, agencies and official clipping programs. In development: request early access.",
    kicker: "Clipper · In development",
    h1: "Long streams in. <em>Viral clips out.</em>",
    lead: "WebersLink Clipper watches long videos and live streams, finds the moments people react to most, and turns them into vertical clips with captions, ready for TikTok, YouTube Shorts and Instagram Reels. It's in development now, and we're opening early access.",
    card: { title: "Clipper" },
    body: `
<h2>What it does</h2>
<p>Clipping a three-hour stream by hand means watching all of it, noting timestamps, cutting, cropping to vertical and writing captions. Clipper does the watching and the first cut for you, so you spend your time picking and posting the best clips.</p>
<ol>
  <li><strong>Add a video</strong> you have the rights to, or (later) a live stream.</li>
  <li><strong>It listens and reads</strong>: speech is transcribed, and loud reactions and chat spikes are detected.</li>
  <li><strong>AI scores every moment</strong> for funny, shocking, emotional, quotable and hype.</li>
  <li><strong>The best moments are cut</strong> into 15 to 60 second clips with clean start and end points.</li>
  <li><strong>Clips are formatted for short video</strong>: vertical 9:16, face and gameplay in frame, bold captions and a hook title.</li>
  <li><strong>You review and post</strong> from a dashboard.</li>
</ol>

<h2>Live clipping</h2>
<p>For big moments, such as a major game launch, timing is everything. Live mode is designed to follow a stream as it happens and deliver ranked clips within minutes of each moment, so you can post while the moment is still trending.</p>

<h2>Who it's for</h2>
<ul>
  <li><strong>Streamers and creators</strong> who want clips of their own streams without hiring an editor.</li>
  <li><strong>Agencies and editors</strong> managing several creators.</li>
  <li><strong>Clippers in official programs</strong>, who are paid by streamers to spread their clips.</li>
</ul>

<h2>Built to be used legally</h2>
<p>Clipper is for content you own or have permission to use, for example through a streamer's official clipping program. It does not include features designed to dodge copyright detection. Posting other people's content without permission risks strikes and bans, and we don't build tools for that.</p>

<h2>Where it's at</h2>
<p>Clipper is being built in stages by our team. The processing pipeline is in place; clip detection and vertical formatting come next, followed by live clipping and a full dashboard. Early-access users help shape it and get it first.</p>

<h2>Get early access</h2>
<p>Want to try it on your own streams or your clipping program? <a href="/#book">Book a free call</a>, email <a href="mailto:hassan@weberslink.org?subject=Clipper%20early%20access">hassan@weberslink.org</a> or <a href="https://wa.me/message/2MT2JFO63P3LA1" target="_blank" rel="noopener">message us on WhatsApp</a> and tell us what you'd clip.</p>
`,
    faqs: [
      ["Can I use Clipper on any streamer's videos?", "Only on videos you own or have permission to use, such as through a streamer's official clipping program. That's what keeps your accounts safe."],
      ["Which platforms will it support?", "Uploaded video files first. Live streams from platforms such as YouTube and Kick are planned, where the creator or platform allows it."],
      ["Will it work for gaming streams?", "Yes. Gaming streams are a main focus: reactions, chat spikes and in-game moments all feed into how clips are chosen."],
      ["When can I use it?", "It's in development now. Request early access and we'll let you know as soon as you can try it."],
    ],
  },
};
