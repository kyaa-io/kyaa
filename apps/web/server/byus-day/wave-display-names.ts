import "server-only";
import { z } from "zod";
import { decryptParticipationName, parseParticipationKey } from "./participation-crypto";

type Rpc = (name: string, args: Record<string, unknown>) => Promise<unknown>;
const reads = new Set([
  "read_fan_posts", "read_fan_post", "read_fan_post_comments", "read_unified_creator_feed", "read_fan_program_posts",
  "read_celebrity_notice_comments", "read_celebrity_cheers", "read_celebrity_cheer_replies", "read_celebrity_fan_community", "read_celebrity_fan_leaderboard",
  "read_kyaa_wave_albums", "kyaa_wave_album_json", "read_mobile_content_fan_clip", "read_mobile_content_fan_clips", "read_mobile_content_clip_comments",
  "read_owned_kyaa_wave_friends", "resolve_kyaa_wave_profile_link",
  "read_owned_kyaa_wave_draw", "save_owned_kyaa_wave_draw_preferences", "read_admin_kyaa_wave_draw", "execute_admin_kyaa_wave_draw", "reveal_admin_kyaa_wave_draw",
  "read_owned_kyaa_wave_participation", "submit_kyaa_wave_participation",
  "read_admin_wave_stage", "execute_admin_wave_stage_draw",
]);
const encryptedRows = z.array(z.object({ kind: z.string(), id: z.string(), appUserId: z.uuid(), nameEncrypted: z.string() })).max(500);

// References come only from an authorized read result, never from request profile IDs.
export async function withWaveDisplayNames(rpc: Rpc, name: string, args: Record<string, unknown>, data: unknown, getKey = () => parseParticipationKey(process.env.KYAA_WAVE_PARTICIPATION_ENCRYPTION_KEY)): Promise<unknown> {
  if (!reads.has(name) || (args.p_slug && args.p_slug !== "kyaa-wave-fanpage")) return data;
  const viewer = args.p_app_user_id ?? args.p_actor_app_user_id;
  if (typeof viewer !== "string") return data;
  const targets: { kind: string; id: string; object: Record<string, unknown>; field: string }[] = [];
  const add = (kind: string, id: unknown, object: Record<string, unknown>, field: string) => {
    if (typeof id === "string" && typeof object[field] === "string") targets.push({ kind, id, object, field });
  };
  const visit = (value: unknown, inheritedKind = "fan_post") => {
    if (Array.isArray(value)) { value.forEach(item => visit(item, inheritedKind)); return; }
    if (!value || typeof value !== "object") return;
    const object = value as Record<string, unknown>;
    const kind = object.kind === "cheer" ? "cheer" : object.clipId ? "fan_clip_comment" : object.postId ? "fan_post_comment" : inheritedKind;
    if (object.author && typeof object.author === "object") add(kind, object.id, object.author as Record<string, unknown>, "nickname");
    if (!object.isOfficial) add(object.profileId ? "profile" : kind, object.profileId ?? object.id, object, "nickname");
    if (object.parentNickname) add("notice_comment", object.parentId, object, "parentNickname");
    if (object.__waveNameReference) {
      add(object.displayName ? "stage" : "draw", object.__waveNameReference, object, object.displayName ? "displayName" : "nickname");
      delete object.__waveNameReference;
    }
    for (const [key, child] of Object.entries(object)) {
      if (key === "author") continue;
      visit(child, key === "commentPreview" ? "fan_clip_comment" : key === "profile" ? "profile" : kind);
    }
  };
  const defaultKind = name.includes("notice_comments") ? "notice_comment" : name.includes("cheer") || name === "read_celebrity_fan_community" ? "cheer" : name.includes("clip_comments") ? "fan_clip_comment" : name.includes("clip") || name.includes("album") ? "fan_clip" : name === "read_fan_post_comments" ? "fan_post_comment" : "fan_post";
  // Avoid mutating the database client's response while applying the presentation projection.
  const result = structuredClone(data);
  if (name === "read_owned_kyaa_wave_participation" || name === "submit_kyaa_wave_participation") {
    const receipt = (result as { participation?: Record<string, unknown> } | null)?.participation;
    if (receipt) { receipt.displayName = ""; add("self", viewer, receipt, "displayName"); }
  }
  visit(result, defaultKind);
  const references = [...new Map(targets.map(target => [`${target.kind}:${target.id}`, { kind: target.kind, id: target.id }])).values()];
  if (!references.length) return result;
  if (references.length > 500) throw new Error("PARTICIPATION_UNAVAILABLE");
  const rows = encryptedRows.parse(await rpc("read_kyaa_wave_display_names", { p_app_user_id: viewer, p_references: references, p_admin_allowlist_id: args.p_actor_admin_allowlist_id ?? null }));
  if (!rows.length) return result;
  const key = getKey();
  const names = new Map(rows.map(row => [`${row.kind}:${row.id}`, decryptParticipationName(row.nameEncrypted, row.appUserId, key)]));
  for (const target of targets) {
    const displayName = names.get(`${target.kind}:${target.id}`);
    if (displayName) target.object[target.field] = displayName;
  }
  return result;
}
