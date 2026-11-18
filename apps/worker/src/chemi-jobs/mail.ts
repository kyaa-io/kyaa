import { runChemiMail, type ChemiMaintenanceRpc } from "../chemi-mail-worker.ts";

export const chemiMailJob = {
  name: "mail",
  run: (rpc: ChemiMaintenanceRpc, env: NodeJS.ProcessEnv) => runChemiMail(rpc, env.APP_ENV, env.CHEMI_MAIL_SINK),
};
