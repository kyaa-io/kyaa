import { expect, it, vi } from "vitest";
import { GET } from "./route";

const { askRoute } = vi.hoisted(() => ({ askRoute: vi.fn() }));
vi.mock("@/server/chemi-ask/routes", () => ({ askRoute }));

it("routes GET to the answer evidence", () => {
  const request = new Request("https://example.test/api/chemi/ask/evidence?t=x");
  GET(request);
  expect(askRoute.mock.calls).toEqual([["evidence", request]]);
});
