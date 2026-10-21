import { BaseError, ResourceNotFoundRpcError, createPublicClient, defineChain, encodeFunctionData, getAddress, http, keccak256, parseTransaction, recoverTransactionAddress, TransactionReceiptNotFoundError, type Address, type Hash, type Hex, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { participationAbi, participationPayloadSchema, type ParticipationChain, type ParticipationPayload, type ParticipationReceipt, type ParticipationStatus } from "../participation-domain.js";
import { WorkerError, type PreparedSubmission } from "../domain.js";
import { assertMintFeePolicy, DEFAULT_MINT_FEE_POLICY, validateMintFeePolicy, type MintFeePolicy } from "../fee-policy.js";
export class ViemParticipationAdapter implements ParticipationChain {
  readonly relayerAddress: Address;
  private account;
  readonly client: PublicClient;
  private policy: MintFeePolicy;
  constructor(private options: { rpcUrl: string; chainId: number; privateKey: Hex; contractAddress: Address; client?: PublicClient; feePolicy?: MintFeePolicy }) {
    if (options.chainId !== 91342) throw new Error("Participation ledger requires chain 91342");
    this.account = privateKeyToAccount(options.privateKey); this.relayerAddress = this.account.address;
    const chain = defineChain({ id: 91342, name: "GIWA Sepolia", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [options.rpcUrl] } } });
    this.client = options.client ?? createPublicClient({ chain, transport: http(options.rpcUrl) });
    this.policy = validateMintFeePolicy(options.feePolicy ?? DEFAULT_MINT_FEE_POLICY);
  }
  private data(payload: ParticipationPayload): Hex {
    participationPayloadSchema.parse(payload);
    if (payload.chainId !== this.options.chainId || getAddress(payload.contractAddress) !== getAddress(this.options.contractAddress)) throw new WorkerError("PARTICIPATION_BINDING_MISMATCH", "Participation runtime binding mismatch", false);
    return encodeFunctionData({ abi: participationAbi, functionName: "record", args: [payload.items.map(item => ({ ...item, source: item.source as Hash, creator: item.creator as Hash, participant: item.participant as Hash, occurredAtMicros: BigInt(item.occurredAtMicros), revision: BigInt(item.revision) }))] });
  }
  async prepare(payload: ParticipationPayload): Promise<PreparedSubmission> {
    const data = this.data(payload);
    if (await this.client.getChainId() !== 91342 || !((await this.client.getCode({ address: this.options.contractAddress }))?.match(/^0x[0-9a-fA-F]{2,}$/))) throw new WorkerError("PARTICIPATION_CHAIN_MISMATCH", "Participation contract is unavailable on approved chain", false);
    const [nonce, gas, fees] = await Promise.all([this.client.getTransactionCount({ address: this.relayerAddress, blockTag: "pending" }), this.client.estimateGas({ account: this.account, to: this.options.contractAddress, data, value: 0n }), this.client.estimateFeesPerGas()]);
    assertMintFeePolicy({ type: "eip1559", gas, ...fees }, this.policy);
    const signedTransaction = await this.account.signTransaction({ type: "eip1559", chainId: 91342, to: this.options.contractAddress, value: 0n, data, nonce, gas, maxFeePerGas: fees.maxFeePerGas!, maxPriorityFeePerGas: fees.maxPriorityFeePerGas! });
    return { signedTransaction, txHash: keccak256(signedTransaction) };
  }
  private async envelope(payload: ParticipationPayload, submission: PreparedSubmission): Promise<void> {
    const tx = parseTransaction(submission.signedTransaction as Hex);
    const sender = await recoverTransactionAddress({ serializedTransaction: submission.signedTransaction as Parameters<typeof recoverTransactionAddress>[0]["serializedTransaction"] });
    if (keccak256(submission.signedTransaction as Hex).toLowerCase() !== submission.txHash.toLowerCase() || tx.chainId !== 91342 || !tx.to || getAddress(tx.to) !== getAddress(this.options.contractAddress) || getAddress(sender) !== this.relayerAddress || (tx.value ?? 0n) !== 0n || tx.data?.toLowerCase() !== this.data(payload).toLowerCase()) throw new WorkerError("PARTICIPATION_ENVELOPE_MISMATCH", "Participation signed envelope mismatch", false);
    assertMintFeePolicy({ type: tx.type, gas: tx.gas, maxFeePerGas: tx.maxFeePerGas, maxPriorityFeePerGas: tx.maxPriorityFeePerGas }, this.policy);
  }
  async broadcast(payload: ParticipationPayload, submission: PreparedSubmission): Promise<string> {
    await this.envelope(payload, submission);
    if (await this.client.getChainId() !== 91342) throw new WorkerError("PARTICIPATION_CHAIN_MISMATCH", "Participation RPC chain mismatch", false);
    try { return await this.client.sendRawTransaction({ serializedTransaction: submission.signedTransaction as Hex }); }
    catch (error) { if (error instanceof Error && error.message.toLowerCase().includes("already known")) return submission.txHash; throw error; }
  }
  async receipt(payload: ParticipationPayload, submission: PreparedSubmission): Promise<ParticipationReceipt | null> {
    await this.envelope(payload, submission);
    let receipt;
    try { receipt = await this.client.getTransactionReceipt({ hash: submission.txHash as Hash }); }
    catch (error) { if (error instanceof TransactionReceiptNotFoundError) return null; throw error; }
    const tx = await this.client.getTransaction({ hash: submission.txHash as Hash });
    if (receipt.status !== "success" || getAddress(tx.from) !== this.relayerAddress || !tx.to || getAddress(tx.to) !== getAddress(payload.contractAddress) || tx.chainId !== 91342 || tx.value !== 0n || tx.input.toLowerCase() !== this.data(payload).toLowerCase() || tx.blockHash !== receipt.blockHash || tx.blockNumber !== receipt.blockNumber) throw new WorkerError("PARTICIPATION_RECEIPT_MISMATCH", "Participation receipt or canonical transaction mismatch", false);
    try { await this.assertState(payload, receipt.blockNumber); }
    catch (error) {
      // A receipt can reach the RPC before its block state is available.
      if (error instanceof BaseError && error.walk(cause => cause instanceof ResourceNotFoundRpcError) instanceof ResourceNotFoundRpcError) return null;
      throw error;
    }
    const block = await this.client.getBlock({ blockNumber: receipt.blockNumber });
    if (block.hash !== receipt.blockHash) throw new WorkerError("PARTICIPATION_ORPHANED", "Participation receipt is not canonical", true);
    return { txHash: submission.txHash, blockHash: receipt.blockHash, blockNumber: receipt.blockNumber.toString(), transactionIndex: receipt.transactionIndex, inclusionStatus: "included" };
  }
  async assertState(payload: ParticipationPayload, blockNumber: bigint): Promise<void> {
    for (const item of payload.items) {
      const state = await this.client.readContract({ address: this.options.contractAddress, abi: participationAbi, functionName: "participations", args: [item.source as Hash], blockNumber });
      const [source, creator, participant, micros, revision, kind, origin, active] = state;
      if (source.toLowerCase() !== item.source.toLowerCase() || creator.toLowerCase() !== item.creator.toLowerCase() || participant.toLowerCase() !== item.participant.toLowerCase() || micros !== BigInt(item.occurredAtMicros) || revision < BigInt(item.revision) || kind !== item.kind || origin !== item.origin || (revision === BigInt(item.revision) && active !== item.active)) throw new WorkerError("PARTICIPATION_STATE_MISMATCH", "Participation source state does not acknowledge batch", false);
    }
  }
  async finality(receipt: ParticipationReceipt, heads?: { safe: bigint | null; finalized: bigint | null }): Promise<ParticipationStatus> {
    const current = await this.client.getTransactionReceipt({ hash: receipt.txHash as Hash }).catch(error => { if (error instanceof TransactionReceiptNotFoundError) return null; throw error; });
    if (!current || current.status !== "success" || current.blockHash !== receipt.blockHash || current.blockNumber !== BigInt(receipt.blockNumber)) return "orphaned";
    const block = await this.client.getBlock({ blockNumber: current.blockNumber });
    if (block.hash !== current.blockHash) return "orphaned";
    for (const tag of ["finalized", "safe"] as const) {
      const number = heads ? heads[tag] : (await this.client.getBlock({ blockTag: tag }).catch(() => null))?.number;
      if (number != null && number >= current.blockNumber) return tag;
    }
    return "included";
  }
}
