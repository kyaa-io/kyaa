import { afterEach, expect, it, vi } from "vitest";
import { saveAdviceImage } from "./advice-image";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("offers the generated PNG to the file share sheet with the full illustration and advice", async () => {
  vi.stubGlobal("Image", class {
    width = 800;
    height = 400;
    decode = async () => {};
  });
  const ctx = {
    measureText: () => ({ width: 40 }), fillRect: vi.fn(),
    drawImage: vi.fn(), fillText: vi.fn(),
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(cb => cb(new Blob(["card"], { type: "image/png" })));
  const share = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { canShare: () => true, share });
  await saveAdviceImage("/chemi/saju/test.webp", "2026-11-21", "오늘의 조언");
  expect(ctx.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 960, 480);
  expect(ctx.fillText.mock.calls.map(([text]) => text)).toEqual(["오늘의 조언", "2026-11-21", "kyaa"]);
  expect(share.mock.calls[0][0].files[0]).toMatchObject({ name: "kyaa-advice.png", type: "image/png" });
});
