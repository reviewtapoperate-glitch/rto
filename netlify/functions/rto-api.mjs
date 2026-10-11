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
async function hashCredential(value) {
  const pepper = env("RTO_CREDENTIAL_PEPPER");
  if (!pepper || pepper.length < 32) throw new Error("Credential hashing is not configured.");
  return "hmac-sha256:" + await sign("rto-credential:" + value, pepper);
}
async function supabaseRequest(path, method = "GET", body, prefer = "return=representation") {
  const url = env("SUPABASE_URL") || "https://ptmznpjsgdkasvywufcx.supabase.co";
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!key) throw new Error("Server authentication is not configured.");
  const response = await fetch(url + "/rest/v1/" + path, {
    method,
    headers: {
      apikey: key,
      authorization: "Bearer " + key,
      "content-type": "application/json",
      prefer
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
  const { owner_code, owner_code_hash, access_code, access_code_hash, ...safe } = row;
  return safe;
}
export async function handleRtoApi(request, context) {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405, { allow: "POST" });
  const sessionSecret = env("RTO_SESSION_SECRET");
  if (!sessionSecret || sessionSecret.length < 32) return json({ error: "Server authentication is not configured. Ask the administrator to configure the required Netlify environment variables." }, 503);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON request." }, 400); }
  const action = String(body?.action || "");
  const previewSafeActions = new Set(["session", "logout", "public-customer", "directory", "slug-exists", "owner-info", "reviews-list", "reviews-for-slugs"]);
  const deployContext = context?.deploy?.context;
  if (deployContext && deployContext !== "production" && !previewSafeActions.has(action)) {
    return json({ error: "Write and privileged actions are disabled on deploy previews. Use an isolated staging environment for functional tests." }, 403);
  }
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
    if (action === "business-signup") {
      const name = String(body?.name || "").trim().slice(0, 120);
      const businessType = String(body?.businessType || "").trim().slice(0, 80);
      const phone = normalizePhone(body?.phone);
      const slug = String(body?.slug || "").trim().toLowerCase();
      if (name.length < 2 || !businessType || phone.length < 7 || !/^[a-z0-9-]{1,80}$/.test(slug)) return json({ error: "Please complete the business name, type, phone, and link fields." }, 400);
      const code = randomAccessCode();
      const codeHash = await hashCredential(code);
      const rows = await supabaseRequest("customers", "POST", {
        slug, name, business_type: businessType, phone, owner_code: null, owner_code_hash: codeHash,
        portfolio: [], menu_items: [], social_links: [], portfolio_title: "Recent work", theme: "neon"
      });
      const row = Array.isArray(rows) ? rows[0] : null;
      if (!row) return json({ error: "Business page could not be created." }, 500);
      const token = await makeSession({ role: "owner", slug: row.slug }, sessionSecret);
      return json({ ok: true, customer: { ...safeOwnerRecord(row), owner_code: code } }, 201, { "set-cookie": sessionCookie(token) });
    }
    if (action === "admin-owner-code") {
      const session = await readSession(request, sessionSecret);
      if (!session || session.role !== "admin") return json({ error: "Administrator sign-in required." }, 403);
      const slug = String(body?.slug || "").trim().toLowerCase();
      if (!/^[a-z0-9-]{1,80}$/.test(slug)) return json({ error: "Invalid business link." }, 400);
      const rows = await supabaseRequest("customers?select=*&slug=eq." + encodeURIComponent(slug) + "&limit=1");
      const row = Array.isArray(rows) ? rows[0] : null;
      if (!row) return json({ error: "Business page not found." }, 404);
      const code = randomAccessCode();
      const codeHash = await hashCredential(code);
      await supabaseRequest("customers?slug=eq." + encodeURIComponent(slug), "PATCH", { owner_code: null, owner_code_hash: codeHash });
      return json({ ok: true, code });
    }
    if (action === "owner-info") {
      const slug = String(body?.slug || "").trim().toLowerCase();
      if (!/^[a-z0-9-]{1,80}$/.test(slug)) return json({ error: "Invalid business link." }, 400);
      const rows = await supabaseRequest("customers?select=*&slug=eq." + encodeURIComponent(slug) + "&limit=1");
      const row = Array.isArray(rows) ? rows[0] : null;
      return row ? json({ customer: safeOwnerRecord(row) }) : json({ error: "Business link not found." }, 404);
    }
    if (action === "owner-login-by-code") {
      const code = String(body?.code || "").trim().toUpperCase();
      if (!code) return json({ error: "Enter your access code." }, 400);
      const submittedHash = await hashCredential(code);
      const rows = await supabaseRequest("customers?select=*&or=(owner_code_hash.not.is.null,owner_code.not.is.null)&limit=1000");
      let row = Array.isArray(rows) ? rows.find(item =>
        item.owner_code_hash
          ? constantTimeEqual(String(item.owner_code_hash), submittedHash)
          : item.owner_code && constantTimeEqual(String(item.owner_code).toUpperCase(), code)
      ) : null;
      if (!row) return json({ error: "That access code doesn't match any account." }, 401);
      if (row.owner_code && !row.owner_code_hash) {
        await supabaseRequest("customers?slug=eq." + encodeURIComponent(row.slug), "PATCH", { owner_code_hash: submittedHash, owner_code: null });
      }
      const token = await makeSession({ role: "owner", slug: row.slug }, sessionSecret);
      return json({ ok: true, customer: safeOwnerRecord(row) }, 200, { "set-cookie": sessionCookie(token) });
    }
    if (action === "owner-login") {
      const slug = String(body?.slug || "").trim().toLowerCase();
      const code = String(body?.code || "").trim().toUpperCase();
      if (!/^[a-z0-9-]{1,80}$/.test(slug) || !code) return json({ error: "Enter a valid link and access code." }, 400);
      const rows = await supabaseRequest("customers?select=*&slug=eq." + encodeURIComponent(slug) + "&limit=1");
      const row = Array.isArray(rows) ? rows[0] : null;
      const submittedHash = await hashCredential(code);
      const hasHash = Boolean(row?.owner_code_hash);
      const hashValid = hasHash && constantTimeEqual(String(row.owner_code_hash), submittedHash);
      const legacyValid = !hasHash && row?.owner_code && constantTimeEqual(String(row.owner_code).toUpperCase(), code);
      if (!row || (!hashValid && !legacyValid)) return json({ error: "Incorrect access code or link." }, 401);
      if (legacyValid) {
        await supabaseRequest("customers?slug=eq." + encodeURIComponent(slug), "PATCH", { owner_code_hash: submittedHash, owner_code: null });
      }
      const token = await makeSession({ role: "owner", slug: row.slug }, sessionSecret);
      return json({ ok: true, customer: safeOwnerRecord(row) }, 200, { "set-cookie": sessionCookie(token) });
    }
    if (action === "member-signup") {
      const name = String(body?.name || "").trim().slice(0, 100);
      const phone = normalizePhone(body?.phone);
      if (name.length < 2 || phone.length < 7 || phone.length > 20) return json({ error: "Enter a valid name and phone number." }, 400);
      const code = randomAccessCode();
      const codeHash = await hashCredential(code);
      const rows = await supabaseRequest("members", "POST", { name, phone, access_code: null, access_code_hash: codeHash });
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
      const rows = await supabaseRequest("members?select=id,name,phone,access_code,access_code_hash&phone=eq." + encodeURIComponent(phone) + "&limit=1");
      const row = Array.isArray(rows) ? rows[0] : null;
      const submittedHash = await hashCredential(code);
      const hasHash = Boolean(row?.access_code_hash);
      const hashValid = hasHash && constantTimeEqual(String(row.access_code_hash), submittedHash);
      const legacyValid = !hasHash && row?.access_code && constantTimeEqual(String(row.access_code).toUpperCase(), code);
      if (!row || (!hashValid && !legacyValid)) return json({ error: "No match found — check your phone and code." }, 401);
      if (legacyValid) {
        await supabaseRequest("members?id=eq." + encodeURIComponent(row.id), "PATCH", { access_code_hash: submittedHash, access_code: null });
      }
      const member = { id: row.id, name: row.name, phone: row.phone };
      const token = await makeSession({ role: "member", member }, sessionSecret);
      return json({ ok: true, member }, 200, { "set-cookie": sessionCookie(token) });
    }
    if (action === "public-customer") {
      const slug = String(body?.slug || "").trim().toLowerCase();
      if (!/^[a-z0-9-]{1,80}$/.test(slug)) return json({ error: "Invalid business link." }, 400);
      const rows = await supabaseRequest("customers?select=*&slug=eq." + encodeURIComponent(slug) + "&limit=1");
      const row = Array.isArray(rows) ? rows[0] : null;
      return row ? json({ customer: safeOwnerRecord(row) }) : json({ error: "Business page not found." }, 404);
    }
    if (action === "directory") {
      const rows = await supabaseRequest("customers?select=*&listed_in_directory=eq.true&order=name.asc&limit=1000");
      return json({ customers: Array.isArray(rows) ? rows.map(safeOwnerRecord) : [] });
    }
    if (action === "slug-exists") {
      const slug = String(body?.slug || "").trim().toLowerCase();
      if (!/^[a-z0-9-]{1,80}$/.test(slug)) return json({ exists: false });
      const rows = await supabaseRequest("customers?select=slug&slug=eq." + encodeURIComponent(slug) + "&limit=1");
      return json({ exists: Array.isArray(rows) && rows.length > 0 });
    }
    if (action === "admin-customers-list") {
      const session = await readSession(request, sessionSecret);
      if (!session || session.role !== "admin") return json({ error: "Administrator sign-in required." }, 403);
      const rows = await supabaseRequest("customers?select=*&order=created_at.desc&limit=1000");
      return json({ customers: Array.isArray(rows) ? rows.map(safeOwnerRecord) : [] });
    }
    if (action === "customer-save") {
      const session = await readSession(request, sessionSecret);
      if (!session || !["admin", "owner"].includes(session.role)) return json({ error: "Sign-in required." }, 403);
      const incoming = body?.record;
      if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) return json({ error: "Invalid business profile." }, 400);
      const slug = session.role === "owner" ? session.slug : String(incoming.slug || "").trim().toLowerCase();
      if (!slug || !/^[a-z0-9-]{1,80}$/.test(slug)) return json({ error: "Invalid business link." }, 400);
      if (session.role === "owner" && incoming.slug && incoming.slug !== session.slug) return json({ error: "Business owners cannot change their page link. Contact RTO for help." }, 403);
      const allowed = ["name","business_type","title","phone","whatsapp_number","whatsapp_message","google_review_url","instagram","linkedin","till_number","till_label","portfolio","photo_url","background_url","menu_items","menu_image_url","portfolio_title","theme","social_links","is_open","connect_label","pay_label","menu_label","cover_style","cover_overlay","listed_in_directory","booking_guidelines","status_on_label","status_off_label","schedule","booking_label","address","maps_url"];
      const record = { slug };
      for (const key of allowed) if (Object.prototype.hasOwnProperty.call(incoming, key)) record[key] = incoming[key];
      if (!String(record.name || "").trim() || !String(record.business_type || "").trim()) return json({ error: "Business name and type are required." }, 400);
      if (session.role === "owner") {
        const exists = await supabaseRequest("customers?select=slug&slug=eq." + encodeURIComponent(slug) + "&limit=1");
        if (!Array.isArray(exists) || !exists.length) return json({ error: "Your business page could not be found." }, 404);
        const rows = await supabaseRequest("customers?slug=eq." + encodeURIComponent(slug), "PATCH", record);
        return json({ ok: true, customer: safeOwnerRecord(Array.isArray(rows) ? rows[0] : null) });
      }
      const rows = await supabaseRequest("customers?on_conflict=slug", "POST", record, "resolution=merge-duplicates,return=representation");
      return json({ ok: true, customer: safeOwnerRecord(Array.isArray(rows) ? rows[0] : null) });
    }
    if (action === "customer-delete") {
      const session = await readSession(request, sessionSecret);
      if (!session || session.role !== "admin") return json({ error: "Administrator sign-in required." }, 403);
      const slug = String(body?.slug || "").trim().toLowerCase();
      if (!/^[a-z0-9-]{1,80}$/.test(slug)) return json({ error: "Invalid business link." }, 400);
      await supabaseRequest("bookings?business_slug=eq." + encodeURIComponent(slug), "DELETE");
      await supabaseRequest("reviews?business_slug=eq." + encodeURIComponent(slug), "DELETE");
      await supabaseRequest("page_events?slug=eq." + encodeURIComponent(slug), "DELETE");
      await supabaseRequest("customers?slug=eq." + encodeURIComponent(slug), "DELETE");
      return json({ ok: true });
    }
    if (action === "reviews-list") {
      const slug = String(body?.slug || "").trim().toLowerCase();
      if (!/^[a-z0-9-]{1,80}$/.test(slug)) return json({ error: "Invalid business link." }, 400);
      const session = await readSession(request, sessionSecret);
      const rows = await supabaseRequest("reviews?select=id,business_slug,member_id,member_name,rating,comment,created_at&business_slug=eq." + encodeURIComponent(slug) + "&order=created_at.desc&limit=500");
      const ownId = session?.role === "member" ? session.member?.id : null;
      return json({ reviews: Array.isArray(rows) ? rows.map(r => ({ ...r, member_id: ownId && r.member_id === ownId ? r.member_id : null })) : [] });
    }
    if (action === "reviews-for-slugs") {
      const slugs = Array.isArray(body?.slugs) ? body.slugs.filter(x => typeof x === "string" && /^[a-z0-9-]{1,80}$/.test(x)).slice(0, 100) : [];
      if (!slugs.length) return json({ reviews: [] });
      const list = slugs.map(x => encodeURIComponent(x)).join(",");
      const rows = await supabaseRequest("reviews?select=business_slug,rating&business_slug=in.(" + list + ")&limit=2000");
      return json({ reviews: Array.isArray(rows) ? rows : [] });
    }
    if (action === "review-submit") {
      const session = await readSession(request, sessionSecret);
      if (!session || session.role !== "member" || !session.member?.id) return json({ error: "Please sign in first." }, 401);
      const slug = String(body?.slug || "").trim().toLowerCase();
      const rating = Number(body?.rating);
      const comment = String(body?.comment || "").trim().slice(0, 2000);
      if (!/^[a-z0-9-]{1,80}$/.test(slug) || !Number.isInteger(rating) || rating < 1 || rating > 5) return json({ error: "Choose a rating from 1 to 5." }, 400);
      const memberRows = await supabaseRequest("members?select=id,name&id=eq." + encodeURIComponent(session.member.id) + "&limit=1");
      const member = Array.isArray(memberRows) ? memberRows[0] : null;
      if (!member) return json({ error: "Member session is no longer valid. Please sign in again." }, 401);
      const rows = await supabaseRequest("reviews?on_conflict=business_slug,member_id", "POST", { business_slug: slug, member_id: member.id, member_name: member.name, rating, comment }, "resolution=merge-duplicates,return=representation");
      return json({ ok: true, review: Array.isArray(rows) ? rows[0] : null });
    }
    if (action === "booking-submit") {
      const name = String(body?.name || "").trim().slice(0, 120);
      const phone = normalizePhone(body?.phone);
      const slug = String(body?.slug || "").trim().toLowerCase();
      const item = String(body?.item || "").trim().slice(0, 250);
      const date = String(body?.date || "").trim().slice(0, 40);
      const time = String(body?.time || "").trim().slice(0, 40);
      const note = String(body?.note || "").trim().slice(0, 2000);
      const guidelinesAccepted = body?.guidelinesAccepted === true;
      if (!/^[a-z0-9-]{1,80}$/.test(slug) || name.length < 2 || phone.length < 7) return json({ error: "Enter your name and a valid phone number." }, 400);
      if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: "Choose a valid booking date." }, 400);
      if (time && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) return json({ error: "Choose a valid booking time." }, 400);
      const biz = await supabaseRequest("customers?select=slug,booking_guidelines&slug=eq." + encodeURIComponent(slug) + "&limit=1");
      if (!Array.isArray(biz) || !biz.length) return json({ error: "Business page not found." }, 404);
      if (String(biz[0].booking_guidelines || "").trim() && !guidelinesAccepted) return json({ error: "Please confirm the booking guidelines before submitting." }, 400);
      const session = await readSession(request, sessionSecret);
      const memberId = session?.role === "member" ? session.member?.id : null;
      const rows = await supabaseRequest("bookings", "POST", { business_slug: slug, member_id: memberId, customer_name: name, customer_phone: phone, item_requested: item, preferred_date: date, preferred_time: time, note, status: "pending" });
      return json({ ok: true, booking: Array.isArray(rows) ? rows[0] : null }, 201);
    }
    if (action === "bookings-list") {
      const session = await readSession(request, sessionSecret);
      const slug = String(body?.slug || "").trim().toLowerCase();
      if (!session || !["admin", "owner"].includes(session.role) || !/^[a-z0-9-]{1,80}$/.test(slug) || (session.role === "owner" && session.slug !== slug)) return json({ error: "Not authorized to view these bookings." }, 403);
      const rows = await supabaseRequest("bookings?select=*&business_slug=eq." + encodeURIComponent(slug) + "&order=created_at.desc&limit=500");
      return json({ bookings: Array.isArray(rows) ? rows : [] });
    }
    if (action === "booking-status") {
      const session = await readSession(request, sessionSecret);
      const id = String(body?.id || "").trim();
      const status = String(body?.status || "");
      if (!session || !["admin", "owner"].includes(session.role) || !/^\d+$/.test(id) || !["pending","confirmed","completed","cancelled","declined"].includes(status)) return json({ error: "Invalid booking update." }, 403);
      const current = await supabaseRequest("bookings?select=id,business_slug&id=eq." + encodeURIComponent(id) + "&limit=1");
      const booking = Array.isArray(current) ? current[0] : null;
      if (!booking || (session.role === "owner" && session.slug !== booking.business_slug)) return json({ error: "Not authorized to update this booking." }, 403);
      await supabaseRequest("bookings?id=eq." + encodeURIComponent(id), "PATCH", { status });
      return json({ ok: true });
    }
    if (action === "member-bookings") {
      const session = await readSession(request, sessionSecret);
      if (!session || session.role !== "member" || !session.member?.id) return json({ error: "Please sign in to view your bookings." }, 401);
      const rows = await supabaseRequest("bookings?select=*,customers(name)&member_id=eq." + encodeURIComponent(session.member.id) + "&order=created_at.desc&limit=500");
      return json({ bookings: Array.isArray(rows) ? rows : [] });
    }
    if (action === "analytics") {
      const session = await readSession(request, sessionSecret);
      const slug = String(body?.slug || "").trim().toLowerCase();
      if (!session || !["admin", "owner"].includes(session.role) || !/^[a-z0-9-]{1,80}$/.test(slug) || (session.role === "owner" && session.slug !== slug)) return json({ error: "Not authorized to view analytics." }, 403);
      const rows = await supabaseRequest("page_events?select=event_type,link_label&slug=eq." + encodeURIComponent(slug) + "&limit=5000");
      return json({ events: Array.isArray(rows) ? rows : [] });
    }
    if (action === "upload-image") {
      const session = await readSession(request, sessionSecret);
      const slug = String(body?.slug || "").trim().toLowerCase();
      const tag = String(body?.tag || "").trim().toLowerCase();
      const filename = String(body?.filename || "image").replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 100);
      const dataUrl = String(body?.dataUrl || "");
      if (!session || !["admin", "owner"].includes(session.role) || !/^[a-z0-9-]{1,80}$/.test(slug) || (session.role === "owner" && session.slug !== slug)) return json({ error: "Not authorized to upload to this business." }, 403);
      if (!/^[a-z0-9-]{1,40}$/.test(tag)) return json({ error: "Invalid image category." }, 400);
      const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
      if (!match) return json({ error: "Use a JPG, PNG, WEBP, or GIF image." }, 400);
      const binary = atob(match[2]);
      if (binary.length > 3 * 1024 * 1024) return json({ error: "Images must be 3 MB or smaller." }, 413);
      const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
      const signatureOk = match[1] === "image/png"
        ? bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((v, i) => bytes[i] === v)
        : match[1] === "image/jpeg" ? bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        : match[1] === "image/gif" ? bytes.length >= 6 && String.fromCharCode(...bytes.slice(0, 6)).startsWith("GIF8")
        : bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
      if (!signatureOk) return json({ error: "The selected file is not a valid image of the declared type." }, 400);
      const path = slug + "/" + tag + "-" + Date.now() + "-" + filename;
      const baseUrl = env("SUPABASE_URL") || "https://ptmznpjsgdkasvywufcx.supabase.co";
      const serviceKey = env("SUPABASE_SECRET_KEY") || env("SUPABASE_SERVICE_ROLE_KEY");
      if (!serviceKey) return json({ error: "Server storage is not configured." }, 503);
      const response = await fetch(baseUrl + "/storage/v1/object/rto-photos/" + path.split("/").map(encodeURIComponent).join("/"), {
        method: "POST",
        headers: { apikey: serviceKey, authorization: "Bearer " + serviceKey, "content-type": match[1], "x-upsert": "true" },
        body: bytes
      });
      if (!response.ok) return json({ error: "Image upload failed. Check file size and storage configuration." }, 400);
      return json({ ok: true, path, publicUrl: baseUrl + "/storage/v1/object/public/rto-photos/" + path.split("/").map(encodeURIComponent).join("/") }, 201);
    }
    if (action === "delete-image") {
      const session = await readSession(request, sessionSecret);
      const path = String(body?.path || "");
      const parts = path.split("/");
      if (!session || !["admin", "owner"].includes(session.role) || parts.length < 2 || parts.some(p => !p || p === "." || p === "..") || !/^[a-z0-9-]{1,80}$/.test(parts[0]) || (session.role === "owner" && session.slug !== parts[0])) return json({ error: "Not authorized to delete this image." }, 403);
      const baseUrl = env("SUPABASE_URL") || "https://ptmznpjsgdkasvywufcx.supabase.co";
      const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
      if (!serviceKey) return json({ error: "Server storage is not configured." }, 503);
      const response = await fetch(baseUrl + "/storage/v1/object/rto-photos", {
        method: "DELETE",
        headers: { apikey: serviceKey, authorization: "Bearer " + serviceKey, "content-type": "application/json" },
        body: JSON.stringify({ prefixes: [parts.slice(1).join("/")] })
      });
      if (!response.ok) return json({ error: "Image deletion failed." }, 400);
      return json({ ok: true });
    }
    if (action === "event-log") {
      const slug = String(body?.slug || "").trim().toLowerCase();
      const eventType = String(body?.eventType || "");
      const label = String(body?.label || "").trim().slice(0, 200);
      if (!/^[a-z0-9-]{1,80}$/.test(slug) || !["view","click"].includes(eventType)) return json({ ok: true });
      const exists = await supabaseRequest("customers?select=slug&slug=eq." + encodeURIComponent(slug) + "&limit=1");
      if (Array.isArray(exists) && exists.length) await supabaseRequest("page_events", "POST", { slug, event_type: eventType, link_label: label || null });
      return json({ ok: true });
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
    if (message.includes("Server authentication is not configured.") || message.includes("Credential hashing is not configured.")) return json({ error: message }, 503);
    return json({ error: "The request could not be completed. Check the server configuration and try again." }, 500);
  }
}
export default handleRtoApi;
export const config = { rateLimit: { action: "rate_limit", aggregateBy: "ip", windowSize: 60, windowLimit: 120 } };
