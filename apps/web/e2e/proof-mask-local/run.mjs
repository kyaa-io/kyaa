// Real-browser check: a cover dragged over the tall receipt on screen must cover the same pixels of the saved WebP.
// Run from apps/web: node e2e/proof-mask-local/run.mjs   (synthetic 1000x4000 picture, loopback only, no network)
import { createServer } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url)), web = path.resolve(here, "../..");
const server = await createServer({ configFile: false, root: here, publicDir: false, cacheDir: path.join(web, "node_modules/.vite-proof-mask"), esbuild: { jsx: "automatic" }, define: { "process.env": {} },
  resolve: { alias: [{ find: "@", replacement: web }] }, server: { host: "127.0.0.1", port: 5199, strictPort: true, hmr: false, fs: { allow: [path.resolve(web, "../..")] } } });
await server.listen();
const browser = await chromium.launch();
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? "PASS" : "FAIL"} ${name} ${detail ?? ""}`); if (!ok) failed++; };
try {
  for (const [label, viewport, w] of [["390", { width: 390, height: 844 }, 342], ["1440", { width: 1440, height: 900 }, 300]]) {
    const page = await browser.newPage({ viewport });
    await page.goto(`http://127.0.0.1:5199/?w=${w}`);
    await page.waitForFunction(() => document.querySelector("[data-proof-mask-frame] img")?.complete);
    const frame = page.locator("[data-proof-mask-frame]");
    const box = await frame.boundingBox();
    // The picture really leaves empty bands: find the red block on screen from a screenshot, independent of the app's own maths.
    const shot = await frame.screenshot();
    const { red, bounds } = await page.evaluate(async (b64) => {
      const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode();
      const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const ctx = c.getContext("2d"); ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height).data; const find = (t) => { let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
        for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) { const i = (y * c.width + x) * 4; if (t(d[i], d[i + 1], d[i + 2])) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } } return { x0, y0, x1, y1 }; };
      return { red: find((r, g, bl) => r > 200 && g < 60 && bl < 60), bounds: find((r, g, bl) => !(r > 200 && g > 200 && bl > 200) && !(Math.abs(r - 0xe8) < 40 && Math.abs(g - 0xe8) < 40)) };
    }, shot.toString("base64"));
    check(`${label}: picture leaves empty side bands`, red.x0 > 20, JSON.stringify(red));
    // Drag over the red block as the user sees it: start a few px past the block, end outside the frame's top-left corner (pointer capture clamps to the picture edge).
    const pad = 3;
    await page.mouse.move(box.x + red.x1 + 1 + pad, box.y + red.y1 + 1 + pad);
    await page.mouse.down();
    await page.mouse.move(box.x - 5, box.y - 5, { steps: 6 });
    await page.mouse.up();
    // Second cover over the blue block at the lower right edge.
    const blue = await frame.screenshot().then((s) => page.evaluate(async (b64) => {
      const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode();
      const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const ctx = c.getContext("2d"); ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height).data; let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
      for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) { const i = (y * c.width + x) * 4; if (d[i + 2] > 200 && d[i] < 60 && d[i + 1] < 60) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } }
      return { x0, y0, x1, y1 };
    }, s.toString("base64")));
    await page.mouse.move(box.x + blue.x0 - pad, box.y + blue.y0 - pad);
    await page.mouse.down();
    await page.mouse.move(box.x + blue.x1 + 1 + pad, box.y + blue.y1 + 1 + pad, { steps: 6 });
    await page.mouse.up();
    const masks = await page.evaluate(() => window.proofMasks);
    check(`${label}: two covers recorded`, masks.length === 2, JSON.stringify(masks));
    // What the screen shows after covering: no red or blue left on the preview.
    const after = await frame.screenshot();
    const left = await page.evaluate(async (b64) => {
      const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode();
      const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const ctx = c.getContext("2d"); ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height).data; let r = 0, b = 0, g = 0;
      for (let i = 0; i < d.length; i += 4) { if (d[i] > 200 && d[i + 1] < 60 && d[i + 2] < 60) r++; if (d[i + 2] > 200 && d[i] < 60 && d[i + 1] < 60) b++; if (d[i + 1] > 200 && d[i] < 60 && d[i + 2] < 60) g++; }
      return { r, b, g };
    }, after.toString("base64"));
    check(`${label}: preview shows red and blue covered, green visible`, left.r === 0 && left.b === 0 && left.g > 0, JSON.stringify(left));
    // The saved file must hide the same things.
    const saved = await page.evaluate((m) => window.proofEncode(m), masks);
    check(`${label}: saved webp hides the red block`, saved.red.hit === 0, JSON.stringify(saved.red));
    check(`${label}: saved webp hides the blue block`, saved.blue.hit === 0, JSON.stringify(saved.blue));
    check(`${label}: saved webp keeps the uncovered green block`, saved.green.hit > saved.green.total * 0.9, JSON.stringify(saved.green));
    await page.close();
  }
} finally { await browser.close(); await server.close(); }
process.exit(failed ? 1 : 0);
