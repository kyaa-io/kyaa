import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
const paths = {
  "runmusic-telegram": "/api/internal/runmusic/telegram/process",
  indexnow: "/api/internal/seo/indexnow", "instagram-sync": "/api/internal/instagram/sync",
  "instagram-live": "/api/internal/instagram/live-sync", "chzzk-live": "/api/internal/chzzk/live-sync",
  "account-deletions": "/api/internal/account-deletions/process", "onchain-dashboard": "/api/internal/onchain-dashboard/refresh",
} as const;
export function createScheduledHandler({ loadSecret, fetcher = fetch }: { loadSecret(id: string): Promise<string>; fetcher?: typeof fetch }, source = process.env) {
  return async (event: unknown) => {
    const input = event as { source?: string; environment?: string; task?: string };
    if (input?.source !== "byus.aws-cron" || input.environment !== source.WORKER_ENVIRONMENT || !["dev","staging","prod"].includes(input.environment ?? "") || !Object.hasOwn(paths, input.task ?? "")) throw new Error("Invalid scheduled invocation");
    let status: number | null = null;
    const log = (outcome: "start" | "disabled" | "success" | "failure") => console.info(JSON.stringify({ event: "scheduled_task", outcome, task: input.task, environment: input.environment, status }));
    log("start");
    if (source.WORKER_ENABLED !== "true") { log("disabled"); return { enabled: false }; }
    try {
    if (!source.CRON_RUNTIME_SECRET_ID || !source.API_ORIGIN) throw new Error("Cron runtime configuration is missing");
    const origin = new URL(source.API_ORIGIN);
    if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) throw new Error("Invalid API origin");
    let secret:{CRON_SECRET?:string};
    try{secret=JSON.parse(await loadSecret(source.CRON_RUNTIME_SECRET_ID)) as {CRON_SECRET?:string};}catch{throw new Error("Cron secret is invalid");}
    if (typeof secret.CRON_SECRET !== "string" || secret.CRON_SECRET.length < 32) throw new Error("Cron secret is invalid");
    const response = await fetcher(new URL(paths[input.task as keyof typeof paths], origin), { headers: { authorization: `Bearer ${secret.CRON_SECRET}`, "x-byus-scheduler": "aws" }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(240_000) });
    status = response.status;
    try {
      if (!response.ok || response.status === 204) throw new Error("Scheduled task failed or has a different owner");
    } finally {
      try { await response.body?.cancel(); } catch { /* Cleanup must not mask the task outcome. */ }
    }
    log("success");
    return { enabled: true, task: input.task, status: response.status };
    } catch (error) { log("failure"); throw error; }
  };
}
const secrets = new SecretsManagerClient({});
export const handler = createScheduledHandler({ async loadSecret(id) { const value = await secrets.send(new GetSecretValueCommand({ SecretId: id })); if (!value.SecretString) throw new Error("Cron secret is empty"); return value.SecretString; } });
