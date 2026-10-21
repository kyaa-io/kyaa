import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ParticipationJob, ParticipationPayload, ParticipationQueue, ParticipationReceipt, ParticipationStatus } from "../participation-domain.js";
import { WorkerError, type PreparedSubmission } from "../domain.js";
function row(v: Record<string, unknown>): ParticipationJob { return { id: String(v.id), leaseOwner: String(v.lease_owner), relayer: String(v.relayer), chainId: Number(v.chain_id), contractAddress: String(v.contract_address), items: v.items, payload: v.payload ?? null, txHash: v.tx_hash == null ? null : String(v.tx_hash), signedTransaction: v.signed_transaction == null ? null : String(v.signed_transaction) }; }
export class SupabaseParticipationQueue implements ParticipationQueue {
  constructor(readonly client: SupabaseClient) {}
  static create(url: string, key: string): SupabaseParticipationQueue { return new SupabaseParticipationQueue(createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })); }
  async rpc(name: string, args: Record<string, unknown>): Promise<unknown> { const { data, error } = await this.client.rpc(name, args); if (error) throw new WorkerError("PARTICIPATION_DATABASE_ERROR", `${name}: ${error.message}`, true); return data; }
  private lease(job: ParticipationJob) { return { p_job_id: job.id, p_worker_id: job.leaseOwner }; }
  async claim(worker: string, batch: number, lease: number) { return ((await this.rpc("claim_participation_batches", { p_worker_id: worker, p_batch_size: batch, p_lease_seconds: lease })) as Record<string, unknown>[]).map(row); }
  async freeze(job: ParticipationJob, payload: ParticipationPayload) { const data = await this.rpc("prepare_participation_batch", { ...this.lease(job), p_payload: payload }); if (!data) throw new WorkerError("STALE_PARTICIPATION_LEASE", "Cannot freeze participation batch", true); return row(data as Record<string, unknown>); }
  async prepared(job: ParticipationJob, submission: PreparedSubmission) { const data = await this.rpc("record_prepared_participation_batch", { ...this.lease(job), p_tx_hash: submission.txHash, p_signed_transaction: submission.signedTransaction }); if (!data) throw new WorkerError("STALE_PARTICIPATION_LEASE", "Cannot persist participation transaction", true); return row(data as Record<string, unknown>); }
  private writerArgs(job: ParticipationJob, relayer: string) { return { ...this.lease(job), p_job_family: "participation", p_chain_id: job.chainId, p_relayer: relayer.toLowerCase() }; }
  async writer(job: ParticipationJob, relayer: string, lease: number) { return await this.rpc("admit_chain_writer", { ...this.writerArgs(job, relayer), p_lease_seconds: lease }) === true; }
  async release(job: ParticipationJob, relayer: string) { await this.rpc("release_chain_writer", this.writerArgs(job, relayer)); }
  async admit(job: ParticipationJob) { return await this.rpc("admit_participation_dispatch", this.lease(job)) === true; }
  async complete(job: ParticipationJob, receipt: ParticipationReceipt) { const result = await this.rpc("complete_participation_batch", { ...this.lease(job), p_receipt: receipt }); if (result === false) throw new WorkerError("STALE_PARTICIPATION_LEASE", "Cannot complete participation batch", true); }
  async retry(job: ParticipationJob, code: string, message: string) { await this.rpc("retry_participation_batch", { ...this.lease(job), p_error_code: code, p_error_message: message, p_retry_seconds: code === "PARTICIPATION_PENDING" ? 2 : 60 }); }
  async receipts(limit: number): Promise<{ id: string; payload: ParticipationPayload; receipt: ParticipationReceipt; submission: PreparedSubmission }[]> {
    const data = await this.rpc("list_participation_receipts", { p_limit: limit });
    return (data as Record<string, unknown>[]).map(v => ({ id: String(v.id ?? v.job_id), payload: v.payload as ParticipationPayload, receipt: v.receipt as ParticipationReceipt, submission: { txHash: String(v.tx_hash), signedTransaction: String(v.signed_transaction) } }));
  }
  async setFinality(id: string, receipt: ParticipationReceipt, status: ParticipationStatus) { await this.rpc("set_participation_finality", { p_job_id: id, p_expected_block_hash: receipt.blockHash, p_status: status }); }
}
