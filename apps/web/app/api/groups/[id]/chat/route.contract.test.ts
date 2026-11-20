import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ groupChatRoute: vi.fn() }));
vi.mock("@/server/groups/dependencies", () => ({ groupChatRoute: state.groupChatRoute }));
import { GET, POST } from "./route";

const page = "18ec5319-95fb-4134-95f4-97ff95ae726b";
beforeEach(() => { vi.clearAllMocks(); state.groupChatRoute.mockResolvedValue(new Response("ok")); });

it.each([["GET", GET], ["POST", POST]] as const)("%s hands the request and the page from the path to the fan-page chat", async (method, handler) => {
  const request = new Request(`https://byus.test/api/groups/${page}/chat`, { method, ...(method === "POST" ? { body: "{}" } : {}) });
  const response = await handler(request, { params: Promise.resolve({ id: page }) });
  expect(state.groupChatRoute).toHaveBeenCalledWith(request, page);
  expect(await response.text()).toBe("ok");
});
