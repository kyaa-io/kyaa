import "server-only";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createPublicClient, http } from "viem";
import { readFinalizedActionSnapshot, snapshotClient, type SnapshotLogScan } from "../../../worker/src/action-public-snapshot";
import { loadServerEnv } from "../config/env";
import { onchainConfig } from "./public-config";
import { projectPublicOnchainSnapshot } from "./public-aggregate";
import { readFinalizedCredentialReplacements, type CredentialReplacementConfig } from "./credential-replacements";
import type { PublicOnchainSnapshot } from "./public-types";

const count = z.number().int().nonnegative().safe();
const integer = z.string().regex(/^(0|[1-9][0-9]*)$/);
const hash = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const timestamp = z.iso.datetime({ offset: true });
const metrics = z.object({ uniqueActiveWallets: count, actionCounts: z.record(z.string().regex(/^[0-9]+$/), count), passportCredentials: count,
  mintedCredentials: count, lifecycleTransactions: count, currentActionTransactions: count }).strict();
const proof = z.object({ txHash: hash, blockNumber: integer, hubAddress: address, actionId: hash, easUid: hash,
  status: z.literal("ACTIVE"), current: z.literal(true), origin: z.literal("NATIVE") }).strict();
export const dashboardSnapshotSchema = z.object({
  version: z.literal(1), configFingerprint: z.string().regex(/^[a-f0-9]{64}$/), network: z.string().min(1), chainId: count,
  verifiedAt: timestamp, blockNumber: integer, blockHash: hash, blockTimestamp: timestamp,
  deployments: z.array(z.object({ label: z.string(), hubAddress: address, fromBlock: integer, actionCount: count,
    writeStatus: z.enum(["historical", "current", "pending_activation"]) }).strict()), metrics, proof: proof.nullable(),
}).strict();
export type DashboardSnapshot = z.infer<typeof dashboardSnapshotSchema>;
export type DashboardOnchainResult = { state: "unavailable" } | { state: "available"; data: {
  asOf: string; blockTimestamp: string; metrics: DashboardSnapshot["metrics"]; proof: DashboardSnapshot["proof"];
} };
const readConfig = { ...onchainConfig, rpcUrl: process.env.GIWA_PUBLIC_READ_RPC_URL?.trim() || onchainConfig.rpcUrl };
const dashboardLogConfig = { rpcUrl: onchainConfig.rpcUrl, chunkBlocks: 10_000n, intervalMs: 125 };
// Match the public cache namespace and every verification/exclusion input, including RPC scope.
export function dashboardConfigFingerprint(config: unknown = readConfig): string {
  return createHash("sha256").update(JSON.stringify({ verifierVersion: "byus-public-onchain-v6-verified-credential-replacements", config, dashboardLogConfig },
    (_key, value: unknown) => typeof value === "bigint" ? value.toString() : value)).digest("hex");
}
export function parseDashboardSnapshot(value: unknown, now = Date.now()): DashboardSnapshot {
  const snapshot = dashboardSnapshotSchema.parse(value);
  const verifiedAt = Date.parse(snapshot.verifiedAt), blockTime = Date.parse(snapshot.blockTimestamp);
  if (snapshot.configFingerprint !== dashboardConfigFingerprint() || snapshot.chainId !== readConfig.chainId || snapshot.network !== readConfig.network
    || verifiedAt > now || now - verifiedAt > 15 * 60_000 || blockTime > verifiedAt
    || (snapshot.proof && (BigInt(snapshot.proof.blockNumber) > BigInt(snapshot.blockNumber)
      || !snapshot.deployments.some((deployment) => deployment.hubAddress.toLowerCase() === snapshot.proof!.hubAddress.toLowerCase())))) {
    throw new Error("DASHBOARD_SNAPSHOT_INVALID");
  }
  return snapshot;
}
export function sanitizeDashboardSnapshot(source: PublicOnchainSnapshot): DashboardSnapshot {
  if (!source.business) throw new Error("DASHBOARD_BUSINESS_UNAVAILABLE");
  const candidate = source.actions.filter((action) => !action.qa && action.current && action.status === "ACTIVE" && action.origin === "NATIVE"
    && source.transactions.some(tx => !tx.qa && tx.origin === "NATIVE" && tx.txHash.toLowerCase() === action.txHash.toLowerCase()
      && tx.hubAddress.toLowerCase() === action.hubAddress.toLowerCase()))
    .sort((a, b) => BigInt(a.blockNumber) > BigInt(b.blockNumber) ? -1 : BigInt(a.blockNumber) < BigInt(b.blockNumber) ? 1 : a.actionId.localeCompare(b.actionId))[0];
  return parseDashboardSnapshot({ version: 1, configFingerprint: dashboardConfigFingerprint(), network: source.network, chainId: source.chainId,
    verifiedAt: source.generatedAt, blockNumber: source.blockNumber, blockHash: source.blockHash, blockTimestamp: source.blockTimestamp,
    deployments: source.deployments.map(({ label, hubAddress, fromBlock, actionCount, writeStatus }) => ({ label, hubAddress, fromBlock, actionCount, writeStatus })),
    metrics: { uniqueActiveWallets: source.business.uniqueActiveWallets, actionCounts: { ...source.business.actionCounts },
      passportCredentials: source.business.passportCredentials, mintedCredentials: source.business.mintedCredentials,
      lifecycleTransactions: source.business.lifecycleTransactions, currentActionTransactions: source.business.currentActionTransactions },
    proof: candidate ? { txHash: candidate.txHash, blockNumber: candidate.blockNumber, hubAddress: candidate.hubAddress,
      actionId: candidate.actionId, easUid: candidate.easUid, status: candidate.status, current: candidate.current, origin: candidate.origin } : null });
}
function database() {
  const env = loadServerEnv();
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}
async function readStored(): Promise<unknown> {
  const { data, error } = await database().from("onchain_dashboard_snapshot").select("payload").eq("id", true).abortSignal(AbortSignal.timeout(4000)).maybeSingle();
  if (error) throw new Error("DASHBOARD_READ_UNAVAILABLE");
  return data?.payload;
}
async function writeStored(snapshot: DashboardSnapshot): Promise<boolean> {
  const { data, error } = await database().rpc("replace_onchain_dashboard_snapshot", { p_payload: snapshot }).abortSignal(AbortSignal.timeout(8000));
  if (error) throw new Error("DASHBOARD_WRITE_UNAVAILABLE");
  return data === true;
}
export async function getDashboardOnchainResult(read = readStored): Promise<DashboardOnchainResult> {
  try {
    const snapshot = parseDashboardSnapshot(await read());
    return { state: "available", data: { asOf: snapshot.verifiedAt, blockTimestamp: snapshot.blockTimestamp, metrics: snapshot.metrics, proof: snapshot.proof } };
  } catch { return { state: "unavailable" }; }
}
export function createDashboardLogScan(signal: AbortSignal): SnapshotLogScan {
  let nextRequest = 0;
  const client = createPublicClient({ transport: http(dashboardLogConfig.rpcUrl, {
    retryCount: 0, timeout: 15_000, fetchOptions: { signal },
    fetchFn: async (input, init) => {
      const wait = Math.max(0, nextRequest - Date.now());
      nextRequest = Date.now() + wait + dashboardLogConfig.intervalMs;
      if (wait) await new Promise(resolve => setTimeout(resolve, wait));
      signal.throwIfAborted();
      return fetch(input, init);
    },
  }) });
  return { client, chunkBlocks: dashboardLogConfig.chunkBlocks };
}
async function verifySnapshot(signal: AbortSignal): Promise<PublicOnchainSnapshot> {
  const started = Date.now();
  let phase = "actions";
  try {
    const client = snapshotClient(readConfig, signal);
    const logScan = createDashboardLogScan(signal);
    const source = await readFinalizedActionSnapshot({ ...readConfig, client, logScan });
    const actionsMs = Date.now() - started;
    phase = "replacements";
    const representatives = readConfig.credentialReplacement.deployment
      ? await readFinalizedCredentialReplacements(readConfig as CredentialReplacementConfig, source, client, logScan) : new Map();
    signal.throwIfAborted();
    phase = "projection";
    const projected = projectPublicOnchainSnapshot(source, new Date(), representatives);
    console.info("onchain_dashboard_verification", { state: "complete", actionsMs, elapsedMs: Date.now() - started });
    return projected;
  } catch (error) {
    console.warn("onchain_dashboard_verification", { state: "failed", phase, elapsedMs: Date.now() - started });
    throw error;
  }
}
export async function refreshDashboardSnapshot(deps = { verify: verifySnapshot, write: writeStored }): Promise<{ updated: boolean }> {
  // Reserve the final fifteen seconds of the route budget for persistence and response.
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const source = await Promise.race([deps.verify(controller.signal), new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => { const error = new Error("DASHBOARD_REFRESH_TIMEOUT"); controller.abort(error); reject(error); }, 285_000);
    })]);
    return { updated: await deps.write(sanitizeDashboardSnapshot(source)) };
  } finally { clearTimeout(timer); controller.abort(); }
}
