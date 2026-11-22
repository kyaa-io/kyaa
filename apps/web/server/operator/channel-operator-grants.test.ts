import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { AuthError } from "../../features/auth/domain/auth-errors";
import { ChannelOperatorGrantError, createChannelOperatorGrantHandlers, createChannelOperatorGrantRepository } from "./channel-operator-grants";

const CH = "10000000-0000-4000-8000-00000000000a";
const GRANT = "40000000-0000-4000-8000-000000000001";
const USER = "50000000-0000-4000-8000-000000000001";
const INVITE = "60000000-0000-4000-8000-000000000001";
const item = { id: GRANT, appUserId: USER, email: "op@example.test", status: "active", grantedAt: "2026-11-04T00:00:00+00:00", revokedAt: null };

function build(role: "admin" | "viewer" = "admin") {
  const repository = {
    list: vi.fn(async () => ({ items: [item] })),
    grant: vi.fn(async () => ({ id: GRANT, status: "active" as const, replayed: false })),
    revoke: vi.fn(async () => ({ id: GRANT, status: "revoked" as const, replayed: false })),
    listInvitations: vi.fn(async () => ({ items: [] })),
    invite: vi.fn(async () => ({ kind: "invited" as const, id: INVITE, status: "pending" as const, expiresAt: "2026-12-06T00:00:00+00:00", replayed: false })),
    cancelInvitation: vi.fn(async () => ({ id: INVITE, status: "cancelled", replayed: false })),
  };
  const authorize = vi.fn(async ({ authorization }: { authorization: string }) => {
    if (!authorization) throw new AuthError("AUTHENTICATION_REQUIRED", 401, "x");
    return { role, appUserId: "u", allowlistId: "a" } as never;
  });
  return { repository, handlers: createChannelOperatorGrantHandlers({ authorize, repository, origin: "https://dev.kyaa.io" } as never) };
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

describe("channel operator invitation API", () => {
  it("blocks every invitation method for a non-admin role", async () => {
    const { handlers, repository } = build("viewer");
    for (const [method, id, body] of [["GET", null, undefined], ["POST", null, { email: "new@example.test", locale: "ko" }], ["DELETE", INVITE, undefined]] as const) {
      expect((await handlers.handleInvitation(req(method, body), CH, id)).status).toBe(403);
    }
    expect(repository.invite).not.toHaveBeenCalled();
    expect(repository.cancelInvitation).not.toHaveBeenCalled();
  });

  it("invites with a normalized email and the server origin, never a client origin", async () => {
    const { handlers, repository } = build();
    const created = await handlers.handleInvitation(req("POST", { email: " New@Example.TEST ", locale: "en" }), CH, null);
    expect(created.status).toBe(201);
    expect(repository.invite).toHaveBeenCalledWith(expect.anything(), CH, { email: "new@example.test", locale: "en", origin: "https://dev.kyaa.io" }, expect.any(String));
    expect((await handlers.handleInvitation(req("POST", { email: "new@example.test", locale: "ko", origin: "https://evil.test" }), CH, null)).status).toBe(400);
    expect((await handlers.handleInvitation(req("POST", { email: "new@example.test" }), CH, null)).status).toBe(400);
  });

  it("reports a direct grant when the email already belongs to a member", async () => {
    const { handlers, repository } = build();
    repository.invite.mockResolvedValue({ kind: "granted", id: GRANT, status: "active", replayed: false } as never);
    const response = await handlers.handleInvitation(req("POST", { email: "op@example.test", locale: "ko" }), CH, null);
    expect(response.status).toBe(201);
    expect((await response.json()).item.kind).toBe("granted");
  });

  it("maps duplicate, not pending and rate limit errors", async () => {
    const { handlers, repository } = build();
    repository.invite.mockRejectedValue(new ChannelOperatorGrantError("CHANNEL_OPERATOR_INVITATION_EXISTS"));
    const duplicate = await handlers.handleInvitation(req("POST", { email: "new@example.test", locale: "ko" }), CH, null);
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toEqual({ error: { code: "CHANNEL_OPERATOR_INVITATION_EXISTS" } });
    repository.invite.mockRejectedValue(new ChannelOperatorGrantError("CHANNEL_OPERATOR_INVITATION_RATE_LIMITED"));
    expect((await handlers.handleInvitation(req("POST", { email: "new@example.test", locale: "ko" }), CH, null)).status).toBe(429);
    repository.cancelInvitation.mockRejectedValue(new ChannelOperatorGrantError("CHANNEL_OPERATOR_INVITATION_NOT_PENDING"));
    expect((await handlers.handleInvitation(req("DELETE"), CH, INVITE)).status).toBe(409);
  });

  it("is unavailable without an allowed origin", async () => {
    const repository = build().repository;
    const handlers = createChannelOperatorGrantHandlers({ authorize: async () => ({ role: "admin", appUserId: "u", allowlistId: "a" }) as never, repository } as never);
    expect((await handlers.handleInvitation(req("POST", { email: "new@example.test", locale: "ko" }), CH, null)).status).toBe(503);
    expect(repository.invite).not.toHaveBeenCalled();
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

  it("calls the invitation RPCs and rejects a malformed reply", async () => {
    const ok = clientWith({ data: { kind: "invited", id: INVITE, status: "pending", expiresAt: "2026-12-06T00:00:00+00:00", replayed: false } });
    await make(ok).invite(actor, CH, { email: "new@example.test", locale: "ko", origin: "https://dev.kyaa.io" }, "c");
    expect(ok.rpc).toHaveBeenCalledWith("invite_channel_operator", expect.objectContaining({ p_target_email: "new@example.test", p_locale: "ko", p_origin: "https://dev.kyaa.io", p_celebrity_id: CH }));
    await expect(make(clientWith({ data: { kind: "invited", id: INVITE } })).invite(actor, CH, { email: "a@b.test", locale: "ko", origin: "https://dev.kyaa.io" }, "c")).rejects.toMatchObject({ code: "CHANNEL_OPERATOR_UNAVAILABLE" });
    await expect(make(clientWith({ error: { message: "operator invitation exists" } })).invite(actor, CH, { email: "a@b.test", locale: "ko", origin: "https://dev.kyaa.io" }, "c")).rejects.toMatchObject({ code: "CHANNEL_OPERATOR_INVITATION_EXISTS" });
    const list = clientWith({ data: { items: [{ id: INVITE, email: "new@example.test", status: "expired", mailStatus: "sent", createdAt: "2026-11-22T00:00:00+00:00", expiresAt: "2026-12-06T00:00:00+00:00", acceptedAt: null, cancelledAt: null }] } });
    expect((await make(list).listInvitations(actor, CH)).items[0]?.status).toBe("expired");
    const cancel = clientWith({ data: { id: INVITE, status: "cancelled", replayed: false } });
    await make(cancel).cancelInvitation(actor, CH, INVITE, "c");
    expect(cancel.rpc).toHaveBeenCalledWith("cancel_channel_operator_invitation", expect.objectContaining({ p_invitation_id: INVITE, p_celebrity_id: CH }));
  });
});
