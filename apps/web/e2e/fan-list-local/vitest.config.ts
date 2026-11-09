import { defineConfig } from "vitest/config";
import base from "../../vitest.config";

// Chromium is installed by the layout CI job; ordinary unit tests need no browser.
export default defineConfig({
  ...base,
  test: { ...base.test, include: ["features/groups/ui/fan-list-overflow.browser.spec.tsx"] },
});
