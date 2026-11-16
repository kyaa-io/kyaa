import { z } from "zod";
import { parseCanonicalChzzkChannelUrl } from "@/features/live/domain/chzzk-live";

/**
 * Official CHZZK Open API channel info: GET /open/v1/channels?channelIds=…, Client-Id/Client-Secret only (no user token),
 * `followerCount` (Int) per channel (https://chzzk.gitbook.io/chzzk/chzzk-api/channel, read 2026-11-16). One channel per call,
 * so the array encoding of `channelIds` never matters.
 */
const CHANNELS_ENDPOINT = "https://openapi.chzzk.naver.com/open/v1/channels";

const responseSchema = z.object({
  code: z.literal(200),
  content: z.object({ data: z.array(z.object({ channelId: z.string(), followerCount: z.number().int().min(0).optional() }).passthrough()) }),
}).passthrough();

export type ChzzkSource = { celebrity_id: string; url: string };
export type ChzzkDb = {
  sources(): Promise<ChzzkSource[]>;
  save(id: string, url: string, count: number, checkedAt: string): Promise<void>;
};
export type ChzzkCredentials = { clientId: string; clientSecret: string };

/** The exact follower count of one channel, or null when the answer is not about that channel or has no count (never 0 by guess). */
export function parseChzzkFollowerCount(payload: unknown, channelId: string): number | null {
  const parsed = responseSchema.safeParse(payload);
  if (!parsed.success) return null;
  const channel = parsed.data.content.data.find((item) => item.channelId === channelId);
  return channel?.followerCount !== undefined && Number.isSafeInteger(channel.followerCount) ? channel.followerCount : null;
}

export async function collectChzzkFollowers(db: ChzzkDb, credentials: ChzzkCredentials, fetcher: typeof fetch = fetch, now = () => new Date()) {
  let saved = 0, skipped = 0, failed = 0;
  for (const source of await db.sources()) {
    const channelId = parseCanonicalChzzkChannelUrl(source.url);
    if (!channelId) { skipped++; continue; }
    const url = new URL(CHANNELS_ENDPOINT);
    url.searchParams.set("channelIds", channelId);
    try {
      const response = await fetcher(url, {
        headers: { "Client-Id": credentials.clientId, "Client-Secret": credentials.clientSecret, "Content-Type": "application/json" },
        cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) { failed++; continue; }
      const count = parseChzzkFollowerCount(await response.json(), channelId);
      if (count === null) { skipped++; continue; }
      await db.save(source.celebrity_id, source.url, count, now().toISOString());
      saved++;
    } catch { failed++; }
  }
  return { saved, skipped, failed };
}
