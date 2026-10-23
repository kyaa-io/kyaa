import { runtimeEnvironment } from "../server/config/hosting";

export function isPrivyAppleLoginEnabled(enabled: string | undefined): boolean {
  return enabled === "true";
}

export function readPublicPrivyAppleLoginPolicy(): boolean {
  return isPrivyAppleLoginEnabled(runtimeEnvironment()["NEXT_PUBLIC_PRIVY_APPLE_LOGIN_ENABLED"]);
}
