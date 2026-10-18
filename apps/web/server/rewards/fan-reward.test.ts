import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { fanRewardSchema } from "../../features/rewards/domain/fan-reward";
import { fanRewardSchema as serverFanRewardSchema } from "../mobile-fan-economy/domain";
import { readFanReward, wantsFanReward } from "./fan-reward";
const id = "11111111-1111-4111-8111-111111111111";
const reward = { status: "awarded", asset: "fan_point", amount: 100, policyVersion: "v1", sourceId: id, ledgerId: id };
describe("tagged source rewards", () => {
  it("requires the explicit representation opt-in", () => {
    expect(wantsFanReward(new Request("https://test"))).toBe(false);
    expect(wantsFanReward(new Request("https://test", { headers: { "X-Kyaa-Reward-Contract": "fan-point-v1" } }))).toBe(true);
  });
  it("parses both actual assets and rejects a positive uncommitted reward", () => {
    expect(fanRewardSchema.parse(reward)).toEqual(serverFanRewardSchema.parse(reward));
    expect(fanRewardSchema.parse({ ...reward, asset: "legacy_free_draw" }).amount).toBe(100);
    expect(fanRewardSchema.safeParse({ ...reward, ledgerId: null }).success).toBe(false);
    expect(fanRewardSchema.safeParse({ ...reward, amount: 0 }).success).toBe(false);
    expect(fanRewardSchema.safeParse({ ...reward, status: "unconfigured" }).success).toBe(false);
  });
  it("uses the verified owner and original source, with no award mutation", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: reward, error: null });
    expect(await readFanReward({ rpc }, id, id)).toEqual(reward);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("read_owned_mobile_fan_reward", { p_app_user_id: id, p_source_id: id });
  });
});
