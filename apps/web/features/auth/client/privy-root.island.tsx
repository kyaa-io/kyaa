"use client";
// Island root (plan-b §2): the page is no longer a child of PrivyProvider. PrivyProvider (through the boundary) holds only
// the mirrors, beside the page; the page reads Privy through the island hooks. Same props as components/privy-provider.tsx.
import { useEffect, useMemo, type ReactNode } from "react";
import type { PrivyClientConfig } from "@privy-io/react-auth";
import { IslandPrivyProvider } from "@/features/auth/client/privy-provider-boundary";
import { useAppLocale } from "@/components/locale-provider";
import { AvatarSessionBridge } from "@/components/avatar-session-bridge";
import { ByUsSessionProvider } from "@/components/byus-session-provider";
import { installResourceWriteWatch } from "@/components/fan-ui/resource-cache";
import { CognitoAuthProvider } from "./cognito-auth";
import { FanSessionKeeper } from "./fan-session-keeper";
import { AuthBootProvider } from "./privy-backend.island";
import { PrivyMirrors } from "./privy-mirrors";
import { PRIVY_APP_ID_REQUIRED, privyProviderConfig } from "./privy-provider-config";

/** PrivyProvider with the mirrors only. Exported for the island test root. */
export function PrivyIsland({ appId, config }: { appId: string; config: PrivyClientConfig }) {
  return <IslandPrivyProvider appId={appId} config={config}><PrivyMirrors /></IslandPrivyProvider>;
}

export function PrivyRoot({
  appId,
  authProvider = "privy",
  appleLoginEnabled = false,
  testAccountLoginEnabled = false,
  children,
}: {
  appId: string;
  authProvider?: "privy" | "cognito";
  appleLoginEnabled?: boolean;
  testAccountLoginEnabled?: boolean;
  children: ReactNode;
}) {
  const { locale } = useAppLocale();
  useEffect(() => installResourceWriteWatch(), []);
  const config = useMemo(() => privyProviderConfig({ locale, authProvider, appleLoginEnabled, testAccountLoginEnabled }), [locale, authProvider, appleLoginEnabled, testAccountLoginEnabled]);
  if (!appId) throw new Error(PRIVY_APP_ID_REQUIRED);
  const page = <AvatarSessionBridge><ByUsSessionProvider>{children}</ByUsSessionProvider></AvatarSessionBridge>;
  return <AuthBootProvider>
    <PrivyIsland appId={appId} config={config} />
    {authProvider === "cognito" ? <CognitoAuthProvider>{page}</CognitoAuthProvider> : <><FanSessionKeeper />{page}</>}
  </AuthBootProvider>;
}
