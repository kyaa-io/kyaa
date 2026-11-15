import "server-only";
import { createClient } from "@/server/data/client";
import { loadServerEnv } from "@/server/config/env";

export async function kakaoRegistrationDisabledResponse(): Promise<Response | null> {
  const headers = { "cache-control": "no-store" };
  try {
    const env = loadServerEnv();
    const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await db.rpc("kakao_notification_delivery_enabled");
    if (error) throw error;
    if (data === true) return null;
    return Response.json({ error: { code: "KAKAO_REGISTRATION_DISABLED" }, retryable: false }, { status: 503, headers });
  } catch {
    return Response.json({ error: { code: "KAKAO_REGISTRATION_UNAVAILABLE" } }, { status: 503, headers });
  }
}
