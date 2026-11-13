import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { AuthError } from "@/features/auth/domain/auth-errors";
import { createLeaderPassHandler, newLeaderPassToken } from "./leader-pass";

const me = "10000000-0000-4000-8000-000000000001";
const allowlist = "10000000-0000-4000-8000-000000000002";
const passId = "10000000-0000-4000-8000-000000000003";
const page = "10000000-0000-4000-8000-000000000004";
const raw = "A".repeat(43);
const hash = createHash("sha256").update(raw).digest("hex");

function setup(role: "admin" | "operator" | "viewer" = "admin") {
  const rpc = vi.fn().mockResolvedValue({});
  const authorize = vi.fn(async (auth: string | null) => { if (auth !== "Bearer valid") throw new AuthError("AUTHENTICATION_REQUIRED", 401, "Login"); return { appUserId: me }; });
  const authorizeAdmin = vi.fn(async (auth: string | null) => { if (auth !== "Bearer admin") throw new AuthError("AUTHENTICATION_REQUIRED", 401, "Login"); return { appUserId: me, allowlistId: allowlist, role, email: "a@example.com" }; });
  return { rpc, handler: createLeaderPassHandler({ rpc, authorize, authorizeAdmin } as never, () => raw) };
}
const req = (body: unknown | undefined, auth: string | null, method = "POST") => new Request("https://kyaa.test/api", { method, headers: { ...(auth ? { authorization: auth } : {}), "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

describe("방장 패스 서버", () => {
  it("토큰은 서버가 만들고 SQL에는 해시만 보낸다", async () => {
    const s = setup();
    s.rpc.mockResolvedValue({ id: passId, label: "오픈채팅 ○○방", expiresAt: "2026-11-20T00:00:00Z" });
    const res = await s.handler("issue", req({ label: "오픈채팅 ○○방" }, "Bearer admin"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ id: passId, token: raw, path: `/pages/groups/apply?pass=${raw}` });
    expect(s.rpc).toHaveBeenCalledWith("group_leader_pass_issue", { p_actor: me, p_admin_id: allowlist, p_label: "오픈채팅 ○○방", p_days: 7, p_token_hash: hash });
    expect(JSON.stringify(s.rpc.mock.calls)).not.toContain(raw);
  });

  it("발급 토큰은 32바이트 base64url 43자이고 매번 다르다", () => {
    const a = newLeaderPassToken(), b = newLeaderPassToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });

  it("발급·취소는 보기 전용 관리자와 일반 회원에게 막히고, 목록은 보기 전용도 읽는다", async () => {
    const viewer = setup("viewer");
    expect((await viewer.handler("issue", req({ label: "x" }, "Bearer admin"))).status).toBe(403);
    expect((await viewer.handler("revoke", req({}, "Bearer admin"), { id: passId })).status).toBe(403);
    expect(viewer.rpc).not.toHaveBeenCalled();
    viewer.rpc.mockResolvedValue({ items: [] });
    expect((await viewer.handler("list", req(undefined, "Bearer admin", "GET"))).status).toBe(200);
    expect((await setup().handler("issue", req({ label: "x" }, "Bearer valid"))).status).toBe(401);
  });

  it("확인과 열기는 로그인한 회원만, 해시와 서버가 정한 값만 SQL로 간다", async () => {
    const s = setup();
    expect((await s.handler("check", req({ token: raw }, null))).status).toBe(401);
    s.rpc.mockResolvedValue({ valid: true, label: "방" });
    expect(await (await s.handler("check", req({ token: raw }, "Bearer valid"))).json()).toEqual({ valid: true, label: "방" });
    expect(s.rpc).toHaveBeenLastCalledWith("group_leader_pass_check", { p_actor: me, p_token_hash: hash });

    s.rpc.mockResolvedValue({ pageId: page, applicationId: passId });
    const requestId = "10000000-0000-4000-8000-000000000009";
    const res = await s.handler("submit", req({ token: raw, name: "방 이름", externalLinks: [{ url: "https://discord.gg/abc", kind: "band" }], requestId }, "Bearer valid"));
    expect(await res.json()).toEqual({ pageId: page });
    expect(s.rpc).toHaveBeenLastCalledWith("group_application_submit_with_pass", { p_actor: me, p_token_hash: hash, p_input: { name: "방 이름", description: "", externalLinks: [{ kind: "discord", url: "https://discord.gg/abc" }], requestId } });
    expect(JSON.stringify(s.rpc.mock.calls)).not.toContain(raw);
  });

  it("형식이 틀린 토큰·허용 밖 링크·다른 필드는 SQL 전에 400", async () => {
    const s = setup();
    const requestId = "10000000-0000-4000-8000-000000000009";
    expect((await s.handler("check", req({ token: "short" }, "Bearer valid"))).status).toBe(400);
    expect((await s.handler("submit", req({ token: raw, name: "방", externalLinks: [{ url: "http://band.us/band/1" }], requestId }, "Bearer valid"))).status).toBe(400);
    expect((await s.handler("submit", req({ token: raw, name: "방", kind: "fan", requestId }, "Bearer valid"))).status).toBe(400);
    expect(s.rpc).not.toHaveBeenCalled();
  });

  it("사용된·만료된 패스(409)와 없는 패스(404)는 코드만 돌려준다", async () => {
    const s = setup();
    const requestId = "10000000-0000-4000-8000-000000000009";
    s.rpc.mockRejectedValueOnce(new Error("GROUPS_CONFLICT"));
    expect((await s.handler("submit", req({ token: raw, name: "방", requestId }, "Bearer valid"))).status).toBe(409);
    s.rpc.mockRejectedValueOnce(new Error("GROUPS_NOT_FOUND"));
    expect((await s.handler("submit", req({ token: raw, name: "방", requestId }, "Bearer valid"))).status).toBe(404);
    s.rpc.mockRejectedValueOnce(new Error("private row contents"));
    const res = await s.handler("submit", req({ token: raw, name: "방", requestId }, "Bearer valid"));
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain("private");
  });
});
