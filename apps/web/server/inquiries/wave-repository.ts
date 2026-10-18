import "server-only";
import { InquiryError } from "./fanmeeting-route";
import type { WaveRepository } from "./wave-route";
type RpcClient = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message?: string } | null }> };
export function createWaveRepository(client: RpcClient): WaveRepository {
  async function call(name: string, args: Record<string, unknown>) {
    const { data, error } = await client.rpc(name, args);
    if (error) {
      for (const code of ["INQUIRY_INVALID", "INQUIRY_RATE_LIMITED", "INQUIRY_IDEMPOTENCY_CONFLICT"] as const) {
        if (error.message === code) throw new InquiryError(code);
      }
      throw new InquiryError("INQUIRY_UNAVAILABLE");
    }
    if (typeof data !== "boolean") throw new InquiryError("INQUIRY_UNAVAILABLE");
    return data;
  }
  return {
    submit: (input, ipHash, payloadHash, sessionHash) => call("submit_wave_inquiry", {
      p_id: input.requestId, p_locale: input.locale, p_name: input.name, p_email: input.email,
      p_message: input.message, p_consent: input.consent, p_ip_hash: ipHash, p_payload_hash: payloadHash,
      p_inquiry_type: input.interest === "creator" ? "wave_creator" : "wave_partner", p_session_hash: sessionHash, p_channel: input.channel,
    }),
    engage: (input, ipHash, sessionHash) => call("record_wave_engagement", {
      p_event: input.event, p_id: input.requestId, p_session_hash: sessionHash, p_ip_hash: ipHash, p_channel: input.channel, p_locale: input.locale,
    }),
  };
}
