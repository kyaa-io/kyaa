import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import real from "./__fixtures__/operator-tools-real-sql.json";
import { groupMissionStatsSchema, groupNoticeBroadcastStatusSchema, groupOperatorMembersSchema } from "@/features/groups/domain/operator-tools";
import { createGroupHandler } from "./routes";

// Real SQL output (disposable cluster, 2026-11-09) through the same route the web calls: DB and API changed together.
const me = "b8000000-0000-4000-8000-000000000001", page = "b8000000-0000-4000-8000-0000000000a1";
const handlerReturning = (value: unknown) => createGroupHandler({ rpc: vi.fn().mockResolvedValue(value), authorize: async () => ({ appUserId: me }), authorizeAdmin: vi.fn() } as never);
const get = new Request("https://kyaa.test/api", { headers: { authorization: "Bearer valid" } });
describe("real SQL responses pass the route schemas", () => {
  it.each(["fanList", "hobbyList", "emptyOwnerList", "emptySearch"] as const)("operator-members %s", async (key) => {
    expect(groupOperatorMembersSchema.safeParse(real[key]).success).toBe(true);
    expect((await handlerReturning(real[key])("operator-members", get.clone(), { id: page })).status).toBe(200);
  });
  it("fan page: hearts and jjinfanTotal are numbers; group page and empty owner page: null where there is no creator", () => {
    expect(typeof real.fanList.jjinfanTotal).toBe("number");
    expect(real.hobbyList.jjinfanTotal).toBeNull();
    expect(real.emptyOwnerList).toMatchObject({ total: 1, nextCursor: null, items: [{ role: "owner", missionCount: 0, lastActiveAt: null, hearts: null, jjinfan: null }] });
    expect(real.emptySearch.items).toEqual([]);
  });
  it.each(["fanStats", "emptyStats"] as const)("mission-stats %s", async (key) => {
    expect(groupMissionStatsSchema.safeParse(real[key]).success).toBe(true);
    expect((await handlerReturning(real[key])("mission-stats", get.clone(), { id: page })).status).toBe(200);
  });
  it("notice broadcast status", async () => {
    expect(groupNoticeBroadcastStatusSchema.safeParse(real.status).success).toBe(true);
    expect((await handlerReturning(real.status)("notice-broadcast-status", get.clone(), { id: page })).status).toBe(200);
  });
});
