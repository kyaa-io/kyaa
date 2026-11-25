import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { File as UndiciFile } from "node:buffer";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FormData as UndiciFormData, Request as UndiciRequest } from "undici";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ upload: vi.fn(async () => ({ error: null })) }));
vi.mock("@/server/g5/home-banner-manager-route-dependencies", () => ({ createHomeBannerVideoDependencies: () => ({
  authorize: async () => ({ email: "a@example.invalid", role: "admin", appUserId: "a0000000-0000-4000-8000-000000000001", allowlistId: "a0000000-0000-4000-8000-000000000002" }),
  storage: { from: () => ({ upload: state.upload }) },
}) }));
import { POST } from "./route";

const browserFile = globalThis.File;
beforeAll(() => { Object.assign(globalThis, { File: UndiciFile }); });
afterAll(() => { Object.assign(globalThis, { File: browserFile }); });

it("stores a silent MP4/WebM pair and answers only the loop path", async () => {
  const loop = (extension: string) => readFileSync(join(process.cwd(), `public/public-assets/cms-assets/home-banners/video/x-mission-loop-v1.${extension}`));
  const form = new UndiciFormData();
  form.set("mp4", new UndiciFile([loop("mp4")], "loop.mp4", { type: "video/mp4" }));
  form.set("webm", new UndiciFile([loop("webm")], "loop.webm", { type: "video/webm" }));
  const res = await POST(new UndiciRequest("https://byus.test/api/admin/home-banner-videos", { method: "POST", headers: { authorization: "Bearer t" }, body: form }) as unknown as Request);
  expect(res.status).toBe(201);
  expect(Object.keys(await res.json())).toEqual(["video"]);
  expect(state.upload).toHaveBeenCalledTimes(2);
});
