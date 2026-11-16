import { createClient } from "@/server/data/client";
import { loadServerEnv } from "@/server/config/env";
import { constantTimeEqual } from "@/server/instagram/crypto";
import { collectYouTubeShorts } from "@/server/youtube-shorts/collector";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const secret = process.env.SNS_INGEST_SECRET;
  if (!secret || secret.length < 32) return Response.json({ error: "NOT_CONFIGURED" }, { status: 503 });
  if (!constantTimeEqual(request.headers.get("authorization") ?? "", `Bearer ${secret}`))
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const key = process.env.YOUTUBE_DATA_API_KEY;
  if (!key) return Response.json({ error: "YOUTUBE_NOT_CONFIGURED" }, { status: 503 });
  try {
    const env = loadServerEnv();
    const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const result = await collectYouTubeShorts({
      async sources() {
        const { data, error } = await client.from("celebrity_social_links").select("celebrity_id,url").eq("platform", "youtube").eq("active", true);
        if (error) throw error;
        return data ?? [];
      },
      async stale(before) {
        const { data, error } = await client.rpc("read_collected_youtube_shorts_due", { p_before: before });
        if (error) throw error;
        return data ?? [];
      },
      async save(id, url, video, checkedAt) {
        const { error } = await client.rpc("save_collected_youtube_shorts", { p_celebrity: id, p_source_url: url,
          p_video_id: video.id, p_title: video.snippet.title.slice(0, 300), p_published_at: video.snippet.publishedAt, p_checked_at: checkedAt });
        if (error) throw error;
      },
      async check(videoId, unavailable, checkedAt) {
        const { error } = await client.rpc("check_collected_youtube_short", { p_video_id: videoId, p_unavailable: unavailable, p_checked_at: checkedAt });
        if (error) throw error;
      },
    }, key);
    return Response.json(result, { status: result.failed ? 503 : 200, headers: { "cache-control": "private, no-store" } });
  } catch {
    return Response.json({ error: "COLLECT_FAILED" }, { status: 503 });
  }
}
