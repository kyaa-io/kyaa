"use client";
import { Fragment, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "@/components/icons";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { AccessibleOverlay } from "@/components/ui/overlay/accessible-overlay";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { messages } from "@/i18n/catalogs/features__profile__ui__settings-screen";
import { translate } from "@/i18n/messages";
import type { FanLocale } from "@/components/fan-shell/fan-app-shell";
import dialogStyles from "@/components/fan-ui/fan-dialog.module.css";
import { ChevronRight } from "@/components/fan-ui/fan-icons";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import shortcutStyles from "./my-shortcuts.module.css";
import styles from "./my-logout.module.css";

/** 바로가기 안 로그아웃 칸의 그림(다른 칸과 같은 3D 계열). */
const LOGOUT_ART = "/images/my/shortcuts/logout.webp";

export function logoutCopy(locale: FanLocale) {
  if (locale === "ko") return { logout: "로그아웃", loggingOut: "로그아웃 중…", failed: "로그아웃하지 못했어요. 다시 시도해 주세요.", cancel: "취소" };
  return {
    logout: translate(locale, messages.m8763f7e0a9f2, "Log out"),
    loggingOut: translate(locale, messages.m758bda62aa11, "Logging out…"),
    failed: translate(locale, messages.m8a916681ec62, "Could not log out. Please try again."),
    cancel: translate(locale, messages.m135463f232a4, "Cancel"),
  };
}

/** Logout behind one confirmation, using the same session logout as Settings. Shared by MY and the header account menu.
 * The confirm button counts as a navigation for the overlay (data-overlay-navigates): logging out unmounts the page, and the overlay must not history.back() over the pending /login. */
export function LogoutConfirmDialog({ locale, onClose }: { locale: FanLocale; onClose: () => void }) {
  const { logout } = useByUsAuth();
  const router = useRouter();
  const t = logoutCopy(locale);
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

  return <AccessibleOverlay open onClose={() => { if (!pending.current) onClose(); }} labelledBy="my-logout-title" busy={busy} backdropClassName={`${dialogStyles.backdrop} ${dialogStyles.backdropCenter}`} contentClassName={`${dialogStyles.panel} ${dialogStyles.dialog} ${dialogStyles["size-sm"]} ${styles.dialog}`} contentAs="section">
    <div className={styles.title}><FanHeading id="my-logout-title">{t.logout}</FanHeading></div>
    {error ? <p role="alert">{error}</p> : null}
    <div className={styles.actions}>
      <FanAction variant="neutral" disabled={busy} onClick={onClose}>{t.cancel}</FanAction>
      <span className={styles.confirm} data-overlay-navigates=""><FanAction variant="primary" fullWidth disabled={busy} ariaBusy={busy} onClick={() => void signOut()}>{busy ? t.loggingOut : t.logout}</FanAction></span>
    </div>
  </AccessibleOverlay>;
}

/** The last row of MY: logout behind one confirmation. */
export function MyLogout({ locale, shortcut = false }: { locale: FanLocale; shortcut?: boolean }) {
  const t = logoutCopy(locale);
  const [confirming, setConfirming] = useState(false);

  const trigger = shortcut
    ? <FanAction variant="text" className={shortcutStyles.row} leadingIcon={<img src={LOGOUT_ART} alt="" width={40} height={40} loading="lazy" decoding="async" />} trailingIcon={<FanIcon icon={ChevronRight} size={20} />} onClick={() => setConfirming(true)}>{t.logout}</FanAction>
    : <FanAction variant="text" className={styles.row} onClick={() => setConfirming(true)}><span className={styles.rowLabel}><LogOut strokeWidth={1.5}/>{t.logout}</span></FanAction>;
  const Wrapper = shortcut ? Fragment : "div";
  return <Wrapper {...(shortcut ? {} : { className: styles.logout })}>
    {trigger}
    {confirming ? <LogoutConfirmDialog locale={locale} onClose={() => setConfirming(false)} /> : null}
  </Wrapper>;
}
