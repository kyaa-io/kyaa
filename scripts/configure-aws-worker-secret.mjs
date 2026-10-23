import { execFileSync } from "node:child_process";
import {
  CreateSecretCommand,
  PutSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";

const environment = process.argv[2];
if (environment !== "dev" && environment !== "staging" && environment !== "prod") {
  throw new Error("Usage: node scripts/configure-aws-worker-secret.mjs <dev|staging|prod>");
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const collectibleAddress = process.env.BYUS_COLLECTIBLE_CONTRACT_ADDRESS;
const collectibleDeploymentBlock = process.env.GIWA_COLLECTIBLE_DEPLOYMENT_BLOCK;
if (Boolean(collectibleAddress) !== Boolean(collectibleDeploymentBlock)) {
  throw new Error("BYUS_COLLECTIBLE_CONTRACT_ADDRESS and GIWA_COLLECTIBLE_DEPLOYMENT_BLOCK must be configured together");
}
if (environment === "prod" && collectibleAddress) {
  throw new Error("Collectible chain configuration is Dev-only until a separate Production approval");
}

const region = required("AWS_REGION");
if (region !== "ap-northeast-2") throw new Error("Worker secrets are restricted to ap-northeast-2");
const profile = required("AWS_PROFILE");
const account = required("EXPECTED_AWS_ACCOUNT_ID");
if (account !== "996702758024") throw new Error("all ByUs worker environments require Sallylab account 996702758024");
const actual = execFileSync("aws", ["sts", "get-caller-identity", "--profile", profile, "--query", "Account", "--output", "text"], { encoding: "utf8" }).trim();
if (actual !== account) throw new Error("AWS account mismatch");
const postgrestUrl = process.env.POSTGREST_URL;
const postgrestToken = process.env.POSTGREST_SERVICE_TOKEN;
if (Boolean(postgrestUrl) !== Boolean(postgrestToken)) throw new Error("POSTGREST_URL and POSTGREST_SERVICE_TOKEN must be configured together");
const prefix = `SUPABASE_${environment.toUpperCase()}`;
const legacyUrl = process.env[`${prefix}_URL`];
const legacyKey = process.env[`${prefix}_SERVICE_ROLE_KEY`];
if (Boolean(legacyUrl) !== Boolean(legacyKey)) throw new Error("Supabase URL and key must be configured together");
if (!postgrestUrl && (!legacyUrl || !legacyKey)) throw new Error("Database configuration requires PostgREST or Supabase credentials");
if (postgrestUrl && new URL(postgrestUrl).href !== ({ dev:"https://data.dev.kyaa.io/",staging:"https://data.staging.kyaa.io/",prod:"https://data.kyaa.io/" })[environment]) throw new Error("Worker PostgREST URL must match its exact environment endpoint");
const pinataPrefix = `PINATA_${environment.toUpperCase()}`;
const secretName = `byus/worker/${environment}`;
const secret = {
  WORKER_ENABLED: "false",
  WORKER_ENVIRONMENT: environment,
  BYUS_DATA_ENVIRONMENT: environment === "prod" ? "production" : "development",
  WORKER_ID: `byus-worker-${environment}-01`,
  WORKER_BATCH_SIZE: "5",
  WORKER_LEASE_SECONDS: "300",
  WORKER_POLL_INTERVAL_MS: "5000",
  WORKER_RECEIPT_POLL_ATTEMPTS: "24",
  ...(legacyUrl && legacyKey ? { SUPABASE_URL: legacyUrl, SUPABASE_SERVICE_ROLE_KEY: legacyKey } : {}),
  ...(postgrestUrl && postgrestToken ? { POSTGREST_URL: postgrestUrl, POSTGREST_SERVICE_TOKEN: postgrestToken } : {}),
  PINATA_JWT: required(`${pinataPrefix}_JWT`),
  PINATA_API_URL: "https://api.pinata.cloud",
  METADATA_ASSET_BASE_URI: required("METADATA_ASSET_BASE_URI"),
  GIWA_RPC_URL: required("GIWA_RPC_URL"),
  GIWA_CHAIN_ID: required("GIWA_CHAIN_ID"),
  GIWA_RELAYER_PRIVATE_KEY: required("GIWA_RELAYER_PRIVATE_KEY"),
  BYUS_PASSPORT_CONTRACT_ADDRESS: required("BYUS_PASSPORT_CONTRACT_ADDRESS"),
  BYUS_STAMP_CONTRACT_ADDRESS: required("BYUS_STAMP_CONTRACT_ADDRESS"),
  GIWA_DEPLOYMENT_BLOCK: required("GIWA_DEPLOYMENT_BLOCK"),
  GIWA_MINT_MAX_GAS: process.env.GIWA_MINT_MAX_GAS ?? "1000000",
  GIWA_MINT_MAX_FEE_PER_GAS_WEI: process.env.GIWA_MINT_MAX_FEE_PER_GAS_WEI ?? "100000000",
  GIWA_MINT_MAX_PRIORITY_FEE_PER_GAS_WEI: process.env.GIWA_MINT_MAX_PRIORITY_FEE_PER_GAS_WEI ?? "100000000",
  GIWA_MINT_MAX_EXECUTION_FEE_WEI: process.env.GIWA_MINT_MAX_EXECUTION_FEE_WEI ?? "100000000000000",
  ...(collectibleAddress && collectibleDeploymentBlock ? {
    BYUS_COLLECTIBLE_CONTRACT_ADDRESS: collectibleAddress,
    GIWA_COLLECTIBLE_DEPLOYMENT_BLOCK: collectibleDeploymentBlock,
  } : {}),
};

let credentials;
try { credentials = JSON.parse(execFileSync("aws", ["configure", "export-credentials", "--profile", profile, "--format", "process"], { encoding: "utf8" })); } catch { throw new Error("Profile credentials are unavailable"); }
if (!credentials.AccessKeyId || !credentials.SecretAccessKey) throw new Error("Profile credentials are unavailable");
const client = new SecretsManagerClient({ region, credentials: {
  accessKeyId: credentials.AccessKeyId, secretAccessKey: credentials.SecretAccessKey,
  ...(credentials.SessionToken ? { sessionToken: credentials.SessionToken } : {}),
} });
const secretString = JSON.stringify(secret);
try {
  await client.send(new CreateSecretCommand({
    Name: secretName,
    Description: `ByUs ${environment} mint worker runtime configuration`,
    SecretString: secretString,
    Tags: [
      { Key: "Project", Value: "ByUs" },
      { Key: "Environment", Value: environment },
      { Key: "Component", Value: "mint-worker" },
    ],
  }));
  process.stdout.write(`${JSON.stringify({ environment, secretName, action: "created", fieldCount: Object.keys(secret).length })}\n`);
} catch (error) {
  if (error?.name !== "ResourceExistsException") throw error;
  await client.send(new PutSecretValueCommand({ SecretId: secretName, SecretString: secretString }));
  process.stdout.write(`${JSON.stringify({ environment, secretName, action: "updated", fieldCount: Object.keys(secret).length })}\n`);
}
