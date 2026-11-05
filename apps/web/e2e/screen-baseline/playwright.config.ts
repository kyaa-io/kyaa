import { defineConfig, devices } from "@playwright/test";

// Screen regression baseline (layer 4). Loopback harness with fixed synthetic data, Chromium only.
// Not a product-defect detector: the harness differs from the deployed app (no SSR, no real session).
// Run from apps/web: npx playwright test -c e2e/screen-baseline/playwright.config.ts [--update-snapshots]
export default defineConfig({
  testDir: ".",
  testMatch: "screen-baseline.spec.ts",
  snapshotPathTemplate: "{testDir}/__screenshots__/{platform}/{arg}{ext}",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  reporter: [["list"]],
  expect: { toHaveScreenshot: { maxDiffPixels: 0, threshold: 0, animations: "disabled", caret: "hide", scale: "css" } },
  use: { ...devices["Desktop Chrome"], locale: "ko-KR", timezoneId: "Asia/Seoul", colorScheme: "light", deviceScaleFactor: 1 },
  webServer: { command: "node server.mjs", url: "http://127.0.0.1:3191/?auth=off", reuseExistingServer: false, timeout: 180_000, stdout: "pipe" },
});
