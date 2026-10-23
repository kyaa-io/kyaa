import { isAwsHosting, runtimeEnvironment } from "../server/config/hosting";

export interface PublicPrivyTestAccountPolicySource {
  appUrl: string | undefined;
  appEnvironment: string | undefined;
  enabled: string | undefined;
}

export function isPrivyTestAccountLoginEnabled(
  source: PublicPrivyTestAccountPolicySource,
): boolean {
  if (source.enabled !== "true" || source.appEnvironment !== "development") return false;
  try {
    const hostname = new URL(source.appUrl ?? "").hostname.toLowerCase();
    return !["byus.kr", "www.byus.kr", "kyaa.io", "www.kyaa.io"].includes(hostname);
  } catch {
    return false;
  }
}

export function readPublicPrivyTestAccountPolicy(): boolean {
  const source = runtimeEnvironment();
  if ((isAwsHosting(source) || source.APP_ENV !== undefined) && source.APP_ENV !== "dev") return false;
  return isPrivyTestAccountLoginEnabled({
    appUrl: source["NEXT_PUBLIC_APP_URL"],
    appEnvironment: source["NEXT_PUBLIC_PRIVY_APP_ENVIRONMENT"],
    enabled: source["NEXT_PUBLIC_PRIVY_TEST_ACCOUNT_LOGIN_ENABLED"],
  });
}
