import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ groupRoute: vi.fn() }));
vi.mock("@/server/groups/dependencies", () => ({ groupRoute: state.groupRoute }));
import { PUT } from "./route";

const page = "30000000-0000-4000-8000-000000000003", post = "10000000-0000-4000-8000-000000000002";
beforeEach(() => { vi.clearAllMocks(); state.groupRoute.mockResolvedValue(Response.json({ liked: false, count: 1, disliked: true, dislikeCount: null })); });

it("hands the request to the group 'dislike' operation with the page and post from the path", async () => {
  const request = new Request(`https://byus.test/api/groups/${page}/posts/${post}/dislike`, { method: "PUT", body: JSON.stringify({ disliked: true, requestId: page }) });
  const response = await PUT(request, { params: Promise.resolve({ id: page, itemId: post }) });
  expect(state.groupRoute).toHaveBeenCalledWith("dislike", request, { id: page, itemId: post });
  expect(await response.json()).toEqual({ liked: false, count: 1, disliked: true, dislikeCount: null });
});
