import { chemiMailJob } from "./chemi-jobs/mail.js";
import type { ChemiMaintenanceRpc } from "./chemi-mail-worker.js";

const jobs = [chemiMailJob];

export async function runChemiMaintenance(rpc: ChemiMaintenanceRpc, env: NodeJS.ProcessEnv) {
  const counts: Record<string, number> = {};
  for (const job of jobs) counts[job.name] = await job.run(rpc, env);
  return counts;
}
