import { runChemiMail, type ChemiMaintenanceRpc } from "../chemi-mail-worker.js";

export const chemiMailJob = {
  name: "mail",
  run: (rpc: ChemiMaintenanceRpc, env: NodeJS.ProcessEnv) => runChemiMail(rpc, env),
};
