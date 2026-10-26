import { z } from "zod";
import { parseCreatorRegistrationEnv, type CreatorRegistrationEnv } from "./creator-registration-runtime.js";
import { RegistrationError, requireRegistration } from "./creator-registration.js";
export function createCreatorRegistrationLambdaHandler(deps: { loadSecret(id: string): Promise<string>; runWorker(env: CreatorRegistrationEnv, remainingTimeInMillis?: () => number): Promise<number> }, source: NodeJS.ProcessEnv) {
  const config = z.object({ enabled: z.enum(["true", "false"]), environment: z.enum(["dev", "staging", "prod"]), secretId: z.string().min(3) }).safeParse({
    enabled: source.CREATOR_REGISTRATION_WORKER_ENABLED,
    environment: source.CREATOR_REGISTRATION_WORKER_ENVIRONMENT,
    secretId: source.CREATOR_REGISTRATION_WORKER_SECRET_ID,
  });
  requireRegistration(config.success, "INVALID_REGISTRATION_LAMBDA_CONFIG");
  requireRegistration(config.data.secretId === `byus/creator-registration/${config.data.environment}`, "REGISTRATION_SECRET_ID_CHANGED");
  return async (event: unknown, context?: { getRemainingTimeInMillis(): number }) => {
    const invocation = z.object({ source: z.literal("byus.creator-registration-cron"), environment: z.literal(config.data.environment) }).strict().safeParse(event);
    requireRegistration(invocation.success, "INVALID_REGISTRATION_INVOCATION");
    if (config.data.enabled === "false") return { enabled: false, claimed: 0 };
    try {
      const secret = JSON.parse(await deps.loadSecret(config.data.secretId)) as unknown;
      const env = parseCreatorRegistrationEnv(secret, config.data.environment);
      return { enabled: true, claimed: await deps.runWorker(env, context ? () => context.getRemainingTimeInMillis() : undefined) };
    } catch (error) {
      // AWS logs uncaught messages; only expose bounded codes, never transport/secret text.
      throw new RegistrationError(error instanceof RegistrationError ? error.code : "REGISTRATION_RUNTIME_ERROR");
    }
  };
}
