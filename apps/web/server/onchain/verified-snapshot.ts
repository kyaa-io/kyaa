import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { createClient } from "@/server/data/client";
import { loadServerEnv } from "../config/env";
import { onchainConfig } from "./public-config";
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
export const readConfig = { ...onchainConfig, rpcUrl: process.env.GIWA_PUBLIC_READ_RPC_URL?.trim() || onchainConfig.rpcUrl };
export const dashboardLogConfig = { rpcUrl: onchainConfig.rpcUrl, chunkBlocks: 10_000n, intervalMs: 125 };
// Match the public cache namespace and every verification/exclusion input, including RPC scope.
export function dashboardConfigFingerprint(config: unknown = readConfig): string {
  return createHash("sha256").update(JSON.stringify({ verifierVersion: "kyaa-verified-onchain-v8-durable-full-ledger", config, dashboardLogConfig },
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
const deployment = z.object({ label: z.string(), hubAddress: address, fromBlock: integer, actionCount: count,
  writeStatus: z.enum(["historical", "current", "pending_activation"]) }).strict();
const representative = z.object({ nftContract: address, tokenId: integer, owner: address, issuanceKey: hash, metadataHash: hash,
  migration: z.object({ migratorAddress: address, batchId: hash, txHash: hash, blockNumber: integer, sourceHub: address,
    sourceActionId: hash, minted: z.boolean() }).strict() }).strict();
const fullSnapshotSchema = z.object({
  version: z.literal(2), network: z.string(), chainId: count, hubAddress: address, environmentId: hash, schemaUid: hash,
  fromBlock: integer, blockNumber: integer, blockHash: hash, blockTimestamp: timestamp, generatedAt: timestamp,
  deployments: z.array(deployment), business: metrics.nullable(), businessUnavailableReason: z.literal("cross_hub_source_collision").optional(),
  raw: metrics, excludedQaWallets: z.array(address), excludedQaActions: count, historicalActions: count,
  actions: z.array(z.object({ actionId: hash, occurrenceId: hash, sourceOccurrence: hash, revision: count, actionCode: z.number().int().min(1).max(12),
    wallet: address, creatorId: hash, campaignId: hash, occurredDay: count, easUid: hash, txHash: hash, blockNumber: integer,
    hubAddress: address, environmentId: hash, sourceDeployment: z.string(), status: z.enum(["ACTIVE", "INVALIDATED"]),
    current: z.boolean(), qa: z.boolean(), origin: z.enum(["NATIVE", "HISTORICAL"]),
    credentials: z.array(z.object({ kind: z.number().int().min(0).max(2), nftContract: address, tokenId: integer,
      linkOrigin: z.number().int().min(0).max(1), representativeAsset: representative.optional() }).strict()) }).strict()).max(10_000),
  transactions: z.array(z.object({ txHash: hash, blockNumber: integer, hubAddress: address,
    kind: z.enum(["record", "invalidate", "correct"]), qa: z.boolean(), origin: z.enum(["NATIVE", "HISTORICAL"]) }).strict()).max(50_000),
}).strict();
const verifiedSchema = z.object({ configFingerprint: z.string().regex(/^[a-f0-9]{64}$/), snapshot: fullSnapshotSchema }).strict();
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const lower = (value: string) => value.toLowerCase();
export function parseVerifiedSnapshot(value: unknown, now = Date.now()): PublicOnchainSnapshot {
  const parsed = verifiedSchema.parse(value), snapshot = parsed.snapshot;
  const verifiedAt = Date.parse(snapshot.generatedAt), blockTime = Date.parse(snapshot.blockTimestamp);
  if (parsed.configFingerprint !== dashboardConfigFingerprint() || verifiedAt > now || now - verifiedAt > 15 * 60_000 || blockTime > verifiedAt
    || snapshot.network !== readConfig.network || snapshot.chainId !== readConfig.chainId || lower(snapshot.hubAddress) !== lower(readConfig.hubAddress)
    || lower(snapshot.environmentId) !== lower(readConfig.environmentId) || lower(snapshot.schemaUid) !== lower(readConfig.schemaUid)
    || snapshot.fromBlock !== String(readConfig.fromBlock) || BigInt(snapshot.blockNumber) < BigInt(snapshot.fromBlock)
    || !same(snapshot.excludedQaWallets.map(lower), readConfig.qaWallets.map(lower))
    || snapshot.deployments.length !== readConfig.deployments.length
    || snapshot.deployments.some((entry, index) => { const expected = readConfig.deployments[index];
      return entry.label !== expected.label || lower(entry.hubAddress) !== lower(expected.hubAddress) || entry.fromBlock !== String(expected.fromBlock)
        || entry.writeStatus !== expected.writeStatus || BigInt(entry.fromBlock) > BigInt(snapshot.blockNumber); })
    || (snapshot.business === null) !== (snapshot.businessUnavailableReason === "cross_hub_source_collision")) throw new Error("VERIFIED_SNAPSHOT_INVALID");
  const hubs = new Map(snapshot.deployments.map(entry => [lower(entry.hubAddress), entry]));
  const assets = new Map<number, Set<string>>();
  for (const binding of Object.values(readConfig.assetBindings)) for (const [kind, asset] of Object.entries(binding)) {
    const allowed = assets.get(Number(kind)) ?? new Set<string>(); allowed.add(lower(asset)); assets.set(Number(kind), allowed);
  }
  const qaSources = new Set(snapshot.actions.filter(action => readConfig.qaWallets.some(wallet => lower(wallet) === lower(action.wallet))).map(action => lower(action.sourceOccurrence)));
  for (const action of snapshot.actions) {
    const hub = hubs.get(lower(action.hubAddress));
    if (!hub || action.sourceDeployment !== hub.label || action.environmentId !== snapshot.environmentId
      || BigInt(action.blockNumber) < BigInt(hub.fromBlock) || BigInt(action.blockNumber) > BigInt(snapshot.blockNumber)
      || action.qa !== qaSources.has(lower(action.sourceOccurrence))
      || action.credentials.some(credential => !assets.get(credential.kind)?.has(lower(credential.nftContract))
        || (credential.representativeAsset && (!assets.get(credential.kind)?.has(lower(credential.representativeAsset.nftContract))
          || lower(credential.representativeAsset.migration.migratorAddress) !== lower(readConfig.credentialReplacement.deployment?.address ?? "")
          || BigInt(credential.representativeAsset.migration.blockNumber) > BigInt(snapshot.blockNumber))))) throw new Error("VERIFIED_SNAPSHOT_ACTION_INVALID");
  }
  for (const transaction of snapshot.transactions) {
    const hub = hubs.get(lower(transaction.hubAddress));
    if (!hub || BigInt(transaction.blockNumber) < BigInt(hub.fromBlock) || BigInt(transaction.blockNumber) > BigInt(snapshot.blockNumber)) throw new Error("VERIFIED_SNAPSHOT_TRANSACTION_INVALID");
  }
  if (snapshot.deployments.some(entry => entry.actionCount !== snapshot.actions.filter(action => lower(action.hubAddress) === lower(entry.hubAddress)).length)
    || snapshot.excludedQaActions !== qaSources.size
    || snapshot.historicalActions > snapshot.actions.filter(action => action.origin === "HISTORICAL").length) throw new Error("VERIFIED_SNAPSHOT_COUNTS_INVALID");
  return snapshot;
}
export function validatePublication(source: PublicOnchainSnapshot, dashboard: unknown): { publicPayload: z.infer<typeof verifiedSchema>; dashboardPayload: DashboardSnapshot | null } {
  const publicPayload = { configFingerprint: dashboardConfigFingerprint(), snapshot: source };
  const snapshot = parseVerifiedSnapshot(publicPayload);
  if (snapshot.business === null) {
    if (dashboard !== null) throw new Error("VERIFIED_SNAPSHOT_PROJECTION_INVALID");
    return { publicPayload, dashboardPayload: null };
  }
  const projection = parseDashboardSnapshot(dashboard);
  if (projection.blockNumber !== snapshot.blockNumber || lower(projection.blockHash) !== lower(snapshot.blockHash)
    || projection.verifiedAt !== snapshot.generatedAt || projection.blockTimestamp !== snapshot.blockTimestamp
    || !same(projection.deployments, snapshot.deployments) || !same(projection.metrics, snapshot.business)) throw new Error("VERIFIED_SNAPSHOT_PROJECTION_INVALID");
  return { publicPayload, dashboardPayload: projection };
}
function database() {
  const env = loadServerEnv();
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}
function assertStoredMetadata(row: Record<string, unknown>, blockNumber: string, blockHash: string, verifiedAt: string) {
  const meta = z.object({ block_number: z.union([integer, count]), block_hash: hash, verified_at: timestamp }).parse(row);
  if (String(meta.block_number) !== blockNumber || lower(meta.block_hash) !== lower(blockHash)
    || Date.parse(meta.verified_at) !== Date.parse(verifiedAt)) throw new Error("VERIFIED_SNAPSHOT_STORED_METADATA_INVALID");
}
export async function readVerifiedPublicSnapshot(): Promise<unknown> {
  const { data, error } = await database().from("onchain_verified_snapshot").select("public_payload,block_number,block_hash,verified_at").eq("id", true).abortSignal(AbortSignal.timeout(4000)).maybeSingle();
  if (error) throw new Error("VERIFIED_SNAPSHOT_READ_UNAVAILABLE");
  if (!data) return undefined;
  const snapshot = parseVerifiedSnapshot(data.public_payload);
  assertStoredMetadata(data, snapshot.blockNumber, snapshot.blockHash, snapshot.generatedAt);
  return data.public_payload;
}
export async function readVerifiedDashboardSnapshot(): Promise<unknown> {
  const { data, error } = await database().from("onchain_verified_snapshot").select("dashboard_payload,block_number,block_hash,verified_at").eq("id", true).abortSignal(AbortSignal.timeout(4000)).maybeSingle();
  if (error) throw new Error("DASHBOARD_READ_UNAVAILABLE");
  if (!data?.dashboard_payload) return undefined;
  const snapshot = parseDashboardSnapshot(data.dashboard_payload);
  assertStoredMetadata(data, snapshot.blockNumber, snapshot.blockHash, snapshot.verifiedAt);
  return data.dashboard_payload;
}
export async function publishVerifiedSnapshot(source: PublicOnchainSnapshot, dashboard: DashboardSnapshot | null, signal?: AbortSignal): Promise<boolean> {
  const { publicPayload, dashboardPayload } = validatePublication(source, dashboard);
  signal?.throwIfAborted();
  const { data, error } = await database().rpc("replace_onchain_verified_snapshot", { p_public_payload: publicPayload, p_dashboard_payload: dashboardPayload }).abortSignal(signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000));
  if (error) throw new Error("VERIFIED_SNAPSHOT_WRITE_UNAVAILABLE");
  return data === true;
}
