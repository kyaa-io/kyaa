import { describe, expect, it, vi } from "vitest";

const redirect = vi.hoisted(() => vi.fn((to: string) => { throw new Error(`NEXT_REDIRECT ${to}`); }));
vi.mock("next/navigation", () => ({ redirect }));
import DukjilGuidePage from "./page";

describe("/guide/dukjil", () => {
  it("sends the old mission book address to /follow and keeps locale and utm", async () => {
    await expect(DukjilGuidePage({ searchParams: Promise.resolve({ locale: "en", utm_source: "x", utm_campaign: ["a", "b"] }) })).rejects.toThrow("NEXT_REDIRECT /follow?locale=en&utm_source=x&utm_campaign=a&utm_campaign=b");
  });
  it("goes to /follow without a query when there is none", async () => {
    await expect(DukjilGuidePage({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_REDIRECT /follow");
    expect(redirect).toHaveBeenLastCalledWith("/follow");
  });
});
