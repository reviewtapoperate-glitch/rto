import { handleRtoApi } from "./rto-api.mjs";

const AUTH_ACTIONS = new Set([
  "admin-login",
  "owner-login",
  "owner-login-by-code",
  "member-signup",
  "member-login",
  "business-signup",
  "admin-owner-code",
  "session",
  "logout"
]);

export default async (request, context) => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed." }), {
      status: 405,
      headers: { "content-type": "application/json; charset=utf-8", allow: "POST", "cache-control": "no-store" }
    });
  }
  let body;
  try { body = await request.clone().json(); } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON request." }), {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
    });
  }
  if (!AUTH_ACTIONS.has(String(body?.action || ""))) {
    return new Response(JSON.stringify({ error: "Unknown authentication action." }), {
      status: 404,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
    });
  }
  return handleRtoApi(request, context);
};

export const config = {
  rateLimit: { action: "rate_limit", aggregateBy: "ip", windowSize: 60, windowLimit: 15 }
};
