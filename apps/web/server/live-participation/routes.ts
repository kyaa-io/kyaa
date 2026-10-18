import "server-only";
import { z } from "zod";
import { AuthError } from "../../features/auth/domain/auth-errors";
import { FanAuthUnavailableError } from "../fan-auth/fan-auth-gate";
import { boundedJson, boundedMultipart, CertificationBodyError, correlation } from "../certification/certification-http";
import { CertificationImageError, MAX_BROADCAST_CERTIFICATION_FILE_BYTES, normalizeBroadcastCertificationImage } from "../certification/certification-image";
import { CertificationRepositoryError } from "../certification/certification-repository";
import type { AdminSession } from "../admin/admin-session-gate";
import type { PublicOnchainResult } from "../onchain/public-types";
import { participationPhaseSchema, participationSubmitSchema, participationKindSchema } from "./domain";
import { LiveParticipationError, type LiveParticipationRepository } from "./repository";
export type LiveParticipationDependencies = { repository: LiveParticipationRepository; authorize(authorization: string | null): Promise<{ appUserId: string }>; authorizeAdmin(authorization: string, correlationId: string): Promise<AdminSession>; readOnchain(): Promise<PublicOnchainResult> };
const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120);
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "cache-control": "private, no-store", vary: "Authorization" } });
function failure(error: unknown) {
  if (error instanceof AuthError || error instanceof FanAuthUnavailableError) return json({ error: { code: error.code } }, error.status);
  if (error instanceof CertificationImageError || error instanceof CertificationBodyError) return json({ error: { code: error.code } }, error.code === "BODY_TOO_LARGE" ? 413 : 422);
  if (error instanceof z.ZodError || error instanceof SyntaxError) return json({ error: { code: "LIVE_PARTICIPATION_INVALID" } }, 422);
  if (error instanceof LiveParticipationError || error instanceof CertificationRepositoryError) { const code = error.code; return json({ error: { code } }, code.includes("NOT_FOUND") ? 404 : code.includes("REQUIRED") ? 403 : /CONFLICT|CLOSED|STALE|ALREADY|PREVIOUS|INELIGIBLE|INCORRECT/.test(code) ? 409 : /INVALID|DUPLICATE|COUNT/.test(code) ? 422 : 503); }
  return json({ error: { code: "LIVE_PARTICIPATION_UNAVAILABLE" } }, 503);
}
export const createGetParticipationHandler = (d: LiveParticipationDependencies) => async (request: Request, input: { slug: string }) => {
  try { const liveSlug = slug.parse(input.slug); const phase = participationPhaseSchema.parse(new URL(request.url).searchParams.get("phase") ?? "before"); const owner = request.headers.has("authorization") ? await d.authorize(request.headers.get("authorization")) : null; return json(await d.repository.catalog(liveSlug, phase, owner?.appUserId ?? null)); } catch (error) { return failure(error); }
};
export const createPostParticipationHandler = (d: LiveParticipationDependencies) => async (request: Request, input: { slug: string }) => {
  try { const liveSlug = slug.parse(input.slug); const owner = await d.authorize(request.headers.get("authorization")); const body = participationSubmitSchema.parse(await boundedJson(request, 32_768)); return json(await d.repository.submit(owner.appUserId, liveSlug, body)); } catch (error) { return failure(error); }
};
export const createPostParticipationUploadHandler = (d: LiveParticipationDependencies) => async (request: Request, input: { slug: string; missionId: string }) => {
  try { const liveSlug = slug.parse(input.slug); const missionId = z.uuid().parse(input.missionId); const owner = await d.authorize(request.headers.get("authorization")); const data = await boundedMultipart(request, MAX_BROADCAST_CERTIFICATION_FILE_BYTES + 196_608); const file = data.get("file"); if (!(file instanceof File) || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new CertificationImageError("INVALID_IMAGE"); const image = await normalizeBroadcastCertificationImage(new Uint8Array(await file.arrayBuffer())); return json(await d.repository.upload(owner.appUserId, liveSlug, missionId, image)); } catch (error) { return failure(error); }
};
export const createGetParticipationSummaryHandler = (d: LiveParticipationDependencies) => async (request: Request) => {
  try { const owner = await d.authorize(request.headers.get("authorization")); return json(await d.repository.summary(owner.appUserId, slug.parse(new URL(request.url).searchParams.get("creator")))); } catch (error) { return failure(error); }
};
export const createGetPublicLiveDashboardHandler = (d: LiveParticipationDependencies) => async () => {
  const [database, chain] = await Promise.allSettled([d.repository.dashboard(), d.readOnchain()]);
  const source = chain.status === "fulfilled" && chain.value.state === "available" ? chain.value.snapshot : null;
  const b = source?.business;
  // Allowlist every public value: no raw actions, wallets or credential identifiers.
  const onchain = source && b ? { state: "available" as const, asOf: source.generatedAt, blockTimestamp: source.blockTimestamp, metrics: { uniqueActiveWallets: b.uniqueActiveWallets, actionCounts: b.actionCounts, passportCredentials: b.passportCredentials, mintedCredentials: b.mintedCredentials, lifecycleTransactions: b.lifecycleTransactions, currentActionTransactions: b.currentActionTransactions } } : { state: "unavailable" as const };
  return Response.json({ database: database.status === "fulfilled" ? { state: "available", ...database.value } : { state: "unavailable" }, onchain }, { headers: { "cache-control": "public, max-age=30" } });
};
const saveSchema = z.object({ id: z.uuid().nullable().optional(), expectedRevision: z.number().int().positive().optional(), liveEventId: z.uuid(), key: z.enum(["reserve","waiting","song","story","dance","topic","matching","sns","attendance","comment","like","early","first","quiz","corner","crew","reflection","highlight","best","idea","aftershare","nextreserve","return","bonus"]), kind: participationKindSchema, phase: participationPhaseSchema, title: z.string().trim().min(1).max(160), description: z.string().max(2000), surveyId: z.uuid().nullable().optional(), certificationMissionId: z.uuid().nullable().optional(), threadId: z.uuid().nullable().optional(), nextLiveEventId: z.uuid().nullable().optional(), opensAt: z.iso.datetime({ offset: true }), closesAt: z.iso.datetime({ offset: true }), public: z.boolean(), enabled: z.boolean() }).strict().refine(value => Date.parse(value.opensAt) < Date.parse(value.closesAt));
export const createAdminParticipationHandler = (d: LiveParticipationDependencies) => async (request: Request) => {
  try { const id = correlation(request); const actor = await d.authorizeAdmin(request.headers.get("authorization") ?? "", id); if (request.method === "GET") return json(await d.repository.adminList(actor, z.uuid().parse(new URL(request.url).searchParams.get("liveEventId")))); return json(await d.repository.adminSave(actor, id, saveSchema.parse(await boundedJson(request)))); } catch (error) { return failure(error); }
};

export const createAdminParticipationSelectionHandler = (d: LiveParticipationDependencies) => async (request: Request) => {
  try { const id = correlation(request); const actor = await d.authorizeAdmin(request.headers.get("authorization") ?? "", id); const body = z.object({ submissionId: z.uuid() }).strict().parse(await boundedJson(request)); return json(await d.repository.adminSelect(actor, id, body.submissionId)); } catch (error) { return failure(error); }
};
