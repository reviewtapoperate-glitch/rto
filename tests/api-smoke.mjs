import assert from "node:assert/strict";

const env = {
  SUPABASE_URL: "https://rto-test.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  RTO_SESSION_SECRET: "a-test-session-secret-that-is-longer-than-32-characters",
  RTO_ADMIN_PASSWORD: "Test-Only-Admin-Password-2026!"
};
globalThis.Netlify = { env: { get: (key) => env[key] } };

const customer = {
  slug: "demo",
  name: "Demo Business",
  business_type: "Cafe",
  phone: "254700000000",
  owner_code: "OWNER123",
  owner_code_hash: null,
  created_at: "2026-01-01T00:00:00Z",
  listed_in_directory: true
};
const members = [];
const calls = [];
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  const method = init.method || "GET";
  const body = init.body ? JSON.parse(String(init.body)) : null;
  calls.push({ url: url.toString(), method, body });

  if (url.pathname === "/rest/v1/customers" && method === "GET") {
    if (url.searchParams.has("slug") && url.searchParams.get("slug") === "eq.demo") return Response.json([customer]);
    if (url.searchParams.has("or")) return Response.json([customer]);
    if (url.searchParams.has("listed_in_directory")) return Response.json([{ ...customer }]);
    return Response.json([{ ...customer }]);
  }
  if (url.pathname === "/rest/v1/customers" && method === "PATCH") {
    Object.assign(customer, body);
    return Response.json([customer]);
  }
  if (url.pathname === "/rest/v1/customers" && method === "POST") {
    const created = { ...body, created_at: "2026-01-01T00:00:00Z" };
    Object.assign(customer, created);
    return Response.json([created], { status: 201 });
  }
  if (url.pathname === "/rest/v1/members" && method === "POST") {
    const created = { id: "member-test-id", ...body, created_at: "2026-01-01T00:00:00Z" };
    members.push(created);
    return Response.json([created], { status: 201 });
  }
  if (url.pathname === "/rest/v1/members" && method === "GET") {
    const phone = url.searchParams.get("phone")?.replace("eq.", "");
    const id = url.searchParams.get("id")?.replace("eq.", "");
    const row = members.find(m => (phone && m.phone === phone) || (id && m.id === id));
    return Response.json(row ? [row] : []);
  }
  return Response.json({ message: "Unmocked test request: " + method + " " + url.pathname + url.search }, { status: 500 });
};

const { default: handler } = await import("../netlify/functions/rto-api.mjs");
const production = { deploy: { context: "production" } };
const preview = { deploy: { context: "deploy-preview" } };
async function call(action, payload = {}, cookie, context = production) {
  const headers = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  return handler(new Request("https://rto-test.netlify.app/.netlify/functions/rto-api", {
    method: "POST",
    headers,
    body: JSON.stringify({ action, ...payload })
  }), context);
}
function sessionCookie(response) {
  const raw = response.headers.get("set-cookie");
  assert.ok(raw, "successful login should issue a session cookie");
  return raw.split(";")[0];
}

const wrongAdmin = await call("admin-login", { password: "wrong" });
assert.equal(wrongAdmin.status, 401, "wrong admin password must be rejected");
const previewAdmin = await call("admin-login", { password: env.RTO_ADMIN_PASSWORD }, undefined, preview);
assert.equal(previewAdmin.status, 403, "admin sign-in must be blocked on deploy previews");

const adminLogin = await call("admin-login", { password: env.RTO_ADMIN_PASSWORD });
assert.equal(adminLogin.status, 200);
const adminCookie = sessionCookie(adminLogin);
assert.match(adminLogin.headers.get("set-cookie"), /HttpOnly; Secure; SameSite=Lax/);
const adminSession = await call("session", {}, adminCookie);
assert.equal((await adminSession.json()).session.role, "admin");

const publicProfile = await call("public-customer", { slug: "demo" });
assert.equal(publicProfile.status, 200);
const publicCustomer = (await publicProfile.json()).customer;
assert.equal(publicCustomer.owner_code, undefined, "public customer data must not contain plaintext owner codes");
assert.equal(publicCustomer.owner_code_hash, undefined, "public customer data must not contain owner code hashes");

const ownerLogin = await call("owner-login", { slug: "demo", code: "OWNER123" });
assert.equal(ownerLogin.status, 200, "valid legacy owner code should be accepted during migration");
assert.equal(customer.owner_code, null, "successful legacy owner login must clear plaintext code");
assert.match(customer.owner_code_hash, /^hmac-sha256:/, "successful legacy owner login must store a keyed hash");
const ownerCookie = sessionCookie(ownerLogin);
const crossBusinessEdit = await call("customer-save", { record: { slug: "another-business", name: "No", business_type: "Cafe" } }, ownerCookie);
assert.equal(crossBusinessEdit.status, 403, "owner session must not edit another business");

const noSessionWrite = await call("customer-save", { record: { slug: "demo", name: "No", business_type: "Cafe" } });
assert.equal(noSessionWrite.status, 403, "unsigned clients must not write business profiles");

const memberSignup = await call("member-signup", { name: "Test Member", phone: "254711111111" });
assert.equal(memberSignup.status, 201);
const signupBody = await memberSignup.json();
const memberCookie = sessionCookie(memberSignup);
assert.ok(signupBody.accessCode, "new member should receive their one-time access code");
assert.equal(members[0].access_code, null, "new member code must not be stored in plaintext");
assert.match(members[0].access_code_hash, /^hmac-sha256:/, "new member code must be stored as a keyed hash");

const memberLogin = await call("member-login", { phone: "254711111111", code: signupBody.accessCode });
assert.equal(memberLogin.status, 200, "hashed member access code should authenticate");
const memberSession = await call("session", {}, memberCookie);
assert.equal((await memberSession.json()).session.role, "member");

console.log("RTO API auth smoke tests passed (mocked Supabase; no live database used).");
