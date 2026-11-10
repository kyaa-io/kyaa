import { defineConfig, devices } from "@playwright/test";

// Read-only smoke for a deployed site: SMOKE_BASE_URL=https://… [SMOKE_STORAGE_STATE=<test account state>] npm run test:e2e:smoke:readonly
export default defineConfig({
  testDir: "./smoke",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  reporter: [["list"]],
  outputDir: "../../test-results/reward-smoke",
  use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium" }],
});
