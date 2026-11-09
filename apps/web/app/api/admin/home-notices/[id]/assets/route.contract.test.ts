import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { File as UndiciFile } from "node:buffer";
import { FormData as UndiciFormData, Request as UndiciRequest } from "undici";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ register: vi.fn(async () => ({ url: "https://db.test/storage/v1/object/public/cms-assets/public-image-assets/a.webp" })) }));
vi.mock("@/server/home-notice/home-notice-dependencies", () => ({ createHomeNoticeAdminDependencies: () => ({
  authorize: async () => ({ email: "a@example.invalid", role: "admin", appUserId: "a0000000-0000-4000-8000-000000000001", allowlistId: "a0000000-0000-4000-8000-000000000002" }),
  repository: {}, registerImage: state.register, invalidatePublicContent: vi.fn(),
}) }));
import { POST } from "./route";

// Server routes see undici's File (same as certification-routes.test.ts).
const browserFile = globalThis.File;
beforeAll(() => { Object.assign(globalThis, { File: UndiciFile }); });
afterAll(() => { Object.assign(globalThis, { File: browserFile }); });

it("registers the file as a public image and answers only its URL", async () => {
  const form = new UndiciFormData();
  form.set("file", new UndiciFile([new Uint8Array([1, 2, 3])], "a.png", { type: "image/png" }));
  const request = new UndiciRequest("https://byus.test/api/admin/home-notices/b0000000-0000-4000-8000-000000000001/assets", { method: "POST", headers: { authorization: "Bearer t" }, body: form });
  const res = await POST(request as unknown as Request, { params: Promise.resolve({ id: "b0000000-0000-4000-8000-000000000001" }) });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ url: "https://db.test/storage/v1/object/public/cms-assets/public-image-assets/a.webp" });
  expect(state.register).toHaveBeenCalledTimes(1);
});
