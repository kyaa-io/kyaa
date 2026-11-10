// Reward-journey e2e: real app -> real API -> the disposable local database copy. Nothing here may point at Dev or production.
import os from "node:os";
import path from "node:path";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1"]);

export const BASE_URL = (process.env.REWARD_E2E_BASE_URL ?? "http://localhost:3002").replace(/\/$/, "");
export const APP_PORT = new URL(BASE_URL).port || "80";

export const PG = {
  host: process.env.REWARD_E2E_PG_HOST ?? "127.0.0.1",
  port: process.env.REWARD_E2E_PG_PORT ?? "55433",
  user: process.env.REWARD_E2E_PG_USER ?? "localsuper",
  database: process.env.REWARD_E2E_PG_DATABASE ?? "byus",
};

/** The suite deletes ledger rows of its test members, so it refuses to run anywhere but a loopback app and a loopback database. */
export function assertLocalOnly(): void {
  if (!LOOPBACK.has(new URL(BASE_URL).hostname)) throw new Error(`REWARD_E2E_NOT_LOCAL: app ${BASE_URL}`);
  if (!LOOPBACK.has(PG.host)) throw new Error(`REWARD_E2E_NOT_LOCAL: database host ${PG.host}`);
}

/** Privy Development test accounts that `kyaa-t3 local-login <account> --port <port>` writes a storage state for. */
export const ACCOUNT_DIR = process.env.REWARD_E2E_ACCOUNT_DIR ?? path.join(os.homedir(), ".kyaa-dev-test-accounts");
export const ACCOUNTS = {
  primary: process.env.REWARD_E2E_ACCOUNT_PRIMARY ?? "dev-fan-5",
  secondary: process.env.REWARD_E2E_ACCOUNT_SECONDARY ?? "dev-fan-4",
} as const;

export const POLICY_VERSION = "group-wallet-v1";
