import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { AuthError } from "@/features/auth/domain/auth-errors";
import { externalRoomLinksInput } from "@/features/groups/domain/external-room-link";
import { leaderPassCheckSchema, leaderPassListSchema } from "@/features/groups/domain/leader-pass";
import type { FanpageDependencies } from "@/server/fanpage/routes";

const uuid = z.uuid();
/** 32바이트 CSPRNG를 base64url로 쓴 43자. */
const token = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const schemas = {
  issue: z.object({ label: z.string().trim().min(1).max(100), days: z.number().int().min(1).max(30).default(7) }).strict(),
  check: z.object({ token }).strict(),
  submit: z.object({
    token,
    name: z.string().trim().min(1).max(100),
    description: z.string().trim().max(1000).default(""),
    imageAssetId: uuid.nullable().optional(),
    externalLinks: externalRoomLinksInput.optional(),
    requestId: uuid,
  }).strict(),
  revoke: z.object({}).strict(),
};
export type LeaderPassOperation = "issue" | "list" | "revoke" | "check" | "submit";
const headers = { "cache-control": "private, no-store", vary: "Authorization" };
/** SQL에는 해시만 보낸다. 원문 토큰은 응답 한 번과 링크에만 있고 저장·로그에 남기지 않는다. */
const hashOf = (value: string) => createHash("sha256").update(value).digest("hex");
export const newLeaderPassToken = () => randomBytes(32).toString("base64url");
const unavailable = () => Response.json({ error: { code: "GROUPS_UNAVAILABLE" } }, { status: 503, headers });

async function bounded(request: Request) {
  const text = await request.text();
  if (text.length > 16384) throw new Error("GROUPS_BODY_TOO_LARGE");
  return JSON.parse(text);
}

export function createLeaderPassHandler(deps: FanpageDependencies, makeToken: () => string = newLeaderPassToken) {
  return async (operation: LeaderPassOperation, request: Request, params: { id?: string } = {}) => {
    try {
      const auth = request.headers.get("authorization");
      const adminOperation = operation === "issue" || operation === "list" || operation === "revoke";
      const admin = adminOperation ? await deps.authorizeAdmin(auth, crypto.randomUUID()) : null;
      if (admin && request.method !== "GET" && admin.role === "viewer") throw new Error("GROUPS_FORBIDDEN");
      const actor = admin?.appUserId ?? (await deps.authorize(auth)).appUserId;
      const input = operation === "list" ? {} : schemas[operation].parse(await bounded(request));
      if (operation === "list") {
        const read = leaderPassListSchema.safeParse(await deps.rpc("group_leader_pass_list", { p_actor: actor, p_admin_id: admin!.allowlistId }));
        return read.success ? Response.json(read.data, { headers }) : unavailable();
      }
      if (operation === "issue") {
        const { label, days } = input as z.infer<typeof schemas.issue>;
        const raw = makeToken();
        const issued = z.object({ id: uuid, label: z.string(), expiresAt: z.string() }).passthrough().parse(await deps.rpc("group_leader_pass_issue", { p_actor: actor, p_admin_id: admin!.allowlistId, p_label: label, p_days: days, p_token_hash: hashOf(raw) }));
        return Response.json({ id: issued.id, label: issued.label, expiresAt: issued.expiresAt, token: raw, path: `/pages/groups/apply?pass=${raw}` }, { headers });
      }
      if (operation === "revoke") {
        return Response.json(await deps.rpc("group_leader_pass_revoke", { p_actor: actor, p_admin_id: admin!.allowlistId, p_id: uuid.parse(params.id) }), { headers });
      }
      if (operation === "check") {
        const { token: raw } = input as z.infer<typeof schemas.check>;
        const read = leaderPassCheckSchema.safeParse(await deps.rpc("group_leader_pass_check", { p_actor: actor, p_token_hash: hashOf(raw) }));
        return read.success ? Response.json(read.data, { headers }) : unavailable();
      }
      const { token: raw, ...rest } = input as z.infer<typeof schemas.submit>;
      const opened = z.object({ pageId: uuid }).passthrough().parse(await deps.rpc("group_application_submit_with_pass", { p_actor: actor, p_token_hash: hashOf(raw), p_input: rest }));
      return Response.json({ pageId: opened.pageId }, { headers });
    } catch (error) {
      if (error instanceof AuthError) return Response.json({ error: { code: error.code } }, { status: error.status, headers });
      if (error instanceof z.ZodError || error instanceof SyntaxError) return Response.json({ error: { code: "GROUPS_INVALID_REQUEST" } }, { status: 400, headers });
      const code = error instanceof Error ? error.message : "";
      const status = ({ GROUPS_FORBIDDEN: 403, GROUPS_NOT_FOUND: 404, GROUPS_CONFLICT: 409, GROUPS_INVALID_REQUEST: 400, GROUPS_BODY_TOO_LARGE: 413 } as Record<string, number>)[code];
      return status ? Response.json({ error: { code } }, { status, headers }) : unavailable();
    }
  };
}
