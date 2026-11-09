"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "@/components/icons";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { AccessibleOverlay } from "@/components/ui/overlay/accessible-overlay";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { messages } from "@/i18n/catalogs/features__profile__ui__settings-screen";
import { translate } from "@/i18n/messages";
import type { FanLocale } from "@/components/fan-shell/fan-app-shell";
import styles from "./my-logout.module.css";

function logoutCopy(locale: FanLocale) {
  if (locale === "ko") return { logout: "로그아웃", loggingOut: "로그아웃 중…", failed: "로그아웃하지 못했어요. 다시 시도해 주세요.", cancel: "취소" };
  return {
    logout: translate(locale, messages.m8763f7e0a9f2, "Log out"),
    loggingOut: translate(locale, messages.m758bda62aa11, "Logging out…"),
    failed: translate(locale, messages.m8a916681ec62, "Could not log out. Please try again."),
    cancel: translate(locale, messages.m135463f232a4, "Cancel"),
  };
}

/** The last row of MY: logout behind one confirmation, using the same session logout as Settings. */
export function MyLogout({ locale }: { locale: FanLocale }) {
  const { logout } = useByUsAuth();
  const router = useRouter();
  const t = logoutCopy(locale);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);

  async function signOut() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await logout();
      router.replace(`/login?locale=${locale}`);
    } catch {
      pending.current = false;
      setBusy(false);
      setError(t.failed);
    }
  }

  return <div className={styles.logout}>
    <FanAction variant="text" className={styles.row} onClick={() => setConfirming(true)}><span className={styles.rowLabel}><LogOut strokeWidth={1.5}/>{t.logout}</span></FanAction>
    {confirming ? <AccessibleOverlay open onClose={() => { if (!pending.current) { setConfirming(false); setError(""); } }} labelledBy="my-logout-title" busy={busy} backdropClassName={styles.backdrop} contentClassName={styles.dialog} contentAs="section">
      <div className={styles.title}><FanHeading id="my-logout-title">{t.logout}</FanHeading></div>
      {error ? <p role="alert">{error}</p> : null}
      <div className={styles.actions}>
        <FanAction variant="neutral" disabled={busy} onClick={() => { setConfirming(false); setError(""); }}>{t.cancel}</FanAction>
        <FanAction variant="primary" disabled={busy} ariaBusy={busy} onClick={() => void signOut()}>{busy ? t.loggingOut : t.logout}</FanAction>
      </div>
    </AccessibleOverlay> : null}
  </div>;
}
