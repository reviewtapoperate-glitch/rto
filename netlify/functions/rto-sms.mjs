function recoveryEnv(name) {
  try { return Netlify.env.get(name); } catch { return undefined; }
}
export function isRecoverySmsConfigured(envGet = recoveryEnv) {
  return Boolean(envGet("AT_USERNAME") && envGet("AT_API_KEY"));
}
export async function sendRecoverySms({ phone, message, envGet = recoveryEnv, fetchImpl = fetch }) {
  const username = envGet("AT_USERNAME");
  const apiKey = envGet("AT_API_KEY");
  const senderId = envGet("AT_SENDER_ID");
  if (!username || !apiKey) return { ok: false, reason: "not_configured" };
  if (!/^\+254\d{9}$/.test(String(phone)) || !message || String(message).length > 480) {
    return { ok: false, reason: "invalid_message" };
  }
  const form = new URLSearchParams({ username, to: phone, message: String(message) });
  if (senderId) form.set("from", senderId);
  try {
    const response = await fetchImpl("https://api.africastalking.com/version1/messaging", {
      method: "POST",
      headers: { apiKey, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString()
    });
    if (!response.ok) return { ok: false, reason: "provider_error" };
    const data = await response.json();
    const recipients = data?.SMSMessageData?.Recipients;
    const accepted = Array.isArray(recipients) && recipients.some(item =>
      ["100", "101", "102"].includes(String(item?.statusCode))
    );
    return accepted ? { ok: true } : { ok: false, reason: "not_accepted" };
  } catch {
    return { ok: false, reason: "network_error" };
  }
}
