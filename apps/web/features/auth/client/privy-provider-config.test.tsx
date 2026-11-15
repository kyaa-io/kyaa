import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ByUsPrivyProvider } from "@/components/privy-provider";
import { LocaleProvider } from "@/components/locale-provider";
import { APP_LOCALES } from "@/i18n/locales";
import { privyProviderConfig } from "./privy-provider-config";

const seen = vi.hoisted(() => ({ config: undefined as unknown, appId: "" }));
vi.mock("@privy-io/react-auth", () => ({
  PrivyProvider: ({ appId, config, children }: { appId: string; config: unknown; children: ReactNode }) => { seen.appId = appId; seen.config = config; return <>{children}</>; },
}));
const pass = vi.hoisted(() => ({ children }: { children: unknown }) => children);
vi.mock("@/components/avatar-session-bridge", () => ({ AvatarSessionBridge: pass }));
vi.mock("@/components/byus-session-provider", () => ({ ByUsSessionProvider: pass }));
vi.mock("@/features/auth/client/cognito-auth", () => ({ CognitoAuthProvider: pass }));
vi.mock("@/components/fan-ui/resource-cache", () => ({ installResourceWriteWatch: () => () => undefined }));

// components/privy-provider.tsx (direct tree) keeps its own copy of the settings; the island boundary uses
// privyProviderConfig. They must stay equal (plan-b §0-7).
describe("Privy Provider settings", () => {
  it("are the same in the direct tree and the shared function for every language and login set", () => {
    let cases = 0;
    for (const locale of APP_LOCALES) for (const authProvider of ["privy", "cognito"] as const) for (const appleLoginEnabled of [false, true]) for (const testAccountLoginEnabled of [false, true]) {
      const { unmount } = render(<LocaleProvider initialLocale={locale}><ByUsPrivyProvider appId="app-id" authProvider={authProvider} appleLoginEnabled={appleLoginEnabled} testAccountLoginEnabled={testAccountLoginEnabled}><span /></ByUsPrivyProvider></LocaleProvider>);
      expect(seen.config, `${locale} ${authProvider} ${appleLoginEnabled} ${testAccountLoginEnabled}`).toEqual(privyProviderConfig({ locale, authProvider, appleLoginEnabled, testAccountLoginEnabled }));
      unmount();
      cases += 1;
    }
    expect(cases).toBe(APP_LOCALES.length * 8);
  });
});
