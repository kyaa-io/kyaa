import "server-only";
import { z } from "zod";
import { AuthError } from "@/features/auth/domain/auth-errors";
import { photocardClaimSchema } from "@/features/fanpage/domain/photocard-claim";
import { FanAuthUnavailableError } from "@/server/fan-auth/fan-auth-gate";

const headers = { "cache-control": "private, no-store", vary: "Authorization" };
const inputSchema = z.object({ bundleId: z.uuid().optional() }).strict();
type Dependencies = {
  authorize(authorization: string | null): Promise<{ appUserId: string }>;
  rpc(name: string, args: Record<string, unknown>): Promise<unknown>;
};
const failure = (code: string, status: number) => Response.json({ error: { code } }, { status, headers });

async function readInput(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("PHOTOCARD_INVALID_SELECTION");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1024) { await reader.cancel(); throw new Error("PHOTOCARD_INVALID_SELECTION"); }
      chunks.push(value);
    }
    return inputSchema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))));
  } catch {
    throw new Error("PHOTOCARD_INVALID_SELECTION");
  } finally { reader.releaseLock(); }
}

export function createPhotocardClaimHandlers(deps: Dependencies) {
  async function handle(request: Request, collectionId: string, claim: boolean) {
    try {
      const owner = await deps.authorize(request.headers.get("authorization"));
      const id = z.uuid().safeParse(collectionId);
      if (!id.success) return failure("PHOTOCARD_INVALID_SELECTION", 400);
      const input = claim ? await readInput(request) : null;
      const raw = await deps.rpc(claim ? "claim_cheer_photocard_bundle" : "read_cheer_photocard_claim", {
        p_app_user_id: owner.appUserId,
        p_collection_id: id.data,
        ...(input ? { p_bundle_id: input.bundleId ?? null } : {}),
      });
      if (raw === null) return failure("PHOTOCARD_NOT_FOUND", 404);
      const result = photocardClaimSchema.safeParse(raw);
      if (!result.success) return failure("PHOTOCARD_UNAVAILABLE", 503);
      return Response.json(result.data, { headers });
    } catch (error) {
      if (error instanceof AuthError) return failure(error.status === 401 ? "AUTHENTICATION_REQUIRED" : "PHOTOCARD_FORBIDDEN", error.status);
      if (error instanceof FanAuthUnavailableError) return failure("PHOTOCARD_UNAVAILABLE", 503);
      const code = error instanceof Error ? error.message : "";
      if (code === "PHOTOCARD_NOT_FOUND") return failure(code, 404);
      if (code === "PHOTOCARD_INVALID_SELECTION") return failure(code, 400);
      if (code === "PHOTOCARD_ALREADY_CLAIMED" || code === "PHOTOCARD_NOT_READY") return failure(code, 409);
      return failure("PHOTOCARD_UNAVAILABLE", 503);
    }
  }
  return {
    get: (request: Request, collectionId: string) => handle(request, collectionId, false),
    claim: (request: Request, collectionId: string) => handle(request, collectionId, true),
  };
}
