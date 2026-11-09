import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createGroupPublicPeopleHandler } from "./routes";
import { openFanCursor } from "./sorted-cursor";
const actor = "a9000000-0000-4000-8000-000000000001", page = "a9000000-0000-4000-8000-000000000002";
const secret = Buffer.alloc(32, 9).toString("base64");
const row = { nickname: "팬", avatarUrl: null, tier: "Gold", hearts: 2, stamps: 0, first_jjinfan_at: "2026-10-01T00:00:00Z", last_active_at: "2026-10-02T00:00:00Z" };
const publicRow = { nickname: row.nickname, avatarUrl: row.avatarUrl, tier: row.tier, hearts: row.hearts, stamps: row.stamps, first_jjinfan_at: row.first_jjinfan_at };
const position = { hearts: 2, stamps: 0, last_active_at: row.last_active_at, app_user_id: actor };
function setup(result: unknown = { items: [row], nextCursor: position }) {
  const rpc = vi.fn().mockResolvedValue(result), authorize = vi.fn().mockResolvedValue({ appUserId: actor });
  const handler = createGroupPublicPeopleHandler({ rpc, authorize, authorizeAdmin: vi.fn() }, () => secret);
  const request = (query = "", auth = false) => handler(new Request(`https://kyaa.test/api/groups/${page}/public-people?sort=hearts${query}`, { headers: auth ? { authorization: "Bearer valid" } : {} }), page);
  return { rpc, authorize, request };
}
describe("sorted fan directory", () => {
  it.each([false, true])("returns no identifiers, including in the encrypted cursor (authenticated=%s)", async auth => {
    const s = setup(), response = await s.request("", auth), body = await response.json();
    expect(response.status).toBe(200); expect(body.items).toEqual([publicRow]);
    expect(Object.keys(body.items[0]).sort()).toEqual(["avatarUrl", "first_jjinfan_at", "hearts", "nickname", "stamps", "tier"]);
    expect(JSON.stringify(body)).not.toContain("last_active_at");
    expect(Buffer.from(body.nextCursor, "base64url").toString()).not.toContain(row.last_active_at);
    expect(JSON.stringify(body)).not.toContain(actor); expect(Buffer.from(body.nextCursor, "base64url").toString()).not.toContain(actor);
    expect(openFanCursor(body.nextCursor, { actor: auth ? actor : null, page, mode: "members", search: "", locale: "ko" }, secret)).toEqual(position);
    await s.request(`&cursor=${body.nextCursor}`, auth);
    expect(s.rpc).toHaveBeenLastCalledWith("read_group_fans", expect.objectContaining({ p_cursor: position, p_actor: auth ? actor : null }));
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("binds cursors to page, actor, locale, mode and search and rejects tampering", async () => {
    const s = setup(), body = await (await s.request()).json();
    for (const query of ["&mode=jjinfans", "&search=a", "&locale=en"]) expect((await s.request(`${query}&cursor=${body.nextCursor}`)).status).toBe(400);
    expect((await s.request(`&cursor=${body.nextCursor}`, true)).status).toBe(400);
    expect((await s.request(`&cursor=X${body.nextCursor.slice(1)}`)).status).toBe(400);
    expect(() => openFanCursor(body.nextCursor, { actor: null, page: actor, mode: "members", search: "", locale: "ko" }, secret)).toThrow();
    expect(s.rpc).toHaveBeenCalledTimes(1);
  });
  it("passes bounded jjinfan search and requires login for friends", async () => {
    const s = setup({ items: [], nextCursor: null });
    expect((await s.request("&mode=jjinfans&search=%20별%20&limit=2&locale=ja")).status).toBe(200);
    expect(s.rpc).toHaveBeenLastCalledWith("read_group_fans", { p_actor: null, p_page_id: page, p_mode: "jjinfans", p_search: "별", p_cursor: null, p_limit: 2, p_locale: "en" });
    expect((await s.request("&mode=friends")).status).toBe(401);
    expect((await s.request("&mode=friends", true)).status).toBe(200);
  });
  it.each(["&offset=30", "&sort=hearts", "&mode=ranking", "&limit=31", "&search=" + "x".repeat(101), "&cursor=bad", "&locale=bad"])('rejects %s before the RPC', async query => {
    const s = setup(); expect((await s.request(query)).status).toBe(400); expect(s.rpc).not.toHaveBeenCalled();
  });
  it.each([{ profileId: actor }, { app_user_id: actor }, { email: "private@example.test" }])("fails closed on an extra row field %j", async extra => {
    const s = setup({ items: [{ ...row, ...extra }], nextCursor: null });
    const response = await s.request(); expect(response.status).toBe(503); expect(await response.text()).not.toContain(actor);
  });
  it("keeps zero counts and nullable first date", async () => {
    const empty = { ...row, hearts: 0, stamps: 0, first_jjinfan_at: null }, s = setup({ items: [empty], nextCursor: null });
    expect(await (await s.request()).json()).toEqual({ items: [{ ...publicRow, hearts: 0, stamps: 0, first_jjinfan_at: null }], nextCursor: null });
  });
});


it("keeps the legacy signed-out hearts response to exactly its previous four row fields", async () => {
  const legacy = { nickname: row.nickname, avatarUrl: row.avatarUrl, tier: row.tier, hearts: row.hearts };
  const rpc = vi.fn().mockResolvedValue({ items: [legacy], nextOffset: null });
  const handler = createGroupPublicPeopleHandler({ rpc, authorize: vi.fn(), authorizeAdmin: vi.fn() }, () => secret);
  const response = await handler(new Request(`https://kyaa.test/api/groups/${page}/public-people?hearts=1`), page);
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(Object.keys(body.items[0]).sort()).toEqual(["avatarUrl", "hearts", "nickname", "tier"]);
  expect(body).toEqual({ items: [legacy], nextOffset: null });
});
