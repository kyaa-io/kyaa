import { chemiMailJob } from "./chemi-jobs/mail.ts";
import type { ChemiMaintenanceRpc } from "./chemi-mail-worker.js";

const jobs = [
  chemiMailJob,
  {
    name: "chainRecords",
    async run(rpc: ChemiMaintenanceRpc, env: NodeJS.ProcessEnv) {
      if (env.APP_ENV !== "dev" || env.CHEMI_TAB !== "true") return null;
      const count = await rpc("chemi_chain_collect", {});
      if (
        typeof count !== "number" ||
        !Number.isSafeInteger(count) ||
        count < 0
      )
        throw new Error("CHEMI_CHAIN_INVALID_COUNT");
      return count;
    },
  },
];

export async function runChemiMaintenance(
  rpc: ChemiMaintenanceRpc,
  env: NodeJS.ProcessEnv,
) {
  const counts: Record<string, number> = {};
  for (const job of jobs) {
    const count = await job.run(rpc, env);
    if (count !== null) counts[job.name] = count;
  }
  return counts;
}
