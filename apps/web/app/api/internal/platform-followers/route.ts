import { boundedJson } from "@/server/certification/certification-http";
import { createClient } from "@/server/data/client";
import { loadServerEnv } from "@/server/config/env";
import { constantTimeEqual } from "@/server/instagram/crypto";
import { platformFollowersRequestSchema, savePlatformFollowers } from "@/server/platform-followers/collector";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const headers = { "cache-control": "private, no-store" };

/** Weekly Instagram/TikTok follower readings from the SNS collector (same dedicated key as sns-ingest). */
export async function POST(request: Request) {
  const secret = process.env.SNS_INGEST_SECRET;
  if (!secret || secret.length < 32) return Response.json({ error: "NOT_CONFIGURED" }, { status: 503, headers });
  if (!constantTimeEqual(request.headers.get("authorization") ?? "", `Bearer ${secret}`))
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401, headers });
  const body = platformFollowersRequestSchema.safeParse(await boundedJson(request, 64 * 1024).catch(() => null));
  if (!body.success) return Response.json({ error: "INVALID_REQUEST" }, { status: 400, headers });
  try {
    const env = loadServerEnv();
    const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const result = await savePlatformFollowers({
      async rpc(name, args) {
        const { data, error } = await client.rpc(name, args);
        if (error) throw error;
        return data;
      },
      now: () => new Date(),
    }, body.data);
    return Response.json(result, { status: result.failed ? 503 : 200, headers });
  } catch {
    return Response.json({ error: "COLLECT_FAILED" }, { status: 503, headers });
  }
}
