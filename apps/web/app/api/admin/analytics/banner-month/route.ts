import { createG6AnalyticsRouteDependencies } from "@/server/g6/analytics-route-dependencies";
import { loadServerEnv } from "@/server/config/env";
import { createClient } from "@/server/data/client";
import { AuthError } from "@/features/auth/domain/auth-errors";

export async function GET(request: Request) {
  const headers = { "cache-control": "private, no-store", vary: "Authorization" };
  try {
    const { authorize } = createG6AnalyticsRouteDependencies();
    const admin = await authorize({ authorization: request.headers.get("authorization") ?? "", correlationId: crypto.randomUUID() });
    const month = new URL(request.url).searchParams.get("month");
    if (!month || !/^20\d\d-(0[1-9]|1[012])$/.test(month)) return new Response(null, { status: 400, headers });
    const env = loadServerEnv();
    const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await db.rpc("read_admin_banner_month", {
      p_actor: admin.appUserId, p_allowlist: admin.allowlistId, p_month: month + "-01",
    });
    if (error) throw error;
    return Response.json(data, { headers });
  } catch (error) {
    return new Response(null, { status: error instanceof AuthError ? error.status : 503, headers });
  }
}
