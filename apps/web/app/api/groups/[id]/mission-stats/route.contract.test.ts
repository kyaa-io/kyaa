import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ groupRoute: vi.fn() }));
vi.mock("@/server/groups/dependencies", () => ({ groupRoute: state.groupRoute }));
import { GET } from "./route";

const page = "30000000-0000-4000-8000-000000000003";
beforeEach(() => { vi.clearAllMocks(); state.groupRoute.mockResolvedValue(new Response("ok")); });

it("hands the request to the group 'mission-stats' operation with the page from the path", async () => {
  const request = new Request(`https://byus.test/api/groups/${page}/mission-stats`);
  const response = await GET(request, { params: Promise.resolve({ id: page }) });
  expect(state.groupRoute).toHaveBeenCalledWith("mission-stats", request, { id: page });
  expect(await response.text()).toBe("ok");
});
