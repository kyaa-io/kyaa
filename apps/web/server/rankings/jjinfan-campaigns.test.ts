import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { AuthError } from "@/features/auth/domain/auth-errors";
import { JjinfanCampaignError, createJjinfanCampaignHandlers, createJjinfanCampaignRepository } from "./jjinfan-campaigns";

const ID = "10000000-0000-4000-8000-00000000000a";
const row = { celebrityId: ID, slug: "elina", name: "엘리나", enabled: false, title: "", description: "", updatedAt: null, count: 3 };
const saved = { celebrityId: ID, enabled: true, title: "제목", description: "", updatedAt: "2026-11-07T00:00:00+00:00" };
function build(role: "admin" | "viewer" = "admin") {
  const repository = { list: vi.fn(async () => ({ items: [row] })), save: vi.fn(async () => saved) };
  const authorize = vi.fn(async ({ authorization }: { authorization: string }) => {
    if (!authorization) throw new AuthError("AUTHENTICATION_REQUIRED", 401, "x");
    return { role, appUserId: "u", allowlistId: "a" } as never;
  });
  return { repository, handlers: createJjinfanCampaignHandlers({ authorize, repository } as never) };
}
const put = (body: unknown, token: string | null = "t") => new Request(`https://kyaa.test/api/admin/jjinfan-challenge/${ID}`, { method: "PUT", headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" }, body: JSON.stringify(body) });
const get = (token: string | null = "t") => new Request("https://kyaa.test/api/admin/jjinfan-challenge", { headers: token ? { authorization: `Bearer ${token}` } : {} });

describe("jjinfan campaign admin API", () => {
  it("needs a login", async () => {
    const { handlers, repository } = build();
    expect((await handlers.list(get(null))).status).toBe(401);
    expect((await handlers.save(put({ enabled: false, title: "", description: "" }, null), ID)).status).toBe(401);
    expect(repository.save).not.toHaveBeenCalled();
  });
  it("lets a viewer read but not save", async () => {
    const { handlers, repository } = build("viewer");
    expect((await handlers.list(get())).status).toBe(200);
    expect((await handlers.save(put({ enabled: true, title: "제목", description: "" }), ID)).status).toBe(403);
    expect(repository.save).not.toHaveBeenCalled();
  });
  it("refuses a bad id, an enabled gauge without a title, overlong text and unknown fields", async () => {
    const { handlers, repository } = build();
    expect((await handlers.save(put({ enabled: false, title: "", description: "" }), "nope")).status).toBe(400);
    expect((await handlers.save(put({ enabled: true, title: "   ", description: "" }), ID)).status).toBe(400);
    expect((await handlers.save(put({ enabled: false, title: "가".repeat(81), description: "" }), ID)).status).toBe(400);
    expect((await handlers.save(put({ enabled: false, title: "", description: "가".repeat(301) }), ID)).status).toBe(400);
    expect((await handlers.save(put({ enabled: false, title: "", description: "", target: 50 }), ID)).status).toBe(400);
    expect((await handlers.save(put({ enabled: false, title: "", description: "", endsOn: "11/30" }), ID)).status).toBe(400);
    expect(repository.save).not.toHaveBeenCalled();
  });
  it("saves trimmed values for a full administrator with no-store", async () => {
    const { handlers, repository } = build();
    const response = await handlers.save(put({ enabled: true, title: " 제목 ", description: " 설명 " }), ID);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(repository.save.mock.calls[0].slice(1, 3) as unknown[]).toEqual([ID, { enabled: true, title: "제목", description: "설명" }]);
  });
  it("maps repository failures without relaying details", async () => {
    const { handlers, repository } = build();
    repository.save.mockRejectedValueOnce(new JjinfanCampaignError("CREATOR_NOT_FOUND"));
    expect((await handlers.save(put({ enabled: false, title: "", description: "" }), ID)).status).toBe(404);
    repository.list.mockRejectedValueOnce(new Error("relation does not exist"));
    const failed = await handlers.list(get());
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain("relation");
  });
});

describe("jjinfan campaign repository", () => {
  const actor = { role: "admin", appUserId: "u", allowlistId: "a", email: "e" } as never;
  it("passes the actor and the values to the RPC and checks the answer", async () => {
    const rpc = vi.fn(async () => ({ data: saved, error: null }));
    const repository = createJjinfanCampaignRepository({ url: "", serviceRoleKey: "" }, { rpc } as never);
    await repository.save(actor, ID, { enabled: true, title: "제목", description: "" }, "c");
    expect(rpc).toHaveBeenCalledWith("set_jjinfan_challenge_campaign", { p_actor_app_user_id: "u", p_actor_admin_allowlist_id: "a", p_correlation_id: "c", p_celebrity_id: ID, p_enabled: true, p_title: "제목", p_description: "" });
  });
  it("sends an end date, or its removal, only when the screen sent one", async () => {
    const rpc = vi.fn(async () => ({ data: { ...saved, endsOn: "2026-11-30" }, error: null }));
    const repository = createJjinfanCampaignRepository({ url: "", serviceRoleKey: "" }, { rpc } as never);
    await repository.save(actor, ID, { enabled: true, title: "제목", description: "", endsOn: "2026-11-30" }, "c");
    expect(rpc).toHaveBeenLastCalledWith("set_jjinfan_challenge_campaign", expect.objectContaining({ p_ends_on: "2026-11-30", p_set_ends_on: true }));
    await repository.save(actor, ID, { enabled: true, title: "제목", description: "", endsOn: null }, "c");
    expect(rpc).toHaveBeenLastCalledWith("set_jjinfan_challenge_campaign", expect.objectContaining({ p_ends_on: null, p_set_ends_on: true }));
  });
  it("turns a known message into its code and everything else into unavailable", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: null, error: { message: "CREATOR_NOT_FOUND" } }).mockResolvedValueOnce({ data: null, error: { message: "secret detail" } }).mockResolvedValueOnce({ data: { items: "bad" }, error: null });
    const repository = createJjinfanCampaignRepository({ url: "", serviceRoleKey: "" }, { rpc } as never);
    await expect(repository.list(actor)).rejects.toMatchObject({ code: "CREATOR_NOT_FOUND" });
    await expect(repository.list(actor)).rejects.toMatchObject({ code: "JJINFAN_CAMPAIGN_UNAVAILABLE" });
    await expect(repository.list(actor)).rejects.toMatchObject({ code: "JJINFAN_CAMPAIGN_UNAVAILABLE" });
  });
});
