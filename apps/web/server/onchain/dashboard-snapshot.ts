import "server-only";
import { createPublicClient, http } from "viem";
import { readFinalizedActionSnapshot, snapshotClient, type SnapshotLogScan } from "../../../worker/src/action-public-snapshot";
import { projectPublicOnchainSnapshot } from "./public-aggregate";
import { readFinalizedCredentialReplacements, type CredentialReplacementConfig } from "./credential-replacements";
import type { PublicOnchainSnapshot } from "./public-types";

import { dashboardConfigFingerprint, parseDashboardSnapshot, readConfig, dashboardLogConfig, readVerifiedDashboardSnapshot, publishVerifiedSnapshot, type DashboardSnapshot, type DashboardOnchainResult } from "./verified-snapshot";
export { dashboardConfigFingerprint, parseDashboardSnapshot, dashboardSnapshotSchema, type DashboardSnapshot, type DashboardOnchainResult } from "./verified-snapshot";

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
export async function getDashboardOnchainResult(read = readVerifiedDashboardSnapshot): Promise<DashboardOnchainResult> {
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
    const source = await readFinalizedActionSnapshot({ ...readConfig, client, logScan, deadlineMs: 420_000, signal });
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
    console.warn("onchain_dashboard_verification", { state: "failed", phase, elapsedMs: Date.now() - started,
      code: signal.aborted ? "CANCELLED_OR_TIMEOUT" : error instanceof Error && error.message === "Action public snapshot deadline exceeded" ? "ACTION_DEADLINE" : "VERIFICATION_FAILED" });
    throw error;
  }
}
export async function refreshDashboardSnapshot(deps = { verify: verifySnapshot, write: publishVerifiedSnapshot }, externalSignal?: AbortSignal): Promise<{ updated: boolean }> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  try {
    const deadline = new Promise<never>((_resolve, reject) => {
      abort = () => { const error = new Error("DASHBOARD_REFRESH_CANCELLED"); controller.abort(error); reject(error); };
      if (externalSignal?.aborted) abort();
      else externalSignal?.addEventListener("abort", abort, { once: true });
      timer = setTimeout(() => { const error = new Error("DASHBOARD_REFRESH_TIMEOUT"); controller.abort(error); reject(error); }, 480_000);
    });
    const work = async () => {
      controller.signal.throwIfAborted();
      const source = await deps.verify(controller.signal);
      controller.signal.throwIfAborted();
      const dashboard = source.business === null ? null : sanitizeDashboardSnapshot(source);
      return { updated: await deps.write(source, dashboard, controller.signal) };
    };
    return await Promise.race([work(), deadline]);
  } finally {
    clearTimeout(timer);
    if (abort) externalSignal?.removeEventListener("abort", abort);
    controller.abort();
  }
}
