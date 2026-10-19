"use client";

import { usePrivy } from "@privy-io/react-auth";
import type { Route } from "next";
import { Check, ArrowRight, ShieldCheck } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useByUsSession } from "@/components/byus-session-provider";
import { usePageLocale } from "@/components/locale-provider";
import { appendLoginContext } from "@/components/login-intent";
import { FocusFlowFrame } from "@/components/fan-shell/focus-flow-frame";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanSurface } from "@/components/fan-ui/fan-surface";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import type { AppLocale } from "@/i18n/locales";
import { withRequestDeadline } from "@/features/reliability/client/request-deadline";
import { normalizeParticipationCode, participationInputSchema, participationNameSchema, participationResponseSchema } from "./kyaa-wave-participation";
import { participationCopy } from "./kyaa-wave-participation-copy";
import styles from "./kyaa-wave-participation-screen.module.css";

type Receipt = { id: string; createdAt: string };
const endpoint = "/api/kyaa-wave/participation";

export function KyaaWaveParticipationScreen() {
  const auth = usePrivy(), session = useByUsSession(), locale = usePageLocale();
  const params = useSearchParams();
  const initialCode = params.getAll("code").length === 1 ? params.get("code") ?? "" : "";
  const [code, setCode] = useState(initialCode.slice(0, 80));
  const restored = auth.ready && session.ready && (!auth.authenticated || !!auth.user?.id && (!session.ownerId || session.ownerId === auth.user.id));
  const identity = `${auth.authenticated}:${auth.user?.id}:${session.ownerId}:${session.generation}:${restored}`;
  return <FocusFlowFrame locale={locale} mainId="participation-main">
    <main id="participation-main" className={styles.main}>
      <div className={styles.program}><span>kyaa wave</span><span>2026.10.22</span></div>
      <Participation key={identity} {...{ locale, code, setCode, restored }} authenticated={auth.authenticated}
        getAccessToken={auth.getAccessToken} autoLogin={!!initialCode} />
    </main>
  </FocusFlowFrame>;
}

function Participation({ locale, code, setCode, restored, authenticated, getAccessToken, autoLogin }: {
  locale: AppLocale; code: string; setCode: (value: string) => void; restored: boolean;
  authenticated: boolean; autoLogin: boolean; getAccessToken: () => Promise<string | null>;
}) {
  const t = participationCopy[locale];
  const router = useRouter();
  const [stage, setStage] = useState<"loading" | "load-error" | "confirm" | "name" | "done">("loading");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  const alive = useRef(false), busy = useRef(false);
  const submission = useRef<{ payload: string; key: string } | null>(null);
  const heading = useRef<HTMLDivElement>(null);
  const controller = useRef<AbortController | null>(null);
  useLayoutEffect(() => {
    alive.current = true;
    return () => { alive.current = false; controller.current?.abort(); };
  }, []);
  useEffect(() => {
    if (stage === "name" || stage === "done") heading.current?.focus();
  }, [stage]);
  useEffect(() => {
    if (!restored || !authenticated) return;
    const request = new AbortController();
    controller.current = request;
    setStage("loading"); setError(null);
    void withRequestDeadline(async signal => {
      const token = await getAccessToken();
      signal.throwIfAborted();
      if (!token) throw new Error("AUTH_REQUIRED");
      const response = await fetch(endpoint, { headers: { authorization: `Bearer ${token}` }, cache: "no-store", signal });
      if (!response.ok) throw new Error("UNAVAILABLE");
      return participationResponseSchema.parse(await response.json());
    }, { signal: request.signal }).then(result => {
      if (request.signal.aborted || !alive.current) return;
      setReceipt(result.participation); setStage(result.participation ? "done" : "confirm");
    }).catch(() => { if (!request.signal.aborted && alive.current) { setError(t.unavailable); setStage("load-error"); } });
    return () => request.abort();
  }, [authenticated, restored, getAccessToken, revision, t.unavailable]);

  const normalizedCode = normalizeParticipationCode(code);
  const returnTo = `/connect/kyaa-wave/participate?${new URLSearchParams({ ...(normalizedCode ? { code: normalizedCode } : {}), locale })}`;
  const login = appendLoginContext("/login", { returnTo, locale, intent: null, entity: null }) as Route;
  useEffect(() => {
    if (restored && !authenticated && autoLogin) router.replace(login);
  }, [restored, authenticated, autoLogin, router, login]);
  const codeField = <div className={styles.field}>
    <label htmlFor="participation-code">{t.code}</label>
    <input id="participation-code" value={code} onChange={event => setCode(event.target.value)} maxLength={80}
      autoCapitalize="characters" autoCorrect="off" spellCheck={false} autoComplete="off" aria-describedby="participation-code-help participation-error"
      aria-invalid={error === t.invalidCode} disabled={saving} />
    <p id="participation-code-help" className={styles.meta}>{t.codeHelp}</p>
  </div>;
  const submit = async () => {
    if (busy.current || !restored || !authenticated) return;
    const validName = participationNameSchema.safeParse(name);
    if (!validName.success) { setError(t.invalidName); return; }
    if (!participationInputSchema.shape.code.safeParse(code).success) { setError(t.invalidCode); return; }
    const payload = JSON.stringify({ code: normalizedCode, name: validName.data });
    if (submission.current?.payload !== payload) submission.current = { payload, key: crypto.randomUUID() };
    const key = submission.current.key;
    busy.current = true; setSaving(true); setError(null);
    const request = new AbortController(); controller.current = request;
    try {
      const { response, body } = await withRequestDeadline(async signal => {
        const token = await getAccessToken();
        signal.throwIfAborted();
        if (!token) throw new Error("AUTH_REQUIRED");
        const response = await fetch(endpoint, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "Idempotency-Key": key }, body: payload, cache: "no-store", signal });
        return { response, body: await response.json() };
      }, { signal: request.signal });
      if (!alive.current || request.signal.aborted) return;
      if (!response.ok) {
        const code = body?.error?.code;
        setError(response.status === 401 || response.status === 403 ? t.auth
          : code === "PARTICIPATION_CODE_INVALID" ? t.invalidCode
            : code === "PARTICIPATION_INVALID" ? t.invalidName
              : code === "PARTICIPATION_CLOSED" ? t.closed
                : code === "PARTICIPATION_RATE_LIMITED" ? t.limited : t.unavailable);
        return;
      }
      const result = participationResponseSchema.parse(body);
      if (!result.participation) throw new Error("UNAVAILABLE");
      setReceipt(result.participation); setName(""); submission.current = null; setStage("done");
    } catch {
      if (alive.current && !request.signal.aborted) setError(t.unavailable);
    } finally { if (alive.current) { busy.current = false; setSaving(false); } }
  };
  const loading = !restored || authenticated && stage === "loading";
  const title = loading ? t.title : !authenticated ? t.title : stage === "done" ? t.done : stage === "name" ? t.nameTitle : stage === "load-error" ? t.title : t.confirm;
  return <FanSurface className={styles.card} aria-labelledby="participation-heading">
    <div className={styles.icon} aria-hidden="true">{stage === "done" ? <Check /> : <ShieldCheck />}</div>
    <p className={styles.eyebrow}>kyaa wave</p>
    <div ref={heading} tabIndex={-1} className={styles.heading}><FanHeading as="h1" id="participation-heading">{title}</FanHeading></div>
    {loading ? <p role="status">{t.loading}</p> : !authenticated ? <>
      <p>{t.intro}</p>{autoLogin ? <FanAction href={login} variant="primary" fullWidth trailingIcon={<ArrowRight />}>{t.login}</FanAction>
        : <form className={styles.form} onSubmit={event => { event.preventDefault(); if (!participationInputSchema.shape.code.safeParse(code).success) { setError(t.invalidCode); return; } router.replace(login); }}>{codeField}<FanAction type="submit" variant="primary" fullWidth trailingIcon={<ArrowRight />}>{t.login}</FanAction></form>}
    </> : stage === "load-error" ? <FanAction variant="primary" fullWidth onClick={() => setRevision(value => value + 1)}>{t.retry}</FanAction>
      : stage === "confirm" ? <><p>{t.privacy}</p><FanAction variant="primary" fullWidth onClick={() => setStage("name")}>{t.start}</FanAction></>
        : stage === "name" ? <form onSubmit={event => { event.preventDefault(); void submit(); }} className={styles.form}>
          <div className={styles.field}><label htmlFor="participation-name">{t.name}</label>
            <input id="participation-name" name="name" autoComplete="name" value={name} onChange={event => setName(event.target.value)} maxLength={160}
              disabled={saving} aria-describedby="participation-privacy participation-error" aria-invalid={error === t.invalidName} />
            <p id="participation-privacy" className={styles.privacy}>{t.privacy}</p></div>
          {codeField}
          <FanAction type="submit" variant="primary" fullWidth disabled={saving} ariaBusy={saving}>{saving ? t.saving : t.save}</FanAction>
        </form> : <>
          <p>{t.doneHelp}</p>
          {receipt && <div className={styles.receipt}><span>{t.receipt}</span><time dateTime={receipt.createdAt}>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" }).format(new Date(receipt.createdAt))} · KST</time></div>}
          <FanAction href={`/?locale=${locale}`} variant="primary" fullWidth>{t.home}</FanAction>
        </>}
    <div id="participation-error">{error && <p role="alert" className={styles.error}>{error}</p>}</div>
  </FanSurface>;
}
