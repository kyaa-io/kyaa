"use client";
import { useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { untypedRouter } from "@/lib/navigation/untyped";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanDialog } from "@/components/fan-ui/fan-dialog";
import { FanText } from "@/components/fan-ui/fan-text";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { beginAccountSwitch, clearAccountSwitch } from "@/features/auth/client/account-switch";
import { accountSwitchCopy } from "@/features/auth/client/account-switch-copy";
import { useAccountSwitchRelease } from "@/features/auth/client/account-switch-release";
import { logoutCopy } from "@/features/my/ui/my-logout";
import type { AppLocale } from "@/i18n/locales";
import styles from "./account-switch-dialog.module.css";

/** Step 1 of the account switch: confirm, sign out of the current account, then the normal login page. Cancel leaves everything as it was. */
export function AccountSwitchDialog({ locale, avatar, name, path, onClose }: { locale: AppLocale; avatar: ReactNode; name: string; path: string; onClose: () => void }) {
  const { logout, user } = useByUsAuth();
  const router = useRouter();
  const t = accountSwitchCopy(locale), out = logoutCopy(locale);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const pending = useRef(false);

  async function switchAccount() {
    if (pending.current || !user) return;
    pending.current = true;
    setBusy(true);
    setError("");
    const returnTo = beginAccountSwitch(user.id, path, locale);
    try {
      await logout();
      untypedRouter(router).replace(`/login?${new URLSearchParams({ locale, returnTo })}`);
    } catch {
      clearAccountSwitch();
      pending.current = false;
      setBusy(false);
      setError(out.failed);
    }
  }

  return <FanDialog open responsive size="sm" title={t.switchAccount} closeLabel={out.cancel}
    onOpenChange={open => { if (!open && !pending.current) onClose(); }}
    secondary={{ label: out.cancel, onClick: onClose, disabled: busy }}
    primary={{ label: t.otherAccount, onClick: () => void switchAccount(), loading: busy, navigates: true }}>
    <div className={styles.body}>
      <div className={styles.current} data-account-switch="current">
        {avatar}
        <span className={styles.who}><FanText role="item" dir="auto" className={styles.name}>{name}</FanText><FanText role="meta">{t.current}</FanText></span>
      </div>
      <FanText role="meta" as="p">{t.signsOut}</FanText>
      {error ? <FanText role="meta" as="p" className={styles.error}><span role="alert">{error}</span></FanText> : null}
    </div>
  </FanDialog>;
}

export function AccountSwitchSettingsRow({ locale, avatar, name }: { locale: AppLocale; avatar: ReactNode; name: string }) {
  const [open, setOpen] = useState(false);
  const enabled = useAccountSwitchRelease();
  const pathname = usePathname() || "/", query = useSearchParams()?.toString();
  if (!enabled) return null;
  return <>
    <FanAction variant="text" onClick={() => setOpen(true)}>{accountSwitchCopy(locale).switchAccount}</FanAction>
    {open ? <AccountSwitchDialog locale={locale} avatar={avatar} name={name} path={`${pathname}${query ? `?${query}` : ""}`} onClose={() => setOpen(false)} /> : null}
  </>;
}
