import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const htmlPath = "frontend/index.html";
const cssPath = "frontend/css/styles.css";
const jsPath = "frontend/js/app.js";
const html = readFileSync(htmlPath, "utf8");
const css = readFileSync(cssPath, "utf8");
const js = readFileSync(jsPath, "utf8");
const toml = readFileSync("netlify.toml", "utf8");

assert(existsSync(htmlPath), "frontend HTML must exist");
assert(existsSync(cssPath), "extracted stylesheet must exist");
assert(existsSync(jsPath), "extracted browser JavaScript must exist");
assert.match(toml, /publish\s*=\s*"frontend"/, "Netlify must publish the frontend directory");
assert.match(html, /href=["']\/css\/styles\.css["']/, "HTML must reference the extracted stylesheet");
assert.match(html, /src=["']\/js\/app\.js["']/, "HTML must reference the extracted app script");
assert.doesNotMatch(html, /<style\b/i, "styles must not remain inline");
const scriptTags = [...html.matchAll(/<script\b([^>]*)>/gi)];
assert(scriptTags.every((match) => /\bsrc\s*=/.test(match[1])), "all scripts must be external files");
assert.match(css, /--pink\s*:\s*#FF2E88/i, "existing TapCore pink token must be preserved");
assert.match(css, /--cyan\s*:\s*#00E5FF/i, "existing signal cyan token must be preserved");
assert.match(js, /SUPABASE_URL/, "Supabase configuration must remain present");
assert.match(js, /QRCode/, "QR functionality must remain present");
assert.match(js, /renderPublicProfile/, "public business profile renderer must remain present");
assert.match(js, /renderOwnerGate/, "owner route must remain present");
assert.match(js, /renderAdminGate/, "admin route must remain present");
assert.match(js, /submitBooking/, "booking flow must remain present");
assert.match(js, /submitReview/, "review flow must remain present");
assert.match(js, /subscribeToLiveUpdates/, "Realtime subscription code must remain present");
assert.match(js, /IS_NETLIFY_PREVIEW/, "preview deployment must be detected");
assert.match(js, /Member sign-up is disabled in the verification preview/, "preview must block member writes");
assert.match(js, /Customer edits are disabled in the verification preview/, "preview must block customer edits");

console.log("RTO structural smoke checks passed. This does not certify authorization or end-to-end runtime behavior.");
