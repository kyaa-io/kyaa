import { describe, expect, it, vi } from "vitest";
import { withWaveDisplayNames } from "./wave-display-names";
import { encryptParticipationName, parseParticipationKey } from "./participation-crypto";
vi.mock("server-only", () => ({}));
const viewer = "aa000000-0000-4000-8000-000000000001";
const author = "aa000000-0000-4000-8000-000000000002";
const id = "aa000000-0000-4000-8000-000000000003";
const key = parseParticipationKey("12".repeat(32));
const row = (kind: string, reference = id) => ({ kind, id: reference, appUserId: author, nameEncrypted: encryptParticipationName("김보석", author, key) });
const args = { p_app_user_id: viewer, p_slug: "kyaa-wave-fanpage" };
describe("Wave checked-in name projection", () => {
 it("replaces only the Wave author's nickname in a mixed feed in one batch", async () => {
  const source = { items: [{ kind: "fan_post", id, author: { nickname: "slowafternoon" } }, { kind: "cheer", id: author, nickname: "global nickname" }] };
  const rpc = vi.fn().mockResolvedValue([row("fan_post")]);
  const result = await withWaveDisplayNames(rpc, "read_unified_creator_feed", args, source, () => key);
  expect(result).toEqual({ items: [{ kind: "fan_post", id, author: { nickname: "김보석" } }, source.items[1]] });
  expect(source.items[0].author?.nickname).toBe("slowafternoon");
  expect(rpc).toHaveBeenCalledOnce();
  expect(JSON.stringify(result)).not.toMatch(/nameEncrypted|appUserId|v1\./);
 });
 it.each([
  ["read_fan_post_comments", { items: [{ id, postId: author, author: { nickname: "old" } }] }, "fan_post_comment"],
  ["read_celebrity_cheer_replies", { replies: [{ id, nickname: "old" }] }, "cheer"],
  ["read_kyaa_wave_albums", { items: [{ id, author: { nickname: "old" }, commentPreview: { id: author, clipId: id, author: { nickname: "old" } } }] }, "fan_clip"],
  ["kyaa_wave_album_json", { id, author: { nickname: "old" }, commentPreview: { id: author, clipId: id, author: { nickname: "old" } } }, "fan_clip"],
  ["read_mobile_content_clip_comments", { items: [{ id, clipId: author, author: { nickname: "old" } }] }, "fan_clip_comment"],
  ["read_owned_kyaa_wave_friends", { friendships: [{ id: author, profileId: id, nickname: "old" }] }, "profile"],
  ["read_owned_kyaa_wave_members", { members: [{ profileId: id, nickname: "old" }], nextCursor: null }, "profile"],
  ["resolve_kyaa_wave_profile_link", { profile: { id, nickname: "old" } }, "profile"],
  ["read_celebrity_fan_leaderboard", { rows: [{ profileId: id, nickname: "old" }] }, "profile"],
 ])("decorates %s using its entity reference", async (name, source, kind) => {
  const rpc = vi.fn().mockResolvedValue([row(kind)]);
  expect(JSON.stringify(await withWaveDisplayNames(rpc, name, args, source, () => key))).toContain("김보석");
  expect(rpc.mock.calls[0][1].p_references).toContainEqual({ kind, id });
 });
 it("decorates parent mentions and preserves official authors", async () => {
  const source = { comments: [{ id, nickname: "old", parentId: author, parentNickname: "parent" }, { id: viewer, nickname: "Official", isOfficial: true }] };
  const rpc = vi.fn().mockResolvedValue([row("notice_comment"), row("notice_comment", author)]);
  const result = await withWaveDisplayNames(rpc, "read_celebrity_notice_comments", args, source, () => key);
  expect(result).toEqual({ comments: [{ id, nickname: "김보석", parentId: author, parentNickname: "김보석" }, source.comments[1]] });
  expect(rpc.mock.calls[0][1].p_references).not.toContainEqual({ kind: "notice_comment", id: viewer });
 });
 it("returns the stored check-in display name in the owner's receipt", async () => {
  const rpc = vi.fn().mockResolvedValue([row("self", viewer)]);
  expect(await withWaveDisplayNames(rpc, "read_owned_kyaa_wave_participation", args, { participation: { id } }, () => key)).toEqual({ participation: { id, displayName: "김보석" } });
 });
 it("decorates draw winners without adding participant identifiers to their response", async () => {
  const rpc = vi.fn().mockResolvedValue([row("draw", `${id}:${author}`)]);
  const source = { published: [{ prizeKey: "camera", winners: [{ nickname: "old", avatarUrl: "avatar", __waveNameReference: `${id}:${author}` }] }] };
  expect(await withWaveDisplayNames(rpc, "read_owned_kyaa_wave_draw", args, source, () => key)).toEqual({ published: [{ prizeKey: "camera", winners: [{ nickname: "김보석", avatarUrl: "avatar" }] }] });
 });
 it("does not look up anonymous, non-Wave, or unlisted reads", async () => {
  const rpc = vi.fn(), source = { id, nickname: "slowafternoon" };
  for (const [name, input] of [["read_celebrity_cheers", {}], ["read_celebrity_cheers", { ...args, p_slug: "other" }], ["read_owned_social_profile", args]] as const) expect(await withWaveDisplayNames(rpc, name, input, source)).toBe(source);
  expect(rpc).not.toHaveBeenCalled();
 });
 it("keeps nonparticipant results unchanged and never loads a key", async () => {
  const rpc = vi.fn().mockResolvedValue([]), getKey = vi.fn(), source = { id, nickname: "old" };
  expect(await withWaveDisplayNames(rpc, "read_celebrity_cheers", args, source, getKey)).toEqual(source);
  expect(getKey).not.toHaveBeenCalled();
 });
 it("strips stable winner references even when the name lookup returns no rows", async () => {
  const rpc = vi.fn().mockResolvedValue([]);
  const source = { published: [{ prizeKey: "camera", winners: [{ nickname: "팬", __waveNameReference: `${id}:${author}` }] }] };
  const result = await withWaveDisplayNames(rpc, "read_owned_kyaa_wave_draw", args, source);
  expect(result).toEqual({ published: [{ prizeKey: "camera", winners: [{ nickname: "팬" }] }] });
  expect(JSON.stringify(result)).not.toContain(author);
 });
 it("never matches a different winner when visibility changes between the two reads", async () => {
  const rpc = vi.fn().mockResolvedValue([row("draw", `${id}:${viewer}`)]);
  const source = { published: [{ prizeKey: "camera", winners: [{ nickname: "A", __waveNameReference: `${id}:${author}` }] }] };
  expect(await withWaveDisplayNames(rpc, "read_owned_kyaa_wave_draw", args, source, () => key)).toEqual({ published: [{ prizeKey: "camera", winners: [{ nickname: "A" }] }] });
 });
 it("fails closed on corrupt ciphertext and never returns a partly decorated result", async () => {
  const rpc = vi.fn().mockResolvedValue([{ ...row("fan_post"), nameEncrypted: "invalid" }]);
  await expect(withWaveDisplayNames(rpc, "read_fan_post", args, { id, author: { nickname: "old" } }, () => key)).rejects.toThrow();
 });
});
