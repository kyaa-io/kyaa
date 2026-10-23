import type { SupabaseClient } from "@supabase/supabase-js";
import { createWorkerClient } from "./data-client.js";
import { z } from "zod";
import type { NotificationWorkerEnv } from "./notification-env.js";

const dueResult = z.object({
  published: z.boolean(),
  drawId: z.uuid().nullable(),
  notificationCount: z.number().int().nonnegative(),
  purgedCount: z.number().int().nonnegative(),
});

export async function runRunmusicDueOnce(
  env: NotificationWorkerEnv,
  client?: Pick<SupabaseClient, "rpc">,
): Promise<number> {
  const db = client ?? createWorkerClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, env, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // Purging stays independent so contacts expire even after a draw or a due RPC failure.
  const [due, purge] = await Promise.allSettled([
    db.rpc("process_due_runmusic"),
    db.rpc("purge_due_runmusic_contacts"),
  ]);
  if (due.status !== "fulfilled" || due.value.error ||
      purge.status !== "fulfilled" || purge.value.error ||
      !Number.isInteger(purge.value.data) || purge.value.data < 0) {
    throw new Error("RUNMUSIC_MAINTENANCE_UNAVAILABLE");
  }
  const parsed = dueResult.safeParse(due.value.data);
  if (!parsed.success) throw new Error("RUNMUSIC_MAINTENANCE_UNAVAILABLE");
  return parsed.data.notificationCount;
}
