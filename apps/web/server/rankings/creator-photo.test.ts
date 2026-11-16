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

  it("rejects a body that is over the limit even without Content-Length", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => png(new Uint8Array(5 * 1024 * 1024 + 1))));
    await expect(creatorPhotoDataUri(OK)).resolves.toBeNull();
  });

  it("rejects a non-image type", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => png(new Uint8Array(4), { "content-type": "text/html" })));
    await expect(creatorPhotoDataUri(OK)).resolves.toBeNull();
  });
});
