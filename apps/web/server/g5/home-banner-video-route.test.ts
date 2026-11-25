import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { File as UndiciFile } from "node:buffer";
import { FormData as UndiciFormData, Headers as UndiciHeaders, Request as UndiciRequest, Response as UndiciResponse } from "undici";

vi.mock("server-only", () => ({}));
import { AuthError } from "../../features/auth/domain/auth-errors";
import { createPostHomeBannerVideoHandler, homeBannerVideoProblem, MAX_HOME_BANNER_VIDEO_BYTES } from "./home-banner-video-route";

const loop = (extension: "mp4" | "webm") => new Uint8Array(readFileSync(join(process.cwd(), `public/public-assets/cms-assets/home-banners/video/x-mission-loop-v1.${extension}`)));
const mp4 = loop("mp4"), webm = loop("webm");
const ascii = (text: string) => [...text].map(char => char.charCodeAt(0));
const withSoundMp4 = new Uint8Array([...mp4.subarray(0, 64), 0, 0, 0, 33, ...ascii("hdlr"), 0, 0, 0, 0, 0, 0, 0, 0, ...ascii("soun")]);
const withSoundWebm = new Uint8Array([...webm.subarray(0, 64), 0x86, 0x86, ...ascii("A_OPUS")]);
const admin = { appUserId: "11111111-1111-4111-8111-111111111111", allowlistId: "22222222-2222-4222-8222-222222222222", role: "admin" } as const;

const browser = { File: globalThis.File, FormData: globalThis.FormData, Headers: globalThis.Headers, Request: globalThis.Request, Response: globalThis.Response };
beforeAll(() => { Object.assign(globalThis, { File: UndiciFile, FormData: UndiciFormData, Headers: UndiciHeaders, Request: UndiciRequest, Response: UndiciResponse }); });
afterAll(() => { Object.assign(globalThis, browser); });

function request(files: Record<string, Uint8Array>) {
  const body = new FormData();
  for (const [name, bytes] of Object.entries(files)) body.set(name, new File([bytes as Uint8Array<ArrayBuffer>], `loop.${name}`, { type: `video/${name}` }));
  return new Request("http://local/api/admin/home-banner-videos", { method: "POST", body, headers: { authorization: "Bearer token" } });
}

describe("home banner video upload", () => {
  it("accepts the silent MP4/WebM loops the home already plays", () => {
    expect(homeBannerVideoProblem(mp4, webm)).toBeNull();
  });

  it("refuses a sound track, a wrong format, and a file over 1 MB", () => {
    expect(homeBannerVideoProblem(withSoundMp4, webm)).toBe("VIDEO_HAS_SOUND");
    expect(homeBannerVideoProblem(mp4, withSoundWebm)).toBe("VIDEO_HAS_SOUND");
    expect(homeBannerVideoProblem(webm, mp4)).toBe("INVALID_VIDEO");
    expect(homeBannerVideoProblem(new Uint8Array(MAX_HOME_BANNER_VIDEO_BYTES + 1), webm)).toBe("VIDEO_TOO_LARGE");
  });

  it("stores the pair under one content-hash name and returns the loop path", async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const handler = createPostHomeBannerVideoHandler({ authorize: vi.fn().mockResolvedValue(admin), storage: { from: () => ({ upload }) } });
    const response = await handler(request({ mp4, webm }));
    expect(response.status).toBe(201);
    const { video } = await response.json() as { video: string };
    expect(video).toMatch(/^\/public-assets\/cms-assets\/home-banners\/video\/admin-[0-9a-f]{32}$/);
    const name = video.split("/").at(-1);
    expect(upload.mock.calls.map(call => [call[0], call[2].contentType])).toEqual([[`home-banners/video/${name}.mp4`, "video/mp4"], [`home-banners/video/${name}.webm`, "video/webm"]]);
  });

  it("uploads nothing for a viewer, a missing file, or a loop with sound", async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const storage = { from: () => ({ upload }) };
    expect((await createPostHomeBannerVideoHandler({ authorize: vi.fn().mockResolvedValue({ ...admin, role: "viewer" }), storage })(request({ mp4, webm }))).status).toBe(403);
    expect((await createPostHomeBannerVideoHandler({ authorize: vi.fn().mockRejectedValue(new AuthError("UNAUTHENTICATED" as never, 401, "no session")), storage })(request({ mp4, webm }))).status).toBe(401);
    const handler = createPostHomeBannerVideoHandler({ authorize: vi.fn().mockResolvedValue(admin), storage });
    expect((await handler(request({ mp4 }))).status).toBe(400);
    const sound = await handler(request({ mp4, webm: withSoundWebm }));
    expect(sound.status).toBe(400);
    expect(await sound.json()).toEqual({ error: { code: "VIDEO_HAS_SOUND" } });
    expect(upload).not.toHaveBeenCalled();
  });
});
