/*
 * Places: shared helpers for country and US-state names, used by the engine and the lead importers.
 */
const COUNTRY_ALIAS = { "UNITED STATES": "US", USA: "US", "UNITED KINGDOM": "UK", GB: "UK", CANADA: "CA" };
const US_STATES = { alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY", "district of columbia": "DC" };

/** "Texas", "texas" and "tx" all become "TX"; anything else (a UK county, say) is kept as written, upper-cased. */
const normState = (s) => { const v = String(s || "").trim().replace(/\./g, ""); return US_STATES[v.toLowerCase()] || v.toUpperCase(); };

function normCountry(c) {
  const u = String(c || "").trim().toUpperCase();
  return COUNTRY_ALIAS[u] || u;
}

const CA_PROVINCES = { alberta: "AB", "british columbia": "BC", manitoba: "MB", "new brunswick": "NB", "newfoundland and labrador": "NL", "nova scotia": "NS", ontario: "ON", "prince edward island": "PE", quebec: "QC", "québec": "QC", saskatchewan: "SK", "northwest territories": "NT", nunavut: "NU", yukon: "YT" };
const CA_CODES = new Set(Object.values(CA_PROVINCES));
/** US states (names and codes) as a set of two-letter codes. */
const US_CODES = new Set(Object.values(US_STATES));

// Canadian provinces are recognised too ("Ontario" -> ON); US names win where a name could be either.
const normStateBase = normState;
const normStateAll = (v) => { const t = String(v || "").trim().replace(/\./g, ""); return US_STATES[t.toLowerCase()] || CA_PROVINCES[t.toLowerCase()] || normStateBase(v); };

module.exports = { US_STATES, US_CODES, CA_PROVINCES, CA_CODES, normState: normStateAll, normCountry };
