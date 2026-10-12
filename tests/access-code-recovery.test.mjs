import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isRecoverySmsConfigured, sendRecoverySms } from "../netlify/functions/rto-sms.mjs";

const env = (values) => (name) => values[name];

test("SMS recovery stays disabled without Africa's Talking credentials", async () => {
  assert.equal(isRecoverySmsConfigured(env({})), false);
  const result = await sendRecoverySms({
    phone: "+254712345678",
    message: "test",
    envGet: env({}),
    fetchImpl: async () => { throw new Error("must not call provider"); }
  });
  assert.deepEqual(result, { ok: false, reason: "not_configured" });
});

test("SMS delivery posts to Africa's Talking and accepts queued messages", async () => {
  let request;
  const result = await sendRecoverySms({
    phone: "+254712345678",
    message: "Verification test",
    envGet: env({ AT_USERNAME: "test-user", AT_API_KEY: "test-key", AT_SENDER_ID: "RTO" }),
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => ({ SMSMessageData: { Recipients: [{ statusCode: 102 }] } }) };
    }
  });
  assert.deepEqual(result, { ok: true });
  assert.equal(request.url, "https://api.africastalking.com/version1/messaging");
  assert.equal(request.options.headers.apiKey, "test-key");
  assert.match(request.options.body, /to=%2B254712345678/);
  assert.match(request.options.body, /from=RTO/);
});

test("SMS provider failures are returned as failures, never false success", async () => {
  const result = await sendRecoverySms({
    phone: "+254712345678",
    message: "Verification test",
    envGet: env({ AT_USERNAME: "test-user", AT_API_KEY: "test-key" }),
    fetchImpl: async () => ({ ok: false, json: async () => ({}) })
  });
  assert.equal(result.ok, false);
});

test("recovery flow uses expiring, hashed challenges and private database storage", async () => {
  const api = await readFile(new URL("../netlify/functions/rto-api.mjs", import.meta.url), "utf8");
  const migration = await readFile(new URL("../supabase/migrations/20261012070000_rto_sms_access_code_recovery.sql", import.meta.url), "utf8");
  const app = await readFile(new URL("../frontend/js/app.js", import.meta.url), "utf8");
  assert.match(api, /hashCredential\("sms-recovery:" \+ challengeId \+ ":" \+ otp\)/);
  assert.match(api, /expires_at/);
  assert.match(api, /rto_complete_sms_access_recovery/);
  assert.match(api, /replacement access code has been sent to your registered phone/);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /pg_advisory_xact_lock/i);
  assert.match(migration, /attempts \+ 1/i);
  assert.match(migration, /revoke all on table public\.access_code_recovery_challenges from public, anon, authenticated/i);
  assert.match(app, /verifyMemberAccessReset/);
  assert.doesNotMatch(api, /return json\(\{ ok: true, code: replacementCode \}\)/);
});
