import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createPublishedContentRepositoryFromEnvironment } from "../content/published-content-repository";
import { createPublicQuizIntroRepositoryFromEnvironment } from "../g2/public-quiz-intro-repository";
import { createCertificationRepository } from "../certification/certification-repository";
import { createIndexNowStoreFromEnvironment } from "../seo/indexnow-store";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it("constructs public repositories and reads via PostgREST with no Supabase URL or key", async () => {
  vi.stubEnv("SUPABASE_URL", undefined); vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", undefined);
  for (const [name, value] of Object.entries({ POSTGREST_URL: "http://127.0.0.1:3001", POSTGREST_SERVICE_TOKEN: "t".repeat(48), AWS_STORAGE_ENABLED: "true", AWS_REGION: "ap-northeast-2", S3_PUBLIC_BUCKET: "public-assets", S3_PRIVATE_BUCKET: "private-assets", ASSET_PUBLIC_BASE_URL: "https://assets.example.test/public-assets" })) vi.stubEnv(name, value);
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input) => Response.json(String(input).endsWith("/rpc/claim_search_indexnow") ? { acquired: false } : []));
  vi.stubGlobal("fetch", fetcher);
  expect(createPublishedContentRepositoryFromEnvironment({})).toBeDefined();
  expect(createPublicQuizIntroRepositoryFromEnvironment({})).toBeDefined();
  await expect(createCertificationRepository({}).listPublic("creator", "ko")).resolves.toEqual([]);
  await expect(createIndexNowStoreFromEnvironment().claim("test-token")).resolves.toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls.every(([url]) => String(url).startsWith("http://127.0.0.1:3001/"))).toBe(true);
});
