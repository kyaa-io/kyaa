import { expect, it, vi } from "vitest";
import { POST } from "./route";
vi.mock("server-only", () => ({}));
vi.mock("@/server/home-notice/home-notice-dependencies", () => ({
  createHomeNoticeAdminDependencies: () => ({ authorize: async () => ({ role: "viewer" }) }),
}));
it("refuses a viewer before accessing any home selection", async () => {
  expect((await POST(new Request("http://localhost/api/admin/home-media", { method: "POST" }))).status).toBe(403);
});
