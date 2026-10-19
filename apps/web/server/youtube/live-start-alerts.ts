import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { ObservedLiveFeed } from "../../features/live/domain/observed-live";
import { YOUTUBE_LIVE_MAX_AGE_MS } from "../../features/live/domain/youtube-channel";
import { loadServerEnv } from "../config/env";

type RpcClient = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ error: unknown }>;
};

export async function captureYouTubeLiveStarts(
  feed: ObservedLiveFeed,
  db: RpcClient,
  now = new Date(),
): Promise<void> {
  const observations = feed.items.flatMap((item) => {
    if (item.platform !== "youtube") return [];
    const videoId = /^https:\/\/www\.youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})$/.exec(item.watchUrl)?.[1];
    const age = now.getTime() - Date.parse(item.observedAt);
    if (!videoId || !Number.isFinite(age) || age < 0 || age >= YOUTUBE_LIVE_MAX_AGE_MS) return [];
    return [{ celebrity_slug: item.celebritySlug, video_id: videoId, observed_at: item.observedAt }];
  });
  if (observations.length === 0) return;
  const { error } = await db.rpc("capture_telegram_youtube_live_starts", { p_observations: observations });
  if (error) throw new Error("YOUTUBE_LIVE_ALERT_CAPTURE_FAILED");
}

export async function captureYouTubeLiveStartsFromEnvironment(feed: ObservedLiveFeed): Promise<void> {
  if (!feed.items.some((item) => item.platform === "youtube")) return;
  const env = loadServerEnv();
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(5_000) }) },
  });
  await captureYouTubeLiveStarts(feed, db);
}
