import { encodeFunctionData, keccak256, parseAbi, type Address, type Hash, type Hex } from "viem";

export const registrationDeployment = {
  chainId: 91342,
  hub: "0xbd9991a26d0a0bf744ecdb8ad4f59f60a9132956" as Address,
  registry: "0x4e104e5dfb3d466a2aac9ed0cf7572578068529b" as Address,
  runtime: "0x094b3a4a3af412568b9d3f004fd8f9e09e8dca8249398f50b9f25308a034d53b" as Hash,
  bindings: ["5f45d72b-8d14-4cdb-906e-248ffb036206", "f03415d0-3235-4bd7-bee5-a8a9c36c163a"],
};
export const registrationAbi = parseAbi([
  "function registerCreator(bytes32 creatorId,string publicSlug)",
  "function registerCampaign(bytes32 campaignId,bytes32 creatorId,string publicSlug)",
  "function isValidContext(bytes32 creatorId,bytes32 campaignId) view returns (bool)",
  "function registrar() view returns (address)",
  "function admin() view returns (address)",
  "function contextRegistry() view returns (address)",
  "event CreatorRegistered(bytes32 indexed creatorId,string publicSlug)",
  "event CampaignRegistered(bytes32 indexed campaignId,bytes32 indexed creatorId,string publicSlug)",
]);
export class RegistrationError extends Error {
  constructor(readonly code: string) { super(code); }
}
export function requireRegistration(ok: unknown, code: string): asserts ok {
  if (!ok) throw new RegistrationError(code);
}
export function registrationId(id: string): Hash {
  requireRegistration(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id), "INVALID_REGISTRATION_ID");
  return `0x${id.replaceAll("-", "").padStart(64, "0")}`;
}
export type RegistrationEnvelope = { chainId: number; nonce: string; to: Address; data: Hex; value: string; gasLimit: string; maxFeePerGas: string; maxPriorityFeePerGas: string };
export type RegistrationProof = { transactionHash: Hash; blockNumber: string; blockHash: Hash };
export type RegistrationAttempt = { id: string; nonce: number; registrar: Address; envelope: RegistrationEnvelope; signed_transaction: Hex | null; transaction_hash: Hash | null; status: string; receipt: RegistrationProof | null };
export type RegistrationClaim = {
  job: { id: string; kind: "creator" | "campaign"; binding_id: string; creator_id: string; campaign_id: string | null; slug: string; lease_owner: string; lease_fence: number; status: string; lease_expires_at?: string; recovery_before_block?: string | null };
  binding: { id: string; chain_id: number; hub_proxy: string };
  source: { valid: boolean; identityValid: boolean };
  attempt: RegistrationAttempt | null;
};
export function registrationData(claim: RegistrationClaim): Hex {
  const j = claim.job;
  requireRegistration(registrationDeployment.bindings.includes(j.binding_id)
    && claim.binding.id === j.binding_id && Number(claim.binding.chain_id) === registrationDeployment.chainId
    && claim.binding.hub_proxy.toLowerCase() === registrationDeployment.hub, "REGISTRATION_SOURCE_CHANGED");
  requireRegistration(j.kind === "creator" || j.kind === "campaign", "INVALID_REGISTRATION_KIND");
  requireRegistration(typeof j.slug === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(j.slug) && j.slug.length <= (j.kind === "creator" ? 80 : 250), "INVALID_REGISTRATION_SLUG");
  if (j.kind === "creator") {
    requireRegistration(j.campaign_id === null, "INVALID_REGISTRATION_KIND");
    return encodeFunctionData({ abi: registrationAbi, functionName: "registerCreator", args: [registrationId(j.creator_id), j.slug] });
  }
  requireRegistration(j.campaign_id, "INVALID_REGISTRATION_KIND");
  return encodeFunctionData({ abi: registrationAbi, functionName: "registerCampaign", args: [registrationId(j.campaign_id), registrationId(j.creator_id), j.slug] });
}
export function assertRegistrationEnvelope(claim: RegistrationClaim, envelope: RegistrationEnvelope) {
  requireRegistration(envelope.chainId === registrationDeployment.chainId && /^\d+$/.test(envelope.nonce) && Number.isSafeInteger(Number(envelope.nonce)) && Number(envelope.nonce) >= 0
    && envelope.to?.toLowerCase() === registrationDeployment.registry && envelope.data === registrationData(claim)
    && envelope.value === "0" && envelope.gasLimit === "150000"
    && /^\d+$/.test(envelope.maxFeePerGas) && BigInt(envelope.maxFeePerGas) > 0n && BigInt(envelope.maxFeePerGas) <= 100000000n
    && /^\d+$/.test(envelope.maxPriorityFeePerGas) && BigInt(envelope.maxPriorityFeePerGas) <= BigInt(envelope.maxFeePerGas), "REGISTRATION_ENVELOPE_CHANGED");
}
export function sameRegistrationEnvelope(a: RegistrationEnvelope, b: RegistrationEnvelope) {
  return Object.entries(a).every(([key, value]) => b[key as keyof RegistrationEnvelope] === value) && Object.keys(a).length === Object.keys(b).length;
}
export interface RegistrationQueue {
  claim(owner: string, registrar: Address): Promise<RegistrationClaim[]>;
  transition(claim: RegistrationClaim, operation: string, payload?: Record<string, unknown>): Promise<RegistrationClaim>;
}
export interface RegistrationChain {
  registrar: Address;
  validateDeployment(blockNumber?: bigint): Promise<void>;
  findExisting(claim: RegistrationClaim): Promise<{ proof: RegistrationProof; envelope: RegistrationEnvelope; registrar: Address } | { pending: true; recoveryBeforeBlock: string } | null>;
  prepare(claim: RegistrationClaim): Promise<RegistrationEnvelope>;
  sign(claim: RegistrationClaim): Promise<Hex>;
  assertSigned(claim: RegistrationClaim): Promise<void>;
  broadcast(raw: Hex): Promise<Hash>;
  inspect(claim: RegistrationClaim): Promise<{ state: "missing" | "orphaned" | "confirmed" | "finalized" | "reverted" | "finalized_revert"; proof?: RegistrationProof }>;
}
export async function processRegistration(initial: RegistrationClaim, queue: RegistrationQueue, chain: RegistrationChain) {
  let claim = initial;
  registrationData(claim);
  requireRegistration(claim.source?.identityValid, "REGISTRATION_SOURCE_CHANGED");
  await chain.validateDeployment();
  if (claim.attempt?.status === "reverted") claim = { ...claim, attempt: null };
  if (!claim.attempt) {
    requireRegistration(claim.source?.valid, "REGISTRATION_SOURCE_CHANGED");
    const existing = await chain.findExisting(claim);
    if (existing && "pending" in existing) {
      await queue.transition(claim, "defer", { recoveryBeforeBlock: existing.recoveryBeforeBlock, delaySeconds: 60, errorCode: "REGISTRATION_RECOVERY_PENDING" });
      return;
    }
    if (existing) {
      claim = await queue.transition(claim, "recover", { ...existing.proof, envelope: existing.envelope, nonce: existing.envelope.nonce, registrar: existing.registrar });
      requireRegistration(claim.attempt?.transaction_hash === existing.proof.transactionHash, "RECOVERY_NOT_DURABLE");
    } else {
      const envelope = await chain.prepare(claim);
      assertRegistrationEnvelope(claim, envelope);
      claim = await queue.transition(claim, "reserve", { nonce: envelope.nonce, envelope });
    }
  }
  requireRegistration(claim.attempt, "ATTEMPT_NOT_DURABLE");
  assertRegistrationEnvelope(claim, claim.attempt.envelope);
  requireRegistration(Number(claim.attempt.nonce) === Number(claim.attempt.envelope.nonce), "REGISTRATION_NONCE_CHANGED");
  if (!claim.attempt.transaction_hash) {
    requireRegistration(claim.source?.identityValid, "REGISTRATION_SOURCE_CHANGED");
    requireRegistration(claim.attempt.registrar.toLowerCase() === chain.registrar.toLowerCase(), "REGISTRATION_SIGNER_CHANGED");
    const raw = await chain.sign(claim);
    const hash = keccak256(raw);
    claim = await queue.transition(claim, "prepare", { signedTransaction: raw, transactionHash: hash });
    requireRegistration(claim.attempt?.signed_transaction === raw && claim.attempt.transaction_hash === hash, "SIGNED_TRANSACTION_NOT_DURABLE");
  }
  if (claim.attempt?.signed_transaction) await chain.assertSigned(claim);
  const observed = await chain.inspect(claim);
  if (observed.state === "orphaned") {
    if (claim.attempt?.receipt && claim.attempt.status === "confirmed") {
      claim = await queue.transition(claim, "orphan", { transactionHash: claim.attempt.transaction_hash, blockHash: claim.attempt.receipt.blockHash });
    }
    await queue.transition(claim, "defer", { errorCode: "WAITING_RECEIPT", delaySeconds: 60 });
    return;
  }
  if (observed.state === "confirmed" || observed.state === "finalized") {
    requireRegistration(observed.proof, "REGISTRATION_PROOF_MISSING");
    requireRegistration(claim.source?.identityValid, "REGISTRATION_SOURCE_CHANGED");
    claim = await queue.transition(claim, "confirm", observed.proof);
    if (observed.state === "finalized") await queue.transition(claim, "finalize", observed.proof);
    else await queue.transition(claim, "defer", { errorCode: "WAITING_FINALITY", delaySeconds: 60 });
    return;
  }
  if (observed.state === "finalized_revert") {
    requireRegistration(observed.proof, "REGISTRATION_PROOF_MISSING");
    await queue.transition(claim, "revert", { ...observed.proof, contextAbsent: true });
    return;
  }
  if (observed.state === "missing" && claim.attempt?.signed_transaction) {
    requireRegistration(claim.source?.identityValid, "REGISTRATION_SOURCE_CHANGED");
    const raw = claim.attempt.signed_transaction;
    const expectedHash = claim.attempt.transaction_hash;
    // Submission intent also fences higher nonces while an earlier receipt is orphaned.
    claim = await queue.transition(claim, "submit");
    requireRegistration(claim.attempt?.signed_transaction === raw && claim.attempt.transaction_hash === expectedHash, "SIGNED_TRANSACTION_NOT_DURABLE");
    const hash = await chain.broadcast(raw);
    requireRegistration(hash === expectedHash, "BROADCAST_HASH_CHANGED");
  }
  await queue.transition(claim, "defer", { errorCode: observed.state === "reverted" ? "WAITING_FINALITY" : "WAITING_RECEIPT", delaySeconds: 60 });
}
export async function runRegistrationQueue(queue: RegistrationQueue, chain: RegistrationChain, owner: string, remainingTimeInMillis?: () => number) {
  const started = Date.now();
  const remaining = remainingTimeInMillis ?? (() => 120000 - (Date.now() - started));
  let processed = 0;
  // Acquire each lease just before work; slow RPCs must not expire a prefetched batch.
  while (processed < 10 && remaining() > 30000) {
    const claims = await queue.claim(owner, chain.registrar);
    if (!claims.length) break;
    requireRegistration(claims.length === 1, "REGISTRATION_DATABASE_RESPONSE");
    const claim = claims[0]!;
    try { await processRegistration(claim, queue, chain); }
    catch (error) {
      const errorCode = error instanceof RegistrationError ? error.code : "REGISTRATION_TRANSIENT";
      // Never log transport errors: RPC URLs and credentials can occur in their messages.
      await queue.transition(claim, "defer", { errorCode, delaySeconds: 120 });
    }
    processed++;
  }
  return processed;
}
