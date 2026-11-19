import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("access-code recovery is administrator-only and SMS recovery is not wired into the API", async () => {
  const api = await readFile(new URL("../netlify/functions/rto-api.mjs", import.meta.url), "utf8");
  const app = await readFile(new URL("../frontend/js/app.js", import.meta.url), "utf8");
  assert.match(api, /action === "member-reset-request"/);
  assert.match(api, /access_code_reset_requests/);
  assert.match(api, /mode: "manual"/);
  assert.match(api, /action === "admin-reset-requests"/);
  assert.match(api, /action === "admin-member-reset"/);
  assert.match(api, /action === "admin-member-reset-reject"/);
  assert.doesNotMatch(api, /sendRecoverySms|isRecoverySmsConfigured|member-reset-verify|rto_verify_sms_recovery|rto_complete_sms_access_recovery/);
  assert.doesNotMatch(app, /verifyMemberAccessReset|ma_reset_otp|verification code by SMS/i);
});

test("viewing owner access panel does not rotate codes; issuing code requires explicit action", async () => {
  const app = await readFile(new URL("../frontend/js/app.js", import.meta.url), "utf8");
  const viewStart = app.indexOf("async function showOwnerAccessModal");
  const viewEnd = app.indexOf("function renderOwnerAccessModal", viewStart);
  assert.ok(viewStart >= 0 && viewEnd > viewStart);
  const viewFunction = app.slice(viewStart, viewEnd);
  assert.doesNotMatch(viewFunction, /rtoApi\("admin-owner-code"/);
  assert.match(app, /Viewing this panel does not change the current code/);
  assert.match(app, /Issue a new code \(revoke old code\)/);
  assert.match(app, /This makes their old code stop working immediately/);
});
