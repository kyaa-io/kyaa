import { describe, expect, it } from "vitest";
import { platformFollowersRequestSchema, savePlatformFollowers, type Deps } from "./collector";

const artist = "fa400000-0000-4000-8000-0000000000d1";
function deps(accountUrl: string | null, saved = true) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const value: Deps = {
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === "sns_ingest_source_context") return accountUrl ? { celebrityId: artist, accountUrl } : null;
      if (name === "save_collected_platform_followers") return saved;
      throw new Error("unexpected");
    },
    now: () => new Date("2026-11-16T00:00:00Z"),
  };
  return { value, calls };
}
const reading = (text: string, accountUrl = "https://www.instagram.com/aryeomii/") =>
  platformFollowersRequestSchema.parse({ items: [{ celebritySlug: "aryeom", platform: "instagram", accountUrl, text }] });

describe("savePlatformFollowers", () => {
  it("keeps the screen wording of a rounded count", async () => {
    const { value, calls } = deps("https://www.instagram.com/aryeomii");
    expect(await savePlatformFollowers(value, reading("428.3만"))).toMatchObject({ saved: 1, failed: 0 });
    expect(calls[1]).toEqual({ name: "save_collected_platform_followers", args: {
      p_celebrity: artist, p_platform: "instagram", p_source_url: "https://www.instagram.com/aryeomii",
      p_count: 4283000, p_digits: 4, p_text: "428.3만", p_checked_at: "2026-11-16T00:00:00.000Z" } });
  });
  it("saves an exact count without wording", async () => {
    const { value, calls } = deps("https://www.tiktok.com/@chang._.a");
    await savePlatformFollowers(value, platformFollowersRequestSchema.parse({ items: [{ celebritySlug: "changha", platform: "tiktok", accountUrl: "https://www.tiktok.com/@chang._.a", text: "20868849" }] }));
    expect(calls[1]?.args).toMatchObject({ p_count: 20868849, p_digits: null, p_text: null });
  });
  it("skips unreadable wording and never writes 0", async () => {
    const { value, calls } = deps("https://www.instagram.com/aryeomii/");
    expect(await savePlatformFollowers(value, reading("팔로워"))).toMatchObject({ saved: 0, skipped: 1, items: [{ reason: "COUNT_UNREADABLE" }] });
    expect(calls).toEqual([]);
  });
  it("skips a reading of another account or an inactive link", async () => {
    const other = deps("https://www.instagram.com/someoneelse/");
    expect((await savePlatformFollowers(other.value, reading("7.6만"))).items[0]).toMatchObject({ status: "skipped", reason: "SOURCE_NOT_ACTIVE" });
    expect(other.calls.map(call => call.name)).toEqual(["sns_ingest_source_context"]);
    const none = deps(null);
    expect((await savePlatformFollowers(none.value, reading("7.6만"))).items[0]).toMatchObject({ reason: "SOURCE_NOT_ACTIVE" });
  });
  it("reports a kept manual or newer row as skipped", async () => {
    const { value } = deps("https://www.instagram.com/aryeomii/", false);
    expect((await savePlatformFollowers(value, reading("7.6만"))).items[0]).toMatchObject({ status: "skipped", reason: "KEPT_EXISTING" });
  });
  it("counts a database error as failed", async () => {
    const value: Deps = { rpc: async () => { throw new Error("down"); }, now: () => new Date() };
    expect(await savePlatformFollowers(value, reading("7.6만"))).toMatchObject({ failed: 1 });
  });
});
