import "server-only";
import { z } from "zod";
import { waveMissionStampSchema } from "@/features/fanpage/domain/wave-missions";
import { AuthError } from "../../features/auth/domain/auth-errors";
import { participationInputSchema, participationResponseSchema, participationAdminPageSchema } from "../../features/connect/kyaa-wave-participation";
import type { FanpageDependencies } from "../fanpage/routes";
import { decryptParticipationName, encryptParticipationName, parseParticipationKey, participationCodeHash, participationPayloadHmac, participationNameFingerprint } from "./participation-crypto";

const headers = { "cache-control": "private, no-store", vary: "Authorization" };
export const participationFailure = (code: string, status: number) => Response.json({ error: { code } }, { status, headers });
const statuses: Record<string, number> = { PARTICIPATION_INVALID: 400, PARTICIPATION_CODE_INVALID: 400, PARTICIPATION_CLOSED: 410, PARTICIPATION_RATE_LIMITED: 429, PARTICIPATION_IDEMPOTENCY_CONFLICT: 409, PARTICIPATION_REVIEW_REQUIRED: 409, FAN_WEB_ACTIVE_ACCOUNT_REQUIRED: 403, PARTICIPATION_ADMIN_FORBIDDEN: 403 };
function failure(error: unknown) {
  if (error instanceof AuthError) return participationFailure(error.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN", error.status === 401 ? 401 : 403);
  const code = error instanceof Error ? error.message : "";
  return participationFailure(statuses[code] ? code : "PARTICIPATION_UNAVAILABLE", statuses[code] ?? 503);
}
async function readBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("PARTICIPATION_INVALID");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2048) { await reader.cancel(); throw new Error("PARTICIPATION_INVALID"); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch { throw new Error("PARTICIPATION_INVALID"); }
  finally { reader.releaseLock(); }
}
export function createParticipationHandler(deps: Pick<FanpageDependencies, "authorize" | "rpc">, getKey = () => parseParticipationKey(process.env.KYAA_WAVE_PARTICIPATION_ENCRYPTION_KEY)) {
  return async (request: Request) => {
    try {
      const { appUserId } = await deps.authorize(request.headers.get("authorization"));
      if (new URL(request.url).search) return participationFailure("PARTICIPATION_INVALID", 400);
      let result: unknown;
      if (request.method === "GET") {
        result = await deps.rpc("read_owned_kyaa_wave_participation", { p_app_user_id: appUserId });
      } else if (request.method === "POST") {
        const parsed = participationInputSchema.safeParse(await readBody(request));
        const requestId = z.uuid().safeParse(request.headers.get("idempotency-key"));
        if (!parsed.success || !requestId.success) return participationFailure("PARTICIPATION_INVALID", 400);
        const { code, name } = parsed.data;
        const key = getKey();
        result = await deps.rpc("submit_kyaa_wave_participation", {
          p_app_user_id: appUserId, p_request_id: requestId.data,
          p_code_hash: participationCodeHash(code), p_payload_hmac: participationPayloadHmac(name, code, appUserId, key),
          p_name_encrypted: encryptParticipationName(name, appUserId, key),
          p_name_fingerprint: participationNameFingerprint(name, key),
        });
        const error = z.object({ error: z.object({ code: z.string() }) }).safeParse(result);
        if (error.success) return failure(new Error(error.data.error.code));
      } else return participationFailure("METHOD_NOT_ALLOWED", 405);
      const response = participationResponseSchema.parse(result);
      if (request.method === "POST" && !response.participation) throw new Error("PARTICIPATION_UNAVAILABLE");
      return Response.json(response, { headers });
    } catch (error) { return failure(error); }
  };
}
const cursorSchema = z.object({ at: z.iso.datetime({ offset: true }), id: z.uuid() }).strict();
const adminRowsSchema = z.array(z.object({ id: z.uuid(), appUserId: z.uuid(), nameEncrypted: z.string(), createdAt: z.iso.datetime({ offset: true }), quizCorrectAt: z.iso.datetime({ offset: true }).nullable().default(null), bingoCompletedAt: z.iso.datetime({ offset: true }).nullable().default(null), stamps: z.array(waveMissionStampSchema).max(11).default([]) })).max(51);
export function createParticipationAdminHandler(deps: Pick<FanpageDependencies, "authorizeAdmin" | "rpc">, getKey = () => parseParticipationKey(process.env.KYAA_WAVE_PARTICIPATION_ENCRYPTION_KEY)) {
  return async (request: Request) => {
    try {
      const actor = await deps.authorizeAdmin(request.headers.get("authorization"), crypto.randomUUID());
      const params = new URL(request.url).searchParams;
      let cursor: z.infer<typeof cursorSchema> | null = null;
      try {
        if (Array.from(params.keys()).some(key => key !== "cursor") || params.getAll("cursor").length > 1) throw new Error();
        if (params.has("cursor")) cursor = cursorSchema.parse(JSON.parse(Buffer.from(z.string().max(240).parse(params.get("cursor")), "base64url").toString("utf8")));
      } catch { return participationFailure("PARTICIPATION_INVALID", 400); }
      const rows = adminRowsSchema.parse(await deps.rpc("list_admin_kyaa_wave_participants", {
        p_actor_app_user_id: actor.appUserId, p_actor_admin_allowlist_id: actor.allowlistId,
        p_before_at: cursor?.at ?? null, p_before_id: cursor?.id ?? null,
      }));
      const key = getKey(), page = rows.slice(0, 50), last = page.at(-1);
      const result = participationAdminPageSchema.parse({
        participants: page.map(row => ({ id: row.id, createdAt: row.createdAt, quizCorrectAt: row.quizCorrectAt, bingoCompletedAt: row.bingoCompletedAt, stamps: row.stamps, name: decryptParticipationName(row.nameEncrypted, row.appUserId, key) })),
        nextCursor: rows.length > 50 && last ? Buffer.from(JSON.stringify({ at: last.createdAt, id: last.id })).toString("base64url") : null,
      });
      return Response.json(result, { headers });
    } catch (error) { return failure(error); }
  };
}
