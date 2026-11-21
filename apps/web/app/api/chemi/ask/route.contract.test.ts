import { expect, it, vi } from "vitest";
import { GET, POST } from "./route";

const { askRoute } = vi.hoisted(() => ({ askRoute: vi.fn() }));
vi.mock("@/server/chemi-ask/routes", () => ({ askRoute }));

it("routes GET to the ask state and POST to a new question", () => {
  const request = new Request("https://example.test/api/chemi/ask");
  GET(request);
  POST(request);
  expect(askRoute.mock.calls).toEqual([["state", request], ["submit", request]]);
});
