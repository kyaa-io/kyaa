import type { Address } from "viem";
import type { WorkerDataClient } from "../data-client.js";
import { RegistrationError, requireRegistration, type RegistrationClaim, type RegistrationQueue } from "../creator-registration.js";
export class CreatorRegistrationQueue implements RegistrationQueue {
  constructor(private readonly client: Pick<WorkerDataClient, "rpc">) {}
  async claim(owner: string, registrar: Address): Promise<RegistrationClaim[]> {
    const { data, error } = await this.client.rpc("creator_registration_claim", { p_owner: owner, p_registrar: registrar.toLowerCase(), p_limit: 1 });
    if (error) throw new RegistrationError("REGISTRATION_DATABASE_ERROR");
    requireRegistration(Array.isArray(data), "REGISTRATION_DATABASE_RESPONSE");
    return data as RegistrationClaim[];
  }
  async transition(claim: RegistrationClaim, operation: string, payload: Record<string, unknown> = {}): Promise<RegistrationClaim> {
    const { data, error } = await this.client.rpc("creator_registration_transition", {
      p_job_id: claim.job.id, p_owner: claim.job.lease_owner, p_fence: claim.job.lease_fence, p_operation: operation, p_payload: operation === "recover" ? { ...payload, registrar: String(payload.registrar).toLowerCase() } : payload,
    });
    if (error) throw new RegistrationError(error.message === "REGISTRATION_NONCE_BLOCKED" ? "SIGNER_NONCE_BLOCKED" : "REGISTRATION_DATABASE_ERROR");
    requireRegistration(data && typeof data === "object" && !Array.isArray(data) && data.job?.id === claim.job.id
      && (operation === "defer" || data.job?.lease_owner === claim.job.lease_owner) && Number(data.job?.lease_fence) === Number(claim.job.lease_fence), "REGISTRATION_DATABASE_RESPONSE");
    return data as RegistrationClaim;
  }
}
