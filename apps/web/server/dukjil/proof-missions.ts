import "server-only";
import { createClient } from "@/server/data/client";
import { loadServerEnv } from "@/server/config/env";

export type ProofMissionRows = {
  missions: { id: string; proofType: string; platform: string | null; closesAt: string }[];
  openMissionIds: string[];
  monthCount: number;
};

// Same states the submit RPC counts toward the monthly limit; rejected proofs do not use it up.
export const MONTH_STATUSES = ["pending", "in_review", "changes_requested", "approved"];

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

// Existing tables only (no new RPC): active missions in their window that carry a proof_type and are not legacy membership missions,
// plus the caller's own open submissions and this month's count. Member data never leaves this function except as ids/counts of the caller.
export async function readProofMissions(celebrityId: string, appUserId: string): Promise<ProofMissionRows> {
  const now = new Date().toISOString();
  const [missions, open, month] = await Promise.all([
    db().from("certification_missions").select("id, proof_type, proof_platform, closes_at").eq("celebrity_id", celebrityId).eq("status", "active")
      .not("proof_type", "is", null).is("membership_platform", null).lte("opens_at", now).gt("closes_at", now).order("closes_at", { ascending: true }).limit(50),
    db().from("certification_submissions").select("mission_id").eq("app_user_id", appUserId).eq("celebrity_id", celebrityId)
      .not("proof_type", "is", null).in("status", ["pending", "in_review", "changes_requested"]),
    db().from("certification_submissions").select("id", { count: "exact", head: true }).eq("app_user_id", appUserId).eq("celebrity_id", celebrityId)
      .not("proof_type", "is", null).in("status", MONTH_STATUSES).gte("submitted_at", kstMonthStart()),
  ]);
  for (const r of [missions, open, month]) if (r.error) throw new Error(r.error.message);
  return {
    missions: ((missions.data ?? []) as { id: string; proof_type: string; proof_platform: string | null; closes_at: string }[])
      .map((m) => ({ id: m.id, proofType: m.proof_type, platform: m.proof_platform, closesAt: m.closes_at })),
    openMissionIds: ((open.data ?? []) as { mission_id: string }[]).map((r) => r.mission_id),
    monthCount: month.count ?? 0,
  };
}
