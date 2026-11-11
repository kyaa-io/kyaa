"use client";
import { useRef, useState, type FormEvent } from "react";
import type { AppLocale } from "@/i18n/locales";
import { emailLoginCopy } from "@/i18n/catalogs/components__email-login";
import { withRequestDeadline } from "@/features/reliability/client/request-deadline";
import { FanText } from "./fan-ui/fan-text";
import { FanAction } from "./fan-ui/fan-action";
import styles from "./login-page.module.css";

export function EmailLoginForm({ locale, disabled }: { locale: AppLocale; disabled: boolean }) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [failed, setFailed] = useState(false);
  const pending = useRef(false);
  const [continuation, email, password, submit, submitting, error] = emailLoginCopy(locale);
  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || disabled) return;
    pending.current = true; setBusy(true); setFailed(false);
    const fields = new FormData(event.currentTarget);
    try {
      const response = await withRequestDeadline(signal => fetch("/api/auth/email/web-login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: fields.get("email"), password: fields.get("password"), locale }), signal }));
      if (!response.ok) throw new Error("Sign in failed");
      window.location.reload();
    } catch { setFailed(true); }
    finally { pending.current = false; setBusy(false); }
  }
  return <div className={styles.otherMethods}>
    <FanAction type="button" variant="secondary" disabled={disabled || busy} aria-expanded={open} aria-controls="email-login-form" onClick={() => setOpen(!open)}>{continuation}</FanAction>
    {open && <form id="email-login-form" className={styles.emailForm} onSubmit={signIn}>
      <label><FanText role="body">{email}</FanText><input name="email" type="email" autoComplete="username" required maxLength={254} disabled={busy || disabled} /></label>
      <label><FanText role="body">{password}</FanText><input name="password" type="password" autoComplete="current-password" required maxLength={1024} disabled={busy || disabled} /></label>
      {failed && <p className={styles.error} role="alert">{error}</p>}
      <FanAction variant="primary" type="submit" disabled={busy || disabled} ariaBusy={busy}>{busy ? submitting : submit}</FanAction>
    </form>}
  </div>;
}
