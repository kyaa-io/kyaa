import "server-only";
import { z } from "zod";
import { AuthError } from "@/features/auth/domain/auth-errors";
import type { FanpageDependencies } from "@/server/fanpage/routes";
import { boundedText } from "@/server/auth/apple-notifications/reauthentication-provider";
const key = { requestId: z.uuid() };
const schemas = {
 create: z.object({ ...key, conditions: z.array(z.discriminatedUnion('type', [z.object({type:z.literal('attendance_days'),min:z.number().int().min(1).max(30)}).strict(),z.object({type:z.literal('mission_approved'),min:z.number().int().min(1).max(10)}).strict(),z.object({type:z.literal('post_or_comment'),min:z.number().int().min(1).max(50)}).strict()])).max(3).default([]), entryMode: z.enum(["ticket", "free"]).default("ticket"), opensAt: z.iso.datetime({ offset: true }).optional(), giftApplicationId: z.uuid().nullable().optional(), title: z.string().trim().min(1).max(100), summary: z.string().trim().max(1000).default(""), imageUrl: z.string().max(2048).regex(/^(https:\/\/|\/[^/])/).nullable().optional(), winnerQuantity: z.number().int().min(1).max(1000), perUserLimit: z.number().int().min(1).max(10000), closesAt: z.iso.datetime({ offset: true }), submissionDays: z.number().int().min(1).max(30), fulfillmentMethod: z.enum(["digital", "physical_shipping", "on_site_pickup"]) }).strict().refine((input) => !input.opensAt || Date.parse(input.closesAt) > Date.parse(input.opensAt), { path: ["closesAt"], message: "Closing time must follow opening time" }),
 enter: z.object({ ...key, amount: z.number().int().min(1).max(10000) }).strict(),
 cancel: z.object(key).strict(),
 recipient: z.object({ ...key, name: z.string().trim().min(1).max(120), phone: z.string().trim().min(7).max(40), address: z.string().trim().max(1000).nullable().optional(), consented: z.literal(true), consentVersion: z.string().min(1).max(80) }).strict(),
 fulfill: z.object({ ...key, winnerId: z.uuid() }).strict(),
};
export type GroupRaffleOperation = "list" | "detail" | "recipients" | keyof typeof schemas;
const headers = { "cache-control": "private, no-store", vary: "Authorization" };
export function createGroupRaffleHandler(deps: FanpageDependencies) {
 return async (operation: GroupRaffleOperation, request: Request, pageId: string, raffleId?: string, platformAdmin = false) => {
  try {
   const page = z.uuid().parse(pageId), id = raffleId ? z.uuid().parse(raffleId) : null;
   const admin = platformAdmin ? await deps.authorizeAdmin(request.headers.get("authorization"), crypto.randomUUID()) : null;
   if (admin?.role === "viewer" && request.method !== "GET") throw new Error("GROUP_RAFFLE_FORBIDDEN");
   const actor = admin?.appUserId ?? (operation === "list" && !request.headers.has("authorization") ? null : (await deps.authorize(request.headers.get("authorization"))).appUserId);
   const input = operation in schemas ? schemas[operation as keyof typeof schemas].parse(JSON.parse(await boundedText(request, 16384))) : {};
   return Response.json(await deps.rpc("group_raffle_dispatch", { p_operation: operation, p_actor: actor, p_page_id: page, p_id: id, p_input: input, p_admin_id: admin?.allowlistId ?? null }), { headers });
  } catch (error) {
   if (error instanceof AuthError) return Response.json({ error: { code: error.code } }, { status: error.status, headers });
   if (error instanceof z.ZodError || error instanceof SyntaxError) return Response.json({ error: { code: "GROUP_RAFFLE_INVALID" } }, { status: 400, headers });
   const code = error instanceof Error ? error.message : "";
   const status = ({ GROUP_RAFFLE_INVALID: 400, GROUP_RAFFLE_CONDITIONS_REQUIRED: 403, GROUP_RAFFLE_NOT_FOUND: 404, GROUP_RAFFLE_FORBIDDEN: 403, GROUP_RAFFLE_MEMBERS_REQUIRED: 403, GROUP_RAFFLE_CLOSED: 409, GROUP_RAFFLE_LIMIT: 409, GROUP_RAFFLE_CONFLICT: 409, GROUP_GIFT_STOCK: 409, GROUP_GIFT_CONFLICT: 409, GROUP_GIFT_FORBIDDEN: 403, GROUP_GIFT_NOT_FOUND: 404, GROUP_WALLET_INSUFFICIENT_BALANCE: 409, GROUP_WALLET_REQUEST_CONFLICT: 409, GROUP_WALLET_WRITE_FENCED: 503 } as Record<string, number>)[code];
   return Response.json({ error: { code: status ? code : "GROUP_WALLET_UNAVAILABLE" } }, { status: status ?? 503, headers });
  }
 };
}
