const SESSION_COOKIE = "rto_session";
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extraHeaders } });
}
function env(name) {
  try { return Netlify.env.get(name); } catch { return undefined; }
}
function constantTimeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const encoder = new TextEncoder();
  const aa = encoder.encode(a), bb = encoder.encode(b);
  let diff = aa.length ^ bb.length;
  const max = Math.max(aa.length, bb.length);
  for (let i = 0; i < max; i++) diff |= (aa[i] || 0) ^ (bb[i] || 0);
  return diff === 0;
}
function base64url(bytes) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function fromBase64url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}
async function sign(value, secret) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))));
}
async function makeSession(payload, secret) {
  const body = base64url(new TextEncoder().encode(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS })));
  return body + "." + await sign(body, secret);
}
async function readSession(request, secret) {
  const raw = (request.headers.get("cookie") || "").split(";").map(x => x.trim()).find(x => x.startsWith(SESSION_COOKIE + "="))?.slice(SESSION_COOKIE.length + 1);
  if (!raw) return null;
  const [body, signature, extra] = raw.split(".");
  if (!body || !signature || extra || !constantTimeEqual(signature, await sign(body, secret))) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(fromBase64url(body)));
    if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000) || !payload.role) return null;
    return payload;
  } catch { return null; }
}
function sessionCookie(value) {
  return `${SESSION_COOKIE}=${value}; Path=/; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; Secure; SameSite=Lax`;
}
function clearCookie() {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}
function normalizePhone(value) {
  return String(value || "").replace(/[^\d+]/g, "").trim();
}
function randomAccessCode() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, b => chars[b % chars.length]).join("");
}
async function supabaseRequest(path, method = "GET", body) {
  const url = env("SUPABASE_URL") || "https://ptmznpjsgdkasvywufcx.supabase.co";
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!key) throw new Error("Server authentication is not configured.");
  const response = await fetch(url + "/rest/v1/" + path, {
    method,
    headers: {
      apikey: key,
      authorization: "Bearer " + key,
      "content-type": "application/json",
      prefer: "return=representation"
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch {}
  if (!response.ok) {
    const message = data?.message || data?.hint || "Database request failed.";
    throw new Error(message);
  }
  return data;
}
function safeOwnerRecord(row) {
  if (!row) return null;
  const { owner_code, ...safe } = row;
  return safe;
}
export default async (request, context) => {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405, { allow: "POST" });
  const sessionSecret = env("RTO_SESSION_SECRET");
  if (!sessionSecret || sessionSecret.length < 32) return json({ error: "Server authentication is not configured. Ask the administrator to configure the required Netlify environment variables." }, 503);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON request." }, 400); }
  const action = String(body?.action || "");
  try {
    if (action === "logout") return json({ ok: true }, 200, { "set-cookie": clearCookie() });
    if (action === "session") {
      const session = await readSession(request, sessionSecret);
      return json({ authenticated: Boolean(session), session: session ? { role: session.role, slug: session.slug || null, member: session.member || null } : null });
    }
    if (action === "admin-login") {
      const expected = env("RTO_ADMIN_PASSWORD");
      if (!expected || expected.length < 16) return json({ error: "Admin authentication is not configured securely." }, 503);
      const password = String(body?.password || "");
      if (!constantTimeEqual(password, expected)) return json({ error: "Incorrect admin passcode." }, 401);
      const token = await makeSession({ role: "admin" }, sessionSecret);
      return json({ ok: true }, 200, { "set-cookie": sessionCookie(token) });
    }
    if (action === "owner-info") {
      const slug = String(body?.slug || "").trim().toLowerCase();
      if (!/^[a-z0-9-]{1,80}$/.test(slug)) return json({ error: "Invalid business link." }, 400);
      const rows = await supabaseRequest("customers?select=*&slug=eq." + encodeURIComponent(slug) + "&limit=1");
      const row = Array.isArray(rows) ? rows[0] : null;
      return row ? json({ customer: safeOwnerRecord(row) }) : json({ error: "Business link not found." }, 404);
    }
    if (action === "owner-login") {
      const slug = String(body?.slug || "").trim().toLowerCase();
      const code = String(body?.code || "").trim().toUpperCase();
      if (!/^[a-z0-9-]{1,80}$/.test(slug) || !code) return json({ error: "Enter a valid link and access code." }, 400);
      const rows = await supabaseRequest("customers?select=*&slug=eq." + encodeURIComponent(slug) + "&limit=1");
      const row = Array.isArray(rows) ? rows[0] : null;
      if (!row || !row.owner_code || !constantTimeEqual(String(row.owner_code).toUpperCase(), code)) return json({ error: "Incorrect access code or link." }, 401);
      const token = await makeSession({ role: "owner", slug: row.slug }, sessionSecret);
      return json({ ok: true, customer: safeOwnerRecord(row) }, 200, { "set-cookie": sessionCookie(token) });
    }
    if (action === "member-signup") {
      const name = String(body?.name || "").trim().slice(0, 100);
      const phone = normalizePhone(body?.phone);
      if (name.length < 2 || phone.length < 7 || phone.length > 20) return json({ error: "Enter a valid name and phone number." }, 400);
      const code = randomAccessCode();
      const rows = await supabaseRequest("members", "POST", { name, phone, access_code: code });
      const row = Array.isArray(rows) ? rows[0] : null;
      if (!row) return json({ error: "Account could not be created." }, 500);
      const member = { id: row.id, name: row.name, phone: row.phone };
      const token = await makeSession({ role: "member", member }, sessionSecret);
      return json({ ok: true, member, accessCode: code }, 201, { "set-cookie": sessionCookie(token) });
    }
    if (action === "member-login") {
      const phone = normalizePhone(body?.phone);
      const code = String(body?.code || "").trim().toUpperCase();
      if (phone.length < 7 || !code) return json({ error: "Enter your phone and access code." }, 400);
      const rows = await supabaseRequest("members?select=id,name,phone,access_code&phone=eq." + encodeURIComponent(phone) + "&limit=1");
      const row = Array.isArray(rows) ? rows[0] : null;
      if (!row || !constantTimeEqual(String(row.access_code || "").toUpperCase(), code)) return json({ error: "No match found — check your phone and code." }, 401);
      const member = { id: row.id, name: row.name, phone: row.phone };
      const token = await makeSession({ role: "member", member }, sessionSecret);
      return json({ ok: true, member }, 200, { "set-cookie": sessionCookie(token) });
    }
    if (action === "owner-profile") {
      const session = await readSession(request, sessionSecret);
      const slug = String(body?.slug || "");
      if (!session || !["owner", "admin"].includes(session.role) || (session.role === "owner" && session.slug !== slug)) return json({ error: "Not authorized." }, 403);
      const rows = await supabaseRequest("customers?select=*&slug=eq." + encodeURIComponent(slug) + "&limit=1");
      return json({ customer: safeOwnerRecord(Array.isArray(rows) ? rows[0] : null) });
    }
    return json({ error: "Unknown action." }, 400);
  } catch (error) {
    const message = String(error?.message || "");
    if (message.toLowerCase().includes("duplicate key") || message.toLowerCase().includes("unique constraint")) return json({ error: "That phone is already registered — try logging in instead." }, 409);
    if (message.includes("Server authentication is not configured.")) return json({ error: message }, 503);
    return json({ error: "The request could not be completed. Check the server configuration and try again." }, 500);
  }
};
export const config = { rateLimit: { action: "rate_limit", aggregateBy: "ip", windowSize: 60, windowLimit: 30 } };
