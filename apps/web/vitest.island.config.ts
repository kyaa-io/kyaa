// Island-only tests for the privy-mode Privy island (PRIVY-RESTORE-1115, from 57c922b24 PERF-r8 B 1b, plan-b §7.2): the
// production island store, mirrors and leases, with the SDK's PrivyProvider swapped for a pass-through. Run by
// fan-design-system.yml when this file exists. Array aliases come first in vite's merge, so these exact names win over "@".
import { defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config";

const web = new URL("./", import.meta.url).pathname;
const at = (relative: string) => `${web}${relative}`;

const merged = mergeConfig(base, defineConfig({
  resolve: {
    alias: [
      { find: /^@\/features\/auth\/client\/privy-backend$/, replacement: at("features/auth/client/privy-backend.island.tsx") },
      { find: /^@\/features\/auth\/client\/privy-provider-boundary$/, replacement: at("features/auth/client/island-test/provider-passthrough.tsx") },
      { find: /^@testing-library\/react$/, replacement: at("features/auth/client/island-test/rtl.tsx") },
    ],
  },
}));
// mergeConfig concatenates arrays; the island project runs only its own files.
merged.test = { ...merged.test, include: ["**/*.island-test.tsx"], exclude: ["**/node_modules/**", "**/.next/**"], env: { ...merged.test?.env, VITEST_ISLAND: "1" } };
export default merged;
