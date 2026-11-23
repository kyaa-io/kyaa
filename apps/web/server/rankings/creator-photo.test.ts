import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { creatorPhotoDataUri } from "./creator-photo";

const OK = "https://kyaa.io/public-assets/cms-assets/a.png";
const png = (body: BodyInit | null, headers: Record<string, string> = {}, status = 200) =>
  new Response(body, { status, headers: { "content-type": "image/png", ...headers } });

afterEach(() => vi.unstubAllGlobals());

describe("creatorPhotoDataUri remote photo", () => {
  it("fetches an allowed https host with redirect: error", async () => {
    const fetchMock = vi.fn(async () => png(new Uint8Array([1, 2, 3])));
    vi.stubGlobal("fetch", fetchMock);
    await expect(creatorPhotoDataUri(OK)).resolves.toBe(`data:image/png;base64,${Buffer.from([1, 2, 3]).toString("base64")}`);
    expect(fetchMock).toHaveBeenCalledWith(OK, expect.objectContaining({ redirect: "error" }));
  });

  it.each([
    "https://evil.example/a.png",
    "http://kyaa.io/public-assets/cms-assets/a.png",
    "https://127.0.0.1/a.png",
    "https://169.254.169.254/latest/meta-data",
    "https://kyaa.io:8443/a.png",
    "https://user:pw@kyaa.io/a.png",
    "https://kyaa.io.evil.example/a.png",
  ])("rejects %s without fetching", async (src) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(creatorPhotoDataUri(src)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null on a 302 (redirect: error makes fetch throw)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    await expect(creatorPhotoDataUri(OK)).resolves.toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => png(null, { location: "http://169.254.169.254/" }, 302)));
    await expect(creatorPhotoDataUri(OK)).resolves.toBeNull();
  });

  it("rejects a big Content-Length", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => png(new Uint8Array(4), { "content-length": String(6 * 1024 * 1024) })));
    await expect(creatorPhotoDataUri(OK)).resolves.toBeNull();
  });

  it.each(["image/png", "image/webp"])("rejects a %s body that is over the limit even without Content-Length", async (type) => {
    vi.stubGlobal("fetch", vi.fn(async () => png(new Uint8Array(5 * 1024 * 1024 + 1), { "content-type": type })));
    await expect(creatorPhotoDataUri(OK)).resolves.toBeNull();
  });

  it.each(["text/html", "image/svg+xml"])("rejects a %s type, even with WebP bytes", async (type) => {
    const webp = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#ee3366" } }).webp().toBuffer();
    vi.stubGlobal("fetch", vi.fn(async () => png(new Uint8Array(webp), { "content-type": type })));
    await expect(creatorPhotoDataUri(OK)).resolves.toBeNull();
  });
});

/** The data URI's own bytes, read back by sharp. */
async function drawn(uri: string | null) {
  expect(uri).toMatch(/^data:image\/png;base64,/);
  return sharp(Buffer.from(uri!.slice(uri!.indexOf(",") + 1), "base64")).metadata();
}

describe("creatorPhotoDataUri WebP and AVIF, which Satori cannot draw", () => {
  const photo = (width: number, height: number) => sharp({ create: { width, height, channels: 3, background: "#ee3366" } });

  it.each([
    ["image/webp", () => photo(1200, 1480).webp().toBuffer()],
    ["image/avif", () => photo(1200, 1480).avif().toBuffer()],
  ])("converts a %s response to a PNG at most 840 px wide", async (type, encode) => {
    const bytes = await encode();
    vi.stubGlobal("fetch", vi.fn(async () => png(new Uint8Array(bytes), { "content-type": `${type}; charset=binary` })));
    const meta = await drawn(await creatorPhotoDataUri(OK));
    expect(meta).toMatchObject({ format: "png", width: 840, height: 1036 });
  });

  it("keeps a small WebP at its own size", async () => {
    const bytes = await photo(300, 400).webp().toBuffer();
    vi.stubGlobal("fetch", vi.fn(async () => png(new Uint8Array(bytes), { "content-type": "image/webp" })));
    expect(await drawn(await creatorPhotoDataUri(OK))).toMatchObject({ format: "png", width: 300, height: 400 });
  });

  it("returns null when the WebP bytes cannot be read", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => png(new Uint8Array([1, 2, 3, 4]), { "content-type": "image/webp" })));
    await expect(creatorPhotoDataUri(OK)).resolves.toBeNull();
  });

  it("converts a WebP under public/", async () => {
    const meta = await drawn(await creatorPhotoDataUri("/chemi/my-fortune-512.webp"));
    expect(meta).toMatchObject({ format: "png", width: 512 });
  });
});
