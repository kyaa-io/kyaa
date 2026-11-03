"use client";

import { useLinkEmail, useUser } from "@privy-io/react-auth";
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import type { AppLocale } from "@/i18n/locales";
import { customSocialCopy } from "@/i18n/catalogs/components__custom-social-auth";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { withOperationDeadline } from "@/features/reliability/client/request-deadline";
import { FanAction } from "./fan-ui/fan-action";
import styles from "./custom-social-auth.module.css";

export function CustomOAuthEmailLink({ locale, userId, onComplete, onCancel }: { locale: AppLocale; userId: string; onComplete(): void; onCancel?(): void }) {
  const t = customSocialCopy(locale);
  const { user } = useByUsAuth();
  const { refreshUser } = useUser();
  const { sendCode, linkWithCode } = useLinkEmail();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const active = useRef(true);
  const identity = useRef(user?.id);
  const busy = useRef(false);
  useLayoutEffect(() => { identity.current = user?.id; }, [user?.id]);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const current = () => active.current && identity.current === userId;

  async function submit(event: FormEvent, resend = false) {
    event.preventDefault();
    if (busy.current || !current()) return;
    busy.current = true;
    setPending(true);
    setFailed(false);
    try {
      if (!sent || resend) {
        await withOperationDeadline(sendCode({ email: email.trim() }), 30_000);
        if (!current()) return;
        setCode("");
        setSent(true);
      } else {
        const result = await withOperationDeadline(linkWithCode({ code: code.trim() }), 30_000);
        if (!current() || result.user.id !== userId) throw new Error("Email link identity changed");
        const refreshed = await withOperationDeadline(refreshUser(), 30_000);
        if (!current() || refreshed?.id !== userId) throw new Error("Email link identity changed");
        onComplete();
      }
    } catch {
      if (current()) setFailed(true);
    } finally {
      busy.current = false;
      if (current()) setPending(false);
    }
  }

  return <form className={styles.form} onSubmit={(event) => void submit(event)} aria-busy={pending}>
    <h2>{t.title}</h2>
    <p id="custom-email-help">{t.help}</p>
    <label htmlFor="custom-email">{t.email}</label>
    <input id="custom-email" type="email" autoComplete="email" autoFocus required value={email} disabled={pending || sent}
      aria-describedby={`custom-email-help${failed ? " custom-email-error" : ""}`} aria-invalid={failed}
      onChange={(event) => setEmail(event.target.value)} />
    {sent && <><label htmlFor="custom-email-code">{t.code}</label>
      <input id="custom-email-code" autoComplete="one-time-code" inputMode="numeric" required maxLength={6} pattern="[0-9]{6}"
        value={code} disabled={pending} autoFocus aria-invalid={failed} aria-describedby={failed ? "custom-email-error" : undefined}
        onChange={(event) => setCode(event.target.value)} /></>}
    {failed && <p id="custom-email-error" role="alert">{t.failed}</p>}
    <FanAction type="submit" disabled={pending}>{sent ? t.verify : t.send}</FanAction>
    {sent && <>
      <FanAction type="button" variant="neutral" disabled={pending} onClick={(event) => void submit(event, true)}>{t.resend}</FanAction>
      <FanAction type="button" variant="neutral" disabled={pending} onClick={() => { setSent(false); setCode(""); setFailed(false); }}>{t.changeEmail}</FanAction>
    </>}
    {onCancel && <FanAction type="button" variant="neutral" disabled={pending} onClick={onCancel}>{t.existingLogin}</FanAction>}
  </form>;
}
