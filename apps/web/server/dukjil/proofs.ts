import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { AuthError } from "@/features/auth/domain/auth-errors";
import { creatorSlugSchema } from "@/features/passport/domain/dukjil-types";
import {
  PROOF_BOARD_MAX, myProofsSchema, proofMissionListSchema, proofBoardSchema, proofCommandResultSchema, proofResubmitBodySchema, proofSubmitBodySchema,
  type ProofErrorCode,
} from "@/features/passport/domain/proof-types";
import { boundedJson, CertificationBodyError } from "@/server/certification/certification-http";
import { containsPersonalInfo } from "./proof-pii";
import { proofPostBody } from "./proof-post-body";
import { resolveCreatorId } from "./creator-id";
import type { ProofMissionRows } from "./proof-missions";
import type { DukjilDependencies } from "./routes";

export type ProofDependencies = DukjilDependencies & {
  stream?: (objectPath: string) => Promise<Response>;
  readMissions?: (celebrityId: string, appUserId: string) => Promise<ProofMissionRows>;
};
const MONTHLY_LIMIT = 2;

// Contract §3.6 / §4. Uploads reuse POST /api/certifications/{missionId}/uploads (webp, 3MB, 24h). The proof image stays in the private
// certification-proofs bucket. read_proof_board returns the member's uploaded (browser-masked) image path of a consented, approved post only;
// the board turns it into an API URL and streams it after re-reading the board, so a withdrawn or hidden post stops serving at once.
const privateHeaders = { "cache-control": "private, no-store", vary: "Authorization" };
// No stale-while-revalidate: a hidden or withdrawn post stops being served within 60 seconds.
const publicHeaders = { "cache-control": "public, max-age=60" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const STATUS: Record<string, number> = {
  PROOF_INVALID: 400, PASSPORT_REQUIRED: 403, CREATOR_NOT_FOUND: 404, PROOF_NOT_FOUND: 404,
  PROOF_ALREADY_OPEN: 409, PROOF_MISSION_UNAVAILABLE: 409, PROOF_MISSION_LEGACY: 409, PROOF_STAMP_UNAVAILABLE: 409, PROOF_TYPE_MISMATCH: 409, IDEMPOTENCY_MISMATCH: 409, REVISION_CONFLICT: 409,
  UPLOAD_EXPIRED: 410, PROOF_PII_DETECTED: 422, UPLOAD_INVALID: 422, PROOF_MONTHLY_LIMIT: 429,
};

export function proofFailure(error: unknown) {
  const body = (code: ProofErrorCode, status: number) => Response.json({ error: { code } }, { status, headers: privateHeaders });
  if (error instanceof AuthError) return body(error.status === 401 ? "AUTHENTICATION_REQUIRED" : "FORBIDDEN", error.status);
  if (error instanceof z.ZodError || error instanceof SyntaxError || error instanceof CertificationBodyError) return body("INVALID_REQUEST", 400);
  const message = error instanceof Error ? error.message : "";
  const code = Object.keys(STATUS).find((known) => message.includes(known));
  if (code) return body(code as ProofErrorCode, STATUS[code]);
  return body("PROOF_UNAVAILABLE", 503);
}

function one(request: Request, key: string) {
  const values = new URL(request.url).searchParams.getAll(key);
  if (values.length > 1) throw new SyntaxError("duplicate query");
  return values[0] ?? null;
}

// Stable hash of everything the client decides, so a replay with a changed field is IDEMPOTENCY_MISMATCH instead of a silent replay.
export function proofRequestHash(fields: Record<string, unknown>) {
  const canonical = JSON.stringify(Object.fromEntries(Object.entries(fields).sort(([a], [b]) => (a < b ? -1 : 1))));
  return createHash("sha256").update(canonical).digest("hex");
}

const boardQuerySchema = z.object({
  category: z.literal("proof"),
  limit: z.coerce.number().int().min(1).max(PROOF_BOARD_MAX),
  before: z.iso.datetime({ offset: true }).nullable(),
});

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});

// One-liner or the default phrase in the request language (body locale, then Accept-Language, then Korean).
function postBody(request: Request, note: string | undefined, locale: string | undefined) {
  if (note) return note;
  const header = (request.headers.get("accept-language") ?? "").split(",")[0]?.split(";")[0]?.trim();
  return proofPostBody(locale ?? header);
}

export function createProofHandlers(deps: ProofDependencies) {
  const run = async (action: () => Promise<Response>) => { try { return await action(); } catch (error) { return proofFailure(error); } };
  const checked = <T>(schema: z.ZodType<T>, value: unknown): T => {
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw new Error("PROOF_UNAVAILABLE");
    return parsed.data;
  };
  const creatorId = async (slug: string) => {
    const id = await (deps.resolveCreatorId ?? resolveCreatorId)(creatorSlugSchema.parse(slug));
    if (!id) throw new Error("CREATOR_NOT_FOUND");
    return id;
  };
  const command = (raw: unknown) => {
    const row = obj(raw);
    return checked(proofCommandResultSchema, { submissionId: row.id, status: row.status, revision: row.revision, replayed: row.replayed });
  };
  return {
    submit: (request: Request) => run(async () => {
      const { appUserId } = await deps.authorize(request.headers.get("authorization"));
      const body = proofSubmitBodySchema.parse(await boundedJson(request, 4096));
      const celebrity = await creatorId(body.creator);
      const raw = await deps.rpc("submit_certification_proof", {
        p_user: appUserId, p_celebrity: celebrity, p_proof_type: body.proofType, p_upload_id: body.uploadId,
        p_publish_consent: body.publishConsent, p_amount_visible: body.amountVisible, p_image_phash: body.imagePhash,
        p_idempotency_key: body.requestKey,
        p_request_hash: proofRequestHash({ celebrity, proofType: body.proofType, uploadId: body.uploadId, publishConsent: body.publishConsent, amountVisible: body.amountVisible, imagePhash: body.imagePhash, note: body.note ?? null }),
        p_pii_detected: containsPersonalInfo(body.note), p_post_body: body.publishConsent ? postBody(request, body.note, body.locale) : null,
      });
      return Response.json(command(raw), { headers: privateHeaders });
    }),
    resubmit: (request: Request, submissionId: string) => run(async () => {
      const { appUserId } = await deps.authorize(request.headers.get("authorization"));
      if (!UUID.test(submissionId)) throw new SyntaxError("submission id");
      const body = proofResubmitBodySchema.parse(await boundedJson(request, 4096));
      const raw = await deps.rpc("resubmit_certification_proof", {
        p_user: appUserId, p_submission_id: submissionId, p_expected_revision: body.expectedRevision, p_upload_id: body.uploadId,
        p_image_phash: body.imagePhash, p_pii_detected: containsPersonalInfo(body.note), p_post_body: postBody(request, body.note, body.locale),
      });
      return Response.json(command(raw), { headers: privateHeaders });
    }),
    mine: (request: Request) => run(async () => {
      const { appUserId } = await deps.authorize(request.headers.get("authorization"));
      const slug = one(request, "creator");
      if (slug === null) throw new SyntaxError("creator required");
      const celebrity = await creatorId(slug);
      // list_my_certification_proofs is requested from the database owner (db-request.md); it returns the caller's own rows only.
      const raw = await deps.rpc("list_my_certification_proofs", { p_user: appUserId, p_celebrity: celebrity });
      return Response.json(checked(myProofsSchema, { items: Array.isArray(raw) ? raw : obj(raw).items ?? [] }), { headers: privateHeaders });
    }),
    // Missions the member can send a proof to (contract §2 P3). Same login rule as the other /api/me/proofs paths; the final decision stays with submit.
    missions: (request: Request) => run(async () => {
      const { appUserId } = await deps.authorize(request.headers.get("authorization"));
      const slug = one(request, "creator");
      if (slug === null || !deps.readMissions) throw new SyntaxError("creator required");
      const celebrity = await creatorId(slug);
      const rows = await deps.readMissions(celebrity, appUserId);
      const items = rows.missions.map((m) => {
        const reason = rows.openMissionIds.includes(m.id) ? "PROOF_ALREADY_OPEN" : rows.monthCount >= MONTHLY_LIMIT ? "PROOF_MONTHLY_LIMIT" : null;
        return { missionId: m.id, proofType: m.proofType, platform: m.platform, submittable: reason === null, unavailableReason: reason, closesAt: m.closesAt };
      });
      return Response.json(checked(proofMissionListSchema, { items }), { headers: privateHeaders });
    }),
    // Public: only consented, approved, visible proofs reach the database result. Author, submission id and images never leave the server.
    board: (request: Request, idOrSlug: string) => run(async () => {
      const query = boardQuerySchema.parse({ category: one(request, "category"), limit: one(request, "limit") ?? 20, before: one(request, "before") });
      const celebrity = UUID.test(idOrSlug) ? idOrSlug : await creatorId(idOrSlug);
      const raw = await deps.rpc("read_proof_board", { p_celebrity: celebrity, p_limit: query.limit, p_before: query.before });
      const rows = Array.isArray(raw) ? raw : [];
      const items = rows.map((row) => {
        const r = obj(row);
        const image = typeof r.imageObjectPath === "string" && r.imageObjectPath && typeof r.createdAt === "string";
        return {
          postId: r.postId, body: r.body, createdAt: r.createdAt, proofType: r.proofType, amountVisible: r.amountVisible ?? null,
          imageUrl: image ? `/api/pages/${encodeURIComponent(idOrSlug)}/posts/${String(r.postId)}/image?t=${encodeURIComponent(String(r.createdAt))}` : null,
          jjinfanRank: r.jjinfanRank ?? null,
        };
      });
      const nextBefore = rows.length >= query.limit ? (items[items.length - 1]?.createdAt as string | undefined) ?? null : null;
      return Response.json(checked(proofBoardSchema, { items, nextBefore }), { headers: publicHeaders });
    }),
    // Public masked image of one board post. The post is looked up through read_proof_board again (consent, approval, visibility), then the
    // stored object is streamed; the object path, bucket and signed URLs are never part of any response.
    image: (request: Request, idOrSlug: string, postId: string) => run(async () => {
      if (!UUID.test(postId) || !deps.stream) throw new SyntaxError("post id");
      const at = Date.parse(one(request, "t") ?? "");
      if (Number.isNaN(at)) throw new SyntaxError("t");
      const celebrity = UUID.test(idOrSlug) ? idOrSlug : await creatorId(idOrSlug);
      const raw = await deps.rpc("read_proof_board", { p_celebrity: celebrity, p_limit: 5, p_before: new Date(at + 1).toISOString() });
      const row = (Array.isArray(raw) ? raw : []).map(obj).find((r) => r.postId === postId);
      const path = typeof row?.imageObjectPath === "string" ? row.imageObjectPath : null;
      if (!path) return Response.json({ error: { code: "PROOF_NOT_FOUND" } }, { status: 404, headers: publicHeaders });
      const upstream = await deps.stream(path);
      if (!upstream.ok || !upstream.body) return Response.json({ error: { code: "PROOF_NOT_FOUND" } }, { status: 404, headers: publicHeaders });
      return new Response(upstream.body, { headers: { ...publicHeaders, "content-type": "image/webp", "x-content-type-options": "nosniff" } });
    }),
  };
}
