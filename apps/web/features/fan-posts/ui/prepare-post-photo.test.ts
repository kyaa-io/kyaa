import { afterEach, expect, it, vi } from "vitest";
import { preparePostPhoto } from "./prepare-post-photo";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const largePhoto = () => new File([new Uint8Array(12 * 1024 * 1024)], "camera.jpg", { type: "image/jpeg" });
function browserImage() {
  const revoke = vi.fn(), draw = vi.fn();
  vi.stubGlobal("URL", class extends URL { static createObjectURL = () => "blob:photo"; static revokeObjectURL = revoke; });
  vi.stubGlobal("Image", class { naturalWidth = 4000; naturalHeight = 3000; decode = vi.fn().mockResolvedValue(undefined); });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: draw } as unknown as CanvasRenderingContext2D);
  return { revoke, draw };
}
it("keeps small originals without decoding or recompressing", async () => {
  const file = new File(["photo"], "small.png", { type: "image/png" });
  expect(await preparePostPhoto(file)).toBe(file);
});
it("reduces a large photo below the request limit and preserves its aspect ratio", async () => {
  const { revoke, draw } = browserImage();
  const encode = vi.spyOn(HTMLCanvasElement.prototype, "toBlob")
    .mockImplementationOnce(callback => callback(new Blob([new Uint8Array(5 * 1024 * 1024)], { type: "image/webp" })))
    .mockImplementationOnce(callback => callback(new Blob(["compressed"], { type: "image/webp" })));
  const result = await preparePostPhoto(largePhoto());
  expect(result.type).toBe("image/webp");
  expect(result.size).toBeLessThanOrEqual(4 * 1024 * 1024);
  expect(draw.mock.calls.map(args => args.slice(3))).toEqual([[4000, 3000], [3000, 2250]]);
  expect(encode).toHaveBeenCalledTimes(2);
  expect(revoke).toHaveBeenCalledWith("blob:photo");
});
it("accepts the PNG fallback used by browsers without WebP encoding", async () => {
  browserImage();
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(callback => callback(new Blob(["png"], { type: "image/png" })));
  expect(await preparePostPhoto(largePhoto())).toMatchObject({ type: "image/png", name: "photo.png" });
});
it("releases resources when encoding fails", async () => {
  const { revoke } = browserImage();
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(callback => callback(null));
  await expect(preparePostPhoto(largePhoto())).rejects.toThrow("INVALID_IMAGE");
  expect(revoke).toHaveBeenCalledOnce();
});
it("keeps the 20 MB input safety limit", async () => {
  await expect(preparePostPhoto(new File([new Uint8Array(20 * 1024 * 1024 + 1)], "large.jpg", { type: "image/jpeg" }))).rejects.toThrow("INVALID_IMAGE");
});
