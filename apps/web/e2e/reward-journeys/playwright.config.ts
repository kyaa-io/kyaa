import { defineConfig, devices } from "@playwright/test";

// Single Chromium, one worker: the members are shared local test accounts, so journeys run one after another.
export default defineConfig({
  testDir: ".",
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  reporter: [["list"]],
  outputDir: "../../test-results/reward-journeys",
  use: { ...devices["Desktop Chrome"], trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium" }],
});
