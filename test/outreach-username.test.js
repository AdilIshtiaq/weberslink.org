const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "outreach-user-"));
process.env.OUTREACH_DATA_DIR = DIR;
process.env.ADMIN_USERNAME = "Owner";
process.env.ADMIN_PASSWORD = "a long test password";
const outreach = require("../outreach");

let server, base;
test.before(async () => {
  server = http.createServer((req, res) => { if (!outreach.handle(req, res)) { res.writeHead(404); res.end(); } });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => { server.close(); fs.rmSync(DIR, { recursive: true, force: true }); });

const post = (body) => fetch(base + "/api/outreach/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("with ADMIN_USERNAME set, both username and password are required", async () => {
  const sess = await (await fetch(base + "/api/outreach/session")).json();
  assert.strictEqual(sess.usernameRequired, true);
  const right = process.env.ADMIN_PASSWORD;
  for (const body of [{ password: right }, { username: "owner", password: "wrong password!" }, { username: "someone", password: right }, { username: "", password: right }]) {
    const r = await post(body);
    assert.strictEqual(r.status, 401);
    assert.strictEqual((await r.json()).error, "Wrong username or password.", "same message whichever part is wrong");
  }
});

test("the right pair signs in (username is not case-sensitive) and the session works", async () => {
  const r = await post({ username: "  OWNER ", password: process.env.ADMIN_PASSWORD });
  assert.strictEqual(r.status, 200);
  const cookie = r.headers.get("set-cookie").split(";")[0];
  const st = await fetch(base + "/api/outreach/status", { headers: { Cookie: cookie } });
  assert.strictEqual(st.status, 200);
});
