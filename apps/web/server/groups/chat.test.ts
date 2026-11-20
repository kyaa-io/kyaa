import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import real from "./__fixtures__/chat-real-sql.json";
import { AuthError } from "@/features/auth/domain/auth-errors";
import { groupChatSchema, groupRoomsSchema } from "@/features/groups/domain/contracts";
import { createGroupChatHandler, createOnlineCreatorsHandler } from "./chat";

const fan = "f1610000-0000-4000-8000-000000000001", page = "18ec5319-95fb-4134-95f4-97ff95ae726b";
const handler = (rpc: ReturnType<typeof vi.fn>, authorize = async () => ({ appUserId: fan })) => createGroupChatHandler({ rpc, authorize, authorizeAdmin: vi.fn() } as never);
const get = (query = "") => new Request(`https://kyaa.test/api/groups/${page}/chat${query}`, { headers: { authorization: "Bearer valid" } });
const post = (body: unknown) => new Request(`https://kyaa.test/api/groups/${page}/chat`, { method: "POST", headers: { authorization: "Bearer valid" }, body: JSON.stringify(body) });

describe("팬페이지 채팅방(임시운영) API", () => {
  it.each(["emptyFan", "readFan", "readArtist"] as const)("실제 SQL 응답(%s)이 라우트 스키마를 통과한다", async (key) => {
    expect(groupChatSchema.safeParse(real[key]).success).toBe(true);
    const rpc = vi.fn().mockResolvedValue(real[key]);
    const response = await handler(rpc)(get("?limit=50"), page);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items.map((item: { mine: boolean }) => item.mine)).toEqual(real[key].items.map((item) => item.profileId === fan));
    expect(rpc).toHaveBeenCalledWith("group_chat_dispatch", { p_operation: "chat", p_actor: fan, p_page_id: page, p_input: { after: undefined, limit: 50 } });
  });
  it("크리에이터 본인의 말은 artist 로 구분되어 온다", () => {
    expect(real.readFan.items.find((item) => item.artist)?.profileId).toBe("00904709-ba3c-49ea-956b-73dba84ce750");
    expect(real.readArtist.artist).toBe(true);
  });
  it("보내기: 글과 requestId 만 넘긴다", async () => {
    const rpc = vi.fn().mockResolvedValue(real.sendArtist);
    const requestId = "c1000000-0000-4000-8000-000000000001";
    const response = await handler(rpc)(post({ body: " 엘리나 왔어요 ", requestId }), page);
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("group_chat_dispatch", { p_operation: "chat-message", p_actor: fan, p_page_id: page, p_input: { body: "엘리나 왔어요", requestId } });
  });
  it.each([[{ body: "가".repeat(501), requestId: "c1000000-0000-4000-8000-000000000001" }], [{ body: "hi" }], [{ body: "hi", requestId: "c1000000-0000-4000-8000-000000000001", assetId: "x" }]])("잘못된 보내기는 DB 전에 400", async (input) => {
    const rpc = vi.fn();
    expect((await handler(rpc)(post(input), page)).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([
    [real.errors.nonFan, 403, "not_verified"],
    ["GROUPS_FORBIDDEN:restricted", 403, "restricted"],
    [real.errors.duplicate, 429, undefined],
    [real.errors.over500, 400, undefined],
    ["GROUPS_NOT_FOUND", 404, undefined],
    ["boom", 503, undefined],
  ] as const)("DB 오류 %s → %i", async (message, status, reason) => {
    const response = await handler(vi.fn().mockRejectedValue(new Error(message)))(get(), page);
    expect(response.status).toBe(status);
    expect((await response.json()).error.reason).toBe(reason);
  });
  it("로그인하지 않으면 DB 를 부르지 않는다", async () => {
    const rpc = vi.fn();
    const response = await handler(rpc, async () => { throw new AuthError("AUTHENTICATION_REQUIRED", 401, "no token"); })(get(), page);
    expect(response.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("랭킹 접속 표시 API", () => {
  const online = (rpc: ReturnType<typeof vi.fn>, query: string) => createOnlineCreatorsHandler({ rpc } as never)(new Request(`https://kyaa.test/api/groups/online-creators${query}`));
  it("실제 SQL 응답을 그대로 돌려준다", async () => {
    const rpc = vi.fn().mockResolvedValueOnce(real.online).mockResolvedValueOnce(real.onlineNone);
    expect(await (await online(rpc, "?slugs=elina,nchive")).json()).toEqual({ online: ["elina"] });
    expect(await (await online(rpc, "?slugs=elina")).json()).toEqual({ online: [] });
    expect(rpc).toHaveBeenCalledWith("group_online_creator_slugs", { p_slugs: ["elina", "nchive"] });
  });
  it.each(["", "?slugs=", "?slugs=Elina", `?slugs=${Array.from({ length: 51 }, (_, i) => `c${i}`).join(",")}`, "?slugs=a&slugs=b"])("잘못된 목록 %s 은 400", async (query) => {
    const rpc = vi.fn();
    expect((await online(rpc, query)).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("비밀방 목록과 섞이지 않음", () => {
  it("방 목록에 chat 방이 와도 빼고 보인다", () => {
    const parsed = groupRoomsSchema.parse({ items: [{ id: "a1000000-0000-4000-8000-000000000001", name: "채팅방(임시운영)", defaultKey: "chat", minimumTier: "Member", status: "open", canEnter: true }, { id: "a1000000-0000-4000-8000-000000000002", name: "자유 소통방", defaultKey: "free", minimumTier: null, status: "open", canEnter: true }] });
    expect(parsed.items.map((item) => item.defaultKey)).toEqual(["free"]);
  });
});
