import "server-only";
import { runtimeEnvironment } from "./hosting";
import { readPublicPrivyAppleLoginPolicy } from "../../components/privy-apple-login-policy";
import { readPublicPrivyTestAccountPolicy } from "../../components/privy-test-account-policy";

/** Explicit allowlist: never serialize the environment or server validation result. */
export function publicRuntimeConfig() {
  const source = runtimeEnvironment();
  return {
    authProvider: source.AUTH_PROVIDER === "cognito" ? "cognito" as const : "privy" as const,
    privyAppId: source["NEXT_PUBLIC_PRIVY_APP_ID"] ?? "",
    appleLoginEnabled: readPublicPrivyAppleLoginPolicy(),
    testAccountLoginEnabled: readPublicPrivyTestAccountPolicy(),
    webPushVapidPublicKey: source["NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY"] ?? "",
  };
}
