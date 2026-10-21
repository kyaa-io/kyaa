import { BaseError } from "viem";
import { ParticipationRevertedError, participationPayloadSchema, type ParticipationChain, type ParticipationJob, type ParticipationQueue } from "./participation-domain.js";
import type { ClockPort } from "./ports.js";
import { classifyError, WorkerError } from "./domain.js";
export class ParticipationWorker {
  constructor(private queue: ParticipationQueue, private chain: ParticipationChain, private options: { workerId: string; batchSize: number; leaseSeconds: number }, private clock: ClockPort = { sleep: ms => new Promise(resolve => setTimeout(resolve, ms)) }) {}
  async runOnce(): Promise<number> {
    const jobs = await this.queue.claim(this.options.workerId, this.options.batchSize, this.options.leaseSeconds);
    for (const initial of jobs) {
      let job: ParticipationJob = initial;
      let held = false;
      try {
        if (job.relayer.toLowerCase() !== this.chain.relayerAddress.toLowerCase()) throw new WorkerError("PARTICIPATION_RELAYER_MISMATCH", "Participation batch uses a different approved signer", false);
        const expected = participationPayloadSchema.parse({ version: 1, chainId: job.chainId, contractAddress: job.contractAddress, items: job.items });
        if (!job.payload) job = await this.queue.freeze(job, expected);
        const payload = participationPayloadSchema.parse(job.payload);
        if (JSON.stringify(payload) !== JSON.stringify(expected)) throw new WorkerError("PARTICIPATION_PAYLOAD_MISMATCH", "Frozen participation payload differs from its source batch", false);
        if (Boolean(job.txHash) !== Boolean(job.signedTransaction)) throw new WorkerError("PARTICIPATION_PARTIAL_SUBMISSION", "Incomplete signed participation submission", false);
        let submission = job.txHash && job.signedTransaction ? { txHash: job.txHash, signedTransaction: job.signedTransaction } : null;
        if (submission) {
          const receipt = await this.chain.receipt(payload, submission);
          if (receipt) { await this.queue.complete(job, receipt); continue; }
        }
        held = await this.queue.writer(job, this.chain.relayerAddress, this.options.leaseSeconds);
        if (!held) continue;
        if (!submission) { submission = await this.chain.prepare(payload); job = await this.queue.prepared(job, submission); }
        if (!await this.queue.admit(job)) continue;
        const hash = await this.chain.broadcast(payload, submission);
        if (hash.toLowerCase() !== submission.txHash.toLowerCase()) throw new WorkerError("PARTICIPATION_HASH_MISMATCH", "Broadcast transaction hash mismatch", false);
        let receipt = await this.chain.receipt(payload, submission);
        for (let poll = 0; !receipt && poll < 5; poll += 1) {
          await this.clock.sleep(1_000);
          receipt = await this.chain.receipt(payload, submission);
        }
        if (receipt) await this.queue.complete(job, receipt);
        else await this.queue.retry(job, "PARTICIPATION_PENDING", "Waiting for canonical participation receipt");
      } catch (error) {
        if (error instanceof ParticipationRevertedError) { await this.queue.failReverted(job, error.receipt); continue; }
        const classified = error instanceof BaseError
          ? new WorkerError("PARTICIPATION_RPC_UNAVAILABLE", "Participation RPC request failed; retrying the persisted batch", true)
          : classifyError(error);
        await this.queue.retry(job, classified.code, classified.message);
      } finally { if (held) await this.queue.release(job, this.chain.relayerAddress); }
    }
    return jobs.length;
  }
}
