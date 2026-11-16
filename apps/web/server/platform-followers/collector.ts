import { z } from "zod";
import { parseFollowerInput } from "@/features/rankings/domain/platform-followers";
import { parseAccountUrl, snsIngestPlatforms } from "@/server/sns-ingest/source-url";

/** One profile reading: `text` is the follower number exactly as the official profile screen shows it ("428.3만", "20868849", "5,432"). */
export const platformFollowersRequestSchema = z.object({
  items: z.array(z.object({
    celebritySlug: z.string().regex(/^[a-z0-9][a-z0-9.-]{0,99}$/i),
    platform: z.enum(snsIngestPlatforms),
    accountUrl: z.string().max(300),
    text: z.string().min(1).max(40),
  }).strict()).min(1).max(100),
}).strict();
export type PlatformFollowersRequest = z.infer<typeof platformFollowersRequestSchema>;

type Item = { celebritySlug: string; platform: string; status: "saved" | "skipped" | "failed"; reason?: string };
export type Deps = { rpc(name: string, args: Record<string, unknown>): Promise<unknown>; now(): Date };

const contextSchema = z.object({ celebrityId: z.uuid(), accountUrl: z.string() }).strict().nullable();

/** Saves only readings of the creator's currently active official account; the database also keeps manual rows and newer readings. */
export async function savePlatformFollowers(deps: Deps, request: PlatformFollowersRequest) {
  const checkedAt = deps.now().toISOString();
  const items: Item[] = [];
  for (const reading of request.items) {
    const base = { celebritySlug: reading.celebritySlug, platform: reading.platform };
    // Unreadable wording is skipped, never written as 0.
    const parsed = parseFollowerInput(reading.text);
    if (!parsed) { items.push({ ...base, status: "skipped", reason: "COUNT_UNREADABLE" }); continue; }
    try {
      const context = contextSchema.parse(await deps.rpc("sns_ingest_source_context", { p_celebrity_slug: reading.celebritySlug, p_platform: reading.platform }));
      const active = context && parseAccountUrl(reading.platform, context.accountUrl);
      const read = parseAccountUrl(reading.platform, reading.accountUrl);
      if (!context || !active || !read || read.handle !== active.handle) { items.push({ ...base, status: "skipped", reason: "SOURCE_NOT_ACTIVE" }); continue; }
      const saved = z.boolean().parse(await deps.rpc("save_collected_platform_followers", {
        p_celebrity: context.celebrityId, p_platform: reading.platform, p_source_url: context.accountUrl,
        p_count: parsed.count, p_digits: parsed.digits, p_text: parsed.sourceText, p_checked_at: checkedAt,
      }));
      items.push(saved ? { ...base, status: "saved" } : { ...base, status: "skipped", reason: "KEPT_EXISTING" });
    } catch {
      items.push({ ...base, status: "failed" });
    }
  }
  const count = (status: Item["status"]) => items.filter(item => item.status === status).length;
  return { saved: count("saved"), skipped: count("skipped"), failed: count("failed"), items };
}
