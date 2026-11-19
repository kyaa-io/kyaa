import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { GET } from "./route";

const original = process.env.CHEMI_TAB;
beforeEach(() => { delete process.env.CHEMI_TAB; });
afterEach(() => { if (original === undefined) delete process.env.CHEMI_TAB; else process.env.CHEMI_TAB = original; });

it("answers 404 with no body detail when CHEMI_TAB is off", async () => {
  for (const value of [undefined, "false", "1"]) {
    if (value === undefined) delete process.env.CHEMI_TAB; else process.env.CHEMI_TAB = value;
    const response = await GET();
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: { code: "CHEMI_NOT_FOUND" } });
  }
});
it("answers 200 when CHEMI_TAB is true", async () => {
  process.env.CHEMI_TAB = "true";
  const response = await GET();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ enabled: true });
});
