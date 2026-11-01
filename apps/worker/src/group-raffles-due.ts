import type { SupabaseClient } from "@supabase/supabase-js";
import { createWorkerClient } from "./data-client.js";
import type { NotificationWorkerEnv } from "./notification-env.js";
export async function runGroupRafflesDueOnce(env: NotificationWorkerEnv, client?: Pick<SupabaseClient, "rpc">): Promise<number> {
 const db = client ?? createWorkerClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, env, { auth: { persistSession: false, autoRefreshToken: false } });
 const result = await db.rpc("process_due_group_raffles");
 if (result.error || !Number.isInteger(result.data) || result.data < 0) throw new Error("GROUP_RAFFLES_MAINTENANCE_UNAVAILABLE");
 return result.data;
}
