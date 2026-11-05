// Short-content layout check. Run: NODE_PATH=<repo>/node_modules node e2e/rankings-short-local/tabs-height.mjs
// Builds the shell frame + a grid page with only a heading and period tabs from the real CSS files, then measures the tab row at 390px.
// Why earlier checks missed it: captures and lint ran with full lists or desktop width, so the mobile min-height of the frame's last child never had spare height to hand to grid rows.
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const shell = read("components/fan-shell/fan-app-shell.module.css").replace(process.env.DROP_FIX ? "grid-auto-rows: max-content;" : "\0", "");
const rankings = read("features/rankings/ui/rankings.module.css");
const tokens = read("app/globals.css");
const html = `<style>${tokens}${shell}${rankings}</style><div class="frame" style="--fan-header-height:64px"><div style="height:64px"></div><main class="page"><h1>Ranking</h1><div class="controls"><div class="chips"><button class="chip" style="min-height:44px">Week</button><button class="chip" style="min-height:44px">Month</button><button class="chip" style="min-height:44px">All</button></div></div></main><footer data-fan-site-footer style="height:300px"></footer></div>`;

const browser = await chromium.launch();
let failed = false;
for (const width of [390, 1440]) {
  const page = await browser.newPage({ viewport: { width, height: 844 } });
  await page.setContent(html);
  const { chips, main } = await page.evaluate(() => ({ chips: document.querySelector(".chips").getBoundingClientRect().height, main: document.querySelector("main").getBoundingClientRect().height }));
  const ok = chips <= 60;
  failed ||= !ok;
  console.log(`${width}px tabs=${Math.round(chips)}px main=${Math.round(main)}px ${ok ? "ok" : "FAIL (tabs stretched)"}`);
  await page.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
