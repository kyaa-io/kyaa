// PERF-r8 B 1b (plan-b §7.2): runs the Privy-mocking tests on the island backend that production builds use.
// Array aliases come first in vite's merge, so these exact names win over the base "@" alias.
import { defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config";

const web = new URL("./", import.meta.url).pathname;
const at = (relative: string) => `${web}${relative}`;

// Phase-0 sample: the 14 files that mock @privy-io/react-auth across all ten hooks (plan-b §9.3), plus island-only tests.
export const ISLAND_FILES = [
  "components/avatar-session-bridge.test.tsx",
  "components/byus-session-provider.test.tsx",
  "components/custom-oauth-account-links.test.tsx",
  "components/custom-oauth-email-link.test.tsx",
  "components/login-page.test.tsx",
  "features/auth/client/cognito-auth-pages.test.tsx",
  "features/auth/client/cognito-auth.test.tsx",
  "features/connect/kyaa-wave-participation-screen.test.tsx",
  "features/fanpage/ui/cheer-event-photocard.test.tsx",
  "features/fanpage/ui/wave-access-boundary.test.tsx",
  "features/profile/ui/settings-screen.test.tsx",
  "features/profile/ui/use-avatar.test.tsx",
  "features/schedules/ui/participation-requests.test.tsx",
];
// Runs in both projects with the same assertions: the real PrivyRoot + ByUsSessionProvider on each backend.
export const BOTH_BACKEND_FILES = ["features/auth/client/privy-root.assembly.test.tsx"];

const merged = mergeConfig(base, defineConfig({
  resolve: {
    alias: [
      { find: /^@\/features\/auth\/client\/privy-backend$/, replacement: at("features/auth/client/privy-backend.island.tsx") },
      { find: /^@\/features\/auth\/client\/privy-root$/, replacement: at("features/auth/client/privy-root.island.tsx") },
      { find: /^@\/features\/auth\/client\/privy-provider-boundary$/, replacement: at("features/auth/client/island-test/provider-passthrough.tsx") },
      { find: /^@testing-library\/react$/, replacement: at("features/auth/client/island-test/rtl.tsx") },
    ],
  },
}));
// mergeConfig concatenates arrays; the island project runs only its own list.
merged.test = { ...merged.test, include: [...ISLAND_FILES, ...BOTH_BACKEND_FILES, "**/*.island-test.tsx"], exclude: ["**/node_modules/**", "**/.next/**"], env: { ...merged.test?.env, VITEST_ISLAND: "1" } };
export default merged;
