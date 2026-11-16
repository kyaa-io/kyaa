import { useState } from "react";
import { createRoot } from "react-dom/client";
import { ProofImageMask } from "@/features/passport-proofs/ui/proof-image-mask";
import { maskAndEncode, type MaskRect } from "@/features/passport-proofs/ui/proof-image";
import "@/app/globals.css";

// Synthetic tall receipt: white page, a red "name" block in the top-left, a blue "number" block at the right edge near the bottom,
// a green block in the centre that must stay visible.
const W = 1000, H = 4000;
export const MARKS = { red: { x: 0, y: 0, w: 250, h: 400, color: "#f00" }, blue: { x: 750, y: 3600, w: 250, h: 400, color: "#00f" }, green: { x: 375, y: 1800, w: 250, h: 400, color: "#0f0" } };
const canvas = document.createElement("canvas");
canvas.width = W; canvas.height = H;
const context = canvas.getContext("2d")!;
context.fillStyle = "#fff"; context.fillRect(0, 0, W, H);
for (const m of Object.values(MARKS)) { context.fillStyle = m.color; context.fillRect(m.x, m.y, m.w, m.h); }
const blob: Blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b!), "image/png"));
const src = URL.createObjectURL(blob);
const width = Number(new URLSearchParams(location.search).get("w") ?? 300);

function Harness() {
  const [masks, setMasks] = useState<MaskRect[]>([]);
  Object.assign(window, { proofMasks: masks });
  return <div style={{ width, margin: 16 }}><ProofImageMask locale="ko" src={src} masks={masks} onChange={setMasks} onRemove={() => {}} /></div>;
}
Object.assign(window, {
  proofEncode: async (masks: MaskRect[]) => {
    const { blob: out } = await maskAndEncode(blob, masks);
    const bitmap = await createImageBitmap(out);
    const c = document.createElement("canvas"); c.width = bitmap.width; c.height = bitmap.height;
    const ctx = c.getContext("2d")!; ctx.drawImage(bitmap, 0, 0);
    const scale = bitmap.width / W;
    const count = (m: { x: number; y: number; w: number; h: number }, test: (r: number, g: number, b: number) => boolean) => {
      const x0 = Math.round(m.x * scale), y0 = Math.round(m.y * scale), w = Math.round(m.w * scale), h = Math.round(m.h * scale);
      const data = ctx.getImageData(x0, y0, w, h).data; let n = 0;
      for (let i = 0; i < data.length; i += 4) if (test(data[i], data[i + 1], data[i + 2])) n++;
      return { hit: n, total: w * h };
    };
    const isRed = (r: number, g: number, b: number) => r > 200 && g < 60 && b < 60;
    const isBlue = (r: number, g: number, b: number) => b > 200 && r < 60 && g < 60;
    const isGreen = (r: number, g: number, b: number) => g > 200 && r < 60 && b < 60;
    return { size: [bitmap.width, bitmap.height], red: count(MARKS.red, isRed), blue: count(MARKS.blue, isBlue), green: count(MARKS.green, isGreen) };
  },
});
createRoot(document.getElementById("root")!).render(<Harness />);
