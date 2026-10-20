import "server-only";
import { z } from "zod";
import { AuthError } from "@/features/auth/domain/auth-errors";
import { FanAuthUnavailableError } from "@/server/fan-auth/fan-auth-gate";
import { renderPhotocard } from "./image";

const accessSchema = z.object({
  storagePath: z.string().min(1).max(500).regex(/^[a-zA-Z0-9][a-zA-Z0-9/_.-]*$/).refine(path => path.split("/").every(part => part && part !== "." && part !== "..")),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  watermarkCode: z.string().regex(/^[A-Z0-9-]{6,40}$/),
}).strict();
const headers = { "cache-control": "private, no-store", vary: "Authorization", "x-content-type-options": "nosniff", "cross-origin-resource-policy": "same-origin" };
type Dependencies = {
  authorize(authorization: string | null): Promise<{ appUserId: string }>;
  rpc(name: string, args: Record<string, unknown>): Promise<unknown>;
  download(path: string): Promise<Uint8Array>;
};

export function createPhotocardReadHandler(deps: Dependencies) {
  return async (request: Request, assetId: string) => {
    try {
      const owner = await deps.authorize(request.headers.get("authorization"));
      const id = z.uuid().parse(assetId);
      const raw = await deps.rpc("authorize_cheer_photocard_read", { p_app_user_id: owner.appUserId, p_asset_id: id });
      if (raw === null) return Response.json({ error: { code: "PHOTOCARD_NOT_FOUND" } }, { status: 404, headers });
      const access = accessSchema.parse(raw);
      const bytes = await renderPhotocard(await deps.download(access.storagePath), access.watermarkCode);
      return new Response(Buffer.from(bytes), { headers: { ...headers, "content-type": "image/webp", "content-disposition": "inline" } });
    } catch (error) {
      const status = error instanceof AuthError || error instanceof FanAuthUnavailableError ? error.status : z.uuid().safeParse(assetId).success ? 503 : 400;
      return Response.json({ error: { code: status === 401 ? "AUTHENTICATION_REQUIRED" : status === 403 ? "PHOTOCARD_FORBIDDEN" : status === 400 ? "PHOTOCARD_INVALID_REQUEST" : "PHOTOCARD_UNAVAILABLE" } }, { status, headers });
    }
  };
}
