import "server-only";
import { z } from "zod";
import { AuthError } from "@/features/auth/domain/auth-errors";
import { boundedText } from "@/server/auth/apple-notifications/reauthentication-provider";
import type { FanpageDependencies } from "@/server/fanpage/routes";
import { giftInputs, type GroupGiftOperation } from "./domain";

import { groupGiftListSchema, groupGiftDetailSchema, groupGiftReceiptSchema, giftStatusSchema } from "@/features/groups/domain/gifts";
const headers = { "cache-control": "private, no-store", vary: "Authorization" };
export function groupGiftFailure(error: unknown) {
  if (error instanceof AuthError) return Response.json({ error: { code: error.code } }, { status: error.status, headers });
  if (error instanceof z.ZodError || error instanceof SyntaxError) return Response.json({ error: { code: "GROUP_GIFT_INVALID" } }, { status: 400, headers });
  const code = error instanceof Error ? error.message : "";
  const status = ({ GROUP_GIFT_INVALID: 400, GROUP_GIFT_FORBIDDEN: 403, GROUP_GIFT_NOT_FOUND: 404, GROUP_GIFT_CONFLICT: 409, GROUP_GIFT_STOCK: 409, GROUP_WALLET_WRITE_FENCED: 503 } as Record<string, number>)[code];
  return Response.json({ error: { code: status ? code : "GROUP_GIFT_UNAVAILABLE" } }, { status: status ?? 503, headers });
}
export function createGroupGiftHandler(deps: FanpageDependencies) {
  return async (operation: GroupGiftOperation, request: Request, params: { id?: string; applicationId?: string } = {}) => {
    try {
      const isAdmin = operation.startsWith("admin-") || operation === "review";
      const admin = isAdmin ? await deps.authorizeAdmin(request.headers.get("authorization"), crypto.randomUUID()) : null;
      if (admin?.role === "viewer" && operation === "review") throw new Error("GROUP_GIFT_FORBIDDEN");
      const actor = admin?.appUserId ?? (await deps.authorize(request.headers.get("authorization"))).appUserId;
      const page = params.id ? z.uuid().parse(params.id) : null;
      const application = params.applicationId ? z.uuid().parse(params.applicationId) : null;
      if (!isAdmin && !page || ["detail", "admin-detail", "revise", "review"].includes(operation) && !application) throw new Error("GROUP_GIFT_INVALID");
      const input = operation in giftInputs ? giftInputs[operation as keyof typeof giftInputs].parse(JSON.parse(await boundedText(request, 16384))) : z.object({status:giftStatusSchema.optional(),cursor:z.uuid().optional(),limit:z.coerce.number().int().min(1).max(100).default(30)}).strict().parse(Object.fromEntries(new URL(request.url).searchParams));
      const result=await deps.rpc("group_gifts_dispatch", { p_operation: operation, p_actor: actor, p_page_id: page, p_id: application, p_input: input, p_admin_id: admin?.allowlistId ?? null });
      const schema=operation.endsWith("list")?groupGiftListSchema:operation.endsWith("detail")?groupGiftDetailSchema:groupGiftReceiptSchema;
      const parsed=schema.safeParse(result);if(!parsed.success)throw new Error("GROUP_GIFT_UNAVAILABLE");return Response.json(parsed.data, {headers});
    } catch (error) { return groupGiftFailure(error); }
  };
}
