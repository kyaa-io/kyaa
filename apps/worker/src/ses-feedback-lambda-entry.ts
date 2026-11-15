import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { createWorkerSecretLoader } from "./aws-secret.js";
import { createSesFeedbackHandler } from "./ses-feedback.js";

const secrets = new SecretsManagerClient({});
const loadSecret = createWorkerSecretLoader((command: GetSecretValueCommand) => secrets.send(command));
export const handler = createSesFeedbackHandler({ loadSecret }, process.env);
