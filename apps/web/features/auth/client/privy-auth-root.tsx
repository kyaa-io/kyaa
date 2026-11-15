"use client";
// Privy sign-in for AUTH_PROVIDER=privy (PRIVY-RESTORE-1115). auth-root.tsx loads this file as its own chunk only in
// privy mode, so Cognito pages never download Privy. PrivyProvider holds only the island mirrors beside the page
// (the 57c922b24 island); the page reads Privy through PrivyBridgeContext, which useByUsAuth() turns into ByUsAuth.
import { useCallback, useMemo, useRef, type ReactNode } from "react";
import type { PrivyClientConfig } from "@privy-io/react-auth";
import { useAppLocale } from "@/components/locale-provider";
import type { ByUsAuth } from "./auth-fallback";
import { openLoginPage } from "./open-login-page";
import { AuthBootProvider, useCreateWallet, useLogin, useLoginWithOAuth, usePrivy, useUser } from "./privy-backend.island";
import { PrivyBridgeContext, type PrivyBridge, type PrivyOAuthListener } from "./privy-bridge";
import { PrivyMirrors } from "./privy-mirrors";
import { PrivyAvatarSessionBridge } from "./privy-avatar-session-bridge";
import { IslandPrivyProvider } from "./privy-provider-boundary";
import { PRIVY_APP_ID_REQUIRED, privyProviderConfig } from "./privy-provider-config";

function PrivyIsland({ appId, config }: { appId: string; config: PrivyClientConfig }) {
  return <IslandPrivyProvider appId={appId} config={config}><PrivyMirrors /></IslandPrivyProvider>;
}

function PrivyBridgeProvider({ children }: { children: ReactNode }) {
  const privy = usePrivy();
  const { refreshUser } = useUser();
  const { createWallet } = useCreateWallet();
  const { login } = useLogin();
  const listeners = useRef(new Set<PrivyOAuthListener>());
  const { initOAuth, loading: oauthLoading } = useLoginWithOAuth({
    onComplete: ({ user }) => { for (const listener of [...listeners.current]) listener.onComplete(user.id); },
    onError: () => { for (const listener of [...listeners.current]) listener.onError(); },
  });
  const subscribeOAuth = useCallback((listener: PrivyOAuthListener) => {
    listeners.current.add(listener);
    return () => { listeners.current.delete(listener); };
  }, []);
  const { ready, authenticated, user, getAccessToken, logout } = privy;
  const userId = authenticated ? user?.id ?? null : null;
  const linkedAccounts = user?.linkedAccounts;
  const authUser = useMemo(() => userId ? { id: userId, linkedAccounts: linkedAccounts ?? [] } : null, [linkedAccounts, userId]);
  const auth = useMemo<ByUsAuth>(() => ({ ready, authenticated, user: authUser, getAccessToken, logout, login: openLoginPage }), [authUser, authenticated, getAccessToken, logout, ready]);
  const value = useMemo<PrivyBridge>(() => ({
    auth,
    oauthLoading,
    startOAuth: (provider) => initOAuth({ provider }).then(() => undefined),
    subscribeOAuth,
    openGoogleLogin: () => login({ loginMethods: ["google"] }),
    refreshUser: () => refreshUser(),
    createWallet: () => Promise.resolve(createWallet({ createAdditional: false })),
  }), [auth, createWallet, initOAuth, login, oauthLoading, refreshUser, subscribeOAuth]);
  return <PrivyBridgeContext.Provider value={value}>{children}</PrivyBridgeContext.Provider>;
}

export default function PrivyAuthRoot({ appId, appleLoginEnabled, testAccountLoginEnabled, children }: {
  appId: string;
  appleLoginEnabled: boolean;
  testAccountLoginEnabled: boolean;
  children: ReactNode;
}) {
  const { locale } = useAppLocale();
  const config = useMemo(() => privyProviderConfig({ locale, authProvider: "privy", appleLoginEnabled, testAccountLoginEnabled }), [locale, appleLoginEnabled, testAccountLoginEnabled]);
  if (!appId) throw new Error(PRIVY_APP_ID_REQUIRED);
  return <AuthBootProvider>
    <PrivyIsland appId={appId} config={config} />
    <PrivyBridgeProvider><PrivyAvatarSessionBridge>{children}</PrivyAvatarSessionBridge></PrivyBridgeProvider>
  </AuthBootProvider>;
}
