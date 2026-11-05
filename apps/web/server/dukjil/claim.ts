import "server-only";
import { z } from "zod";
import { boundedJson } from "@/server/certification/certification-http";
import { dukjilFailure, type DukjilDependencies } from "./routes";
import { passportIdSchema, resolveOwnedCreator } from "./roadmap";

// Contract §3.4: claim_passport_page(p_user, p_celebrity, p_page_no, p_request_key). One heart per page; hearts go to
// creator_heart_ledger and never to the wallet. A replay returns the first result with replayed:true.
export const claimBodySchema = z.object({ requestKey: z.uuid() }).strict();
export const pageNoSchema = z.coerce.number().int().min(1).max(999);
export const claimResultSchema = z.object({
  hearts: z.literal(1), pageNo: z.number().int().min(1), jjinfanConfirmed: z.boolean(), cheerStampId: z.uuid().nullable(), replayed: z.boolean(),
}).strict();
export type PassportClaimResult = z.infer<typeof claimResultSchema>;

const privateHeaders = { "cache-control": "private, no-store", vary: "Authorization" };

export function createClaimHandler(deps: DukjilDependencies) {
  return {
    claim: async (request: Request, passportId: string, pageNo: string) => {
      try {
        const { appUserId } = await deps.authorize(request.headers.get("authorization"));
        const id = passportIdSchema.parse(passportId);
        const page = pageNoSchema.parse(pageNo);
        const body = claimBodySchema.parse(await boundedJson(request, 1024));
        // Ownership and the creator behind the passport come from the owner's own passport row, never from the client.
        const celebrityId = await resolveOwnedCreator(deps, appUserId, id);
        const raw = await deps.rpc("claim_passport_page", { p_user: appUserId, p_celebrity: celebrityId, p_page_no: page, p_request_key: body.requestKey });
        const parsed = claimResultSchema.safeParse(raw);
        if (!parsed.success) throw new Error("DUKJIL_UNAVAILABLE");
        return Response.json(parsed.data, { headers: privateHeaders });
      } catch (error) {
        return dukjilFailure(error);
      }
    },
  };
}
