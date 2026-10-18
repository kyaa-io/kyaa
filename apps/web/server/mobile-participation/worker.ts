import "server-only";
export interface ParticipationCompletionRpc { rpc(name: string, args: Record<string, unknown>): Promise<unknown> }
export async function processParticipationCompletions(deps: ParticipationCompletionRpc, limit = 25) {
  const claimed = await deps.rpc("claim_mobile_participation_activity_completion", { p_limit: Math.min(Math.max(limit, 1), 50) }) as { items?: Array<{ sessionId: string; version: number }> };
  let completed = 0;
  for (const item of claimed.items ?? []) {
    await deps.rpc("finish_mobile_participation_activity_completion", { p_session_id: item.sessionId, p_expected_version: item.version, p_accepted: true, p_rejection_code: null });
    completed++;
  }
  return { claimed: claimed.items?.length ?? 0, completed };
}
