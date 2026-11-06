import "server-only";
import { z } from "zod";
import { qualificationSchema } from "@/features/groups/domain/qualification";
import { groupMessagesSchema, groupOwnReportsSchema } from "@/features/groups/domain/contracts";
import { applicationStatusListSchema } from "@/features/groups/domain/application-status";
import { AuthError } from "@/features/auth/domain/auth-errors";
import type { FanpageDependencies } from "@/server/fanpage/routes";
import { APP_LOCALES } from "@/i18n/locales";

const uuid = z.uuid();
const requestId = uuid;
const visitedCursor = z.object({v:z.literal(1),sort:z.literal("visited"),owner:uuid,id:uuid,lastSeenAt:z.iso.datetime({offset:true}).nullable()}).strict();
function decodeVisitedCursor(token:string,owner:string) {
 if (!/^[A-Za-z0-9_-]{1,512}$/.test(token)) throw new SyntaxError("invalid cursor");
 const bytes=Buffer.from(token,"base64url");
 if(bytes.toString("base64url")!==token) throw new SyntaxError("invalid cursor");
 const cursor=visitedCursor.parse(JSON.parse(bytes.toString("utf8")));
 if(cursor.owner!==owner) throw new SyntaxError("cursor owner mismatch");
 return cursor;
}
const base = z.object({ qualification: qualificationSchema.optional(), expectedRevision: z.number().int().min(1).optional(), kind: z.enum(["fan", "hobby", "brand"]), name: z.string().trim().min(1).max(100), description: z.string().trim().min(1).max(1000), imageAssetId:uuid.nullable().optional(), imageUrl: z.string().max(2048).refine(v => /^https:\/\//.test(v) || /^\/[^/]/.test(v)).nullable().optional(), question: z.string().trim().max(300).nullable().optional(), requestId }).strict();
const inputSchemas = {
  apply: base,
  revise: base,
  "post-edit": z.object({ title: z.string().trim().min(1).max(100), body: z.string().trim().min(1).max(20000), visibility: z.enum(["public", "members"]), category: z.enum(["notice","free"]).optional(), assetIds: z.array(uuid).max(5).optional(), requestId }).strict(),
  join: z.object({ answer: z.string().trim().max(1000).optional(), requestId }).strict(),
  role: z.object({ appUserId: uuid, role: z.enum(["manager", "member"]), requestId }).strict(),
  transfer: z.object({ appUserId: uuid, requestId }).strict(),
  post: z.object({ title: z.string().trim().min(1).max(100), body: z.string().trim().min(1).max(20000), visibility: z.enum(["public", "members"]), category: z.enum(["notice","free"]).optional(), assetIds: z.array(uuid).max(5).optional(), requestId }).strict(),
  room: z.object({ name: z.string().trim().min(1).max(100), minimumTier: z.enum(["Member", "Bronze", "Silver", "Gold", "Platinum", "Diamond"]).default("Gold"), requestId }).strict(),
  message: z.object({ body: z.string().trim().min(1).max(2000), requestId }).strict(),
  settings: z.object({ name: z.string().trim().min(1).max(100), description: z.string().trim().max(1000), question: z.string().trim().max(300).nullable(), anonymous: z.boolean(), imageAssetId:uuid.nullable().optional(), requestId }).strict(),
  comment: z.object({body:z.string().trim().min(1).max(2000),parentId:uuid.nullable().optional(),assetIds:z.array(uuid).max(5).optional(),requestId}).strict(),
  reaction: z.object({liked:z.boolean(),requestId}).strict(),
  "room-state": z.object({name:z.string().trim().min(1).max(100),status:z.enum(["scheduled","open","readonly","closed"]),minimumTier:z.enum(["Member","Bronze","Silver","Gold","Platinum","Diamond"]),opensAt:z.iso.datetime({offset:true}).nullable().optional(),closesAt:z.iso.datetime({offset:true}).nullable().optional(),requestId}).strict().refine(v=>v.status!=="scheduled"||Boolean(v.opensAt)),
  report:z.object({targetType:z.enum(["post","comment","message"]),targetId:uuid,reason:z.string().trim().min(1).max(1000),requestId}).strict(),
  "resolve-report":z.object({status:z.enum(["submitted","reviewing","action_requested","resolved"]),resolution:z.string().trim().min(1).max(1000),remove:z.boolean().default(false),requestId}).strict(),
  "page-resolve-report":z.object({status:z.enum(["reviewing","action_requested","resolved"]),resolution:z.string().trim().min(1).max(1000),remove:z.boolean().default(false),requestId}).strict(),
  "artist-bind":z.object({appUserId:uuid,requestId}).strict(),
  "artist-unbind":z.object({appUserId:uuid,requestId}).strict(),
  "set-notifications":z.union([z.object({enabled:z.boolean()}).strict(),z.object({notices:z.boolean(),events:z.boolean(),recipients:z.boolean(),activity:z.boolean()}).strict().transform(value=>({enabled:true,...value}))]),
  "set-presence-setting":z.object({enabled:z.boolean()}).strict(),
  review: z.object({expectedRevision:z.number().int().min(1).optional(), action: z.enum(["approve", "reject", "request_changes", "start_review"]), reason: z.string().trim().max(1000).optional(), celebrityId: uuid.optional(), requestId }).strict(),
};
export type GroupOperation = "directory" | "resolve" | "detail" | "applications" | "application-status" | "apply" | "revise" | "post-edit" | "join" | "leave" | "bookmark" | "unbookmark" | "members" | "role" | "transfer" | "posts" | "post" | "post-detail" | "post-remove" | "rooms" | "room" | "messages" | "message" | "settings" | "admin-applications" | "review" | "comments" | "comment" | "comment-remove" | "reaction" | "room-state" | "report" | "admin-reports" | "resolve-report" | "report-evidence" | "artist-bind" | "artist-unbind" | "artist-bindings" | "presence" | "heartbeat" | "presence-setting" | "set-presence-setting" | "notifications" | "set-notifications" | "room-read" | "page-reports" | "page-resolve-report" | "own-reports";
const headers = { "cache-control": "private, no-store", vary: "Authorization" };
export const groupsUnavailable = () => Response.json({ error: { code: "GROUPS_UNAVAILABLE" } }, { status: 503, headers });
async function boundedBody(request: Request) {
  const reader = request.body?.getReader(); if (!reader) throw new SyntaxError("body required");
  const chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 98304) { await reader.cancel(); throw new Error("GROUPS_BODY_TOO_LARGE"); } chunks.push(part.value); } }
  finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export function createGroupHandler(deps: FanpageDependencies) {
  return async (operation: GroupOperation, request: Request, params: { id?: string; itemId?: string; slug?: string; postId?:string } = {}) => {
    try {
      const url = new URL(request.url); const auth = request.headers.get("authorization");
      const one = (key: string) => { const v = url.searchParams.getAll(key); if (v.length > 1) throw new SyntaxError("duplicate query"); return v[0]; };
      const admin = ["admin-applications", "review", "admin-reports", "resolve-report", "report-evidence", "artist-bind", "artist-unbind", "artist-bindings"].includes(operation) ? await deps.authorizeAdmin(auth, crypto.randomUUID()) : null;
      if (admin && request.method !== "GET" && admin.role === "viewer") throw new Error("GROUPS_FORBIDDEN");
      const isPublic = ["directory", "resolve", "detail", "posts", "post-detail", "comments", "presence"].includes(operation) && !one("mine") && !one("owned");
      const owner = admin?.appUserId ?? ((!isPublic || auth !== null) ? (await deps.authorize(auth)).appUserId : null);
      const payload: Record<string, unknown> = {};
      if (operation in inputSchemas) Object.assign(payload, inputSchemas[operation as keyof typeof inputSchemas].parse(await boundedBody(request)));
      if (operation === "application-status") {
        const item = params.itemId ? uuid.parse(params.itemId) : null;
        const limit = item ? 1 : z.coerce.number().int().min(1).max(50).parse(one("limit") ?? 20);
        const read = applicationStatusListSchema.safeParse(await deps.rpc("group_application_status", { p_actor: owner, p_item_id: item, p_limit: limit }));
        if (!read.success) return groupsUnavailable();
        if (!item) return Response.json(read.data, { headers });
        return read.data.items[0] ? Response.json(read.data.items[0], { headers }) : Response.json({ error: { code: "GROUPS_NOT_FOUND" } }, { status: 404, headers });
      }
      if (operation === "directory") {
        const sort=z.enum(["popular", "recent", "today", "visited"]).parse(one("sort") ?? "popular");
        const mine=z.enum(["joined", "bookmarked"]).optional().parse(one("mine"));
        const type=z.enum(["all", "fan", "hobby", "brand", "nonfan"]).parse(one("type") ?? "all");
        const search=z.string().max(100).parse(one("search") ?? "");
        const owned=z.enum(["1"]).optional().parse(one("owned")) === "1";
        const artistRole=z.enum(["idol","singer","actor","creator","show_host"]).optional().parse(one("artistRole"));
        const cursor=one("cursor");
        if(sort==="visited" && (mine!=="joined" || !owner || type!=="all" || search!=="" || owned || artistRole)) throw new SyntaxError("invalid visited scope");
        Object.assign(payload,{owned,artistRole,type,search,sort,mine,cursor:sort==="visited"?(cursor?decodeVisitedCursor(cursor,owner!):undefined):uuid.optional().parse(cursor),limit:z.coerce.number().int().min(1).max(50).parse(one("limit") ?? 8)});
      }
      if (operation === "directory" && payload.sort === "today" && payload.cursor) throw new SyntaxError("today does not accept a cursor");
      if (["posts", "messages", "members", "comments", "applications", "admin-applications", "admin-reports", "page-reports"].includes(operation)) Object.assign(payload, { cursor: uuid.optional().parse(one(operation === "messages" ? "after" : "cursor")), limit: z.coerce.number().int().min(1).max(100).parse(one("limit") ?? 30) });
      if (operation === "own-reports") Object.assign(payload,{cursor:uuid.optional().parse(one("cursor")),limit:z.coerce.number().int().min(1).max(30).parse(one("limit")??30)});
      if (operation === "members") payload.search=z.string().trim().max(100).parse(one("search")??"");
      if(operation === "comment-remove" && params.postId)payload.postId=uuid.parse(params.postId);
      if (operation === "posts") Object.assign(payload,{search:z.string().max(100).parse(one("search")??""),category:z.enum(["all","notice","free"]).parse(one("category")??"all"),sort:z.enum(["recent","popular"]).parse(one("sort")??"recent")});
      if (["directory","resolve","detail"].includes(operation)) { const requested = one("locale"); if (requested !== undefined) payload.locale = z.enum(APP_LOCALES).parse(requested); }
      if (operation === "resolve") payload.slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100).parse(params.slug);
      const content=["own-reports","applications","admin-applications","review","posts","post-detail","post","post-edit","post-remove","comments","comment","comment-remove","reaction","room-state","report","page-reports","page-resolve-report","admin-reports","resolve-report","report-evidence","artist-bind","artist-unbind","artist-bindings","presence","heartbeat","presence-setting","set-presence-setting","notifications","set-notifications","room-read","rooms","messages","message"].includes(operation);
      const result = await deps.rpc(content?"groups_content_dispatch":"groups_dispatch", { p_operation: operation, p_actor: owner, p_page_id: params.id ? uuid.parse(params.id) : null, p_item_id: params.itemId ? uuid.parse(params.itemId) : null, p_input: payload, p_admin_id: admin?.allowlistId ?? null });
      if(operation === "directory" && payload.sort === "visited") {
        const data=z.object({items:z.array(z.unknown()),totalCount:z.number().int().nonnegative(),nextCursor:visitedCursor.nullable()}).passthrough().parse(result);
        if(data.nextCursor && data.nextCursor.owner!==owner) throw new SyntaxError("cursor owner mismatch");
        return Response.json({...data,nextCursor:data.nextCursor?Buffer.from(JSON.stringify(data.nextCursor)).toString("base64url"):null},{headers});
      }
      if(operation === "own-reports")return Response.json(groupOwnReportsSchema.parse(result),{headers});
      if(operation === "messages"){const messages=groupMessagesSchema.parse(result);return Response.json({...messages,items:messages.items.map(item=>({...item,mine:item.profileId===owner}))},{headers});}
      return Response.json(result, { headers });
    } catch (error) {
      if (error instanceof AuthError) return Response.json({ error: { code: error.code } }, { status: error.status, headers });
      const raw = error instanceof Error ? error.message : "";
      const [code, entryReason] = raw.startsWith("GROUPS_FORBIDDEN:") ? ["GROUPS_FORBIDDEN", raw.slice(17)] : [raw, ""];
      const status = ({ GROUPS_FORBIDDEN: 403, GROUPS_NOT_FOUND: 404, GROUPS_CONFLICT: 409, GROUPS_INVALID_REQUEST: 400, GROUPS_BODY_TOO_LARGE: 413 } as Record<string, number>)[code];
      if (error instanceof z.ZodError || error instanceof SyntaxError) return Response.json({ error: { code: "GROUPS_INVALID_REQUEST" } }, { status: 400, headers });
      return status ? Response.json({ error: { code, ...(["stage_low", "jjinfan_required", "not_member"].includes(entryReason) ? { reason: entryReason } : {}) } }, { status, headers }) : groupsUnavailable();
    }
  };
}
