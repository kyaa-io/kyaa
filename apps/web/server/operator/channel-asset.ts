import "server-only";
import { z } from "zod";
import { AuthError } from "../../features/auth/domain/auth-errors";
import type { ChannelSession } from "./channel-operator-gate";

const headers = { "cache-control": "private, no-store", vary: "Authorization", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'" };
const errorResponse = (code: string, status: number) => Response.json({ error: { code } }, { status, headers: { "cache-control": "private, no-store", vary: "Authorization" } });
const assetSchema = z.object({ storagePath: z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/), mimeType: z.literal("image/webp") }).strict();

/**
 * Operator-only image preview. The asset must belong to the authenticated
 * channel: the gate rejects other channels and the SQL read filters
 * celebrity_id, so another channel's asset never resolves.
 */
export function createChannelAssetHandler(dependencies: {
  authorize(authorization: string | null, correlationId: string, celebrityId: string): Promise<ChannelSession>;
  readAsset(session: ChannelSession, celebrityId: string, assetId: string): Promise<unknown>;
  download(path: string): Promise<Blob | Uint8Array>;
}) {
  return async function GET(request: Request, celebrityId: string, assetId: string): Promise<Response> {
    try {
      if (!z.uuid().safeParse(celebrityId).success || !z.uuid().safeParse(assetId).success) return errorResponse("INVALID_INPUT", 400);
      if (new URL(request.url).search) return errorResponse("INVALID_INPUT", 400);
      const session = await dependencies.authorize(request.headers.get("authorization"), crypto.randomUUID(), celebrityId);
      const raw = await dependencies.readAsset(session, celebrityId, assetId);
      // An asset outside the channel is indistinguishable from a missing one.
      if (raw === null || raw === undefined) return errorResponse("FORBIDDEN", 403);
      const value = assetSchema.safeParse(raw);
      if (!value.success) return errorResponse("UNAVAILABLE", 503);
      const bytes = await dependencies.download(value.data.storagePath);
      return new Response(bytes as BodyInit, { headers: { ...headers, "content-type": value.data.mimeType } });
    } catch (error) {
      if (error instanceof AuthError) return errorResponse(error.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN", error.status === 401 ? 401 : 403);
      // The SQL read raises this for a channel the caller does not operate.
      if (error instanceof Error && error.message === "active channel operator required") return errorResponse("FORBIDDEN", 403);
      return errorResponse("UNAVAILABLE", 503);
    }
  };
}
