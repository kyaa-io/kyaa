import { loadServerEnv } from "../../../../server/config/env";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const headers = { "cache-control": "no-store" };
  try {
    const env = loadServerEnv();
    const postgrestUrl = process.env.POSTGREST_URL;
    const postgrestToken = process.env.POSTGREST_SERVICE_TOKEN;
    if (Boolean(postgrestUrl) !== Boolean(postgrestToken)) throw new Error("Incomplete database configuration");
    let base: string;
    let connectionHeaders: Record<string, string>;
    if (postgrestUrl && postgrestToken) {
      base = postgrestUrl;
      connectionHeaders = { authorization: `Bearer ${postgrestToken}` };
    } else {
      if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Database connection not configured");
      base = `${env.SUPABASE_URL}/rest/v1`;
      connectionHeaders = { authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, apikey: env.SUPABASE_SERVICE_ROLE_KEY };
    }
    const url = new URL(`${base.replace(/\/$/, "")}/app_users`);
    url.search = "select=id&limit=0";
    const response = await fetch(url, {
      headers: connectionHeaders,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok) throw new Error("Database unavailable");
    await response.body?.cancel();
    return Response.json({ status: "ready" }, { headers });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503, headers });
  }
}
