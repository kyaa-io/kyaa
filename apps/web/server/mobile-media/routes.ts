import "server-only";

import { z } from "zod";
import { AuthError } from "@/features/auth/domain/auth-errors";
import { ownedMediaSchema, reserveMediaSchema } from "./domain";

export interface MobileMediaDependencies {
  authorize(authorization: string | null): Promise<{ appUserId: string }>;
  rpc(name: string, args: Record<string, unknown>): Promise<unknown>;
  signUpload(path: string): Promise<{ uploadUrl: string; token: string; tokenExpiresAt: string }>;
  process(assetId: string): Promise<void>;
  cleanup(): Promise<void>;
  stream(path: string, range: string | null, method?: "HEAD"): Promise<Response>;
}
const headers = { "cache-control": "private, no-store", vary: "Authorization" };
const uuid = z.uuid();
async function jsonBody(request: Request) {
  const reader = request.body?.getReader(); if (!reader) throw new SyntaxError("missing body");
  const chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength; if (size > 4096) { await reader.cancel(); throw new Error("MEDIA_BODY_TOO_LARGE"); } chunks.push(chunk.value); } }
  finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}
function errorResponse(error: unknown) {
  if (error instanceof AuthError) return Response.json({ error: { code: "AUTHENTICATION_REQUIRED" } }, { status: error.status, headers });
  if (error instanceof z.ZodError || error instanceof SyntaxError) return Response.json({ error: { code: "MEDIA_INVALID_INPUT" } }, { status: 400, headers });
  const code = error instanceof Error ? error.message : "";
  const status = ({ MEDIA_BODY_TOO_LARGE: 413, MEDIA_NOT_FOUND: 404, MEDIA_FORBIDDEN: 403, MEDIA_CONFLICT: 409, MEDIA_RATE_LIMITED: 429 } as Record<string, number>)[code];
  return Response.json({ error: { code: status ? code : "MEDIA_UNAVAILABLE" } }, { status: status ?? 503, headers });
}

export function createMobileMediaHandlers(deps: MobileMediaDependencies) {
  const owner = async (request: Request) => (await deps.authorize(request.headers.get("authorization"))).appUserId;
  return {
    reserve: async (request: Request) => { try {
      const appUserId = await owner(request), value = reserveMediaSchema.parse(await jsonBody(request));
      const reserved = z.object({ assetId: uuid, storagePath: z.string(), expiresAt: z.iso.datetime({ offset: true }), replayed: z.boolean() }).strict().parse(await deps.rpc("reserve_owned_mobile_media", { p_app_user_id: appUserId, p_kind: value.kind, p_purpose: value.purpose, p_content_type: value.contentType, p_byte_size: value.byteSize, p_request_id: value.requestId }));
      const signed = await deps.signUpload(reserved.storagePath);
      await deps.rpc("record_owned_mobile_media_upload_token", { p_app_user_id: appUserId, p_asset_id: reserved.assetId, p_token_expires_at: signed.tokenExpiresAt });
      return Response.json({ assetId: reserved.assetId, uploadUrl: signed.uploadUrl, uploadToken: signed.token, expiresAt: reserved.expiresAt, replayed: reserved.replayed }, { status: 201, headers });
    } catch (error) { return errorResponse(error); } },
    status: async (request: Request, id: string) => { try { return Response.json(ownedMediaSchema.parse(await deps.rpc("read_owned_mobile_media", { p_app_user_id: await owner(request), p_asset_id: uuid.parse(id) })), { headers }); } catch (error) { return errorResponse(error); } },
    complete: async (request: Request, id: string) => { try {
      const appUserId = await owner(request); await deps.rpc("queue_owned_mobile_media_validation", { p_app_user_id: appUserId, p_asset_id: uuid.parse(id) });
      await deps.process(id);
      const result = ownedMediaSchema.parse(await deps.rpc("read_owned_mobile_media", { p_app_user_id: appUserId, p_asset_id: id }));
      return Response.json(result, { status: result.state === "ready" || result.state === "rejected" ? 200 : 202, headers });
    } catch (error) { return errorResponse(error); } },
    cancel: async (request: Request, id: string) => { try { await deps.rpc("cancel_owned_mobile_media", { p_app_user_id: await owner(request), p_asset_id: uuid.parse(id) }); await deps.cleanup(); return new Response(null, { status: 204, headers }); } catch (error) { return errorResponse(error); } },
    read: async (request: Request, id: string, publicOfficial = false) => { try {
      const appUserId = publicOfficial ? null : await owner(request), url = new URL(request.url), variants = url.searchParams.getAll("variant");
      if (variants.length > 1) throw new SyntaxError("duplicate variant"); const variant = z.enum(["original", "thumbnail"]).parse(variants[0] ?? "original");
      const access = z.object({ storagePath: z.string(), contentType: z.string() }).strict().nullable().parse(await deps.rpc(publicOfficial ? "authorize_public_official_media_read" : "authorize_mobile_media_read", { ...(publicOfficial ? {} : { p_app_user_id: appUserId }), p_asset_id: uuid.parse(id), p_variant: variant }));
      if (!access) throw new Error("MEDIA_NOT_FOUND");
      const range = request.headers.get("range");
      const upstream = request.method === "HEAD"
        ? await deps.stream(access.storagePath, range, "HEAD")
        : await deps.stream(access.storagePath, range);
      if (!upstream.ok && upstream.status !== 206 && upstream.status !== 416) throw new Error("MEDIA_UNAVAILABLE");
      const responseHeaders = new Headers({ "content-type": access.contentType, "cache-control": "private, no-store", vary: "Authorization", "accept-ranges": "bytes" });
      for (const name of ["content-length", "content-range", "etag", "last-modified"]) { const value = upstream.headers.get(name); if (value) responseHeaders.set(name, value); }
      return new Response(request.method === "HEAD" ? null : upstream.body, { status: upstream.status, headers: responseHeaders });
    } catch (error) { return errorResponse(error); } },
  };
}
