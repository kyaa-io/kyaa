import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { forgetPublicFiles, publicFile } from "./public-file";

afterEach(forgetPublicFiles);

it("reads the file from disk once per process", async () => {
  const read = vi.fn(async () => new Uint8Array([1, 2, 3]));
  const get = vi.fn();
  expect(new Uint8Array(await publicFile("public/fonts/a.ttf", "https://kyaa.io", read, get))).toEqual(new Uint8Array([1, 2, 3]));
  await publicFile("public/fonts/a.ttf", "https://kyaa.io", read, get);
  expect(read).toHaveBeenCalledTimes(1);
  expect(get).not.toHaveBeenCalled();
});

it("falls back to the same server when public/ is not beside the server, and does not keep a failure", async () => {
  const read = vi.fn(async () => { throw new Error("ENOENT"); });
  const get = vi.fn(async () => new Response(new Uint8Array([9])));
  expect(new Uint8Array(await publicFile("public/fonts/b.ttf", "https://kyaa.io", read, get as unknown as typeof fetch))).toEqual(new Uint8Array([9]));
  expect(get).toHaveBeenCalledWith(new URL("https://kyaa.io/fonts/b.ttf"));
  const missing = vi.fn(async () => new Response(null, { status: 404 }));
  await expect(publicFile("public/fonts/c.ttf", "https://kyaa.io", read, missing as unknown as typeof fetch)).rejects.toThrow("PUBLIC_FILE_UNAVAILABLE");
  await Promise.resolve();
  const ok = vi.fn(async () => new Response(new Uint8Array([7])));
  expect(new Uint8Array(await publicFile("public/fonts/c.ttf", "https://kyaa.io", read, ok as unknown as typeof fetch))).toEqual(new Uint8Array([7]));
});
