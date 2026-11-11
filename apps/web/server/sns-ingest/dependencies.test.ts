import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";
import sharp from "sharp";
vi.mock("server-only", () => ({}));
import { fetchImage } from "./dependencies";
import { MAX_PUBLIC_IMAGE_BYTES, normalizePublicImage } from "../media/public-image-processing";
afterEach(() => vi.unstubAllGlobals());
describe("download boundary", () => {
  it.each([null, "1", String(MAX_PUBLIC_IMAGE_BYTES + 1), "invalid", "-1"])("rejects oversized streams and bad lengths %s", async length => {
    const cancel = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(MAX_PUBLIC_IMAGE_BYTES + 1)); }, cancel }), { headers: length === null ? {} : { "content-length": length } })));
    await expect(fetchImage(new URL("https://scontent.cdninstagram.com/image"))).rejects.toThrow("SNS_INGEST_IMAGE_TOO_LARGE");
    expect(cancel).toHaveBeenCalled();
  });
  it("refuses same-host and external redirects with real fetch", async () => {
    let targetHits = 0;
    const server = createServer((req, res) => {
      if (req.url === "/target") { targetHits++; res.end("unexpected"); return; }
      res.writeHead(302, { location: req.url === "/external" ? "http://169.254.169.254/" : "/target" }); res.end();
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address() as { port: number };
      for (const path of ["same", "external"]) await expect(fetchImage(new URL(`http://127.0.0.1:${address.port}/${path}`))).rejects.toThrow();
      expect(targetHits).toBe(0);
    } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  });
  it("accepts exactly 8 MiB without length", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array(MAX_PUBLIC_IMAGE_BYTES))));
    expect((await fetchImage(new URL("https://scontent.cdninstagram.com/image"))).length).toBe(MAX_PUBLIC_IMAGE_BYTES);
  });
  it("rejects unavailable responses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 503 })));
    await expect(fetchImage(new URL("https://scontent.cdninstagram.com/image"))).rejects.toThrow();
  });
});
describe("real image normalization", () => {
  it.each(["jpeg", "png", "webp"] as const)("accepts %s", async format => {
    const bytes = await sharp({ create: { width: 4, height: 4, channels: 3, background: "red" } }).toFormat(format).toBuffer();
    expect((await normalizePublicImage(bytes)).mimeType).toBe("image/webp");
  });
  it("rejects corrupt, unsupported, multipage and excessive pixels", async () => {
    const multi = await sharp({ create: { width: 2, height: 4, channels: 3, background: "red", pageHeight: 2 } }).gif().toBuffer();
    const oversized = await sharp({ create: { width: 6400, height: 6400, channels: 3, background: "red" } }).png().toBuffer();
    for (const bytes of [Buffer.from("broken"), Buffer.from('<svg width="2" height="2"></svg>'), multi, oversized]) await expect(normalizePublicImage(bytes)).rejects.toThrow("INVALID_IMAGE");
  });
});
