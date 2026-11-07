import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const route = vi.hoisted(() => ({ calls: [] as Array<{ operation: string; url: string; auth: string | null; params: unknown }>, response: new Response(null) as Response | Error }));
vi.mock("./dependencies", () => ({ groupRoute: async (operation: string, request: Request, params: unknown) => {
  route.calls.push({ operation, url: request.url, auth: request.headers.get("authorization"), params });
  if (route.response instanceof Error) throw route.response;
  return route.response;
} }));
import { loadPublicGroupDetail, loadPublicGroupPostsEmpty } from "./public-detail";
const pageId = "d2611003-0000-4000-8000-000000000002";
const page = { id: pageId, kind: "hobby", celebrityId: null, slug: null, name: "모임", description: "", imageUrl: "/images/groups/music-placeholder.svg", question: null, memberCount: 3, anonymous: false, status: "published", listed: true, createdAt: "2026-10-01T00:00:00Z" };
beforeEach(() => { route.calls = []; });
it("reads the signed-out detail through the same handler, without credentials, in the page language", async () => {
  route.response = Response.json({ page, membership: null, bookmarked: false });
  const detail = await loadPublicGroupDetail(pageId, "en");
  expect(route.calls).toEqual([{ operation: "detail", url: `http://localhost/api/groups/${pageId}?locale=en`, auth: null, params: { id: pageId } }]);
  if (detail === null) { expect(detail).not.toBeNull(); return; }
  expect(detail.page.id).toBe(pageId);
});
it("draws nothing from a refused, malformed or failed read", async () => {
  route.response = Response.json({ error: { code: "GROUPS_NOT_FOUND" } }, { status: 404 });
  expect(await loadPublicGroupDetail(pageId, "ko")).toBeNull();
  route.response = Response.json({ page: { id: pageId } });
  expect(await loadPublicGroupDetail(pageId, "ko")).toBeNull();
  route.response = new Error("down");
  expect(await loadPublicGroupDetail(pageId, "ko")).toBeNull();
});
it("says the page has no public post only when the signed-out read answers an empty list", async () => {
  route.response = Response.json({ items: [], nextCursor: null });
  expect(await loadPublicGroupPostsEmpty(pageId)).toBe(true);
  expect(route.calls.at(-1)).toEqual({ operation: "posts", url: `http://localhost/api/groups/${pageId}/posts?category=all&search=&sort=recent&limit=1`, auth: null, params: { id: pageId } });
  route.response = Response.json({ items: [{ id: "x" }], nextCursor: null });
  expect(await loadPublicGroupPostsEmpty(pageId)).toBe(false);
  route.response = Response.json({ error: { code: "GROUPS_NOT_FOUND" } }, { status: 404 });
  expect(await loadPublicGroupPostsEmpty(pageId)).toBe(false);
  route.response = new Error("down");
  expect(await loadPublicGroupPostsEmpty(pageId)).toBe(false);
});
