import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import real from "./__fixtures__/chat-real-sql.json";
import { AuthError } from "@/features/auth/domain/auth-errors";
import { groupChatSchema, groupRoomsSchema } from "@/features/groups/domain/contracts";
import { createGroupChatHandler, createOnlineCreatorsHandler } from "./chat";

const fan = "11130000-0000-4000-8000-000000000002", page = "11130000-0000-4000-8000-000000000100";
const handler = (rpc: ReturnType<typeof vi.fn>, authorize = async () => ({ appUserId: fan })) => createGroupChatHandler({ rpc, authorize, authorizeAdmin: vi.fn() } as never);
const get = (query = "") => new Request(`https://kyaa.test/api/groups/${page}/chat${query}`, { headers: { authorization: "Bearer valid" } });
const post = (body: unknown) => new Request(`https://kyaa.test/api/groups/${page}/chat`, { method: "POST", headers: { authorization: "Bearer valid" }, body: JSON.stringify(body) });
const requestId = "c1000000-0000-4000-8000-000000000001", message = "a1000000-0000-4000-8000-000000000001";

describe("팬페이지 채팅방 API", () => {
  it.each(["emptyFan", "readFan", "readArtist", "readAfterRemove"] as const)("실제 SQL 응답(%s)이 라우트 스키마를 통과한다", async (key) => {
    expect(groupChatSchema.safeParse(real[key]).success).toBe(true);
    const rpc = vi.fn().mockResolvedValue(real[key]);
    const response = await handler(rpc)(get("?limit=50"), page);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items.map((item: { mine: boolean }) => item.mine)).toEqual(real[key].items.map((item) => item.profileId === fan));
    expect(rpc).toHaveBeenCalledWith("group_chat_dispatch", { p_operation: "chat", p_actor: fan, p_page_id: page, p_input: { after: undefined, limit: 50 } });
  });
  it("실제 SQL: 크리에이터 표시, 사진·영상, 접속, 읽은 위치, 읽은 사람 수, 지워진 메시지", () => {
    const photo = real.readFan.items.find((item) => item.asset?.kind === "image")!;
    expect(photo.artist).toBe(true);
    expect(real.readFan).toMatchObject({ firstUnreadId: photo.id, onlineCount: 2, receipts: [{ readCount: 1 }] });
    expect(real.readFan.items.every((item) => item.online)).toBe(true);
    expect(real.readArtist.items.at(-1)?.asset).toMatchObject({ kind: "video", width: 540, height: 960 });
    expect(real.readArtist.artist).toBe(true);
    // 한 번도 들어온 적 없으면 경계선도 안 읽은 개수도 없다. 내가 보내면 그때까지 읽은 것으로 친다.
    expect(real.emptyFan.firstUnreadId).toBeNull();
    expect([real.unreadNever.unreadCount, real.unreadOne.unreadCount, real.unreadAfterSend.unreadCount]).toEqual([0, 1, 0]);
    expect(real.readAfterRemove.removed).toEqual([photo.id]);
  });
  it("실제 SQL: 첨부 파일은 채팅방에 들어올 수 있는 사람만 읽고, 지운 메시지의 파일은 아무도 읽지 못한다", () => {
    expect(real.mediaFanThumb).toEqual({ contentType: "image/webp", storagePath: "t/photo.webp" });
    expect(real.mediaArtistVideo).toEqual({ contentType: "video/mp4", storagePath: "t/clip" });
    expect([real.mediaStranger, real.mediaGuest, real.mediaAfterRemove]).toEqual([null, null, null]);
    expect(real.assetAfterRemove).toBe("cancelled:true");
    expect(real.errors).toMatchObject({ strangerUnread: "GROUPS_FORBIDDEN:not_verified", foreignAsset: "GROUPS_INVALID_REQUEST", removeOthers: "GROUPS_NOT_FOUND", reportOwn: "GROUPS_NOT_FOUND" });
  });
  it("탭의 안 읽은 개수는 읽은 위치를 바꾸지 않는 따로 된 읽기다", async () => {
    const rpc = vi.fn().mockResolvedValue(real.unreadOne);
    const response = await handler(rpc)(get("?unread=1"), page);
    expect(await response.json()).toEqual({ unreadCount: 1 });
    expect(rpc).toHaveBeenCalledWith("group_chat_dispatch", { p_operation: "chat-unread", p_actor: fan, p_page_id: page, p_input: {} });
  });
  it("보내기: 글·첨부·requestId 만 넘긴다", async () => {
    const rpc = vi.fn().mockResolvedValue(real.sendText);
    expect((await handler(rpc)(post({ body: " 엘리나 왔어요 ", requestId }), page)).status).toBe(200);
    expect(rpc).toHaveBeenLastCalledWith("group_chat_dispatch", { p_operation: "chat-message", p_actor: fan, p_page_id: page, p_input: { body: "엘리나 왔어요", requestId } });
    await handler(rpc)(post({ assetId: message, requestId }), page);
    expect(rpc).toHaveBeenLastCalledWith("group_chat_dispatch", { p_operation: "chat-message", p_actor: fan, p_page_id: page, p_input: { body: "", assetId: message, requestId } });
  });
  it.each([
    [{ action: "read", through: message }, "chat-read", { through: message }],
    [{ action: "remove", messageId: message }, "chat-remove", { messageId: message }],
    [{ action: "report", messageId: message, reason: " 광고 " }, "chat-report", { messageId: message, reason: "광고" }],
  ] as const)("읽음·삭제·신고 %o", async (input, operation, forwarded) => {
    const rpc = vi.fn().mockResolvedValue(real.readMark);
    expect((await handler(rpc)(post(input), page)).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("group_chat_dispatch", { p_operation: operation, p_actor: fan, p_page_id: page, p_input: forwarded });
  });
  it.each([[{ body: "가".repeat(501), requestId }], [{ body: "hi" }], [{ body: "", requestId }], [{ body: "hi", requestId, assetId: "x" }], [{ action: "read" }], [{ action: "report", messageId: message, reason: " " }], [{ action: "purge", messageId: message }], [{ action: "remove", messageId: message, extra: 1 }]])("잘못된 요청 %o 은 DB 전에 400", async (input) => {
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
    const parsed = groupRoomsSchema.parse({ items: [{ id: "a1000000-0000-4000-8000-000000000001", name: "채팅방", defaultKey: "chat", minimumTier: "Member", status: "open", canEnter: true }, { id: "a1000000-0000-4000-8000-000000000002", name: "자유 소통방", defaultKey: "free", minimumTier: null, status: "open", canEnter: true }] });
    expect(parsed.items.map((item) => item.defaultKey)).toEqual(["free"]);
  });
});
