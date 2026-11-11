import "server-only";
import { runtimeEnvironment } from "./hosting";
import { readGa4MeasurementId } from "../../features/analytics/domain/ga4-id";
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
    ga4MeasurementId: readGa4MeasurementId(source["NEXT_PUBLIC_GA4_MEASUREMENT_ID"]),
  };
}

/** Kakao Login through the Cognito pool's OIDC provider; only with Cognito sign-in. */
export function readCognitoKakaoLoginPolicy(): boolean {
  const source = runtimeEnvironment();
  return source.AUTH_PROVIDER === "cognito" && source.COGNITO_KAKAO_ENABLED === "true";
}
