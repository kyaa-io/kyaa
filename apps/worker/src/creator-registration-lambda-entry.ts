import { SecretsManagerClient, type GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { createWorkerSecretLoader } from "./aws-secret.js";
import { createCreatorRegistrationLambdaHandler } from "./creator-registration-lambda.js";
import { runCreatorRegistrationOnce } from "./creator-registration-runtime.js";
const secrets = new SecretsManagerClient({});
export const handler = createCreatorRegistrationLambdaHandler({
  loadSecret: createWorkerSecretLoader((command: GetSecretValueCommand) => secrets.send(command)),
  runWorker: runCreatorRegistrationOnce,
}, process.env);
