import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { deriveCredentialId } from "../../features/passport/domain/credential-issuance";
import { CertificationRepository } from "../certification/certification-repository";
import { dashboardAggregateSchema, participationCatalogSchema, participationResultSchema, participationSummarySchema, type ParticipationSubmit } from "./domain";

export class LiveParticipationError extends Error { constructor(readonly code: string) { super(code); } }
export class LiveParticipationRepository {
  constructor(private readonly db: SupabaseClient) {}
  private async rpc<T>(name: string, args: Record<string, unknown>, schema: z.ZodType<T>): Promise<T> {
    const { data, error } = await this.db.rpc(name, args);
    if (error && /active admin required|viewer is read-only/.test(error.message)) throw new LiveParticipationError("LIVE_PARTICIPATION_ADMIN_REQUIRED");
    if (error) throw new LiveParticipationError(error.message.match(/LIVE_PARTICIPATION_[A-Z_]+|CERTIFICATION_[A-Z_]+|PHASE2_MISSION_[A-Z_]+|G3_[A-Z_]+|FAN_WEB_ACTIVE_ACCOUNT_REQUIRED/)?.[0] ?? "LIVE_PARTICIPATION_UNAVAILABLE");
    try { return schema.parse(data); } catch { throw new LiveParticipationError("LIVE_PARTICIPATION_INTEGRITY_ERROR"); }
  }
  catalog(slug: string, phase: string, appUserId: string | null) { return this.rpc("read_live_participation", { p_live_slug: slug, p_phase: phase, p_app_user_id: appUserId }, participationCatalogSchema); }
  submit(appUserId: string, slug: string, input: ParticipationSubmit) {
    const stampId = randomUUID(); const operationKey = `byus:stamp:v1:${stampId}`;
    return this.rpc("submit_owned_live_participation", { p_app_user_id: appUserId, p_live_slug: slug, p_mission_id: input.missionId, p_request_key: input.requestKey, p_payload: input.payload, p_stamp_id: stampId, p_stamp_operation_key: operationKey, p_stamp_issuance_id: deriveCredentialId(operationKey) }, participationResultSchema);
  }
  summary(appUserId: string, creatorSlug: string) { return this.rpc("read_owned_participation_summary", { p_app_user_id: appUserId, p_creator_slug: creatorSlug }, participationSummarySchema); }
  dashboard() { return this.rpc("read_public_live_dashboard", {}, dashboardAggregateSchema); }
  async upload(appUserId: string, slug: string, missionId: string, image: { bytes: Uint8Array; width: number; height: number }) {
    const certificationId = await this.rpc("get_owned_live_participation_upload_target", { p_app_user_id: appUserId, p_live_slug: slug, p_mission_id: missionId }, z.uuid());
    return new CertificationRepository(this.db).upload(appUserId, certificationId, image);
  }
  adminSelect(actor: { appUserId: string; allowlistId: string }, correlation: string, submissionId: string) { return this.rpc("admin_select_live_participation", { p_actor: actor.appUserId, p_allowlist: actor.allowlistId, p_correlation: correlation, p_submission_id: submissionId }, z.record(z.string(), z.unknown())); }
  adminList(actor: { appUserId: string; allowlistId: string }, liveEventId: string) { return this.rpc("admin_read_live_participation", { p_actor: actor.appUserId, p_allowlist: actor.allowlistId, p_live: liveEventId }, z.record(z.string(), z.unknown())); }
  adminSave(actor: { appUserId: string; allowlistId: string }, correlation: string, input: Record<string, unknown>) { return this.rpc("admin_save_live_participation", { p_actor: actor.appUserId, p_allowlist: actor.allowlistId, p_correlation: correlation, p_input: input }, z.record(z.string(), z.unknown())); }
}
