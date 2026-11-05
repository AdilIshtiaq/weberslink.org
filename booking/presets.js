/* Starting points for a new business (the owner edits everything afterwards in their dashboard). */
const days = (...d) => d;
module.exports = {
  salon: {
    tag: "Hair & beauty", who: "stylist", needAddress: false, accent: "#b0457a",
    policy: "Free cancellation up to 24 hours before. Late cancellations may be charged 50%.",
    services: [
      { id: "s1", name: "Women's cut & style", mins: 60, price: 65, desc: "Consultation, wash, cut and blow-dry." },
      { id: "s2", name: "Men's cut", mins: 30, price: 35, desc: "Classic or fade, with a hot towel finish." },
      { id: "s3", name: "Full colour", mins: 120, price: 140, desc: "Root-to-tip colour, toner and style." },
    ],
    staff: [{ id: "p1", name: "Your name", role: "Stylist", services: ["s1", "s2", "s3"], days: days(1, 2, 3, 4, 5, 6) }],
    hours: { 0: null, 1: ["09:00", "18:00"], 2: ["09:00", "18:00"], 3: ["09:00", "18:00"], 4: ["09:00", "20:00"], 5: ["09:00", "18:00"], 6: ["09:00", "16:00"] },
    buffer: 10, notice: 120,
  },
  clinic: {
    tag: "Clinic", who: "practitioner", needAddress: false, accent: "#1f7a8c",
    policy: "Please arrive 10 minutes early. Cancel at least 24 hours ahead so we can offer the time to someone else.",
    services: [
      { id: "s1", name: "Consultation", mins: 30, price: 60, desc: "First visit and assessment." },
      { id: "s2", name: "Follow-up", mins: 20, price: 40, desc: "Review and next steps." },
    ],
    staff: [{ id: "p1", name: "Your name", role: "Practitioner", services: ["s1", "s2"], days: days(1, 2, 3, 4, 5) }],
    hours: { 0: null, 1: ["08:00", "17:00"], 2: ["08:00", "17:00"], 3: ["08:00", "17:00"], 4: ["08:00", "17:00"], 5: ["08:00", "15:00"], 6: null },
    buffer: 10, notice: 240,
  },
  home: {
    tag: "Home services", who: "technician", needAddress: true, accent: "#2f6fdb",
    policy: "Arrival window is 30 minutes either side of your time. We'll call when the technician is on the way.",
    services: [
      { id: "s1", name: "Free estimate visit", mins: 60, price: 0, desc: "We look at the job and give a written quote." },
      { id: "s2", name: "Repair visit", mins: 90, price: 150, desc: "Most repairs done on the first visit." },
    ],
    staff: [{ id: "p1", name: "Your name", role: "Technician", services: ["s1", "s2"], days: days(1, 2, 3, 4, 5) }],
    hours: { 0: null, 1: ["08:00", "18:00"], 2: ["08:00", "18:00"], 3: ["08:00", "18:00"], 4: ["08:00", "18:00"], 5: ["08:00", "18:00"], 6: null },
    buffer: 30, notice: 180,
  },
  other: {
    tag: "", who: "team member", needAddress: false, accent: "#7a4fe0", policy: "Please cancel at least 24 hours ahead if you can't make it.",
    services: [{ id: "s1", name: "Appointment", mins: 30, price: 0, desc: "" }],
    staff: [{ id: "p1", name: "Your name", role: "", services: ["s1"], days: days(1, 2, 3, 4, 5) }],
    hours: { 0: null, 1: ["09:00", "17:00"], 2: ["09:00", "17:00"], 3: ["09:00", "17:00"], 4: ["09:00", "17:00"], 5: ["09:00", "17:00"], 6: null },
    buffer: 0, notice: 120,
  },
};
