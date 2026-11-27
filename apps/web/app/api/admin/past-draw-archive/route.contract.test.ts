import { expect, it, vi } from "vitest";
import { AuthError } from "@/features/auth/domain/auth-errors";
import { POST } from "./route";

const { authorize, findPublished, insert } = vi.hoisted(() => ({
  authorize: vi.fn(), findPublished: vi.fn(), insert: vi.fn(),
}));
vi.mock("@/server/home-notice/home-notice-dependencies", () => ({
  createHomeNoticeAdminDependencies: () => ({ authorize, repository: { findPublished } }),
}));
vi.mock("@/server/raffle/past-draw-archive", async importOriginal => ({
  ...(await importOriginal<typeof import("@/server/raffle/past-draw-archive")>()),
  archiveDatabase: () => ({ from: () => ({ insert }) }),
}));

const row = {
  round_key: "sample-round", source_kind: "notice", source_id: "source-notice", notice_slug: "source-notice",
  closes_at: "2026-01-01T00:00:00Z", results_notice_slug: null, published: true, is_test: false,
};
const post = (body = row) => POST(new Request("https://dev.kyaa.io/api/admin/past-draw-archive", {
  method: "POST", body: JSON.stringify(body),
}));

it("rejects unsigned viewers and read-only administrators before writing", async () => {
  authorize.mockRejectedValueOnce(new AuthError("AUTHENTICATION_REQUIRED", 401, "Required"));
  expect((await post()).status).toBe(401);
  authorize.mockResolvedValueOnce({ role: "viewer" });
  expect((await post()).status).toBe(403);
  expect(insert).not.toHaveBeenCalled();
});

it("requires a public notice and reports concurrent duplicate registration", async () => {
  authorize.mockResolvedValue({ role: "editor" });
  findPublished.mockResolvedValueOnce(null);
  expect((await post()).status).toBe(422);
  expect(insert).not.toHaveBeenCalled();
  findPublished.mockResolvedValue({ slug: "source-notice" });
  insert.mockResolvedValueOnce({ error: { code: "23505" } });
  expect((await post()).status).toBe(409);
  insert.mockResolvedValueOnce({ error: null });
  expect((await post()).status).toBe(201);
});
