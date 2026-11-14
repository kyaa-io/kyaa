import { parseYouTubeChannelUrl } from "@/features/live/domain/youtube-channel";

export type Source = { celebrity_id: string; url: string };
export type Db = {
  sources(): Promise<Source[]>;
  save(id: string, url: string, count: number, checkedAt: string): Promise<void>;
};

export function parseSubscriberCount(payload: unknown, requestedId?: string): number | null {
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { items?: unknown }).items)) return null;
  const items = (payload as { items: unknown[] }).items;
  if (items.length !== 1 || !items[0] || typeof items[0] !== "object") return null;
  const item = items[0] as { id?: unknown; statistics?: { hiddenSubscriberCount?: unknown; subscriberCount?: unknown } };
  if (requestedId && item.id !== requestedId) return null;
  if (item.statistics?.hiddenSubscriberCount === true) return null;
  const raw = item.statistics?.subscriberCount;
  if (typeof raw !== "string" || !/^(0|[1-9]\d*)$/.test(raw)) return null;
  const count = Number(raw);
  if (!Number.isSafeInteger(count)) return null;
  const magnitude = Math.max(0, raw.length - 3);
  return Math.floor(count / 10 ** magnitude) * 10 ** magnitude;
}

export async function collectYouTubeFollowers(db: Db, key: string, fetcher: typeof fetch = fetch, now = () => new Date()) {
  const sources = await db.sources();
  let saved = 0, skipped = 0, failed = 0;
  for (const source of sources) {
    const target = parseYouTubeChannelUrl(source.url);
    if (!target) { skipped++; continue; }
    const url = new URL("https://www.googleapis.com/youtube/v3/channels");
    url.search = new URLSearchParams({ part: "statistics", [target.kind === "id" ? "id" : "forHandle"]: target.value, key }).toString();
    try {
      const response = await fetcher(url, { cache: "no-store", signal: AbortSignal.timeout(15000) });
      if (!response.ok) { failed++; continue; }
      const count = parseSubscriberCount(await response.json(), target.kind === "id" ? target.value : undefined);
      if (count === null) { skipped++; continue; }
      await db.save(source.celebrity_id, source.url, count, now().toISOString());
      saved++;
    } catch { failed++; }
  }
  return { saved, skipped, failed };
}
