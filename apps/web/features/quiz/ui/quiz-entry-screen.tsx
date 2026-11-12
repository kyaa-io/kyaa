"use client";

import { toContentLocale } from "@/i18n/locales";
import { messages as localizedMessages } from "@/i18n/catalogs/features__quiz__ui__quiz-entry-screen";
import { messages as certificationPanelMessages } from "@/i18n/catalogs/features__certification__ui__certification-panel";
import { messages as quizResultMessages } from "@/i18n/catalogs/features__quiz__ui__quiz-result-screen";
import { messages as passportScreenMessages } from "@/i18n/catalogs/features__passport__ui__passport-screens";
import { additionalLocales, translate } from "@/i18n/messages";
import { creatorHomeHref } from "@/features/creator/domain/creator-navigation";
import { useOwnedFanResource } from "@/components/fan-ui/use-owned-fan-resource";
import { mySummaryPath, mySummarySchema } from "@/features/my/domain/my-summary";

import { getSessionStorage } from "@/features/reliability/client/session-storage";

import { useByUsAuth as usePrivy } from "@/features/auth/client/cognito-auth";
import { ArrowRight, Check, CircleAlert, RotateCcw, X } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { parseQuizStartProjection } from "../domain/quiz-attempt";
import { parsePublicQuizIntro, type PublicQuizIntro } from "../domain/quiz-intro";
import { appendLiveReturnTo, sanitizeLiveReturnTo } from "../domain/live-return-context";
import { certificationListHref, clearQuizCloseReturn, readQuizCloseReturn, rememberQuizFocusReturn, type QuizCloseReturn } from "../domain/quiz-close-return";
import { consumeAuthIntent, readAuthIntent } from "@/components/auth-intent";
import { AuthIntentLink } from "@/components/auth-intent-link";
import { FanLanguageSwitch } from "@/components/fan-shell/fan-language-switch";
import { FanAction, fanActionClassName } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanAppFrame, type FanLocale } from "@/components/fan-shell/fan-app-shell";
import { appendLoginContext, sanitizeAuthIntentId } from "@/components/login-intent";
import styles from "./quiz-entry-screen.module.css";
import { sendGa4Event } from "@/features/analytics/client/ga4-client";

type ScreenState =
  | { kind: "loading" }
  | { kind: "ready"; intro: PublicQuizIntro }
  | { kind: "error"; message: string };

type ApiErrorBody = { error?: { code?: string } };

class QuizEntryError extends Error {
  constructor(readonly code: string) { super(code); }
}

const copy = {
  ko: {
    sessionExpired: "로그인이 만료되었어요. 다시 로그인한 뒤 참여해 주세요.",
    unavailable: "현재 참여할 수 있는 팬 인증 퀴즈가 없어요.",
    loadError: "팬 인증 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
    loadingAria: "팬 인증 정보 불러오는 중",
    loading: "팬 인증을 준비하고 있어요.",
    errorTitle: "팬 인증을 준비하지 못했어요.",
    retry: "다시 시도",
    unavailableTitle: "아직 팬 인증 퀴즈가 준비되지 않았어요.",
    unavailableBody: (name: string) => `${name}의 새 팬 인증이 열리면 다시 참여해 주세요.`,
    fanPage: (name: string) => `${name} 팬페이지로 돌아가기`,
    listBack: "인증 목록",
    eyebrow: "팬 인증 · 시작 전",
    title: (name: string) => `${name}\n나의 팬심을 확인해 보세요.`,
    
    questionCount: (count: number) => `${count}문항`,
    passThreshold: (count: number) => `${count}문항 이상`,
    passThresholdTail: " 정답이면 인증 완료",
    
    authChecking: "로그인 확인 중…",
    profileChecking: "프로필 확인 중…",
    profileError: "프로필을 확인하지 못했어요.",
    profileAuthError: "로그인 상태를 확인하지 못했어요. 다시 로그인해 주세요.",
    profileNetworkError: "네트워크 연결을 확인하지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.",
    profileServerError: "서버에서 프로필을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
    close: "닫기",
    starting: "팬 인증 시작 중…",
    cooldown: "잠깐 숨 고르기! 1분 뒤 새 문제로 다시 만나요.",
    start: "팬 인증 시작하기",
    login: "로그인하고 시작하기",
    
    verified: (name: string) => `${name} 팬 인증 완료`,
    openPassport: "패스포트 보기",
  },
  en: {
    sessionExpired: "Your sign-in expired. Sign in again to continue.",
    unavailable: "This fan verification quiz is not available right now.",
    loadError: "We couldn't load fan verification. Please try again in a moment.",
    loadingAria: "Loading fan verification",
    loading: "Preparing fan verification.",
    errorTitle: "We couldn't prepare fan verification.",
    retry: "Try again",
    unavailableTitle: "The fan verification quiz isn't ready yet.",
    unavailableBody: (name: string) => `Come back when a new ${name} fan verification opens.`,
    fanPage: (name: string) => `Back to ${name} fan page`,
    listBack: "Verification",
    eyebrow: "Fan verification · Before you begin",
    title: (name: string) => `See how well you know\n${name}.`,
    
    questionCount: (count: number) => `${count} questions`,
    passThreshold: (count: number) => `At least ${count} correct`,
    passThresholdTail: " to pass",
    
    authChecking: "Checking sign-in…",
    profileChecking: "Checking profile…",
    profileError: "We couldn't check your profile.",
    profileAuthError: "We couldn't confirm your sign-in. Please sign in again.",
    profileNetworkError: "We couldn't reach the network. Check your connection and try again.",
    profileServerError: "The server couldn't load your profile. Please try again in a moment.",
    close: "Close",
    starting: "Starting fan verification…",
    cooldown: "Quick breather! Fresh questions will be ready in a minute.",
    start: "Start fan verification",
    login: "Sign in to start",
    
    verified: (name: string) => `${name} fan verification complete`,
    openPassport: "Open Passport",
  },

  ...additionalLocales((translationLocale) => ({
    sessionExpired: localizedMessages.m8583f735760a[translationLocale],
    unavailable: localizedMessages.m85e00c143995[translationLocale],
    loadError: localizedMessages.m465be069c2b9[translationLocale],
    loadingAria: localizedMessages.m15d50361234f[translationLocale],
    loading: localizedMessages.m2b3d0f29e8cf[translationLocale],
    errorTitle: localizedMessages.mcd6720ec3242[translationLocale],
    retry: localizedMessages.m8846c9245a30[translationLocale],
    unavailableTitle: localizedMessages.m7dca46965504[translationLocale],
    unavailableBody: (name: string) => translate(translationLocale, localizedMessages.m523e7646bd59, "Come back when a new {0} fan verification opens.", [name]),
    fanPage: (name: string) => translate(translationLocale, localizedMessages.m087490a6b525, "Back to {0} fan page", [name]),
    listBack: certificationPanelMessages.m5acaed52a19a[translationLocale],
    eyebrow: localizedMessages.m2ba7ff4d7753[translationLocale],
    title: (name: string) => translate(translationLocale, localizedMessages.m2342b08e5b5b, "See how well you know\n{0}.", [name]),
    
    questionCount: (count: number) => translate(translationLocale, localizedMessages.mbbfb2a916e4d, "{0} questions", [count]),
    passThreshold: (count: number) => translate(translationLocale, localizedMessages.mc9041df7d4b2, "At least {0} correct", [count]),
    passThresholdTail: localizedMessages.md55660c432ca[translationLocale],
    
    authChecking: localizedMessages.mfa2e863970e4[translationLocale],
    profileChecking: localizedMessages.m882f9ba49057[translationLocale],
    profileError: localizedMessages.m1db38cfc9edf[translationLocale],
    profileAuthError: localizedMessages.m1db38cfc9edf[translationLocale],
    profileNetworkError: localizedMessages.m1db38cfc9edf[translationLocale],
    profileServerError: localizedMessages.m1db38cfc9edf[translationLocale],
    close: localizedMessages.m20b3a9bcb62c[translationLocale],
    starting: localizedMessages.mbbde83d340ee[translationLocale],
    cooldown: localizedMessages.m3cbe55588a43[translationLocale],
    start: localizedMessages.mb8716a66fc57[translationLocale],
    login: localizedMessages.m1fccdbe4af58[translationLocale],
    
    verified: (name: string) => translate(translationLocale, quizResultMessages.m7309a3343f60, "{0} fan verification complete", [name]),
    openPassport: passportScreenMessages.mfc76989a61b9[translationLocale],
  }))
} as const;

const parseSummary = (body: unknown) => mySummarySchema.parse((body as { summary?: unknown } | null)?.summary);

function withLocale(path: string, locale: FanLocale): Route {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}locale=${locale}` as Route;
}

async function readJson(response: Response): Promise<unknown> {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new QuizEntryError((body as ApiErrorBody | null)?.error?.code ?? "QUIZ_UNAVAILABLE");
  }
  return body;
}

function errorMessage(error: unknown, locale: FanLocale): string {
  const t = copy[locale];
  if (error instanceof QuizEntryError) {
    if (error.code === "VERIFICATION_COOLDOWN") return t.cooldown;
    if (error.code === "UNAUTHENTICATED") return t.sessionExpired;
    if (error.code === "NOT_FOUND" || error.code === "QUIZ_UNAVAILABLE") return t.unavailable;
  }
  return t.loadError;
}

export function QuizEntryScreen({
  slug,
  locale,
  returnTo,
}: {
  slug: string;
  locale: FanLocale;
  returnTo?: string | null;
}) {
  const router = useRouter();
  const auth = usePrivy();
  const { ready, authenticated, getAccessToken } = auth;
  // BUGS-1846 T8: a fan who already holds this creator's passport sees "verified" with the passport, not the start dialog.
  const summary = useOwnedFanResource(authenticated ? mySummaryPath(toContentLocale(locale)) : null, parseSummary, auth);
  const heldPassportId = summary.state.status === "ready"
    ? summary.state.data.creators.find((creator) => creator.celebrity.slug === slug && creator.relationship === "passport")?.passport?.id ?? null
    : null;
  // Starting waits for the ownership read; a failed read falls back to the server start, which still answers "holder".
  const ownershipChecking = authenticated && summary.state.status === "loading";
  const [screen, setScreen] = useState<ScreenState>({ kind: "loading" });
  const [starting, setStarting] = useState(false);
  const [profileState, setProfileState] = useState<"idle" | "checking" | "complete" | "error">("idle");
  const [profileFailure, setProfileFailure] = useState<"auth" | "network" | "server">("server");
  const [profileAttempt, setProfileAttempt] = useState(0);
  const [startError, setStartError] = useState<string | null>(null);
  const requestGeneration = useRef(0);
  const resumedIntentRef = useRef<string | null>(null);
  const t = copy[locale];
  const liveReturnTo = sanitizeLiveReturnTo(returnTo);
  const entryQuery = new URLSearchParams({ locale });
  if (liveReturnTo) entryQuery.set("returnTo", liveReturnTo);
  const entrySourceQuery = `?${entryQuery.toString()}`;

  const loadIntro = useCallback(async () => {
    const generation = ++requestGeneration.current;
    setScreen({ kind: "loading" });
    try {
      const response = await fetch(`/api/public/celebrities/${encodeURIComponent(slug)}/quiz?locale=${toContentLocale(locale)}`, {
        method: "GET",
        cache: "no-store",
      });
      const body = await readJson(response) as { intro?: unknown };
      const intro = parsePublicQuizIntro(body.intro);
      if (generation === requestGeneration.current) setScreen({ kind: "ready", intro });
    } catch (error) {
      if (generation === requestGeneration.current) setScreen({ kind: "error", message: errorMessage(error, locale) });
    }
  }, [locale, slug]);

  useEffect(() => {
    void loadIntro();
    return () => { requestGeneration.current += 1; };
  }, [loadIntro]);

  useEffect(() => {
    if (!ready || !authenticated) {
      setProfileState("idle");
      return;
    }
    const controller = new AbortController();
    setProfileState("checking");
    void (async () => {
      try {
        const token = await getAccessToken();
        if (!token) throw new QuizEntryError("UNAUTHENTICATED");
        let response: Response;
        try {
          response = await fetch("/api/me/profile", {
            headers: { authorization: `Bearer ${token}` },
            cache: "no-store",
            signal: controller.signal,
          });
        } catch (cause) {
          if ((cause as Error).name === "AbortError") throw cause;
          throw new QuizEntryError("PROFILE_NETWORK");
        }
        const body = await response.json().catch(() => null) as { profile?: { completed?: boolean } } | null;
        if (response.status === 401 || response.status === 403) throw new QuizEntryError("UNAUTHENTICATED");
        if (!response.ok || !body?.profile) throw new QuizEntryError("PROFILE_UNAVAILABLE");
        if (body.profile.completed) {
          setProfileState("complete");
          return;
        }
        const current = new URLSearchParams(window.location.search);
        const authIntent = sanitizeAuthIntentId(current.get("authIntent"));
        const returnQuery = new URLSearchParams({ locale });
        for (const key of ["source", "sourceId", "reactionId"] as const) {
          for (const value of current.getAll(key)) returnQuery.append(key, value);
        }
        if (authIntent) returnQuery.set("authIntent", authIntent);
        if (liveReturnTo) returnQuery.set("returnTo", liveReturnTo);
        const returnTo = `/c/${slug}/verify?${returnQuery.toString()}`;
        router.replace(appendLoginContext("/onboarding/profile", {
          returnTo,
          intent: "passport",
          entity: slug,
          locale,
          authIntent,
        }) as Route);
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        const code = error instanceof QuizEntryError ? error.code : "";
        setProfileFailure(code === "UNAUTHENTICATED" ? "auth" : code === "PROFILE_NETWORK" ? "network" : "server");
        setProfileState("error");
      }
    })();
    return () => controller.abort();
  }, [authenticated, getAccessToken, liveReturnTo, locale, profileAttempt, ready, router, slug]);

  const start = useCallback(async () => {
    if (!ready || !authenticated || profileState !== "complete" || starting || ownershipChecking) return;
    if (heldPassportId) {
      // Same landing as the server's "holder" answer, without opening an attempt.
      const intent = readAuthIntent(getSessionStorage(), new URLSearchParams(window.location.search).get("authIntent"));
      if (intent?.actionType === "START_FAN_VERIFICATION" && intent.targetType === "celebrity" && intent.targetId === slug) {
        consumeAuthIntent(getSessionStorage(), intent.id);
      }
      router.push((liveReturnTo ?? withLocale(`/passports/${heldPassportId}`, locale)) as Route);
      return;
    }
    setStarting(true);
    setStartError(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new QuizEntryError("UNAUTHENTICATED");
      const current = new URLSearchParams(window.location.search);
      const attemptQuery = new URLSearchParams({ locale });
      for (const key of ["source", "sourceId", "reactionId"] as const) {
        for (const value of current.getAll(key)) attemptQuery.append(key, value);
      }
      const response = await fetch(`/api/celebrities/${encodeURIComponent(slug)}/quiz/attempts?${attemptQuery.toString()}`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const body = await readJson(response) as { result?: unknown };
      const result = parseQuizStartProjection(body.result);
      const intentId = new URLSearchParams(window.location.search).get("authIntent");
      const intent = readAuthIntent(getSessionStorage(), intentId);
      if (intent?.actionType === "START_FAN_VERIFICATION" && intent.targetType === "celebrity" && intent.targetId === slug) {
        consumeAuthIntent(getSessionStorage(), intent.id);
      }
      if (result.kind === "holder") {
        router.push((liveReturnTo ?? withLocale(`/passports/${result.passportId}`, locale)) as Route);
        return;
      }
      if (result.attempt.status === "open") sendGa4Event("fan_verification_start");
      if (result.attempt.status !== "open") {
        router.push(appendLiveReturnTo(
          withLocale(`/c/${slug}/verify/result?attempt=${result.attempt.id}`, locale),
          liveReturnTo,
        ) as Route);
        return;
      }
      router.push(appendLiveReturnTo(
        withLocale(`/c/${slug}/verify/questions?attempt=${result.attempt.id}`, locale),
        liveReturnTo,
      ) as Route);
    } catch (error) {
      setStartError(errorMessage(error, locale));
      setStarting(false);
    }
  }, [authenticated, getAccessToken, heldPassportId, liveReturnTo, locale, ownershipChecking, profileState, ready, router, slug, starting]);

  useEffect(() => {
    if (!authenticated || profileState !== "complete" || ownershipChecking || screen.kind !== "ready") return;
    if (!heldPassportId && screen.intro.quiz.availability !== "available") return;
    const intentId = new URLSearchParams(window.location.search).get("authIntent");
    if (!intentId || resumedIntentRef.current === intentId) return;
    const intent = readAuthIntent(getSessionStorage(), intentId);
    if (intent?.actionType !== "START_FAN_VERIFICATION" || intent.targetType !== "celebrity" || intent.targetId !== slug) return;
    resumedIntentRef.current = intentId;
    void start();
  }, [authenticated, heldPassportId, ownershipChecking, profileState, screen, slug, start]);

  const dialogRef = useRef<HTMLElement | null>(null);
  // A holder sees "verified" even when the quiz is closed or not offered.
  const dialogOpen = screen.kind === "ready" && (heldPassportId !== null || screen.intro.quiz.availability === "available");
  // Read on mount (kept through a reload). Closing always lands on the certification list this dialog belongs to; the remembered click only adds its exact URL and the card to focus.
  const [closeOrigin, setCloseOrigin] = useState<QuizCloseReturn | null>(null);
  useEffect(() => { setCloseOrigin(readQuizCloseReturn(getSessionStorage(), slug)); }, [slug]);
  const listHref = closeOrigin ? (closeOrigin.href.includes("locale=") ? closeOrigin.href : withLocale(closeOrigin.href, locale)) : certificationListHref(slug, locale);
  const closeDialog = useCallback(() => {
    // replace, so Back never re-opens this dialog.
    if (closeOrigin) rememberQuizFocusReturn(getSessionStorage(), slug, closeOrigin.itemId);
    clearQuizCloseReturn(getSessionStorage());
    router.replace(listHref as Route);
  }, [closeOrigin, listHref, router, slug]);
  // Before the intro arrives (or when it fails) there is no dialog to hold focus, so Esc closes from the page itself.
  useEffect(() => {
    if (dialogOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !event.defaultPrevented) closeDialog(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [closeDialog, dialogOpen]);
  useEffect(() => {
    if (!dialogOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => { previous?.focus?.(); };
  }, [dialogOpen]);
  const onDialogKeyDown = useCallback((event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") { event.stopPropagation(); closeDialog(); return; }
    if (event.key !== "Tab" || !dialogRef.current) return;
    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>("a[href],button:not([disabled])"));
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }, [closeDialog]);

  const topAligned = dialogOpen;

  return (
    <FanAppFrame locale={locale} mainId="fan-verification-intro-main">
      <main className={styles.page} id="fan-verification-intro-main" tabIndex={-1}>
      <div
        className={topAligned ? `${styles.shell} ${styles.shellTopAligned}` : styles.shell}
        data-content-alignment={topAligned ? "top" : "center"}
      >
        {screen.kind === "loading" && (
          <div className={styles.loading} role="status" aria-label={t.loadingAria}>
            <span /><span /><span />
          </div>
        )}
        {screen.kind === "error" && (
          <section className={styles.message} role="alert">
            <h1>{t.errorTitle}</h1><p>{screen.message}</p>
            <FanAction leadingIcon={<RotateCcw aria-hidden="true" />} onClick={() => void loadIntro()}>{t.retry}</FanAction>
            <Link className={styles.secondaryAction} href={listHref as Route}>{t.listBack}</Link>
          </section>
        )}
        {screen.kind === "ready" && !dialogOpen && (
          <section className={styles.message}>
            <h1>{t.unavailableTitle}</h1>
            <p>{t.unavailableBody(screen.intro.celebrity.name)}</p>
            <Link className={styles.secondaryAction} href={listHref as Route}>{t.listBack}</Link>
          </section>
        )}
        {screen.kind === "ready" && dialogOpen && (
          <div className={styles.backdrop} onClick={(event) => { if (event.target === event.currentTarget) closeDialog(); }}>
          <section ref={dialogRef} className={styles.entry} role="dialog" aria-modal="true" aria-labelledby="quiz-entry-heading" tabIndex={-1} onKeyDown={onDialogKeyDown}>
            <div className={styles.dialogActions}><FanLanguageSwitch locale={locale} compact /><button type="button" className={styles.closeButton} aria-label={t.close} onClick={closeDialog}><X aria-hidden="true" /></button></div>
            {heldPassportId ? (
              <header><FanHeading as="h1" id="quiz-entry-heading">{t.verified(screen.intro.celebrity.name)}</FanHeading></header>
            ) : <>
            <header>
              <p>{t.eyebrow}</p>
              <h1
                id="quiz-entry-heading"
                aria-label={t.title(screen.intro.celebrity.name).replace("\n", " ")}
              >
                {t.title(screen.intro.celebrity.name).split("\n").map((line, index) => (
                  <span key={line}>{index > 0 ? <br /> : null}{line}</span>
                ))}
              </h1>
            </header>
            <ul className={styles.facts}>
              <li><Check aria-hidden="true" /><span><strong>{t.questionCount(screen.intro.quiz.totalQuestions)}</strong></span></li>
              <li><Check aria-hidden="true" /><span><strong>{t.passThreshold(screen.intro.quiz.passThreshold)}</strong>{t.passThresholdTail}</span></li>
            </ul>
            </>}
            {!ready ? (
              <p className={styles.actionStatus} role="status">{t.authChecking}</p>
            ) : authenticated && profileState === "checking" ? (
              <p className={styles.actionStatus} role="status">{t.profileChecking}</p>
            ) : authenticated && profileState === "error" ? (
              <>
                <p className={styles.inlineError} role="alert"><CircleAlert aria-hidden="true" />{profileFailure === "auth" ? t.profileAuthError : profileFailure === "network" ? t.profileNetworkError : t.profileServerError}</p>
                <FanAction className={styles.entryAction} leadingIcon={<RotateCcw aria-hidden="true" />} onClick={() => setProfileAttempt((value) => value + 1)}>{t.retry}</FanAction>
              </>
            ) : authenticated ? (
              <FanAction className={styles.entryAction} variant="primary" trailingIcon={<ArrowRight />}
                {...(heldPassportId
                  ? { href: withLocale(`/passports/${heldPassportId}`, locale) }
                  : { disabled: starting || ownershipChecking, ariaBusy: starting || ownershipChecking, onClick: () => void start() })}>
                {heldPassportId ? t.openPassport : starting ? t.starting : t.start}
              </FanAction>
            ) : (
              <AuthIntentLink className={fanActionClassName("primary", { className: styles.entryAction })} emphasis="primary" locale={locale} input={{ sourcePath: `/c/${slug}/verify`, sourceQuery: entrySourceQuery, actionType: "START_FAN_VERIFICATION", targetType: "celebrity", targetId: slug }}>{t.login}</AuthIntentLink>
            )}
            {startError && <p className={styles.inlineError} role="alert" tabIndex={-1}>{startError}</p>}
            <Link className={styles.returnLink} href={withLocale(creatorHomeHref(slug), locale)}>{t.fanPage(screen.intro.celebrity.name)}</Link>
          </section>
          </div>
        )}
      </div>
      </main>
    </FanAppFrame>
  );
}
