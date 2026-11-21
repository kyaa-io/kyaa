import "server-only";
import { z } from "zod";
import { AuthError } from "@/features/auth/domain/auth-errors";
import { groupChatSchema, groupChatActionInput, groupChatMessageInput, groupChatUnreadSchema, onlineCreatorsSchema } from "@/features/groups/domain/contracts";
import type { FanpageDependencies } from "@/server/fanpage/routes";

const headers = { "cache-control": "private, no-store", vary: "Authorization" };
const failure = (status: number, code: string, reason?: string) => Response.json({ error: { code, ...(reason ? { reason } : {}) } }, { status, headers });

/** 팬페이지 하나의 채팅방. 자격(팬인증 회원·확인된 크리에이터 본인)과 저장 규칙은 group_chat_dispatch 가 정한다. */
export function createGroupChatHandler(deps: FanpageDependencies) {
  return async (request: Request, pageId: string) => {
    try {
      const page = z.uuid().parse(pageId);
      const actor = (await deps.authorize(request.headers.get("authorization"))).appUserId;
      if (request.method === "GET") {
        const url = new URL(request.url);
        const one = (key: string) => { const values = url.searchParams.getAll(key); if (values.length > 1) throw new SyntaxError("duplicate query"); return values[0]; };
        const call = (operation: string, input: Record<string, unknown> = {}) => deps.rpc("group_chat_dispatch", { p_operation: operation, p_actor: actor, p_page_id: page, p_input: input });
        // 탭의 안 읽은 개수. 읽은 위치는 바꾸지 않는다.
        if (one("unread") !== undefined) {
          const unread = groupChatUnreadSchema.safeParse(await call("chat-unread"));
          return unread.success ? Response.json(unread.data, { headers }) : failure(503, "GROUPS_UNAVAILABLE");
        }
        const input = { after: z.uuid().optional().parse(one("after")), limit: z.coerce.number().int().min(1).max(100).parse(one("limit") ?? 50) };
        const read = groupChatSchema.safeParse(await call("chat", input));
        if (!read.success) return failure(503, "GROUPS_UNAVAILABLE");
        return Response.json({ ...read.data, items: read.data.items.map((item) => ({ ...item, mine: item.profileId === actor })) }, { headers });
      }
      const text = await request.text();
      if (text.length > 8192) return failure(413, "GROUPS_BODY_TOO_LARGE");
      const json: unknown = JSON.parse(text);
      if (json && typeof json === "object" && "action" in json) {
        const { action, ...input } = groupChatActionInput.parse(json);
        return Response.json(await deps.rpc("group_chat_dispatch", { p_operation: `chat-${action}`, p_actor: actor, p_page_id: page, p_input: input }), { headers });
      }
      const input = groupChatMessageInput.parse(json);
      return Response.json(await deps.rpc("group_chat_dispatch", { p_operation: "chat-message", p_actor: actor, p_page_id: page, p_input: input }), { headers });
    } catch (error) {
      if (error instanceof AuthError) return failure(error.status, error.code);
      if (error instanceof z.ZodError || error instanceof SyntaxError) return failure(400, "GROUPS_INVALID_REQUEST");
      const raw = error instanceof Error ? error.message : "";
      const [code, reason] = raw.startsWith("GROUPS_FORBIDDEN:") ? ["GROUPS_FORBIDDEN", raw.slice(17)] : [raw, undefined];
      const status = ({ GROUPS_FORBIDDEN: 403, GROUPS_NOT_FOUND: 404, GROUPS_CONFLICT: 409, GROUPS_INVALID_REQUEST: 400, GROUPS_RATE_LIMITED: 429 } as Record<string, number>)[code];
      return status ? failure(status, code, reason && ["not_verified", "restricted"].includes(reason) ? reason : undefined) : failure(503, "GROUPS_UNAVAILABLE");
    }
  };
}

/** 랭킹 행의 '접속 중'. 팬페이지 머리의 공개 접속 표시와 같은 조건이라 로그인 없이 읽는다. */
export function createOnlineCreatorsHandler(deps: FanpageDependencies) {
  return async (request: Request) => {
    try {
      const url = new URL(request.url);
      const raw = url.searchParams.getAll("slugs");
      if (raw.length !== 1) throw new SyntaxError("slugs required");
      const slugs = z.array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100)).min(1).max(50).parse(raw[0]!.split(","));
      const read = onlineCreatorsSchema.safeParse(await deps.rpc("group_online_creator_slugs", { p_slugs: slugs }));
      if (!read.success) return failure(503, "GROUPS_UNAVAILABLE");
      return Response.json({ online: read.data }, { headers: { "cache-control": "public, max-age=15" } });
    } catch (error) {
      if (error instanceof z.ZodError || error instanceof SyntaxError) return failure(400, "GROUPS_INVALID_REQUEST");
      return failure(503, "GROUPS_UNAVAILABLE");
    }
  };
}
