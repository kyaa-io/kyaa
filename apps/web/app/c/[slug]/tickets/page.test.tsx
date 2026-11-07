import { expect, it, vi } from "vitest";
const redirect = vi.hoisted(() => vi.fn((to: string) => { throw new Error(`REDIRECT:${to}`); }));
vi.mock("next/navigation", () => ({ redirect }));
import Page from "./page";

it("sends the old creator ticket history to the 덕질 wallet history", async () => {
  await expect(Page({ params: Promise.resolve({ slug: "elina" }), searchParams: Promise.resolve({ locale: "en" }) })).rejects.toThrow("REDIRECT:/benefits?locale=en#wallet-history");
});
