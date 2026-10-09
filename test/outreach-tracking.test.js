const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "outreach-track-"));
process.env.OUTREACH_DATA_DIR = DIR;
const eng = require("../outreach/engine");
const CFG = eng.sanitizeConfig({ sending: { timezone: "UTC", send_days: ["Mon", "Tue", "Wed", "Thu", "Fri"], followup_gaps_days: "3,4,7" } });
const at = (iso) => new Date(iso + "T15:00:00Z");
const lead = (o) => ({ email: "a@b.com", step: "0", status: "new", last_sent: "", sending: "", ...o });

test("the Leads table says what happens next for every kind of lead", () => {
  const now = at("2026-03-02");
  assert.match(eng.nextEmail(lead({}), CFG, now), /Email 1 on the next send day/);
  assert.strictEqual(eng.nextEmail(lead({ status: "active", step: "1", last_sent: "2026-03-02T15:00:00Z" }), CFG, now), "Email 2 on 2026-03-05");
  assert.strictEqual(eng.nextEmail(lead({ status: "active", step: "2", last_sent: "2026-03-05T15:00:00Z" }), CFG, now), "Email 3 on 2026-03-09", "7 days after email 1; Sunday is skipped");
  assert.strictEqual(eng.nextEmail(lead({ status: "active", step: "3", last_sent: "2026-03-09T15:00:00Z" }), CFG, now), "Email 4 on 2026-03-16");
  assert.match(eng.nextEmail(lead({ status: "active", step: "1", last_sent: "2026-03-02T15:00:00Z" }), CFG, at("2026-03-05")), /Email 2 due on the next run/);
  assert.strictEqual(eng.nextEmail(lead({ status: "finished", step: "4" }), CFG, now), "Sequence complete");
  assert.strictEqual(eng.nextEmail(lead({ status: "active", step: "1", sending: "1" }), CFG, now), "On hold (check it)");
  for (const status of ["replied", "unsubscribed", "bounced", "do-not-contact", "skipped-country"]) assert.strictEqual(eng.nextEmail(lead({ status, step: "1" }), CFG, now), "", status + " has nothing next");
});

test.after(() => fs.rmSync(DIR, { recursive: true, force: true }));
