import { z } from "zod";
import { authorTierRequestHeaders, publicAuthorTierSchema } from "@/features/rewards/domain/public-author-tier";

type Rpc = (name: string, args: Record<string, unknown>) => Promise<unknown>;
type RecordValue = Record<string, unknown>;
const row = (value: unknown): RecordValue | undefined =>
  value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : undefined;
const rows = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const tiers = z.array(z.object({ kind: z.enum(["post", "comment", "profile"]), id: z.uuid(), tier: publicAuthorTierSchema }));

export async function withAuthorTiers(rpc: Rpc, name: string, args: RecordValue, data: unknown, request?: Request) {
  // Older tabs still validate nested author and leaderboard rows with strict schemas.
  if (request?.headers.get("X-Kyaa-Author-Tiers") !== authorTierRequestHeaders["X-Kyaa-Author-Tiers"]) return data;
  const result = row(data);
  if (!result) return data;
  const targets: { kind: "post" | "comment" | "profile"; id: string; field: RecordValue }[] = [];
  const add = (kind: typeof targets[number]["kind"], value: unknown) => {
    const item = row(value);
    if (!item) return;
    const id = kind === "profile" ? item.profileId : item.id;
    const field = kind === "profile" ? item : row(item.author);
    if (typeof id === "string" && field) targets.push({ kind, id, field });
  };
  switch (name) {
    case "read_fan_post":
      add("post", result.post);
      break;
    case "read_fan_posts":
    case "read_fan_post_period_ranking":
    case "read_fan_program_posts":
      rows(result.items).forEach(item => add("post", item));
      break;
    case "read_fan_post_comments":
    case "read_fan_post_comments_replies":
      rows(result.items).forEach(item => add("comment", item));
      break;
    case "read_unified_creator_feed":
      for (const entry of rows(result.entries)) {
        const item = row(row(entry)?.item);
        if (item?.kind === "fan_post") add("post", item);
      }
      break;
    case "read_celebrity_fan_leaderboard":
      rows(result.rows).forEach(item => add("profile", item));
      add("profile", result.me);
      break;
  }
  if (!targets.length) return data;
  const ids = (kind: typeof targets[number]["kind"]) =>
    [...new Set(targets.filter(target => target.kind === kind).map(target => target.id))];
  const matches = tiers.parse(await rpc("read_public_author_passport_tiers", {
    p_post_ids: ids("post"),
    p_comment_ids: ids("comment"),
    p_profile_ids: ids("profile"),
    p_slug: args.p_slug ?? null,
  }));
  const byReference = new Map(matches.map(match => [`${match.kind}:${match.id}`, match.tier]));
  for (const target of targets) {
    const tier = byReference.get(`${target.kind}:${target.id}`);
    if (tier) target.field.tier = tier;
  }
  return data;
}
