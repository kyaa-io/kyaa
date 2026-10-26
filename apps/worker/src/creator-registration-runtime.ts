import { randomUUID } from "node:crypto";
import { z } from "zod";
import { CreatorRegistrationChain } from "./adapters/creator-registration-chain.js";
import { CreatorRegistrationQueue } from "./adapters/creator-registration-queue.js";
import { createWorkerClient, isWorkerPostgrestUrl } from "./data-client.js";
import { requireRegistration, runRegistrationQueue } from "./creator-registration.js";
const secretSchema = z.object({
  POSTGREST_URL: z.string().url(),
  POSTGREST_SERVICE_TOKEN: z.string().min(40),
  GIWA_RPC_URL: z.string().url(),
  CREATOR_REGISTRATION_PRIVATE_KEY: z.templateLiteral(["0x", z.string()]).refine(v => /^0x[0-9a-fA-F]{64}$/.test(v)),
  EXPECTED_REGISTRAR_ADDRESS: z.templateLiteral(["0x", z.string()]).refine(v => /^0x[0-9a-fA-F]{40}$/.test(v)),
  REGISTRY_DEPLOYMENT_BLOCK: z.string().regex(/^[1-9]\d*$/),
}).strict();
export type CreatorRegistrationEnv = z.infer<typeof secretSchema>;
export function parseCreatorRegistrationEnv(input: unknown, environment: "dev" | "staging" | "prod"): CreatorRegistrationEnv {
  const parsed = secretSchema.safeParse(input);
  requireRegistration(parsed.success, "INVALID_REGISTRATION_SECRET");
  const env = parsed.data;
  let role: unknown;
  try { role = (JSON.parse(Buffer.from(env.POSTGREST_SERVICE_TOKEN.split(".")[1] ?? "", "base64url").toString()) as { role?: unknown }).role; } catch { /* rejected below */ }
  requireRegistration(role === "creator_registration_worker", "REGISTRATION_DATABASE_ROLE_CHANGED");
  requireRegistration(isWorkerPostgrestUrl(env.POSTGREST_URL, environment) && new URL(env.GIWA_RPC_URL).protocol === "https:", "REGISTRATION_ENVIRONMENT_CHANGED");
  return env;
}
export async function runCreatorRegistrationOnce(env: CreatorRegistrationEnv, remainingTimeInMillis?: () => number) {
  const queue = new CreatorRegistrationQueue(createWorkerClient(undefined, undefined, env));
  const chain = new CreatorRegistrationChain({ rpcUrl: env.GIWA_RPC_URL, privateKey: env.CREATOR_REGISTRATION_PRIVATE_KEY, expectedRegistrar: env.EXPECTED_REGISTRAR_ADDRESS, deploymentBlock: BigInt(env.REGISTRY_DEPLOYMENT_BLOCK), remainingTimeInMillis });
  return runRegistrationQueue(queue, chain, randomUUID(), remainingTimeInMillis);
}
