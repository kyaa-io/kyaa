import "server-only";
import { fanRewardSchema } from "../mobile-fan-economy/domain";

export function wantsFanReward(request: Request): boolean {
  return request.headers.get("X-Kyaa-Reward-Contract") === "fan-point-v1";
}
type RewardRpcClient = { rpc(name: string, parameters: Record<string, string>): PromiseLike<{ data: unknown; error: { message?: string } | null }> };
export async function readFanReward(db: RewardRpcClient, appUserId: string, sourceId: string) {
  const { data, error } = await db.rpc("read_owned_mobile_fan_reward", { p_app_user_id: appUserId, p_source_id: sourceId });
  if (error) throw new Error("FAN_REWARD_UNAVAILABLE");
  const reward = fanRewardSchema.parse(data);
  if (reward.sourceId !== null && reward.sourceId !== sourceId) throw new Error("FAN_REWARD_INTEGRITY_ERROR");
  return reward;
}
