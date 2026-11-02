import "server-only";
import { z } from "zod";
import { AuthError } from "@/features/auth/domain/auth-errors";
import { boundedJson } from "@/server/certification/certification-http";
import type { FanpageDependencies } from "@/server/fanpage/routes";
import { groupActivitiesSchema, groupEventsSchema, groupEventDetailSchema, groupCollectionsSchema, groupMissionsSchema, groupMissionDetailSchema, groupTicketSchema, groupParticipantsSchema, groupSubmissionsSchema,groupCheckInSchema,groupEventApplicationReceiptSchema,groupSubmissionReceiptSchema,groupEventReviewReceiptSchema,groupOfficialApplicationsSchema,groupEventSupportSchema,groupEventSupportSubmissionSchema } from "./domain";
const id = z.uuid();
const request = { requestId: id };
const text = z.string().trim().min(1).max(200);
const image = z.string().max(2048).refine(value => value.startsWith("https://") || /^\/[^/]/.test(value)).nullable().optional();
const external = z.url().max(2048).refine(value => { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; });
const eventInput = z.object({ ...request, expectedRevision: z.number().int().positive().optional(), title: text, description: z.string().max(10000), imageUrl: image, imageAssetId:id.nullable().optional(), startsAt: z.iso.datetime({ offset: true }), endsAt: z.iso.datetime({ offset: true }), opensAt: z.iso.datetime({ offset: true }), closesAt: z.iso.datetime({ offset: true }), location: z.string().trim().min(1).max(300), capacity: z.number().int().min(1).max(100000).nullable(), requiresApproval: z.boolean(), state: z.enum(["draft", "published", "cancelled", "ended"]) }).strict().refine(v => Date.parse(v.startsAt) < Date.parse(v.endsAt) && Date.parse(v.opensAt) < Date.parse(v.closesAt) && Date.parse(v.closesAt) <= Date.parse(v.endsAt));
// Existing immutable receipts must replay byte-for-byte after the evidence upgrade.
const missionSubmitReceipt=z.union([groupSubmissionReceiptSchema,z.object({id:z.uuid(),status:z.literal("pending")}).strict()]);
const missionReviewReceipt=z.union([groupSubmissionReceiptSchema,z.object({id:z.uuid(),status:z.enum(["completed","rejected"]),rewardPoints:z.number().int().nonnegative()}).strict()]);
const eventReviewReceipt=z.union([groupEventReviewReceiptSchema,z.object({status:z.literal("saved"),eventId:z.uuid()}).strict()]);
const writeSchemas = {
  "event-save": eventInput,
  "event-apply": z.object({...request,applicationMessage:z.string().max(1000).optional()}).strict(),
  "event-cancel": z.object(request).strict(),
  "event-review-participant": z.object({ ...request, action: z.enum(["confirm", "reject"]) }).strict(),
  "event-check-in": z.object({ ...request, qrPayload: z.string().regex(/^kyaa-event:[0-9a-f-]{36}:[0-9a-f]{64}$/).refine(value => z.uuid().safeParse(value.split(":")[1]).success) }).strict(),
  "admin-event-check-in": z.object({ ...request, qrPayload: z.string().regex(/^kyaa-event:[0-9a-f-]{36}:[0-9a-f]{64}$/).refine(value => z.uuid().safeParse(value.split(":")[1]).success) }).strict(),
  "event-manual-check-in":z.object({...request,confirmedName:z.string().trim().min(1).max(80),reason:z.string().trim().min(1).max(500)}).strict(),
  "event-support-submit":z.object({...request,description:z.string().trim().min(1).max(10000),sourceUrl:external,previousSubmissionId:id.optional()}).strict(),
  "event-support-review":z.object({...request,action:z.enum(["approve","request_changes"]),reason:z.string().trim().max(1000).default("")}).strict(),
  "event-review-write": z.object({ ...request,title:text.optional(),imageAssetId:id.optional(),expectedReviewRevision:z.number().int().nonnegative().optional(), body: z.string().trim().min(1).max(5000) }).strict(),
  "official-submit": z.object({ ...request, description: z.string().trim().min(1).max(10000), sourceUrl: external.nullable().default(null),previousApplicationId:id.optional() }).strict(),
  "official-review": z.object({ ...request, action: z.enum(["start_review", "approve", "reject", "request_changes"]), reason: z.string().trim().max(1000).default("") }).strict(),
  "collection-save": z.object({ ...request, expectedRevision: z.number().int().positive().optional(), title: text, imageUrl: image, imageAssetId:id.nullable().optional(), externalUrl: external, status: z.enum(["active", "sold_out", "hidden"]) }).strict(),
  "mission-save": z.object({ ...request,submissionKind:z.enum(["text","photo","survey"]).optional(),surveyQuestion:z.string().trim().min(1).max(500).optional(),surveyOptions:z.array(z.string().trim().min(1).max(200)).length(3).refine(v=>new Set(v).size===3).optional(), expectedRevision: z.number().int().positive().optional(), title: text, instructions: z.string().trim().min(1).max(10000), imageUrl: image, imageAssetId:id.nullable().optional(), state: z.enum(["draft", "published", "closed"]) }).strict().refine(v=>v.submissionKind!=="survey"||Boolean(v.surveyQuestion&&v.surveyOptions)),
  "mission-submit": z.object({...request,body:z.string().trim().max(10000).default(""),imageAssetId:id.optional(),originalAttested:z.boolean().optional(),surveyChoice:z.number().int().min(0).max(2).optional(),expectedMissionRevision:z.number().int().positive().optional(),expectedSubmissionRevision:z.number().int().positive().optional()}).strict().refine(v=>v.surveyChoice!==undefined||v.body.length>0),
  "mission-review": z.object({...request,expectedSubmissionRevision:z.number().int().positive().optional(),action:z.enum(["approve","reject"]),reason:z.string().trim().max(1000).default("")}).strict(),
  "mission-reward-policy": z.object({ ...request, rewardPoints: z.number().int().min(0).max(100000), budgetPoints: z.number().int().min(0).max(1000000000) }).strict(),
};
export type GroupActivityOperation = keyof typeof writeSchemas | "mission" | "activities" | "events" | "event" | "event-ticket" | "event-participants" | "collections" | "missions" | "mission-submissions" | "admin-official-applications" | "admin-missions" | "official-applications" | "event-support" | "admin-event-support";
const publicOperations = new Set(["activities", "events", "event", "collections", "missions", "mission"]);
const adminOperations = new Set(["official-review", "admin-official-applications", "admin-missions", "admin-event-check-in", "mission-reward-policy","admin-event-support","event-support-review"]);
const headers = { "cache-control": "private, no-store", vary: "Authorization" };
export function groupActivityFailure(error: unknown) {
  if (error instanceof AuthError) return Response.json({ error: { code: error.code } }, { status: error.status, headers });
  if (error instanceof z.ZodError || error instanceof SyntaxError) return Response.json({ error: { code: "GROUP_ACTIVITY_INVALID" } }, { status: 400, headers });
  const marker = error instanceof Error ? error.message : "";
  const statuses: Record<string, number> = { GROUP_ACTIVITY_FORBIDDEN: 403, GROUP_ACTIVITY_NOT_FOUND: 404, GROUP_ACTIVITY_CONFLICT: 409, GROUP_ACTIVITY_CLOSED: 409, GROUP_ACTIVITY_CAPACITY: 409, GROUP_ACTIVITY_INVALID: 400 };
  return Response.json({ error: { code: statuses[marker] ? marker : "GROUP_ACTIVITY_UNAVAILABLE" } }, { status: statuses[marker] ?? 503, headers });
}
export function createGroupActivityHandler(deps: FanpageDependencies) {
  return async (operation: GroupActivityOperation, r: Request, params: { id?: string; itemId?: string; subId?: string } = {}) => {
    try {
      const auth = r.headers.get("authorization");
      const admin = adminOperations.has(operation) ? await deps.authorizeAdmin(auth, crypto.randomUUID()) : null;
      if (admin?.role === "viewer" && operation in writeSchemas) throw new Error("GROUP_ACTIVITY_FORBIDDEN");
      const owner = admin?.appUserId ?? (auth !== null || !publicOperations.has(operation) ? (await deps.authorize(auth)).appUserId : null);
      const payload: Record<string, unknown> = operation in writeSchemas ? writeSchemas[operation as keyof typeof writeSchemas].parse(await boundedJson(r, 24576)) : {};
      const query = new URL(r.url).searchParams;
      for (const key of ["limit", "cursor"]) if (query.getAll(key).length > 1) throw new SyntaxError("duplicate query");
      if (!(operation in writeSchemas)) Object.assign(payload, { limit: z.coerce.number().int().min(1).max(100).parse(query.get("limit") ?? 30), cursor: query.has("cursor") ? id.parse(query.get("cursor")) : null });
      if(operation==="event-participants"){if(query.getAll("search").length>1)throw new SyntaxError("duplicate query");payload.search=z.string().trim().max(100).parse(query.get("search")??"");}
      const result = await deps.rpc("group_activities_dispatch", { p_operation: operation === "admin-event-check-in" ? "event-check-in" : operation, p_actor: owner, p_page_id: params.id ? id.parse(params.id) : null, p_item_id: params.itemId ? id.parse(params.itemId) : null, p_sub_id: params.subId ? id.parse(params.subId) : null, p_input: payload, p_admin_id: admin?.allowlistId ?? null });
      if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("GROUP_ACTIVITY_UNAVAILABLE");
      if (operation === "activities") {
        const catalog = await deps.rpc("group_raffle_list", { p_page_id: params.id ? id.parse(params.id) : null, p_actor: owner });
        const raffles = z.object({ raffles: z.array(z.record(z.string(), z.unknown())) }).parse(catalog);
        const combined = groupActivitiesSchema.safeParse({ ...result, raffles: raffles.raffles });
        if (!combined.success) throw new Error("GROUP_ACTIVITY_UNAVAILABLE");
        return Response.json(combined.data, { headers });
      }
      const outputSchema = ({ "event-apply":groupEventApplicationReceiptSchema,"mission-submit":missionSubmitReceipt,"mission-review":missionReviewReceipt,"event-review-write":eventReviewReceipt,events:groupEventsSchema,event:groupEventDetailSchema,collections:groupCollectionsSchema,missions:groupMissionsSchema,mission:groupMissionDetailSchema,"event-ticket":groupTicketSchema,"event-participants":groupParticipantsSchema,"mission-submissions":groupSubmissionsSchema,"official-applications":groupOfficialApplicationsSchema,"event-support":groupEventSupportSchema,"event-support-submit":groupEventSupportSubmissionSchema,"event-support-review":groupEventSupportSubmissionSchema,"event-check-in":groupCheckInSchema,"admin-event-check-in":groupCheckInSchema,"event-manual-check-in":groupCheckInSchema } as Record<string,z.ZodType>)[operation];
      if (outputSchema && !outputSchema.safeParse(result).success) throw new Error("GROUP_ACTIVITY_UNAVAILABLE");
      return Response.json(result, { headers });
    } catch (error) { return groupActivityFailure(error); }
  };
}
