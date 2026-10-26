import { describe, expect, it, vi } from "vitest";
import { encodeAbiParameters, encodeEventTopics, keccak256, type Address, type Hash, type Hex, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { processRegistration, registrationData, registrationDeployment, registrationId, runRegistrationQueue, type RegistrationAttempt, type RegistrationChain, type RegistrationClaim, type RegistrationEnvelope, type RegistrationQueue, type RegistrationProof } from "../src/creator-registration.js";
import { CreatorRegistrationChain } from "../src/adapters/creator-registration-chain.js";
import { CreatorRegistrationQueue } from "../src/adapters/creator-registration-queue.js";
import { createCreatorRegistrationLambdaHandler } from "../src/creator-registration-lambda.js";
import { parseCreatorRegistrationEnv } from "../src/creator-registration-runtime.js";
const key = `0x${"1".repeat(64)}` as Hex;
const signer = privateKeyToAccount(key).address;
const hash = `0x${"a".repeat(64)}` as Hash;
const blockHash = `0x${"b".repeat(64)}` as Hash;
function fixture(): RegistrationClaim {
  return { job: { id: "job", kind: "creator", creator_id: "11111111-1111-1111-1111-111111111111", campaign_id: null, slug: "creator-one", binding_id: registrationDeployment.bindings[0]!, lease_owner: "worker", lease_fence: 1, status: "queued" }, binding: { id: registrationDeployment.bindings[0]!, chain_id: 91342, hub_proxy: registrationDeployment.hub }, source: { valid: true, identityValid: true }, attempt: null };
}
function envelope(claim = fixture()): RegistrationEnvelope { return { chainId: 91342, nonce: "7", to: registrationDeployment.registry, data: registrationData(claim), value: "0", gasLimit: "150000", maxFeePerGas: "100", maxPriorityFeePerGas: "0" }; }
function attempt(claim = fixture()): RegistrationAttempt { return { id: "attempt", nonce: 7, registrar: signer, envelope: envelope(claim), signed_transaction: "0x02aa", transaction_hash: keccak256("0x02aa"), status: "prepared", receipt: null }; }
function harness() {
  let saved = fixture();
  const steps: string[] = [];
  const queue: RegistrationQueue = {
    claim: vi.fn().mockImplementationOnce(async () => [structuredClone(saved)]).mockResolvedValue([]),
    transition: vi.fn(async (_claim, op, payload = {}) => {
      steps.push(op);
      if (op === "reserve") saved.attempt = { ...attempt(saved), envelope: payload.envelope as RegistrationEnvelope, signed_transaction: null, transaction_hash: null };
      if (op === "prepare") { saved.attempt!.signed_transaction = payload.signedTransaction as Hex; saved.attempt!.transaction_hash = payload.transactionHash as Hash; }
      if (op === "confirm") saved.attempt!.receipt = payload as RegistrationProof;
      return structuredClone(saved);
    }),
  };
  const chain: RegistrationChain = {
    registrar: signer, validateDeployment: vi.fn(async () => {}), findExisting: vi.fn(async () => null), prepare: vi.fn(async () => envelope(saved)), sign: vi.fn(async () => "0x02aa" as Hex), assertSigned: vi.fn(async () => {}),
    broadcast: vi.fn(async raw => { steps.push("broadcast"); return keccak256(raw); }), inspect: vi.fn(async () => ({ state: "missing" as const })),
  };
  return { queue, chain, steps, get saved() { return saved; }, set saved(value) { saved = value; } };
}
describe("durable registration lane", () => {
  it("reserves and confirms saved signed bytes before broadcast", async () => {
    const h = harness(); await processRegistration(h.saved, h.queue, h.chain);
    expect(h.steps).toEqual(["reserve", "prepare", "submit", "broadcast", "defer"]);
    expect(h.chain.broadcast).toHaveBeenCalledWith(h.saved.attempt!.signed_transaction);
  });
  it("does not broadcast when prepare persisted but its response was lost; restart replays identical bytes", async () => {
    const h = harness(); const transition = h.queue.transition;
    h.queue.transition = vi.fn(async (claim, op, payload) => { const result = await transition(claim, op, payload); if (op === "prepare") throw new Error("lost response"); return result; });
    await expect(processRegistration(h.saved, h.queue, h.chain)).rejects.toThrow("lost response");
    expect(h.chain.broadcast).not.toHaveBeenCalled();
    h.queue.transition = transition;
    const persisted = h.saved.attempt!.signed_transaction;
    await processRegistration(h.saved, h.queue, h.chain);
    expect(h.chain.sign).toHaveBeenCalledTimes(1); expect(h.chain.broadcast).toHaveBeenCalledWith(persisted);
  });
  it("resumes the frozen unsigned envelope after reserve response loss", async () => {
    const h = harness(); const transition = h.queue.transition;
    h.queue.transition = async (claim, op, payload) => { const result = await transition(claim, op, payload); if (op === "reserve") throw Error("lost reserve response"); return result; };
    await expect(processRegistration(h.saved, h.queue, h.chain)).rejects.toThrow("lost reserve response"); expect(h.chain.sign).not.toHaveBeenCalled();
    const unsigned = structuredClone(h.saved.attempt!.envelope); h.queue.transition = transition;
    await processRegistration(h.saved, h.queue, h.chain);
    expect(h.saved.attempt!.envelope).toEqual(unsigned); expect(h.chain.prepare).toHaveBeenCalledTimes(1);
  });
  it("keeps same nonce and bytes after lost broadcast response", async () => {
    const h = harness(); h.chain.broadcast = vi.fn().mockRejectedValueOnce(new Error("lost response")).mockImplementation(async raw => keccak256(raw));
    await expect(processRegistration(h.saved, h.queue, h.chain)).rejects.toThrow();
    const persisted = structuredClone(h.saved.attempt);
    await processRegistration(h.saved, h.queue, h.chain);
    expect(h.saved.attempt).toEqual(persisted); expect(h.chain.sign).toHaveBeenCalledTimes(1); expect(h.chain.broadcast).toHaveBeenCalledTimes(2);
  });
  it("does not broadcast until submit fencing is durably acknowledged", async () => {
    const h = harness(); h.saved.attempt = attempt(); const transition = h.queue.transition;
    h.queue.transition = async (claim, op, payload) => { const result = await transition(claim, op, payload); if (op === "submit") throw Error("lost submit response"); return result; };
    await expect(processRegistration(h.saved, h.queue, h.chain)).rejects.toThrow("lost submit response"); expect(h.chain.broadcast).not.toHaveBeenCalled();
    h.queue.transition = transition; await processRegistration(h.saved, h.queue, h.chain); expect(h.chain.broadcast).toHaveBeenCalledTimes(1);
  });
  it("requires exact persisted raw/hash acknowledgment", async () => {
    const h = harness(); const transition = h.queue.transition;
    h.queue.transition = async (claim, op, payload) => { const result = await transition(claim, op, payload); if (op === "prepare") result.attempt!.signed_transaction = "0x02bb"; return result; };
    await expect(processRegistration(h.saved, h.queue, h.chain)).rejects.toThrow("SIGNED_TRANSACTION_NOT_DURABLE"); expect(h.chain.broadcast).not.toHaveBeenCalled();
  });
  it("persists bounded recovery progress without signing or consuming failure budget", async () => {
    const h = harness(); h.chain.findExisting = vi.fn(async () => ({ pending: true as const, recoveryBeforeBlock: "12345" }));
    await processRegistration(h.saved, h.queue, h.chain);
    expect(h.queue.transition).toHaveBeenCalledWith(expect.anything(), "defer", { recoveryBeforeBlock: "12345", delaySeconds: 60, errorCode: "REGISTRATION_RECOVERY_PENDING" });
    expect(h.chain.sign).not.toHaveBeenCalled(); expect(h.chain.prepare).not.toHaveBeenCalled(); expect(h.chain.broadcast).not.toHaveBeenCalled();
  });
  it("recovers exact historical proof without signing", async () => {
    const h = harness(); const proof = { transactionHash: hash, blockNumber: "10", blockHash };
    h.chain.findExisting = vi.fn(async () => ({ proof, envelope: envelope(), registrar: signer }));
    h.queue.transition = vi.fn(async (_claim, op) => { h.steps.push(op); if (op === "recover") h.saved.attempt = { ...attempt(), transaction_hash: hash, signed_transaction: null }; return structuredClone(h.saved); });
    h.chain.inspect = vi.fn(async () => ({ state: "finalized" as const, proof }));
    await processRegistration(h.saved, h.queue, h.chain);
    expect(h.steps).toEqual(["recover", "confirm", "finalize"]); expect(h.chain.sign).not.toHaveBeenCalled(); expect(h.chain.broadcast).not.toHaveBeenCalled();
  });
  it("refreshes confirmed admission and waits without submitting/finalizing", async () => {
    const h = harness(); h.saved.attempt = attempt(); h.chain.inspect = vi.fn(async () => ({ state: "confirmed" as const, proof: { transactionHash: hash, blockNumber: "10", blockHash } }));
    await processRegistration(h.saved, h.queue, h.chain);
    expect(h.steps).toEqual(["confirm", "defer"]); expect(h.queue.transition).toHaveBeenLastCalledWith(expect.anything(), "defer", { errorCode: "WAITING_FINALITY", delaySeconds: 60 });
  });
  it("revokes orphaned proof with hash/block CAS", async () => {
    const h = harness(); h.saved.attempt = attempt(); h.saved.attempt.status = "confirmed"; h.saved.attempt.receipt = { transactionHash: h.saved.attempt.transaction_hash!, blockNumber: "10", blockHash }; h.chain.inspect = vi.fn(async () => ({ state: "orphaned" as const }));
    await processRegistration(h.saved, h.queue, h.chain);
    expect(h.queue.transition).toHaveBeenCalledWith(expect.anything(), "orphan", { transactionHash: h.saved.attempt.transaction_hash, blockHash }); expect(h.chain.broadcast).not.toHaveBeenCalled();
  });
  it("only releases reverted nonce after finalized absent-context proof", async () => {
    const h = harness(); h.saved.attempt = attempt(); h.chain.inspect = vi.fn(async () => ({ state: "reverted" as const }));
    await processRegistration(h.saved, h.queue, h.chain); expect(h.steps).toEqual(["defer"]);
    h.steps.length = 0; h.chain.inspect = vi.fn(async () => ({ state: "finalized_revert" as const, proof: { transactionHash: hash, blockNumber: "10", blockHash } }));
    await processRegistration(h.saved, h.queue, h.chain); expect(h.steps).toEqual(["revert"]);
  });
  it("still revokes orphaned proof when source was archived after submission", async () => {
    const h = harness(); h.saved.attempt = attempt(); h.saved.attempt.status = "confirmed"; h.saved.attempt.receipt = { transactionHash: h.saved.attempt.transaction_hash!, blockNumber: "10", blockHash }; h.saved.source.valid = false;
    h.chain.inspect = vi.fn(async () => ({ state: "orphaned" as const }));
    await processRegistration(h.saved, h.queue, h.chain); expect(h.steps).toEqual(["orphan", "defer"]);
  });
  it("does not broadcast saved bytes after source identity mismatch", async () => {
    const h = harness(); h.saved.attempt = attempt(); h.saved.source.identityValid = false;
    await expect(processRegistration(h.saved, h.queue, h.chain)).rejects.toThrow("REGISTRATION_SOURCE_CHANGED"); expect(h.chain.inspect).not.toHaveBeenCalled(); expect(h.chain.broadcast).not.toHaveBeenCalled();
  });
  it("continues frozen authorized registration and confirms after unpublication", async () => {
    const h = harness(); const transition = h.queue.transition;
    h.queue.transition = async (claim, op, payload) => { const result = await transition(claim, op, payload); if (op === "reserve") { h.saved.source.valid = false; result.source.valid = false; } return result; };
    await processRegistration(h.saved, h.queue, h.chain);
    expect(h.chain.sign).toHaveBeenCalledTimes(1); expect(h.chain.broadcast).toHaveBeenCalledTimes(1);
    h.chain.inspect = vi.fn(async () => ({ state: "confirmed" as const, proof: { transactionHash: h.saved.attempt!.transaction_hash!, blockNumber: "10", blockHash } }));
    await processRegistration(h.saved, h.queue, h.chain);
    expect(h.saved.attempt!.receipt).toMatchObject({ blockNumber: "10" });
    expect(h.chain.sign).toHaveBeenCalledTimes(1);
  });
  it("reconciles external registration afresh after an earlier finalized revert", async () => {
    const h = harness(); h.saved.attempt = { ...attempt(), status: "reverted" };
    h.chain.findExisting = vi.fn(async claim => { expect(claim.attempt).toBeNull(); return null; });
    await processRegistration(h.saved, h.queue, h.chain); expect(h.chain.prepare).toHaveBeenCalledTimes(1); expect(h.steps[0]).toBe("reserve");
  });
  it("never reserves unpublished source without earlier durable authorization", async () => {
    const h = harness(); h.saved.source.valid = false;
    await expect(processRegistration(h.saved, h.queue, h.chain)).rejects.toThrow("REGISTRATION_SOURCE_CHANGED"); expect(h.chain.sign).not.toHaveBeenCalled(); expect(h.queue.transition).not.toHaveBeenCalled();
  });
  it("refreshes multiple due confirmations within one scheduled invocation", async () => {
    const h = harness();
    const one = fixture(); one.attempt = attempt(one);
    const two = fixture(); two.job.id = "job2"; two.job.creator_id = "22222222-2222-2222-2222-222222222222"; two.attempt = attempt(two);
    h.queue.claim = vi.fn().mockResolvedValueOnce([one]).mockResolvedValueOnce([two]).mockResolvedValue([]);
    h.queue.transition = vi.fn(async (claim, op) => { h.steps.push(`${claim.job.id}:${op}`); return claim; });
    h.chain.inspect = vi.fn(async () => ({ state: "confirmed" as const, proof: { transactionHash: hash, blockNumber: "10", blockHash } }));
    expect(await runRegistrationQueue(h.queue, h.chain, "worker")).toBe(2);
    expect(h.steps).toEqual(["job:confirm", "job:defer", "job2:confirm", "job2:defer"]);
  });
  it("does not acquire a lease with less than 30 seconds remaining", async () => {
    const h = harness(); expect(await runRegistrationQueue(h.queue, h.chain, "worker", () => 25000)).toBe(0); expect(h.queue.claim).not.toHaveBeenCalled();
  });
  it("uses only safe codes for transport failures", async () => {
    const h = harness(); h.chain.validateDeployment = vi.fn(async () => { throw new Error("https://secret-token.example"); });
    await runRegistrationQueue(h.queue, h.chain, "worker"); expect(h.queue.transition).toHaveBeenCalledWith(expect.anything(), "defer", { errorCode: "REGISTRATION_TRANSIENT", delaySeconds: 120 });
  });
});
function chainFixture() {
  const claim = fixture(); claim.attempt = { ...attempt(), transaction_hash: hash };
  const topics = encodeEventTopics({ abi: [{ type: "event", name: "CreatorRegistered", inputs: [{ name: "creatorId", type: "bytes32", indexed: true }, { name: "publicSlug", type: "string", indexed: false }] }], eventName: "CreatorRegistered", args: { creatorId: registrationId(claim.job.creator_id) } });
  const receipt = { transactionHash: hash, blockHash, blockNumber: 10n, status: "success", from: signer, to: registrationDeployment.registry, logs: [{ address: registrationDeployment.registry, topics, data: encodeAbiParameters([{ type: "string" }], [claim.job.slug]), transactionHash: hash, blockHash, blockNumber: 10n }] };
  const tx = { hash, blockHash, blockNumber: 10n, from: signer, to: registrationDeployment.registry, type: "eip1559", chainId: 91342, nonce: 7, gas: 150000n, value: 0n, maxFeePerGas: 100n, maxPriorityFeePerGas: 0n, input: registrationData(claim) };
  const client = { getTransactionCount: vi.fn(async () => 7), getTransactionReceipt: vi.fn(async () => receipt), getTransaction: vi.fn(async () => tx), getBlock: vi.fn(async (_args: unknown) => ({ number: 9n, hash: blockHash })), readContract: vi.fn(async () => true), getChainId: vi.fn(async () => 91342), getCode: vi.fn(async () => "0x00"), getBlockNumber: vi.fn(async () => 20n), getLogs: vi.fn(async () => [{ args: { creatorId: registrationId(claim.job.creator_id), publicSlug: claim.job.slug }, transactionHash: hash, blockHash, blockNumber: 10n }]) };
  const chain = new CreatorRegistrationChain({ rpcUrl: "https://rpc.example", privateKey: key, expectedRegistrar: signer, deploymentBlock: 1n }, client as unknown as PublicClient);
  return { claim, receipt, tx, client, chain };
}
describe("chain registration evidence", () => {
  it("accepts exact canonical receipt, event, envelope and context", async () => { const h = chainFixture(); expect(await h.chain.inspect(h.claim)).toMatchObject({ state: "confirmed" as const }); });
  it.each(["slug", "creator", "sender", "input", "chain", "fee"])("rejects changed %s", async field => {
    const h = chainFixture();
    if (field === "slug") h.receipt.logs[0]!.data = encodeAbiParameters([{ type: "string" }], ["wrong-slug"]);
    if (field === "creator") h.receipt.logs[0]!.topics[1] = `0x${"0".repeat(64)}`;
    if (field === "sender") h.tx.from = "0x0000000000000000000000000000000000000001";
    if (field === "input") h.tx.input = "0x1234" as Hex;
    if (field === "chain") h.tx.chainId = 1;
    if (field === "fee") h.tx.maxFeePerGas = 100000001n;
    await expect(h.chain.inspect(h.claim)).rejects.toThrow();
  });
  it("reports canonical-block mismatch as orphan without admission", async () => { const h = chainFixture(); h.client.getBlock.mockResolvedValue({ number: 10n, hash: `0x${"c".repeat(64)}` }); expect(await h.chain.inspect(h.claim)).toEqual({ state: "orphaned" as const }); });
  it("rejects wrong registry runtime", async () => { const h = chainFixture(); await expect(h.chain.validateDeployment()).rejects.toThrow("REGISTRATION_DEPLOYMENT_CHANGED"); });
  it("rechecks finalized block, receipt block, deployment and mapping", async () => {
    const h = chainFixture(); h.client.getBlock.mockResolvedValue({ number: 20n, hash: blockHash }); const deployment = vi.spyOn(h.chain, "validateDeployment").mockResolvedValue();
    expect(await h.chain.inspect(h.claim)).toMatchObject({ state: "finalized" as const }); expect(deployment).toHaveBeenCalledWith(20n); expect(h.client.readContract).toHaveBeenCalledWith(expect.objectContaining({ blockNumber: 20n, functionName: "isValidContext" }));
  });
  it("admits canonical confirmation while finality RPC is unavailable", async () => {
    const h = chainFixture(); h.client.getBlock.mockImplementation(async (args: unknown) => { if ((args as { blockTag?: string }).blockTag === "finalized") throw Error("not available"); return { number: 10n, hash: blockHash }; });
    expect(await h.chain.inspect(h.claim)).toMatchObject({ state: "confirmed" });
  });
  it("recovers original canonical receipt with historical registrar", async () => {
    const h = chainFixture(); h.client.readContract.mockImplementation(async (args?: unknown) => ((args as { functionName?: string }).functionName === "isValidContext" ? true : signer) as never);
    expect(await h.chain.findExisting({ ...h.claim, attempt: null })).toMatchObject({ registrar: signer, proof: { transactionHash: hash, blockHash, blockNumber: "10" } });
  });
  it("skips logs for an unregistered context even beyond the provider range limit", async () => {
    const h = chainFixture(); h.client.getBlockNumber.mockResolvedValue(25001n); h.client.readContract.mockResolvedValue(false);
    h.client.getLogs.mockImplementation(async () => { throw Error("block range greater than 10000 max"); });
    expect(await h.chain.findExisting({ ...h.claim, attempt: null })).toBeNull(); expect(h.client.getLogs).not.toHaveBeenCalled();
  });
  it("recovers backwards in provider-compatible 10000-block windows", async () => {
    const h = chainFixture(); h.client.getBlockNumber.mockResolvedValue(25001n);
    h.client.readContract.mockImplementation(async (args?: unknown) => ((args as { functionName?: string }).functionName === "isValidContext" ? true : signer) as never);
    h.client.getLogs.mockImplementation(async (...args: unknown[]) => {
      const { fromBlock, toBlock } = args[0] as { fromBlock: bigint; toBlock: bigint };
      if (toBlock - fromBlock + 1n > 10000n) throw Error("block range greater than 10000 max");
      return fromBlock <= 10n && toBlock >= 10n ? [{ args: { creatorId: registrationId(h.claim.job.creator_id), publicSlug: h.claim.job.slug }, transactionHash: hash, blockHash, blockNumber: 10n }] : [];
    });
    expect(await h.chain.findExisting({ ...h.claim, attempt: null })).toMatchObject({ proof: { transactionHash: hash } });
    expect(h.client.getLogs.mock.calls.map(call => { const args = (call as unknown[])[0] as { fromBlock: bigint; toBlock: bigint }; return [args.fromBlock, args.toBlock]; })).toEqual([[15002n, 25001n], [5002n, 15001n], [1n, 5001n]]);
  });
  it("resumes durable cursors across restarts until an older exact event is found", async () => {
    const h = chainFixture(); h.client.getBlockNumber.mockResolvedValue(250001n);
    h.client.readContract.mockImplementation(async (args?: unknown) => ((args as { functionName?: string }).functionName === "isValidContext" ? true : signer) as never);
    h.client.getLogs.mockImplementation(async (...args: unknown[]) => {
      const { fromBlock, toBlock } = args[0] as { fromBlock: bigint; toBlock: bigint };
      expect(toBlock - fromBlock + 1n).toBeLessThanOrEqual(10000n);
      return fromBlock <= 10n && toBlock >= 10n ? [{ args: { creatorId: registrationId(h.claim.job.creator_id), publicSlug: h.claim.job.slug }, transactionHash: hash, blockHash, blockNumber: 10n }] : [];
    });
    const cursors: string[] = []; let result;
    for (let invocation = 0; invocation < 3; invocation++) {
      const chain = new CreatorRegistrationChain({ rpcUrl: "https://rpc.example", privateKey: key, expectedRegistrar: signer, deploymentBlock: 1n }, h.client as unknown as PublicClient);
      const before = h.client.getLogs.mock.calls.length;
      result = await chain.findExisting({ ...h.claim, attempt: null });
      expect(h.client.getLogs.mock.calls.length - before).toBeLessThanOrEqual(10);
      if (result && "pending" in result) { cursors.push(result.recoveryBeforeBlock); h.claim.job.recovery_before_block = result.recoveryBeforeBlock; }
      else break;
    }
    expect(cursors).toEqual(["150001", "50001"]); expect(result).toMatchObject({ proof: { transactionHash: hash } }); expect(h.client.getLogs).toHaveBeenCalledTimes(25);
  });
  it("yields and saves progress before slow windows exhaust the claim lease", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-10-26T00:00:00Z"));
      const h = chainFixture(); h.claim.attempt = null; h.claim.job.lease_expires_at = new Date(Date.now() + 120000).toISOString(); h.client.getBlockNumber.mockResolvedValue(250001n);
      h.client.getLogs.mockImplementation(async () => { vi.setSystemTime(Date.now() + 14000); return []; });
      const queue: RegistrationQueue = { claim: vi.fn(), transition: vi.fn(async (claim, op, payload) => {
        expect(op).toBe("defer"); expect(Date.now()).toBeLessThan(Date.parse(claim.job.lease_expires_at!)); expect(payload).toMatchObject({ errorCode: "REGISTRATION_RECOVERY_PENDING", recoveryBeforeBlock: "180001" }); return claim;
      }) };
      const chain = new CreatorRegistrationChain({ rpcUrl: "https://rpc.example", privateKey: key, expectedRegistrar: signer, deploymentBlock: 1n, remainingTimeInMillis: () => 240000 }, h.client as unknown as PublicClient);
      vi.spyOn(chain, "validateDeployment").mockResolvedValue();
      await processRegistration(h.claim, queue, chain);
      expect(h.client.getLogs).toHaveBeenCalledTimes(7); expect(queue.transition).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
  it("saves completed windows when a later RPC query is rate-limited", async () => {
    const h = chainFixture(); h.client.getBlockNumber.mockResolvedValue(250001n);
    h.client.getLogs.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockRejectedValueOnce(Error("rate limit"));
    expect(await h.chain.findExisting({ ...h.claim, attempt: null })).toEqual({ pending: true, recoveryBeforeBlock: "220001" });
    h.claim.job.recovery_before_block = "220001"; h.client.getLogs.mockRejectedValueOnce(Error("rate limit"));
    expect(await h.chain.findExisting({ ...h.claim, attempt: null })).toEqual({ pending: true, recoveryBeforeBlock: "220001" });
    expect(h.client.getLogs).toHaveBeenLastCalledWith(expect.objectContaining({ toBlock: 220001n }));
  });
  it("does not hide conflicting event proof behind pending progress", async () => {
    const h = chainFixture(); h.client.getBlockNumber.mockResolvedValue(250001n);
    h.client.getLogs.mockResolvedValueOnce([]).mockResolvedValueOnce([{ args: { creatorId: registrationId(h.claim.job.creator_id), publicSlug: "wrong" }, transactionHash: hash, blockHash, blockNumber: 10n }]);
    await expect(h.chain.findExisting({ ...h.claim, attempt: null })).rejects.toThrow("REGISTRATION_EVENT_CONFLICT");
  });
  it("rejects recovery event with wrong slug instead of re-registering", async () => { const h = chainFixture(); h.client.getLogs.mockResolvedValue([{ args: { creatorId: registrationId(h.claim.job.creator_id), publicSlug: "wrong" }, transactionHash: hash, blockHash, blockNumber: 10n }]); await expect(h.chain.findExisting({ ...h.claim, attempt: null })).rejects.toThrow("REGISTRATION_EVENT_CONFLICT"); });
  it("validates real signed raw and rejects mismatching hash before replay", async () => {
    const h = chainFixture(); h.claim.attempt!.nonce = 0; h.claim.attempt!.envelope.nonce = "0"; h.client.getTransactionCount.mockResolvedValue(0); const raw = await h.chain.sign(h.claim);
    h.claim.attempt!.signed_transaction = raw; h.claim.attempt!.transaction_hash = keccak256(raw);
    await expect(h.chain.assertSigned(h.claim)).resolves.toBeUndefined();
    h.claim.attempt!.transaction_hash = hash; await expect(h.chain.assertSigned(h.claim)).rejects.toThrow("REGISTRATION_SIGNATURE_CHANGED");
  });
  it("does not sign when registered context has no exact deployment-bounded event", async () => {
    const h = chainFixture(); h.client.getLogs.mockResolvedValue([]);
    await expect(h.chain.findExisting({ ...h.claim, attempt: null })).rejects.toThrow("REGISTRATION_EVENT_MISSING");
  });
  it("rejects source binding mismatch before chain operations", () => {
    const claim = fixture(); claim.binding.hub_proxy = "0x0000000000000000000000000000000000000001";
    expect(() => registrationData(claim)).toThrow("REGISTRATION_SOURCE_CHANGED");
  });
});
describe("isolated runtime", () => {
  it("disabled handler never fetches credentials", async () => {
    const deps = { loadSecret: vi.fn(), runWorker: vi.fn() };
    const handler = createCreatorRegistrationLambdaHandler(deps, { CREATOR_REGISTRATION_WORKER_ENABLED: "false", CREATOR_REGISTRATION_WORKER_ENVIRONMENT: "prod", CREATOR_REGISTRATION_WORKER_SECRET_ID: "byus/creator-registration/prod" });
    expect(await handler({ source: "byus.creator-registration-cron", environment: "prod" })).toEqual({ enabled: false, claimed: 0 }); expect(deps.loadSecret).not.toHaveBeenCalled();
    await expect(handler({ source: "byus.creator-registration-cron", environment: "staging" })).rejects.toThrow();
  });
  it("requires dedicated role and environment-specific PostgREST", () => {
    const token = (role: string) => `header.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.${"s".repeat(40)}`;
    const env = { POSTGREST_URL: "https://data.kyaa.io/", POSTGREST_SERVICE_TOKEN: token("creator_registration_worker"), GIWA_RPC_URL: "https://rpc.example", CREATOR_REGISTRATION_PRIVATE_KEY: key, EXPECTED_REGISTRAR_ADDRESS: signer, REGISTRY_DEPLOYMENT_BLOCK: "1" };
    expect(parseCreatorRegistrationEnv(env, "prod")).toEqual(env);
    expect(() => parseCreatorRegistrationEnv({ ...env, POSTGREST_SERVICE_TOKEN: token("service_role") }, "prod")).toThrow("REGISTRATION_DATABASE_ROLE_CHANGED");
    expect(() => parseCreatorRegistrationEnv(env, "staging")).toThrow("REGISTRATION_ENVIRONMENT_CHANGED");
  });
  it("matches bounded RPC/fencing contract and permits defer lease release", async () => {
    const claim = fixture(); const rpc = vi.fn().mockResolvedValueOnce({ data: [claim], error: null }).mockResolvedValueOnce({ data: { ...claim, job: { ...claim.job, lease_owner: null } }, error: null });
    const queue = new CreatorRegistrationQueue({ rpc } as never);
    expect(await queue.claim("worker", signer)).toEqual([claim]); await queue.transition(claim, "defer", { errorCode: "WAITING_RECEIPT", delaySeconds: 60 });
    expect(rpc).toHaveBeenLastCalledWith("creator_registration_transition", expect.objectContaining({ p_job_id: "job", p_owner: "worker", p_fence: 1, p_operation: "defer" }));
  });
});
