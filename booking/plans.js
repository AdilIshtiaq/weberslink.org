/*
 * Plans for client businesses. Edit names, prices and limits here; the dashboard, your admin page and the limits
 * on the server all read this file. null = unlimited. Prices are shown to owners as given (no card is charged:
 * an owner asks to upgrade, you invoice them, then switch their plan on /admin/booking.html).
 */
module.exports = {
  free: {
    name: "Free", price: "$0", note: "For one person getting started",
    staff: 1, bookingsPerMonth: 100, questions: 2, poweredBy: true,
    perks: ["1 team member", "100 online bookings a month", "Email confirmations and reminders", "Clients, notes and history", "2 booking questions"],
  },
  pro: {
    name: "Pro", price: "$19 / month", note: "For a growing team",
    staff: null, bookingsPerMonth: null, questions: null, poweredBy: false,
    perks: ["Unlimited team members", "Unlimited bookings", "Unlimited booking questions", "No WebersLink branding on your page", "Priority email support"],
  },
};
/** Paid help sold alongside the plans (shown in the dashboard; requests come to you). */
module.exports.SERVICES = {
  setup: { name: "Done-for-you setup", price: "one-time fee", text: "We enter your services, team and hours, import your client list, add booking to your website, Google profile and Instagram, and test it with you." },
  custom: { name: "Custom features", price: "quote", text: "Need something specific, like deposits, SMS, your own app, a custom design or an integration? Tell us and we'll quote." },
};
module.exports.planOf = (acc) => module.exports[(acc && acc.plan) || "free"] || module.exports.free;
