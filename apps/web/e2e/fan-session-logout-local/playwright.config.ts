import { defineConfig, devices } from "@playwright/test";

// Self-contained: the spec starts its own server around the real fan-session route and the real client module. No database, no Privy.
// Run: npx playwright test --config e2e/fan-session-logout-local/playwright.config.ts
export default defineConfig({
  testDir: ".",
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [["list"]],
  outputDir: "../../test-results/fan-session-logout-local",
  use: { ...devices["Desktop Chrome"] },
  projects: [{ name: "chromium" }],
});
