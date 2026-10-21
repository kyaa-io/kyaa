import { z } from "zod";
import type { PreparedSubmission } from "./domain.js";
const hash = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const uint64 = z.string().regex(/^[1-9][0-9]*$/).refine(v => BigInt(v) <= 18446744073709551615n);
export const participationItemSchema = z.object({ source: hash, creator: hash, participant: hash, occurredAtMicros: uint64, revision: uint64, kind: z.number().int().min(1).max(4), origin: z.number().int().min(0).max(1), active: z.boolean() }).strict();
export const participationPayloadSchema = z.object({ version: z.literal(1), chainId: z.literal(91342), contractAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/), items: z.array(participationItemSchema).min(1).max(20) }).strict();
export type ParticipationPayload = z.infer<typeof participationPayloadSchema>;
export type ParticipationStatus = "included" | "safe" | "finalized" | "orphaned";
export interface ParticipationReceipt { txHash: string; blockNumber: string; blockHash: string; transactionIndex: number; inclusionStatus: ParticipationStatus }
export type ParticipationRevertedReceipt = ParticipationReceipt & { outcome: "reverted"; inclusionStatus: "finalized" };
export class ParticipationRevertedError extends Error {
  constructor(readonly receipt: ParticipationRevertedReceipt) { super("Participation transaction reverted and finalized"); }
}
export interface ParticipationJob { id: string; leaseOwner: string; relayer: string; chainId: number; contractAddress: string; items: unknown; payload: unknown; txHash: string | null; signedTransaction: string | null }
export interface ParticipationQueue {
  claim(worker: string, batch: number, lease: number): Promise<ParticipationJob[]>;
  freeze(job: ParticipationJob, payload: ParticipationPayload): Promise<ParticipationJob>;
  writer(job: ParticipationJob, relayer: string, lease: number): Promise<boolean>;
  release(job: ParticipationJob, relayer: string): Promise<void>;
  admit(job: ParticipationJob): Promise<boolean>;
  prepared(job: ParticipationJob, submission: PreparedSubmission): Promise<ParticipationJob>;
  complete(job: ParticipationJob, receipt: ParticipationReceipt): Promise<void>;
  failReverted(job: ParticipationJob, receipt: ParticipationRevertedReceipt): Promise<void>;
  retry(job: ParticipationJob, code: string, message: string): Promise<void>;
}
export interface ParticipationChain {
  relayerAddress: string;
  prepare(payload: ParticipationPayload): Promise<PreparedSubmission>;
  broadcast(payload: ParticipationPayload, submission: PreparedSubmission): Promise<string>;
  receipt(payload: ParticipationPayload, submission: PreparedSubmission): Promise<ParticipationReceipt | null>;
}
export const participationComponents = [
  { name: "source", type: "bytes32" }, { name: "creator", type: "bytes32" }, { name: "participant", type: "bytes32" },
  { name: "occurredAtMicros", type: "uint64" }, { name: "revision", type: "uint64" }, { name: "kind", type: "uint8" }, { name: "origin", type: "uint8" }, { name: "active", type: "bool" },
] as const;
export const participationAbi = [
  { type: "function", name: "record", stateMutability: "nonpayable", inputs: [{ name: "items", type: "tuple[]", components: participationComponents }], outputs: [] },
  { type: "function", name: "participations", stateMutability: "view", inputs: [{ name: "", type: "bytes32" }], outputs: participationComponents },
  { type: "function", name: "counts", stateMutability: "view", inputs: [{ name: "creator", type: "bytes32" }, { name: "day", type: "uint256" }], outputs: [{ type: "tuple", components: [{ name: "reservations", type: "uint256" }, { name: "passports", type: "uint256" }, { name: "likes", type: "uint256" }, { name: "comments", type: "uint256" }, { name: "engagedFans", type: "uint256" }] }] },
] as const;
