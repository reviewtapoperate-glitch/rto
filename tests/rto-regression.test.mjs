import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { webcrypto } from "node:crypto";

if (!globalThis.crypto) globalThis.crypto = webcrypto;
const env = {
  URL: "https://reviewtapoperate.netlify.app",
  SUPABASE_URL: "https://rto-test.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  RTO_SESSION_SECRET: "test-session-secret-at-least-thirty-two-characters",
  RTO_CREDENTIAL_PEPPER: "test-credential-pepper-at-least-thirty-two-characters",
  AT_USERNAME: "test-user",
  AT_API_KEY: "test-api-key"
};
globalThis.Netlify = { env: { get: name => env[name] } };
const { handleRtoApi } = await import("../netlify/functions/rto-api.mjs");
const sitemapHandler = (await import("../netlify/functions/sitemap.mjs")).default;

const jsonResponse = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json" }
});
function request(action, payload = {}, cookie = "") {
  return new Request("https://reviewtapoperate.netlify.app/.netlify/functions/rto-api", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {})
    },
    body: JSON.stringify({ action, ...payload })
  });
}
async function sessionCookie(role, extra = {}) {
  const body = Buffer.from(JSON.stringify({
    role, ...extra, exp: Math.floor(Date.now() / 1000) + 3600
  })).toString("base64url");
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(env.RTO_SESSION_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const signature = Buffer.from(await crypto.subtle.sign(
    "HMAC", key, new TextEncoder().encode(body)
  )).toString("base64url");
  return "rto_session=" + body + "." + signature;
}

test("reset request sends an OTP by SMS to a uniquely matching registered phone", async () => {
  const oldFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(String(url));
    let body = null;
    if (init.body && String(init.headers?.["Content-Type"] || init.headers?.["content-type"] || "").includes("application/json")) {
      body = JSON.parse(init.body);
    }
    calls.push({ url: parsed, method: init.method || "GET", body, rawBody: init.body });
    if (parsed.pathname.endsWith("/members")) {
      return jsonResponse([{ id: "member-1", name: "Jane Doe", phone: "+254712345678" }]);
    }
    if (parsed.pathname.endsWith("/rpc/rto_create_sms_recovery_challenge")) {
      assert.equal(body.p_member_id, "member-1");
      assert.equal(body.p_phone, "254712345678");
      assert.match(body.p_otp_hash, /^hmac-sha256:/);
      return jsonResponse(true);
    }
    if (parsed.hostname === "api.africastalking.com") {
      assert.match(String(init.body), /Your\+ReviewTapOperate\+verification\+code/);
      return jsonResponse({ SMSMessageData: { Recipients: [{ statusCode: 102 }] } });
    }
    throw new Error("Unexpected mocked request: " + parsed.href);
  };
  try {
    const response = await handleRtoApi(request("member-reset-request", {
      phone: "0712 345 678"
    }), { deploy: { context: "production" } });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.ok, true);
    assert.match(result.challengeId, /^[0-9a-f-]{36}$/i);
    assert.ok(calls.some(c => c.url.pathname.endsWith("/rpc/rto_create_sms_recovery_challenge")));
    assert.ok(calls.some(c => c.url.hostname === "api.africastalking.com"));
    assert.equal(calls.some(c => c.url.pathname.endsWith("/access_code_reset_requests")), false);
  } finally { globalThis.fetch = oldFetch; }
});

test("unknown phone receives the same generic response without an SMS or stored challenge", async () => {
  const oldFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(String(url));
    calls.push({ url: parsed, method: init.method || "GET" });
    if (parsed.pathname.endsWith("/members")) {
      return jsonResponse([{ id: "member-1", name: "Jane Doe", phone: "+254712345678" }]);
    }
    throw new Error("Unknown numbers must not trigger writes or SMS: " + parsed.href);
  };
  try {
    const response = await handleRtoApi(request("member-reset-request", {
      phone: "0700 000 000"
    }), { deploy: { context: "production" } });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.ok, true);
    assert.match(result.message, /If this number is registered/);
    assert.equal(calls.some(c => c.method === "POST"), false);
  } finally { globalThis.fetch = oldFetch; }
});

test("administrator reset list includes resolved and rejected request history", async () => {
  const oldFetch = globalThis.fetch;
  const cookie = await sessionCookie("admin");
  let requestedUrl;
  globalThis.fetch = async url => {
    requestedUrl = new URL(String(url));
    return jsonResponse([{ id: 1, status: "pending" }, { id: 2, status: "resolved" }]);
  };
  try {
    const response = await handleRtoApi(request("admin-reset-requests", {}, cookie), { deploy: { context: "production" } });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).requests.length, 2);
    assert.equal(requestedUrl.searchParams.has("status"), false);
  } finally { globalThis.fetch = oldFetch; }
});

test("administrator reset updates the member and resolves the request through one atomic RPC", async () => {
  const oldFetch = globalThis.fetch;
  const cookie = await sessionCookie("admin");
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(String(url));
    calls.push({ url: parsed, method: init.method || "GET", body: init.body ? JSON.parse(init.body) : null });
    if (parsed.pathname.endsWith("/access_code_reset_requests") && (init.method || "GET") === "GET") {
      return jsonResponse([{ id: 42, member_id: "member-1", status: "pending" }]);
    }
    assert.ok(parsed.pathname.endsWith("/rpc/rto_resolve_access_code_reset"));
    return jsonResponse(true);
  };
  try {
    const response = await handleRtoApi(request("admin-member-reset", { requestId: "42" }, cookie), { deploy: { context: "production" } });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.ok(result.code, "replacement code is returned only after the atomic RPC succeeds");
    const rpcCalls = calls.filter(call => call.url.pathname.endsWith("/rpc/rto_resolve_access_code_reset"));
    assert.equal(rpcCalls.length, 1, "credential and request state are changed by one database transaction");
    assert.deepEqual(rpcCalls[0].body, { p_request_id: 42, p_code_hash: rpcCalls[0].body.p_code_hash });
    assert.match(rpcCalls[0].body.p_code_hash, /^hmac-sha256:[A-Za-z0-9_-]{43}$/);
  } finally { globalThis.fetch = oldFetch; }
});

test("administrator reset does not disclose a code when the atomic RPC declines the request", async () => {
  const oldFetch = globalThis.fetch;
  const cookie = await sessionCookie("admin");
  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(String(url));
    if (parsed.pathname.endsWith("/access_code_reset_requests") && (init.method || "GET") === "GET") {
      return jsonResponse([{ id: 42, member_id: "member-1", status: "pending" }]);
    }
    return jsonResponse(false);
  };
  try {
    const response = await handleRtoApi(request("admin-member-reset", { requestId: "42" }, cookie), { deploy: { context: "production" } });
    assert.equal(response.status, 409);
    assert.equal(Object.hasOwn(await response.json(), "code"), false);
  } finally { globalThis.fetch = oldFetch; }
});

test("business deletion rejects unauthenticated requests before database writes", async () => {
  const oldFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => { called = true; throw new Error("must not be called"); };
  try {
    const response = await handleRtoApi(request("customer-delete", { slug: "test-business" }), { deploy: { context: "production" } });
    assert.equal(response.status, 403);
    assert.equal(called, false);
  } finally { globalThis.fetch = oldFetch; }
});

test("authorized business deletion uses the atomic database function", async () => {
  const oldFetch = globalThis.fetch;
  const cookie = await sessionCookie("admin");
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(String(url));
    calls.push({ url: parsed, method: init.method || "GET", body: init.body ? JSON.parse(init.body) : null });
    assert.ok(parsed.pathname.endsWith("/rpc/rto_delete_customer"));
    return jsonResponse(true);
  };
  try {
    const response = await handleRtoApi(request("customer-delete", { slug: "test-business" }, cookie), { deploy: { context: "production" } });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).ok, true);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].body, { p_slug: "test-business" });
  } finally { globalThis.fetch = oldFetch; }
});

test("owner analytics calls the aggregate RPC only for the owner's own slug", async () => {
  const oldFetch = globalThis.fetch;
  const cookie = await sessionCookie("owner", { slug: "my-business" });
  let calledUrl;
  globalThis.fetch = async (url, init = {}) => {
    calledUrl = new URL(String(url));
    assert.equal(init.method, "POST");
    return jsonResponse({ views: 12, clicks: 4, bookings: 2, sourceCounts: { nfc: 7, unknown: 5 }, daily: [] });
  };
  try {
    const response = await handleRtoApi(request("analytics", { slug: "my-business" }, cookie), { deploy: { context: "production" } });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).views, 12);
    assert.ok(calledUrl.pathname.endsWith("/rpc/rto_business_analytics"));
    const forbidden = await handleRtoApi(request("analytics", { slug: "other-business" }, cookie), { deploy: { context: "production" } });
    assert.equal(forbidden.status, 403);
  } finally { globalThis.fetch = oldFetch; }
});

test("dynamic sitemap lists eligible slugs and excludes invalid slugs", async () => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => jsonResponse([
    { slug: "valid-business", created_at: "2026-10-01T00:00:00Z" },
    { slug: "bad slug", created_at: "2026-10-02T00:00:00Z" }
  ]);
  try {
    const response = await sitemapHandler();
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /application\/xml/);
    const xml = await response.text();
    assert.match(xml, /https:\/\/reviewtapoperate\.netlify\.app\/\?c=valid-business/);
    assert.doesNotMatch(xml, /bad%20slug|bad slug/);
    assert.doesNotMatch(xml, /<lastmod>/);
  } finally { globalThis.fetch = oldFetch; }
});

test("public app removes in-app review UI but retains Google Review and three default tracking links", async () => {
  const app = await readFile(new URL("../frontend/js/app.js", import.meta.url), "utf8");
  assert.doesNotMatch(app, /id="reviewsSection"|function loadReviewsSection|function submitReview/);
  assert.match(app, /Leave a Google review/);
  assert.match(app, /\["NFC tap", trackedLink\(slugValue, "nfc"\)\]/);
  assert.match(app, /\["QR scan", trackedLink\(slugValue, "qr"\)\]/);
  assert.match(app, /\["General sharing", trackedLink\(slugValue, "link"\)\]/);
  assert.match(app, /<details style="margin:12px 0;"><summary[^>]*>Advanced channel tracking/);
});

test("frontend restores server session and the selected top-level view after refresh", async () => {
  const app = await readFile(new URL("../frontend/js/app.js", import.meta.url), "utf8");
  assert.match(app, /async function restoreServerSession\(\)/);
  assert.match(app, /async function bootstrapApp\(\)/);
  assert.match(app, /rtoApi\("session"\)/);
  assert.match(app, /const authActions = new Set\(\[[^\]]*"logout"\]\)/);
  assert.match(app, /rto_current_view/);
  assert.match(app, /auth\.session\?\.role === "owner" && auth\.session\.slug === editSlug/);
});
