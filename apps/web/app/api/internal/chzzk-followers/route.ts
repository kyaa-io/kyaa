import { createClient } from "@/server/data/client";
import { loadServerEnv } from "@/server/config/env";
import { constantTimeEqual } from "@/server/instagram/crypto";
import { collectChzzkFollowers } from "@/server/platform-followers/chzzk";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const headers = { "cache-control": "private, no-store" };

/** Weekly CHZZK follower counts from the official Open API, called by the SNS collector with its dedicated key. */
export async function POST(request: Request) {
  const secret = process.env.SNS_INGEST_SECRET;
  if (!secret || secret.length < 32) return Response.json({ error: "NOT_CONFIGURED" }, { status: 503, headers });
  if (!constantTimeEqual(request.headers.get("authorization") ?? "", `Bearer ${secret}`))
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401, headers });
  try {
    const env = loadServerEnv();
    if (!env.CHZZK_CLIENT_ID || !env.CHZZK_CLIENT_SECRET) return Response.json({ error: "CHZZK_NOT_CONFIGURED" }, { status: 503, headers });
    const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const result = await collectChzzkFollowers({
      async sources() {
        const { data, error } = await client.from("celebrity_social_links").select("celebrity_id,url").eq("platform", "chzzk").eq("active", true);
        if (error) throw error;
        return data ?? [];
      },
      async save(id, url, count, checkedAt) {
        const { error } = await client.rpc("save_collected_platform_followers", {
          p_celebrity: id, p_platform: "chzzk", p_source_url: url, p_count: count, p_digits: null, p_text: null, p_checked_at: checkedAt,
        });
        if (error) throw error;
      },
    }, { clientId: env.CHZZK_CLIENT_ID, clientSecret: env.CHZZK_CLIENT_SECRET });
    return Response.json(result, { status: result.failed ? 503 : 200, headers });
  } catch {
    return Response.json({ error: "COLLECT_FAILED" }, { status: 503, headers });
  }
}
