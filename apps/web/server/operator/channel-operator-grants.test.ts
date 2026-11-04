import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { AuthError } from "../../features/auth/domain/auth-errors";
import { ChannelOperatorGrantError, createChannelOperatorGrantHandlers, createChannelOperatorGrantRepository } from "./channel-operator-grants";

const CH = "10000000-0000-4000-8000-00000000000a";
const GRANT = "40000000-0000-4000-8000-000000000001";
const USER = "50000000-0000-4000-8000-000000000001";
const item = { id: GRANT, appUserId: USER, email: "op@example.test", status: "active", grantedAt: "2026-11-04T00:00:00+00:00", revokedAt: null };

function build(role: "admin" | "viewer" = "admin") {
  const repository = {
    list: vi.fn(async () => ({ items: [item] })),
    grant: vi.fn(async () => ({ id: GRANT, status: "active" as const, replayed: false })),
    revoke: vi.fn(async () => ({ id: GRANT, status: "revoked" as const, replayed: false })),
  };
  const authorize = vi.fn(async ({ authorization }: { authorization: string }) => {
    if (!authorization) throw new AuthError("AUTHENTICATION_REQUIRED", 401, "x");
    return { role, appUserId: "u", allowlistId: "a" } as never;
  });
  return { repository, handlers: createChannelOperatorGrantHandlers({ authorize, repository } as never) };
}
const req = (method: string, body?: unknown, token: string | null = "t", query = "") => new Request(`https://byus.test/api/admin/celebrities/x/operators${query}`, {
  method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
});

describe("channel operator grant API", () => {
  it("blocks every method for a non-admin role", async () => {
    const { handlers, repository } = build("viewer");
    for (const [method, grantId, body] of [["GET", null, undefined], ["POST", null, { email: "op@example.test" }], ["DELETE", GRANT, undefined]] as const) {
      expect((await handlers.handle(req(method, body), CH, grantId)).status).toBe(403);
    }
    expect(repository.list).not.toHaveBeenCalled();
    expect(repository.grant).not.toHaveBeenCalled();
    expect(repository.revoke).not.toHaveBeenCalled();
  });

  it("returns 401 without a token", async () => {
    const { handlers } = build();
    expect((await handlers.handle(req("GET", undefined, null), CH, null)).status).toBe(401);
  });

  it("lists, grants (201), and revokes", async () => {
    const { handlers, repository } = build();
    const list = await handlers.handle(req("GET"), CH, null);
    expect(list.status).toBe(200);
    expect((await list.json()).items).toHaveLength(1);
    expect((await handlers.handle(req("POST", { email: " Op@Example.test " }), CH, null)).status).toBe(201);
    expect(repository.grant).toHaveBeenCalledWith(expect.anything(), CH, "op@example.test", expect.any(String));
    const revoked = await handlers.handle(req("DELETE"), CH, GRANT);
    expect(revoked.status).toBe(200);
    expect(repository.revoke).toHaveBeenCalledWith(expect.anything(), CH, GRANT, expect.any(String));
  });

  it("returns 200 for a replayed grant", async () => {
    const { handlers, repository } = build();
    repository.grant.mockResolvedValue({ id: GRANT, status: "active", replayed: true });
    expect((await handlers.handle(req("POST", { email: "op@example.test" }), CH, null)).status).toBe(200);
  });

  it("rejects a bad email, extra fields, a query string and a bad id", async () => {
    const { handlers, repository } = build();
    expect((await handlers.handle(req("POST", { email: "nope" }), CH, null)).status).toBe(400);
    expect((await handlers.handle(req("POST", { email: "op@example.test", x: 1 }), CH, null)).status).toBe(400);
    expect((await handlers.handle(req("GET", undefined, "t", "?a=1"), CH, null)).status).toBe(400);
    expect((await handlers.handle(req("GET"), "bad", null)).status).toBe(400);
    expect(repository.grant).not.toHaveBeenCalled();
  });

  it("maps repository errors", async () => {
    const { handlers, repository } = build();
    repository.grant.mockRejectedValue(new ChannelOperatorGrantError("CHANNEL_OPERATOR_CANDIDATE_NOT_FOUND"));
    const missing = await handlers.handle(req("POST", { email: "op@example.test" }), CH, null);
    expect(missing.status).toBeGreaterThanOrEqual(400);
    expect((await missing.json()).error.code).toBe("CHANNEL_OPERATOR_CANDIDATE_NOT_FOUND");
    repository.grant.mockRejectedValue(new ChannelOperatorGrantError("CHANNEL_OPERATOR_CANDIDATE_AMBIGUOUS"));
    const ambiguous = await handlers.handle(req("POST", { email: "op@example.test" }), CH, null);
    expect(ambiguous.status).toBe(409);
    expect(await ambiguous.json()).toEqual({ error: { code: "CHANNEL_OPERATOR_CANDIDATE_AMBIGUOUS" } });
  });

  it("revokes only through the grant's own channel", async () => {
    const { handlers, repository } = build();
    repository.revoke.mockRejectedValue(new ChannelOperatorGrantError("CHANNEL_OPERATOR_NOT_FOUND"));
    const other = "10000000-0000-4000-8000-00000000000b";
    const response = await handlers.handle(req("DELETE"), other, GRANT);
    expect(response.status).toBe(404);
    expect(repository.revoke).toHaveBeenCalledWith(expect.anything(), other, GRANT, expect.any(String));
  });
});

describe("channel operator grant repository", () => {
  const actor = { role: "admin", appUserId: "u", allowlistId: "a" } as never;
  const clientWith = (result: { data?: unknown; error?: { message: string } | null }) => ({ rpc: vi.fn(async () => ({ data: result.data ?? null, error: result.error ?? null })) });
  const make = (client: ReturnType<typeof clientWith>) => createChannelOperatorGrantRepository({ url: "https://db.test", serviceRoleKey: "x" } as never, client as never);

  it("calls the grant RPC with the actor and maps known messages", async () => {
    const ok = clientWith({ data: { id: GRANT, status: "active", replayed: false } });
    await make(ok).grant(actor, CH, "op@example.test", "corr");
    expect(ok.rpc).toHaveBeenCalledWith("grant_channel_operator", expect.objectContaining({ p_actor_app_user_id: "u", p_celebrity_id: CH, p_target_email: "op@example.test" }));
    await expect(make(clientWith({ error: { message: "operator candidate not found" } })).grant(actor, CH, "a@b.test", "c")).rejects.toMatchObject({ code: "CHANNEL_OPERATOR_CANDIDATE_NOT_FOUND" });
    await expect(make(clientWith({ error: { message: "operator candidate ambiguous" } })).grant(actor, CH, "a@b.test", "c")).rejects.toMatchObject({ code: "CHANNEL_OPERATOR_CANDIDATE_AMBIGUOUS" });
    const revoked = clientWith({ data: { id: GRANT, status: "revoked", replayed: false } });
    await make(revoked).revoke(actor, CH, GRANT, "c");
    expect(revoked.rpc).toHaveBeenCalledWith("revoke_channel_operator", expect.objectContaining({ p_celebrity_id: CH, p_grant_id: GRANT }));
    await expect(make(clientWith({ error: { message: "full admin required" } })).revoke(actor, CH, GRANT, "c")).rejects.toMatchObject({ code: "CHANNEL_OPERATOR_FORBIDDEN" });
    await expect(make(clientWith({ error: { message: "boom" } })).list(actor, CH)).rejects.toMatchObject({ code: "CHANNEL_OPERATOR_UNAVAILABLE" });
  });
});
