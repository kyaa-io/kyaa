"use client";
// Privy sign-in for AUTH_PROVIDER=privy (PRIVY-RESTORE-1115). auth-root.tsx loads this file as its own chunk only in
// privy mode, so Cognito pages never download Privy. PrivyProvider holds only the island mirrors beside the page
// (the 57c922b24 island); the page reads Privy through PrivyBridgeContext, which useByUsAuth() turns into ByUsAuth.
import { useCallback, useEffect, useState, useMemo, useRef, type ReactNode } from "react";
import type { PrivyClientConfig } from "@privy-io/react-auth";
import { useAppLocale } from "@/components/locale-provider";
import type { ByUsAuth } from "./auth-fallback";
import { openLoginPage } from "./open-login-page";
import { AuthBootProvider, useCreateWallet, useLogin, useLoginWithOAuth, usePrivy, useUser } from "./privy-backend.island";
import { PrivyBridgeContext, type PrivyBridge, type PrivyOAuthListener } from "./privy-bridge";
import { PrivyMirrors } from "./privy-mirrors";
import { PrivyAvatarSessionBridge } from "./privy-avatar-session-bridge";
import { IslandPrivyProvider } from "@/features/auth/client/privy-provider-boundary"; // exact name: the island Vitest project swaps it
import { PRIVY_APP_ID_REQUIRED, privyProviderConfig } from "./privy-provider-config";

import { clearFanSession, FAN_SESSION_BEARER, readFanSessionHint } from "./fan-session";
import { FanSessionKeeper } from "./fan-session-keeper";

/** PrivyProvider with the mirrors only. Exported for the island test root. */
export function PrivyIsland({ appId, config }: { appId: string; config: PrivyClientConfig }) {
  return <IslandPrivyProvider appId={appId} config={config}><PrivyMirrors /></IslandPrivyProvider>;
}

// Privy's public app settings (the same call the SDK makes) tell whether email sign-in is switched on in its dashboard.
const emailSettingByApp = new Map<string, Promise<boolean>>();
function privyEmailEnabled(appId: string): Promise<boolean> {
  let setting = emailSettingByApp.get(appId);
  if (!setting) {
    setting = fetch(`https://auth.privy.io/api/v1/apps/${encodeURIComponent(appId)}`, { headers: { "privy-app-id": appId } })
      .then((response) => response.ok ? response.json() as Promise<{ email_auth?: unknown }> : null)
      .then((settings) => settings?.email_auth === true)
      .catch(() => false);
    emailSettingByApp.set(appId, setting);
  }
  return setting;
}

function PrivyBridgeProvider({ appId, children }: { appId: string; children: ReactNode }) {
  const privy = usePrivy();
  const { refreshUser } = useUser();
  const { createWallet } = useCreateWallet();
  const { login } = useLogin();
  const listeners = useRef(new Set<PrivyOAuthListener>());
  const { initOAuth, loading: oauthLoading } = useLoginWithOAuth({
    onComplete: ({ user }) => { for (const listener of [...listeners.current]) listener.onComplete(user.id); },
    onError: (code) => {
      const reason = code === "exited_auth_flow" || code === "oauth_user_denied" ? "cancelled" : "provider_error";
      for (const listener of [...listeners.current]) listener.onError(reason);
    },
  });
  const subscribeOAuth = useCallback((listener: PrivyOAuthListener) => {
    listeners.current.add(listener);
    return () => { listeners.current.delete(listener); };
  }, []);
  const { ready, authenticated, user, getAccessToken, logout } = privy;
  const userId = authenticated ? user?.id ?? null : null;
  const linkedAccounts = user?.linkedAccounts;
  const authUser = useMemo(() => userId ? { id: userId, linkedAccounts: linkedAccounts ?? [] } : null, [linkedAccounts, userId]);
  const [, setHintRevision] = useState(0);
  useEffect(() => {
    const changed = () => setHintRevision((value) => value + 1);
    window.addEventListener("kyaa:fan-session-changed", changed);
    window.addEventListener("storage", changed);
    return () => { window.removeEventListener("kyaa:fan-session-changed", changed); window.removeEventListener("storage", changed); };
  }, []);
  const hasSession = Boolean(userId && readFanSessionHint()?.pid === userId);
  const fanToken = useCallback(async () => userId && readFanSessionHint()?.pid === userId ? FAN_SESSION_BEARER : getAccessToken(), [getAccessToken, userId]);
  const signOut = useCallback(async () => { await clearFanSession(); await logout(); }, [logout]);
  const auth = useMemo<ByUsAuth>(() => ({ ready, authenticated, user: authUser, getPrivyAccessToken: getAccessToken, getAccessToken: hasSession ? fanToken : getAccessToken, logout: signOut, login: openLoginPage }), [authUser, authenticated, fanToken, getAccessToken, hasSession, signOut, ready]);
  const value = useMemo<PrivyBridge>(() => ({
    auth,
    oauthLoading,
    startOAuth: (provider) => initOAuth({ provider }).then(() => undefined),
    subscribeOAuth,
    emailLoginAvailable: () => privyEmailEnabled(appId),
    openEmailLogin: () => login({ loginMethods: ["email"] }),
    openGoogleLogin: () => login({ loginMethods: ["google"] }),
    refreshUser: () => refreshUser(),
    createWallet: () => Promise.resolve(createWallet({ createAdditional: false })),
  }), [appId, auth, createWallet, initOAuth, login, oauthLoading, refreshUser, subscribeOAuth]);
  return <PrivyBridgeContext.Provider value={value}><FanSessionKeeper ownerId={userId} getPrivyAccessToken={getAccessToken} onAccountUnavailable={signOut} />{children}</PrivyBridgeContext.Provider>;
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
    <PrivyBridgeProvider appId={appId}><PrivyAvatarSessionBridge>{children}</PrivyAvatarSessionBridge></PrivyBridgeProvider>
  </AuthBootProvider>;
}
