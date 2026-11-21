import { expect, it, vi } from "vitest";
import { POST } from "./route";

const { askRoute } = vi.hoisted(() => ({ askRoute: vi.fn() }));
vi.mock("@/server/chemi-ask/routes", () => ({ askRoute }));

it("routes POST to the one follow-up question", () => {
  const request = new Request("https://example.test/api/chemi/ask/followup");
  POST(request);
  expect(askRoute.mock.calls).toEqual([["followup", request]]);
});
