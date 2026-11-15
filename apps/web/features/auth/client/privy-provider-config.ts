// The PrivyProvider settings, shared by the island Provider boundary. Standalone: only SDK *types* are imported, so it
// pulls neither the SDK nor a backend nor components/privy-provider.tsx at run time. components/privy-provider.tsx keeps
// its own copy for the direct tree; privy-provider-config.test.tsx holds the two equal (plan-b §0-7).
import type { PrivyClientConfig } from "@privy-io/react-auth";
import { messages as localizedMessages } from "@/i18n/catalogs/components__privy-provider";
import type { AppLocale } from "@/i18n/locales";
import { translate } from "@/i18n/messages";

export type PrivyProviderSettings = {
  locale: AppLocale;
  authProvider: "privy" | "cognito";
  appleLoginEnabled: boolean;
  testAccountLoginEnabled: boolean;
};

export const PRIVY_APP_ID_REQUIRED = "NEXT_PUBLIC_PRIVY_APP_ID is required to initialize kyaa authentication.";

export function privyProviderConfig({ locale, authProvider, appleLoginEnabled, testAccountLoginEnabled }: PrivyProviderSettings): PrivyClientConfig {
  return {
    allowOAuthInEmbeddedBrowsers: false,
    loginMethods: [
      "google",
      ...(appleLoginEnabled ? (["apple"] as const) : []),
      ...(testAccountLoginEnabled ? (["email"] as const) : []),
    ],
    appearance: {
      theme: "light",
      accentColor: "#D11B62",
      logo: "/images/guest-home/kyaa-wordmark.svg",
      landingHeader: locale === "ko" ? "kyaa 시작하기" : translate(locale, localizedMessages.mec65a0eab4d9, "Get started with kyaa"),
      loginMessage: testAccountLoginEnabled
        ? appleLoginEnabled
          ? locale === "ko" ? "Google, Apple 또는 Privy Test Account 이메일로 로그인하세요." : translate(locale, localizedMessages.m9bbd915ffa25, "Sign in with Google, Apple or your Privy Test Account email.")
          : locale === "ko" ? "Google 계정 또는 Privy Test Account 이메일로 로그인하세요." : translate(locale, localizedMessages.m842d64f75fa5, "Sign in with Google or your Privy Test Account email.")
        : appleLoginEnabled
          ? locale === "ko" ? "Google 또는 Apple 계정으로 로그인하고 최애와 함께한 순간을 기록하세요." : translate(locale, localizedMessages.mfad7525856e8, "Sign in with Google or Apple to keep a record of moments with your favorites.")
          : locale === "ko" ? "Google 계정으로 로그인하고 최애와 함께한 순간을 기록하세요." : translate(locale, localizedMessages.mfaf03be529aa, "Sign in with Google to keep a record of moments with your favorites."),
    },
    embeddedWallets: {
      ethereum: { createOnLogin: authProvider === "cognito" ? "off" : "all-users" },
    },
  };
}
