import "server-only";
import { z } from "zod";
import { AuthError } from "@/features/auth/domain/auth-errors";
import type { FanpageDependencies } from "@/server/fanpage/routes";
const createSchema = z.object({ requestKey: z.uuid(), name: z.string().trim().min(1).max(100), blankWeight: z.number().int().min(0).max(1000000), prizes: z.array(z.object({ name: z.string().trim().min(1).max(100), imageUrl: z.string().max(2048).regex(/^(https:\/\/|\/[^/])/).nullable().optional(), weight: z.number().int().min(1).max(1000000), stock: z.number().int().min(1).max(1000000) }).strict()).min(1).max(50) }).strict().refine(input => input.blankWeight + input.prizes.reduce((total, prize) => total + prize.weight, 0) === 1000000);
export type CapsuleOperation = "list" | "create" | "draw" | "receipt" | "activate" | "pause" | "close" | "admin-list" | "fulfillments" | "fulfill";
const schemas = { create: createSchema, draw: z.object({ requestKey: z.uuid(), count: z.union([z.literal(1), z.literal(10)]) }).strict(), fulfill: z.object({ id: z.uuid() }).strict() };
const headers = { "cache-control": "private, no-store", vary: "Authorization" };
export function createCapsuleHandler(deps: FanpageDependencies) {
 return async (operation: CapsuleOperation, request: Request, campaignId?: string, requestKey?: string) => {
  try {
   const adminOnly = ["create", "activate", "pause", "close", "admin-list", "fulfillments", "fulfill"].includes(operation);
   const admin = adminOnly ? await deps.authorizeAdmin(request.headers.get("authorization"), crypto.randomUUID()) : null;
   if (admin?.role === "viewer" && request.method !== "GET") return Response.json({ error: { code: "CAPSULE_FORBIDDEN" } }, { status: 403, headers });
   const actor = admin?.appUserId ?? (operation === "list" ? null : (await deps.authorize(request.headers.get("authorization"))).appUserId);
   let input: unknown = {};
   if (operation in schemas) {
    const reader = request.body?.getReader(); if (!reader) throw new SyntaxError();
    const parts: Uint8Array[] = []; let size = 0;
    try { while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength; if (size > 65536) { await reader.cancel(); return Response.json({ error: { code: "CAPSULE_INVALID" } }, { status: 413, headers }); } parts.push(chunk.value); } }
    finally { reader.releaseLock(); }
    input = schemas[operation as keyof typeof schemas].parse(JSON.parse(Buffer.concat(parts).toString("utf8")));
   }
   if (["fulfillments", "admin-list", "list"].includes(operation)) input = { cursor:z.uuid().optional().parse(new URL(request.url).searchParams.get("cursor")??undefined) };
   if (operation === "receipt") input = { requestKey: z.uuid().parse(requestKey) };
   const result = await deps.rpc("group_capsule_dispatch", { p_operation: operation, p_actor: actor, p_campaign: campaignId ? z.uuid().parse(campaignId) : null, p_input: input, p_admin_id: admin?.allowlistId ?? null });
   return Response.json(result, { headers });
  } catch (error) {
   if (error instanceof AuthError) return Response.json({ error: { code: error.code } }, { status: error.status, headers });
   const code = error instanceof Error ? error.message : "";
   const status = ({ CAPSULE_FORBIDDEN: 403, CAPSULE_NOT_FOUND: 404, CAPSULE_INVALID: 400, CAPSULE_REQUEST_CONFLICT: 409, CAPSULE_CONFLICT: 409, CAPSULE_CLOSED: 409, CAPSULE_INSUFFICIENT_STOCK: 409, CAPSULE_SOLD_OUT: 409, GROUP_WALLET_INSUFFICIENT_BALANCE: 409, GROUP_WALLET_REQUEST_CONFLICT: 409, GROUP_WALLET_WRITE_FENCED: 503 } as Record<string, number>)[code];
   if (error instanceof z.ZodError || error instanceof SyntaxError) return Response.json({ error: { code: "CAPSULE_INVALID" } }, { status: 400, headers });
   return Response.json({ error: { code: status ? code : "GROUP_WALLET_UNAVAILABLE" } }, { status: status ?? 503, headers });
  }
 };
}
