import { createPublicClient, defineChain, http, keccak256, parseEventLogs, parseTransaction, recoverTransactionAddress, TransactionReceiptNotFoundError, type Address, type Hash, type Hex, type PublicClient, type Transaction, type TransactionReceipt, type TransactionSerializedEIP1559 } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { assertRegistrationEnvelope, registrationAbi, registrationData, registrationDeployment as deployment, registrationId, requireRegistration, sameRegistrationEnvelope, type RegistrationAttempt, type RegistrationChain, type RegistrationClaim, type RegistrationEnvelope, type RegistrationProof } from "../creator-registration.js";
const zero = `0x${"0".repeat(64)}` as Hash;
const proofOf = (r: TransactionReceipt): RegistrationProof => ({ transactionHash: r.transactionHash, blockNumber: String(r.blockNumber), blockHash: r.blockHash });
export class CreatorRegistrationChain implements RegistrationChain {
  readonly registrar: Address;
  private readonly account;
  private readonly client: PublicClient;
  constructor(private readonly config: { rpcUrl: string; privateKey: Hex; expectedRegistrar: Address; deploymentBlock: bigint; remainingTimeInMillis?: (() => number) | undefined }, client?: PublicClient) {
    this.account = privateKeyToAccount(config.privateKey);
    this.registrar = this.account.address;
    requireRegistration(this.registrar.toLowerCase() === config.expectedRegistrar.toLowerCase(), "REGISTRATION_SIGNER_CHANGED");
    const chain = defineChain({ id: deployment.chainId, name: "GIWA Sepolia", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [config.rpcUrl] } } });
    this.client = client ?? createPublicClient({ chain, transport: http(config.rpcUrl, { retryCount: 0, timeout: 15000 }) });
  }
  async validateDeployment(blockNumber?: bigint) {
    const at = blockNumber === undefined ? {} : { blockNumber };
    const [chainId, code, pointer, registrar] = await Promise.all([
      this.client.getChainId(),
      this.client.getCode({ address: deployment.registry, ...at }),
      this.client.readContract({ address: deployment.hub, abi: registrationAbi, functionName: "contextRegistry", ...at }),
      this.client.readContract({ address: deployment.registry, abi: registrationAbi, functionName: "registrar", ...at }),
    ]);
    requireRegistration(chainId === deployment.chainId && code && keccak256(code) === deployment.runtime
      && pointer.toLowerCase() === deployment.registry && registrar.toLowerCase() === this.registrar.toLowerCase(), "REGISTRATION_DEPLOYMENT_CHANGED");
  }
  private async context(claim: RegistrationClaim, blockNumber?: bigint) {
    return this.client.readContract({ address: deployment.registry, abi: registrationAbi, functionName: "isValidContext", args: [registrationId(claim.job.creator_id), claim.job.campaign_id ? registrationId(claim.job.campaign_id) : zero], ...(blockNumber === undefined ? {} : { blockNumber }) });
  }
  private envelope(tx: Transaction): RegistrationEnvelope {
    requireRegistration(tx.type === "eip1559" && tx.chainId !== undefined && tx.maxFeePerGas !== undefined && tx.maxPriorityFeePerGas !== undefined && tx.to, "REGISTRATION_ENVELOPE_CHANGED");
    return { chainId: tx.chainId, nonce: String(tx.nonce), to: tx.to, data: tx.input, value: String(tx.value), gasLimit: String(tx.gas), maxFeePerGas: String(tx.maxFeePerGas), maxPriorityFeePerGas: String(tx.maxPriorityFeePerGas) };
  }
  private async receipt(hash: Hash) {
    try { return await this.client.getTransactionReceipt({ hash }); }
    catch (error) { if (error instanceof TransactionReceiptNotFoundError) return null; throw error; }
  }
  private async validateReceipt(claim: RegistrationClaim, receipt: TransactionReceipt, signer?: Address, successful = true) {
    const [tx, block] = await Promise.all([
      this.client.getTransaction({ hash: receipt.transactionHash }),
      this.client.getBlock({ blockNumber: receipt.blockNumber }),
    ]);
    requireRegistration(block.hash === receipt.blockHash && tx.hash === receipt.transactionHash && tx.blockHash === receipt.blockHash && tx.blockNumber === receipt.blockNumber
      && receipt.to?.toLowerCase() === deployment.registry && tx.to?.toLowerCase() === deployment.registry
      && receipt.from.toLowerCase() === tx.from.toLowerCase() && (!signer || tx.from.toLowerCase() === signer.toLowerCase()), "REGISTRATION_RECEIPT_CHANGED");
    const envelope = this.envelope(tx);
    assertRegistrationEnvelope(claim, envelope);
    if (claim.attempt) {
      requireRegistration(receipt.transactionHash === claim.attempt.transaction_hash && Number(envelope.nonce) === Number(claim.attempt.nonce)
        && sameRegistrationEnvelope(envelope, claim.attempt.envelope), "REGISTRATION_TRANSACTION_CHANGED");
    }
    if (successful) {
      requireRegistration(receipt.status === "success", "REGISTRATION_RECEIPT_REVERTED");
      const events = parseEventLogs({ abi: registrationAbi, logs: receipt.logs.filter(log => log.address.toLowerCase() === deployment.registry), strict: true });
      const expectedName = claim.job.kind === "creator" ? "CreatorRegistered" : "CampaignRegistered";
      const matches = events.filter(event => event.eventName === expectedName);
      const event = matches[0];
      requireRegistration(matches.length === 1 && event && event.args.creatorId === registrationId(claim.job.creator_id)
        && event.args.publicSlug === claim.job.slug && (event.eventName !== "CampaignRegistered" || event.args.campaignId === registrationId(claim.job.campaign_id!)), "REGISTRATION_EVENT_CHANGED");
      requireRegistration(await this.context(claim, receipt.blockNumber) && await this.context(claim), "REGISTRATION_CONTEXT_CHANGED");
    }
    return { envelope, registrar: tx.from };
  }
  async findExisting(claim: RegistrationClaim): ReturnType<RegistrationChain["findExisting"]> {
    const started = Date.now();
    const leaseExpires = claim.job.lease_expires_at ? Date.parse(claim.job.lease_expires_at) : started + 120000;
    requireRegistration(Number.isFinite(leaseExpires), "REGISTRATION_LEASE_CHANGED");
    const scanDeadline = Math.min(started + 90000, leaseExpires - 30000);
    if (!await this.context(claim)) return null;
    const head = await this.client.getBlockNumber();
    requireRegistration(head >= this.config.deploymentBlock, "REGISTRATION_DEPLOYMENT_BLOCK_CHANGED");
    const savedCursor = claim.job.recovery_before_block;
    requireRegistration(savedCursor == null || /^\d+$/.test(savedCursor), "REGISTRATION_RECOVERY_CURSOR_CHANGED");
    let toBlock = savedCursor == null || BigInt(savedCursor) > head ? head : BigInt(savedCursor);
    const creator = registrationId(claim.job.creator_id);
    const readLogs = (fromBlock: bigint, toBlock: bigint) => claim.job.kind === "creator"
      ? this.client.getLogs({ address: deployment.registry, event: registrationAbi[6], args: { creatorId: creator }, fromBlock, toBlock, strict: true })
      : this.client.getLogs({ address: deployment.registry, event: registrationAbi[7], args: { campaignId: registrationId(claim.job.campaign_id!) }, fromBlock, toBlock, strict: true });
    let logs: Awaited<ReturnType<typeof readLogs>> = [];
    let windows = 0;
    while (toBlock >= this.config.deploymentBlock) {
      // Leave one RPC timeout plus a DB write before the two-minute claim lease expires.
      if (windows >= 10 || Date.now() >= scanDeadline || (this.config.remainingTimeInMillis && this.config.remainingTimeInMillis() < 45000)) {
        return { pending: true as const, recoveryBeforeBlock: String(toBlock) };
      }
      const fromBlock = toBlock - this.config.deploymentBlock >= 9999n ? toBlock - 9999n : this.config.deploymentBlock;
      try { logs = await readLogs(fromBlock, toBlock); }
      catch {
        // Save completed empty windows even if the provider rate-limits the next query.
        return { pending: true as const, recoveryBeforeBlock: String(toBlock) };
      }
      if (logs.length) break;
      toBlock = fromBlock - 1n;
      windows++;
    }
    requireRegistration(logs.length, "REGISTRATION_EVENT_MISSING");
    requireRegistration(logs.length === 1 && logs[0]?.transactionHash, "REGISTRATION_EVENT_CONFLICT");
    const log = logs[0];
    requireRegistration(log.args.creatorId === creator && log.args.publicSlug === claim.job.slug, "REGISTRATION_EVENT_CONFLICT");
    if (leaseExpires - Date.now() < 60000 || (this.config.remainingTimeInMillis && this.config.remainingTimeInMillis() < 60000)) {
      return { pending: true as const, recoveryBeforeBlock: String(toBlock) };
    }
    const receipt = await this.receipt(log.transactionHash);
    requireRegistration(receipt && receipt.blockHash === log.blockHash && receipt.blockNumber === log.blockNumber, "REGISTRATION_RECEIPT_CHANGED");
    const [historicalRegistrar, admin] = await Promise.all([
      this.client.readContract({ address: deployment.registry, abi: registrationAbi, functionName: "registrar", blockNumber: receipt.blockNumber }),
      this.client.readContract({ address: deployment.registry, abi: registrationAbi, functionName: "admin", blockNumber: receipt.blockNumber }),
    ]);
    requireRegistration([historicalRegistrar.toLowerCase(), admin.toLowerCase()].includes(receipt.from.toLowerCase()), "REGISTRATION_SIGNER_CHANGED");
    const observed = await this.validateReceipt(claim, receipt);
    return { ...observed, proof: proofOf(receipt) };
  }
  async prepare(claim: RegistrationClaim): Promise<RegistrationEnvelope> {
    const [nonce, latest, fees] = await Promise.all([
      this.client.getTransactionCount({ address: this.registrar, blockTag: "pending" }),
      this.client.getTransactionCount({ address: this.registrar, blockTag: "latest" }),
      this.client.estimateFeesPerGas(),
    ]);
    requireRegistration(nonce === latest, "REGISTRATION_NONCE_CONFLICT");
    requireRegistration(fees.maxFeePerGas > 0n && fees.maxFeePerGas <= 100000000n && fees.maxPriorityFeePerGas <= fees.maxFeePerGas, "REGISTRATION_FEE_CAP");
    const envelope = { chainId: deployment.chainId, nonce: String(nonce), to: deployment.registry, data: registrationData(claim), value: "0", gasLimit: "150000", maxFeePerGas: String(fees.maxFeePerGas), maxPriorityFeePerGas: String(fees.maxPriorityFeePerGas) };
    // Simulation catches inactive creator/campaign contexts before reserving a nonce.
    await this.client.call({ account: this.registrar, to: envelope.to, data: envelope.data, gas: 150000n });
    return envelope;
  }
  async sign(claim: RegistrationClaim) {
    const attempt = claim.attempt!;
    assertRegistrationEnvelope(claim, attempt.envelope);
    const pending = await this.client.getTransactionCount({ address: this.registrar, blockTag: "pending" });
    requireRegistration(pending === Number(attempt.envelope.nonce), "REGISTRATION_NONCE_CONFLICT");
    const e = attempt.envelope;
    return this.account.signTransaction({ type: "eip1559", chainId: e.chainId, nonce: Number(e.nonce), to: e.to, data: e.data, value: 0n, gas: BigInt(e.gasLimit), maxFeePerGas: BigInt(e.maxFeePerGas), maxPriorityFeePerGas: BigInt(e.maxPriorityFeePerGas) });
  }
  async assertSigned(claim: RegistrationClaim) {
    const attempt = claim.attempt!;
    const raw = attempt.signed_transaction!;
    requireRegistration(/^0x02[0-9a-f]+$/i.test(raw), "REGISTRATION_SIGNATURE_CHANGED");
    const tx = parseTransaction(raw);
    requireRegistration(keccak256(raw) === attempt.transaction_hash && (await recoverTransactionAddress({ serializedTransaction: raw as TransactionSerializedEIP1559 })).toLowerCase() === this.registrar.toLowerCase()
      && attempt.registrar.toLowerCase() === this.registrar.toLowerCase(), "REGISTRATION_SIGNATURE_CHANGED");
    requireRegistration(tx.type === "eip1559" && tx.to && tx.chainId && tx.maxFeePerGas !== undefined, "REGISTRATION_ENVELOPE_CHANGED");
    const envelope: RegistrationEnvelope = { chainId: tx.chainId, nonce: String(tx.nonce ?? 0), to: tx.to, data: tx.data ?? "0x", value: String(tx.value ?? 0n), gasLimit: String(tx.gas), maxFeePerGas: String(tx.maxFeePerGas), maxPriorityFeePerGas: String(tx.maxPriorityFeePerGas ?? 0n) };
    assertRegistrationEnvelope(claim, envelope);
    requireRegistration(sameRegistrationEnvelope(envelope, attempt.envelope), "REGISTRATION_ENVELOPE_CHANGED");
  }
  async broadcast(raw: Hex) { return this.client.sendRawTransaction({ serializedTransaction: raw }); }
  async inspect(claim: RegistrationClaim) {
    const attempt = claim.attempt as RegistrationAttempt;
    const receipt = await this.receipt(attempt.transaction_hash!);
    if (!receipt) return { state: attempt.receipt && attempt.status === "confirmed" ? "orphaned" as const : "missing" as const };
    const block = await this.client.getBlock({ blockNumber: receipt.blockNumber });
    if (block.hash !== receipt.blockHash || (attempt.receipt && attempt.status === "confirmed" && attempt.receipt.blockHash !== receipt.blockHash)) return { state: "orphaned" as const };
    requireRegistration(receipt.status === "success" || receipt.status === "reverted", "REGISTRATION_RECEIPT_CHANGED");
    const success = receipt.status === "success";
    await this.validateReceipt(claim, receipt, attempt.registrar, success);
    const proof = proofOf(receipt);
    const finalized = await this.client.getBlock({ blockTag: "finalized" }).catch(() => null);
    if (!finalized) return { state: success ? "confirmed" as const : "reverted" as const, proof };
    if (finalized.number === null || finalized.number < receipt.blockNumber) return { state: success ? "confirmed" as const : "reverted" as const, proof };
    await this.validateDeployment(finalized.number);
    const [finalizedAgain, receiptBlock] = await Promise.all([
      this.client.getBlock({ blockNumber: finalized.number }), this.client.getBlock({ blockNumber: receipt.blockNumber }),
    ]);
    requireRegistration(finalizedAgain.hash === finalized.hash && receiptBlock.hash === receipt.blockHash, "REGISTRATION_FINALITY_CHANGED");
    const context = await this.context(claim, finalized.number);
    requireRegistration(success ? context : !context, "REGISTRATION_CONTEXT_CHANGED");
    return { state: success ? "finalized" as const : "finalized_revert" as const, proof };
  }
}
