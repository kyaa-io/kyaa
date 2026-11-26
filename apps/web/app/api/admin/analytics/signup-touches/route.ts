import { AuthError } from "@/features/auth/domain/auth-errors";
import { signupTouchesSchema } from "@/features/analytics/domain/signup-touches";
import { createG6AnalyticsRouteDependencies } from "@/server/g6/analytics-route-dependencies";
import { loadServerEnv } from "@/server/config/env";
import { createClient } from "@/server/data/client";

export const dynamic = "force-dynamic";

const headers = { "cache-control": "private, no-store", vary: "Authorization" };
const failure = (status: number, code: string) => Response.json({ error: { code } }, { status, headers });

export async function GET(request: Request) {
  try {
    const { authorize } = createG6AnalyticsRouteDependencies();
    const admin = await authorize({ authorization: request.headers.get("authorization") ?? "", correlationId: crypto.randomUUID() });
    const params = new URL(request.url).searchParams;
    const input = params.get("days") ?? "7";
    if ([...params.keys()].some((key) => key !== "days" || params.getAll(key).length !== 1) || !/^(7|30|90)$/.test(input)) {
      return failure(400, "INVALID_QUERY");
    }
    const environment = loadServerEnv();
    const database = createClient(environment.SUPABASE_URL, environment.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const { data, error } = await database.rpc("read_admin_signup_touches", {
      p_actor_app_user_id: admin.appUserId, p_actor_admin_allowlist_id: admin.allowlistId, p_days: Number(input),
    });
    const parsed = signupTouchesSchema.safeParse(data);
    if (error || !parsed.success) return failure(503, "SIGNUP_TOUCHES_UNAVAILABLE");
    return Response.json(parsed.data, { status: 200, headers });
  } catch (error) {
    if (error instanceof AuthError) return failure(error.status, error.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN");
    return failure(503, "SIGNUP_TOUCHES_UNAVAILABLE");
  }
}
