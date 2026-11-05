import "server-only";
import { createClient } from "@/server/data/client";
import { loadServerEnv } from "@/server/config/env";

export type ProofMissionRows = {
  missions: { id: string; proofType: string; platform: string | null; closesAt: string }[];
  openMissionIds: string[];
  monthCount: number;
};

let client: ReturnType<typeof createClient> | null = null;
const db = () => {
  if (!client) { const env = loadServerEnv(); client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } }); }
  return client;
};

// Start of the current KST calendar month, as an ISO instant (the monthly limit counts per creator and KST month).
export function kstMonthStart(now = new Date()) {
  const kst = new Date(now.getTime() + 9 * 3600_000);
  return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), 1) - 9 * 3600_000).toISOString();
}

// The certification tables are closed to service_role, so one definer RPC returns the active proof missions in their window,
// the caller's own open submissions and this KST month's count. Member data never leaves this function except as ids/counts of the caller.
export async function readProofMissions(celebrityId: string, appUserId: string): Promise<ProofMissionRows> {
  const { data, error } = await db().rpc("list_proof_missions", { p_user: appUserId, p_celebrity: celebrityId, p_month_start: kstMonthStart() });
  if (error) throw new Error(error.message);
  const r = (data ?? {}) as { missions?: { id: string; proofType: string; platform: string | null; closesAt: string }[]; openMissionIds?: string[]; monthCount?: number };
  return { missions: r.missions ?? [], openMissionIds: r.openMissionIds ?? [], monthCount: Number(r.monthCount ?? 0) };
}
