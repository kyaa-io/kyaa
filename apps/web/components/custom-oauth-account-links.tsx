"use client";

import { useLinkWithOAuth, useUser, type User } from "@privy-io/react-auth";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { AppLocale } from "@/i18n/locales";
import { customSocialCopy, customSocialName } from "@/i18n/catalogs/components__custom-social-auth";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { withOperationDeadline } from "@/features/reliability/client/request-deadline";
import { REGIONAL_SOCIAL_PROVIDERS, REGIONAL_SOCIAL_PROVIDER_IDS, isEnabledCustomOAuthProvider, type CustomOAuthPolicy, type CustomOAuthProvider } from "./privy-custom-oauth-policy";
import { FanAction } from "./fan-ui/fan-action";
import { useByUsSession } from "./byus-session-provider";
import styles from "./custom-social-auth.module.css";

const storageKey = "kyaa.custom-oauth-link";
function embeddedWallets(user: User): string {
  return user.linkedAccounts.filter((account) => account.type === "wallet" && account.chainType === "ethereum" && account.walletClientType === "privy")
    .map((account) => account.type === "wallet" ? account.address.toLowerCase() : "").sort().join(",");
}

export function CustomOAuthAccountLinks({ locale, visible, ...policy }: CustomOAuthPolicy & { locale: AppLocale; visible: boolean }) {
  const t = customSocialCopy(locale);
  const { ready, authenticated, user, logout } = useByUsAuth();
  const session = useByUsSession();
  const { refreshUser } = useUser();
  const { initOAuth, loading, state } = useLinkWithOAuth();
  const [result, setResult] = useState<"failed" | "done" | null>(null);
  const checked = useRef(false);
  const pending = useRef(false);
  const mounted = useRef(true);
  const identity = useRef({ id: user?.id, generation: 0 });
  useLayoutEffect(() => {
    if (identity.current.id !== user?.id) identity.current = { id: user?.id, generation: identity.current.generation + 1 };
  }, [user?.id]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  useEffect(() => {
    if (loading || state.status === "loading") { checked.current = false; return; }
    if (!ready || checked.current || state.status === "initial") return;
    checked.current = true;
    const owner = user?.id;
    const generation = identity.current.generation;
    const current = () => mounted.current && identity.current.id === owner && identity.current.generation === generation;
    void (async () => {
      try {
        const raw = sessionStorage.getItem(storageKey);
        sessionStorage.removeItem(storageKey);
        if (!raw) return;
        const expected = JSON.parse(raw) as { userId?: unknown; wallets?: unknown; provider?: unknown; startedAt?: unknown };
        if (state.status === "error") throw new Error("OAuth linking failed");
        if (!current()) return;
        if (expected.userId !== owner) throw new Error("OAuth link owner changed");
        if (!authenticated || !user || typeof expected.userId !== "string" || typeof expected.wallets !== "string"
          || typeof expected.provider !== "string" || !isEnabledCustomOAuthProvider(expected.provider, policy)
          || typeof expected.startedAt !== "number" || Date.now() - expected.startedAt > 600_000
          || expected.startedAt > Date.now() || expected.userId !== user.id || expected.wallets !== embeddedWallets(user)) {
          if (!current()) return;
          session.resetTransition();
          if (!current()) return;
          await logout();
          if (!current()) return;
          throw new Error("OAuth link identity changed");
        }
        const refreshed = await withOperationDeadline(refreshUser(), 30_000);
        if (!current()) return;
        if (!refreshed || refreshed.id !== expected.userId || embeddedWallets(refreshed) !== expected.wallets) {
          if (!current()) return;
          session.resetTransition();
          if (!current()) return;
          await logout();
          if (!current()) return;
          throw new Error("OAuth link identity changed");
        }
        if (!refreshed.linkedAccounts.some((account) => account.type === REGIONAL_SOCIAL_PROVIDERS[expected.provider as CustomOAuthProvider].accountType)) throw new Error("OAuth account missing");
        if (current()) setResult("done");
      } catch {
        if (current()) setResult("failed");
      }
    })();
  }, [authenticated, loading, logout, policy, ready, refreshUser, session, state.status, user]);

  const link = useCallback(async (provider: CustomOAuthProvider) => {
    if (pending.current || !ready || !authenticated || !user || !embeddedWallets(user)) return;
    pending.current = true;
    setResult(null);
    const owner = user.id;
    const generation = identity.current.generation;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({ userId: user.id, wallets: embeddedWallets(user), provider, startedAt: Date.now() }));
      await withOperationDeadline(initOAuth({ provider }), 30_000);
    } catch {
      if (!mounted.current || identity.current.id !== owner || identity.current.generation !== generation) return;
      sessionStorage.removeItem(storageKey);
      setResult("failed");
    } finally {
      pending.current = false;
    }
  }, [authenticated, initOAuth, ready, user]);

  return <section className={styles.accounts} hidden={!visible} aria-labelledby="custom-login-accounts-heading">
    <h3 id="custom-login-accounts-heading">{t.linkTitle}</h3>
    {REGIONAL_SOCIAL_PROVIDER_IDS.filter((provider) => isEnabledCustomOAuthProvider(provider, policy)).map((provider) => {
      const linked = user?.linkedAccounts.some((account) => account.type === REGIONAL_SOCIAL_PROVIDERS[provider].accountType);
      return <FanAction key={provider} type="button" variant="neutral"
        disabled={!ready || !authenticated || loading || linked || !user || !embeddedWallets(user)} aria-busy={loading}
        onClick={() => void link(provider)}>{(linked ? t.linked : t.link).replace("{0}", customSocialName(provider, locale))}</FanAction>;
    })}
    {result && <p role={result === "failed" ? "alert" : "status"}>{result === "failed" ? t.linkFailed : t.linkedSuccess}</p>}
  </section>;
}
