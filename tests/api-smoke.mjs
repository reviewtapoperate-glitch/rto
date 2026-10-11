import assert from "node:assert/strict";

const env = {
  SUPABASE_URL: "https://rto-test.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  RTO_SESSION_SECRET: "a-test-session-secret-that-is-longer-than-32-characters",
  RTO_CREDENTIAL_PEPPER: "a-separate-test-credential-pepper-longer-than-32-characters",
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
const reviews = [];
const bookings = [];
const events = [];
const calls = [];
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  const method = init.method || "GET";
  const body = init.body && url.pathname.startsWith("/rest/v1/") ? JSON.parse(String(init.body)) : null;
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
  if (url.pathname.startsWith("/storage/v1/object/") && ["POST", "DELETE"].includes(method)) return Response.json({ ok: true });
  if (url.pathname === "/rest/v1/reviews" && method === "POST") { const row = { id: reviews.length + 1, ...body }; reviews.push(row); return Response.json([row], { status: 201 }); }
  if (url.pathname === "/rest/v1/reviews" && method === "GET") return Response.json(reviews);
  if (url.pathname === "/rest/v1/bookings" && method === "POST") { const row = { id: bookings.length + 1, ...body }; bookings.push(row); return Response.json([row], { status: 201 }); }
  if (url.pathname === "/rest/v1/bookings" && method === "GET") {
    const id = url.searchParams.get("id")?.replace("eq.", "");
    const memberId = url.searchParams.get("member_id")?.replace("eq.", "");
    return Response.json(bookings.filter(row => (!id || String(row.id) === id) && (!memberId || row.member_id === memberId)));
  }
  if (url.pathname === "/rest/v1/bookings" && method === "PATCH") {
    const id = url.searchParams.get("id")?.replace("eq.", "");
    const row = bookings.find(item => String(item.id) === id);
    if (row) Object.assign(row, body);
    return Response.json(row ? [row] : []);
  }
  if (url.pathname === "/rest/v1/bookings" && method === "DELETE") return Response.json([]);
  if (url.pathname === "/rest/v1/page_events" && method === "POST") { const row = { id: events.length + 1, ...body }; events.push(row); return Response.json([row], { status: 201 }); }
  if (url.pathname === "/rest/v1/page_events" && method === "GET") return Response.json(events);
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
const { default: authHandler } = await import("../netlify/functions/rto-auth.mjs");
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
const adminSave = await call("customer-save", { record: { slug: "demo", name: "Updated Demo", business_type: "Cafe" } }, adminCookie);
assert.equal(adminSave.status, 200, "authenticated admin should be able to save a business");
const authWrapperRejectsData = await authHandler(new Request("https://rto-test.netlify.app/.netlify/functions/rto-auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "customer-save" }) }), production);
assert.equal(authWrapperRejectsData.status, 404, "auth wrapper must reject non-authentication actions");

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
customer.owner_code = "STALE-CODE";
const staleOwnerCode = await call("owner-login", { slug: "demo", code: "STALE-CODE" });
assert.equal(staleOwnerCode.status, 401, "legacy plaintext must not override an existing hash");
customer.owner_code = null;
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
members[0].access_code = "STALE-CODE";
const staleMemberCode = await call("member-login", { phone: "254711111111", code: "STALE-CODE" });
assert.equal(staleMemberCode.status, 401, "legacy plaintext must not override an existing member code hash");
members[0].access_code = null;
const memberSession = await call("session", {}, memberCookie);
assert.equal((await memberSession.json()).session.role, "member");
const reviewSubmit = await call("review-submit", { slug: "demo", rating: 5, comment: "Test review", member_id: "spoofed-id", member_name: "Impersonated" }, memberCookie);
assert.equal(reviewSubmit.status, 200, "signed-in member should submit a review through the API");
assert.equal(reviews[0].member_id, "member-test-id", "review author must come from the signed session, not client input");
assert.equal(reviews[0].member_name, "Test Member", "review display name must come from the member record");
const bookingSubmit = await call("booking-submit", { slug: "demo", name: "Booking Guest", phone: "254722222222", item: "Table", date: "2026-10-15", time: "18:00", note: "Test", member_id: "spoofed-id" });
assert.equal(bookingSubmit.status, 201, "public visitor should submit a validated booking");
assert.equal(bookings[0].member_id, null, "anonymous booking must not accept a spoofed member id");
customer.booking_guidelines = "Please read before booking.";
const missingGuidelines = await call("booking-submit", { slug: "demo", name: "Guest", phone: "254733333333", date: "2026-10-15", time: "18:00", guidelinesAccepted: false });
assert.equal(missingGuidelines.status, 400, "booking guidelines must be enforced server-side");
const invalidDate = await call("booking-submit", { slug: "demo", name: "Guest", phone: "254733333333", date: "tomorrow", time: "18:00", guidelinesAccepted: true });
assert.equal(invalidDate.status, 400, "booking date format must be validated server-side");
customer.booking_guidelines = null;
const booking = bookings[0];
const ownerBookingList = await call("bookings-list", { slug: "demo" }, ownerCookie);
assert.equal(ownerBookingList.status, 200, "owner should only access bookings for their business");
const bookingStatus = await call("booking-status", { id: booking.id, status: "confirmed" }, ownerCookie);
assert.equal(bookingStatus.status, 200, "owner should update their own booking status");
bookings.push({ id: 2, business_slug: "another-business", member_id: null, status: "pending" });
const crossBusinessBooking = await call("booking-status", { id: 2, status: "confirmed" }, ownerCookie);
assert.equal(crossBusinessBooking.status, 403, "owner must not update another business booking");
const upload = await call("upload-image", { slug: "demo", tag: "photo", filename: "test.png", dataUrl: "data:image/png;base64,iVBORw0KGgo=" }, ownerCookie);
assert.equal(upload.status, 201, "authorized owner should upload a valid image");
const uploadedPath = (await upload.json()).path;
const deleteImage = await call("delete-image", { slug: "demo", path: uploadedPath }, ownerCookie);
assert.equal(deleteImage.status, 200, "owner should delete images under their own business path");

console.log("RTO API smoke tests passed (mocked Supabase; no live database used).");
