import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ onlineCreatorsRoute: vi.fn() }));
vi.mock("@/server/groups/dependencies", () => ({ onlineCreatorsRoute: state.onlineCreatorsRoute }));
import { GET } from "./route";

beforeEach(() => { vi.clearAllMocks(); state.onlineCreatorsRoute.mockResolvedValue(new Response("ok")); });

it("hands the ranking presence read to the groups server", async () => {
  const request = new Request("https://byus.test/api/groups/online-creators?slugs=elina");
  const response = await GET(request);
  expect(state.onlineCreatorsRoute).toHaveBeenCalledWith(request);
  expect(await response.text()).toBe("ok");
});
