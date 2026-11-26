import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
const reads = vi.hoisted(() => ({ candidate: vi.fn(), names: [] as unknown[] }));
vi.mock("@/server/config/env", () => ({ loadServerEnv: () => ({ SUPABASE_URL: "http://db", SUPABASE_SERVICE_ROLE_KEY: "key" }) }));
vi.mock("@/server/data/client", () => ({
  createClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ eq: (_column: string, value: unknown) => { reads.names.push(value); return { maybeSingle: reads.candidate }; } }) }) }) }),
}));
import Page from "./page";

const original = { app: process.env.APP_ENV, node: process.env.NODE_ENV };
const env = process.env as Record<string, string | undefined>;
beforeEach(() => { reads.candidate.mockReset(); reads.names.length = 0; delete env.APP_ENV; });
afterEach(() => { env.APP_ENV = original.app; env.NODE_ENV = original.node; if (original.app === undefined) delete env.APP_ENV; });

const open = () => Page({ params: Promise.resolve({ country: "JP", name: "Team" }), searchParams: Promise.resolve({}) });

it("answers 404 on production and staging without reading survey records", async () => {
  for (const value of ["prod", "staging"]) {
    env.APP_ENV = value;
    await expect(open()).rejects.toThrow("NOT_FOUND");
  }
  env.APP_ENV = undefined; delete env.APP_ENV; env.NODE_ENV = "production";
  await expect(open()).rejects.toThrow("NOT_FOUND");
  expect(reads.candidate).not.toHaveBeenCalled();
});

it("reads the survey record on the DEV deployment", async () => {
  env.APP_ENV = "dev";
  reads.candidate.mockResolvedValue({ data: null, error: null });
  await expect(open()).rejects.toThrow("NOT_FOUND");
  expect(reads.candidate).toHaveBeenCalledOnce();
});

it("looks up a Japanese team name from its percent-encoded path segment", async () => {
  env.APP_ENV = "dev";
  reads.candidate.mockResolvedValue({ data: null, error: null });
  await expect(Page({ params: Promise.resolve({ country: "JP", name: encodeURIComponent("地下 チーム") }), searchParams: Promise.resolve({}) })).rejects.toThrow("NOT_FOUND");
  expect(reads.names).toEqual(["地下 チーム"]);
});
