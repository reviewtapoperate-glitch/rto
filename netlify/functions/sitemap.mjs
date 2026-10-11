export default async () => {
  const readEnv = (name) => { try { return Netlify.env.get(name); } catch { return undefined; } };
  const baseUrl = (readEnv("URL") || "https://reviewtapoperate.netlify.app").replace(/\/$/, "");
  const supabaseUrl = readEnv("SUPABASE_URL") || "https://ptmznpjsgdkasvywufcx.supabase.co";
  const key = readEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!key) return new Response("Sitemap temporarily unavailable", { status: 503, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  try {
    const response = await fetch(supabaseUrl + "/rest/v1/customers?select=slug,created_at&listed_in_directory=eq.true&order=created_at.desc&limit=5000", {
      headers: { apikey: key, authorization: "Bearer " + key, "cache-control": "no-store" }
    });
    if (!response.ok) throw new Error("Business listing query failed");
    const rows = await response.json();
    const urls = [
      `<url><loc>${baseUrl}/</loc></url>`,
      ...(Array.isArray(rows) ? rows : []).filter(row => /^[a-z0-9-]{1,80}$/.test(String(row.slug || ""))).map(row => {
        const loc = baseUrl + "/?c=" + encodeURIComponent(row.slug);
        const lastmod = row.created_at ? `<lastmod>${new Date(row.created_at).toISOString()}</lastmod>` : "";
        return `<url><loc>${loc}</loc>${lastmod}</url>`;
      })
    ];
    const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>`;
    return new Response(xml, { status: 200, headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=900, s-maxage=900" } });
  } catch {
    return new Response("Sitemap temporarily unavailable", { status: 503, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  }
};
export const config = { path: "/sitemap.xml" };
