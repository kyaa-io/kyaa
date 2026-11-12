"use client";
import { FanSkeletonRows } from "@/components/fan-ui/fan-skeleton";
import { knownCertificationTitle } from "../domain/certification-title";
import { TranslatedText } from "@/features/content-safety/ui/use-automatic-translation";
import { toContentLocale } from "@/i18n/locales";
import type { AppLocale } from "@/i18n/locales";
import { messages as localizedMessages } from "@/i18n/catalogs/features__certification__ui__certification-panel";
import { additionalLocales, translate } from "@/i18n/messages";
import { rememberQuizCloseReturn, takeQuizFocusReturn } from "@/features/quiz/domain/quiz-close-return";
import { getSessionStorage } from "@/features/reliability/client/session-storage";
import { useByUsAuth as usePrivy } from "@/features/auth/client/cognito-auth";
import { FanLockedRows } from "@/components/fan-ui/fan-locked-value";
import { GuestLoginAction } from "@/features/my/ui/guest-login";
import {
  Award,
  ChevronRight,
  History,
} from "lucide-react";
import type { Route } from "next";
import Link from "../../../components/fan-ui/hover-prefetch-link";
import Image from "next/image";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { z } from "zod";
import {
  certificationListItemSchema,
  historyItemSchema,
  membershipPlatformLabel,
  type CertificationHistoryItem,
  type CertificationListItem,
  type CertificationLocale,
} from "../domain/certification";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanSectionLink } from "@/components/fan-ui/fan-section-link";
import { proofsText } from "@/features/passport-proofs/ui/proofs-copy";
import { certificationStampSrc } from "../domain/certification-stamp";
import styles from "./certification.module.css";
import { ShareProofHistoryRows, ShareProofTile } from "@/features/share-proof/ui/share-proof-panel";
import gridStyles from "./certification-grid.module.css";

const copy = {
  ko: {
    title: "팬 인증",
    missions: "인증 목록",
    all: "전체",
    history: "내 인증 내역",
    loading: "인증을 불러오는 중이에요.",
    error: "인증을 불러오지 못했어요.",
    empty: "등록된 인증이 없어요.",
    historyEmpty: "아직 제출한 인증이 없어요.",
    login: "로그인하면 내 인증 내역을 확인할 수 있어요.",
    available: "참여 가능",
    preparing: "준비 중",
    closed: "종료",
    pending: "검토 중",
    approved: "승인",
    rejected: "반려",
    score: "점",
    ticket: "응모권",
    start: "인증하기",
    startQuiz: "퀴즈 풀기",
    attempt: (value: number) => `${value}회차`,
  },
  en: {
    title: "Fan verification",
    missions: "Verification",
    all: "All",
    history: "My history",
    loading: "Loading verification missions.",
    error: "We couldn’t load verification missions.",
    empty: "No verification is available.",
    historyEmpty: "You have no submissions yet.",
    login: "Sign in to see your submission history.",
    available: "Available",
    preparing: "Preparing",
    closed: "Closed",
    pending: "Under review",
    approved: "Approved",
    rejected: "Rejected",
    score: "pts",
    ticket: "tickets",
    start: "Get verified",
    startQuiz: "Take quiz",
    attempt: (value: number) => `Attempt ${value}`,
  },

  ...additionalLocales((translationLocale) => ({
    title: localizedMessages.m84776792a6a6[translationLocale],
    missions: localizedMessages.m5acaed52a19a[translationLocale],
    all: localizedMessages.mfbe0f0d8b589[translationLocale],
    history: localizedMessages.m577093b578a3[translationLocale],
    loading: localizedMessages.m8c73c29c5ef0[translationLocale],
    error: localizedMessages.mc084de4feb8e[translationLocale],
    empty: localizedMessages.me8850e1b06b4[translationLocale],
    historyEmpty: localizedMessages.m08188f574c68[translationLocale],
    login: localizedMessages.m79fd84b32847[translationLocale],
    available: localizedMessages.m26877e0405a0[translationLocale],
    preparing: localizedMessages.me6800ee5bcd0[translationLocale],
    closed: localizedMessages.m6797acdc4160[translationLocale],
    pending: localizedMessages.mbaf38767e5fa[translationLocale],
    approved: localizedMessages.mc01385355806[translationLocale],
    rejected: localizedMessages.m0f0c1691895f[translationLocale],
    score: localizedMessages.m5224845219bc[translationLocale],
    ticket: localizedMessages.m1925bade61c2[translationLocale],
    start: localizedMessages.mfd7692d3f746[translationLocale],
    startQuiz: localizedMessages.m75cba4550bc8[translationLocale],
    attempt: (value: number) => translate(translationLocale, localizedMessages.m1f876e07eb39, "Attempt {0}", [value]),
  }))
} as const;

export function CertificationPanel({
  slug,
  locale,
  initialTab = "missions",
}: {
  slug: string;
  locale: AppLocale;
  initialTab?: "missions" | "history";
}) {
  const { ready, authenticated, getAccessToken, user } = usePrivy();
  const t = copy[locale];
  const panelId = useId();
  const [tab, setTab] = useState<"missions" | "history">(initialTab);
  const [items, setItems] = useState<CertificationListItem[]>([]);
  // 받는 인증 항목이 하나도 없는 크리에이터는 제출 화면 링크를 숨긴다(빈 화면으로 보내지 않는다).
  const [noMissions, setNoMissions] = useState(false);
  const [category, setCategory] = useState<string>("");
  const [historyItems, setHistory] = useState<CertificationHistoryItem[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const ownerKey = authenticated ? (user?.id ?? null) : null;
  const identityKey = `${ownerKey ?? "guest"}:${slug}:${locale}`;
  const [ownedStatus, setOwnedStatus] = useState<{key:string; items:CertificationHistoryItem[]; error:boolean}>();
  const [ownedRetry, setOwnedRetry] = useState(0);
  useEffect(() => {
    if (tab !== "missions" || !ready || !authenticated || !ownerKey) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const token = await getAccessToken();
        if (!token) throw new Error("AUTH_REQUIRED");
        const response = await fetch(`/api/me/celebrities/${encodeURIComponent(slug)}/certifications?locale=${toContentLocale(locale)}`, {headers:{authorization:`Bearer ${token}`},cache:"no-store",signal:controller.signal});
        if (!response.ok) throw new Error("HISTORY_UNAVAILABLE");
        const body = await response.json();
        const items = z.array(historyItemSchema).parse(body.certifications);
        if (!controller.signal.aborted) setOwnedStatus({key:identityKey,items,error:false});
      } catch { if (!controller.signal.aborted) setOwnedStatus({key:identityKey,items:[],error:true}); }
    })();
    return () => controller.abort();
  }, [tab, ready, authenticated, ownerKey, identityKey, slug, locale, getAccessToken, ownedRetry]);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setState("loading");
      try {
        if (tab === "missions") {
          const response = await fetch(
            `/api/celebrities/${encodeURIComponent(slug)}/certifications?locale=${toContentLocale(locale)}`,
            { signal },
          );
          if (!response.ok) throw new Error();
          const body = await response.json();
          const list = z.array(certificationListItemSchema).parse(body.certifications);
          setItems(list);
          setNoMissions(!list.some((item) => item.kind === "manual" && item.status !== "closed"));
        } else if (ready && authenticated && ownerKey) {
          const token = await getAccessToken();
          const response = await fetch(
            `/api/me/celebrities/${encodeURIComponent(slug)}/certifications?locale=${toContentLocale(locale)}`,
            {
              headers: { authorization: `Bearer ${token}` },
              cache: "no-store",
              signal,
            },
          );
          if (!response.ok) throw new Error();
          const body = await response.json();
          if (!signal?.aborted)
            setHistory(z.array(historyItemSchema).parse(body.certifications));
        }
        if (!signal?.aborted) setState("ready");
      } catch {
        if (!signal?.aborted) setState("error");
      }
    },
    [authenticated, getAccessToken, locale, ownerKey, ready, slug, tab],
  );
  useEffect(() => {
    setHistory([]);
  }, [ownerKey]);
  const focusReturned = useRef(false);
  useEffect(() => {
    if (focusReturned.current || state !== "ready" || tab !== "missions" || !items.length) return;
    focusReturned.current = true;
    const itemId = takeQuizFocusReturn(getSessionStorage(), slug);
    if (!itemId) return;
    document.querySelector<HTMLElement>(`a[data-certification-item="${CSS.escape(itemId)}"]`)?.focus();
  }, [items, slug, state, tab]);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next =
      event.key === "Home"
        ? "missions"
        : event.key === "End"
          ? "history"
          : tab === "missions"
            ? "history"
            : "missions";
    setTab(next);
    document.getElementById(`${panelId}-${next}`)?.focus();
  }
  const categories = [...new Set(items.map((item) => item.category))];
  const selectedCategory = categories.includes(category) ? category : "";
  const filteredItems = items.filter(
    (item) => !selectedCategory || item.category === selectedCategory,
  );
  return (
    <section className={styles.panel} aria-labelledby={`${panelId}-heading`}>
      <header className={styles.panelHeading}>
        <h2 id={`${panelId}-heading`}>
          {t.title}
        </h2>
        {noMissions ? null : <FanSectionLink href={`/c/${encodeURIComponent(slug)}/proofs?locale=${locale}`}>{proofsText(locale, "pfTitle")}</FanSectionLink>}
      </header>
      <div className={styles.tabs} role="tablist" aria-label={t.title}>
        <button
          type="button"
          role="tab"
          id={`${panelId}-missions`}
          aria-controls={`${panelId}-content`}
          aria-selected={tab === "missions"}
          tabIndex={tab === "missions" ? 0 : -1}
          onKeyDown={handleTabKeyDown}
          onClick={() => setTab("missions")}
        >
          <Award aria-hidden="true" />
          {t.missions}
        </button>
        <button
          type="button"
          role="tab"
          id={`${panelId}-history`}
          aria-controls={`${panelId}-content`}
          aria-selected={tab === "history"}
          tabIndex={tab === "history" ? 0 : -1}
          onKeyDown={handleTabKeyDown}
          onClick={() => setTab("history")}
        >
          <History aria-hidden="true" />
          {t.history}
        </button>
      </div>
      <div
        id={`${panelId}-content`}
        role="tabpanel"
        aria-labelledby={`${panelId}-${tab}`}
      >
        {state === "loading" ? (
          <FanSkeletonRows rows={4} variant="entity" ariaLabel={t.loading} />
        ) : state === "error" ? (
          <div className={styles.state} role="alert">
            <p>{t.error}</p>
            <FanAction onClick={() => void load()}>
              {locale === "ko" ? "다시 시도" : translate(locale, localizedMessages.m31610d1a288d, "Try again")}
            </FanAction>
          </div>
        ) : tab === "missions" ? (
          <div className={styles.missions}>
            {ready && authenticated && ownerKey && ownedStatus?.key !== identityKey && <FanSkeletonRows rows={2} variant="entity" ariaLabel={t.loading} />}
            {ownedStatus?.key === identityKey && ownedStatus.error && <div className={styles.state} role="alert"><p>{t.history} · {t.error}</p><FanAction onClick={() => {setOwnedStatus(undefined);setOwnedRetry(value=>value+1);}}>{locale === "ko" ? "다시 시도" : translate(locale, localizedMessages.m31610d1a288d, "Try again")}</FanAction></div>}
            {items.length ? (
              <div
                className={styles.categories}
                aria-label={
                  locale === "ko" ? "인증 카테고리" : translate(locale, localizedMessages.m55f6d05a1ab8, "Certification categories")
                }
              >
                <button
                  type="button"
                  aria-pressed={!selectedCategory}
                  onClick={() => setCategory("")}
                >
                  {t.all}
                </button>
                {categories.map((value) => (
                  <button
                    type="button"
                    key={value}
                    aria-pressed={selectedCategory === value}
                    onClick={() => setCategory(value)}
                  >
                    {value}
                  </button>
                ))}
              </div>
            ) : null}
            {items.length ? (
              <ul className={gridStyles.grid} data-certification-grid="panel">
                {!selectedCategory && <li><ShareProofTile slug={slug} locale={locale} /></li>}
                {filteredItems.map((item) => {
                  const own = ready && authenticated && ownedStatus?.key === identityKey && !ownedStatus.error ? ownedStatus.items.filter(entry=>entry.missionId===item.id && entry.kind===item.kind).sort((a,b)=>b.submittedAt.localeCompare(a.submittedAt))[0] : undefined;
                  const reviewing = own?.status === "pending";
                  const actionable = item.status === "available" && !reviewing;
                  const stateText = own ? (locale === "ko" && own.status === "approved" ? "인증 완료" : t[own.status]) : item.status === "available" ? (item.kind === "quiz" ? t.startQuiz : t.start) : t[item.status];
                  const reward = [item.reward?.scorePoints ? `+${item.reward.scorePoints}${locale === "en" ? " " : ""}${t.score}` : "", item.reward?.ticketAmount ? `+${item.reward.ticketAmount} ${t.ticket}` : ""].filter(Boolean).join(" · ");
                  const content = (
                    <>
                      <Image src={certificationStampSrc(item)} alt="" width={32} height={32} />
                      <strong>{knownCertificationTitle(locale, item) ?? <TranslatedText text={item.title} locale={locale} controls={false} />}</strong>
                      <span className={gridStyles.state} data-status={own?.status ?? item.status}>
                        {stateText}{reward && actionable && own?.status !== "approved" ? <span className={gridStyles.reward}> · {reward}</span> : null}
                      </span>
                    </>
                  );
                  return (
                    <li key={item.id}>
                      {actionable ? (
                        <Link
                          href={item.actionHref as Route}
                          className={gridStyles.tile}
                          data-status={item.status}
                          data-certification-item={item.id}
                          onClick={item.kind === "quiz" ? () => rememberQuizCloseReturn(getSessionStorage(), slug, `${window.location.pathname}${window.location.search}`, item.id) : undefined}
                        >
                          {content}
                        </Link>
                      ) : (
                        <div className={gridStyles.tile} data-status={item.status} data-disabled="true">
                          {content}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <ul className={gridStyles.grid} data-certification-grid="panel"><li><ShareProofTile slug={slug} locale={locale} /></li></ul>
            )}
          </div>
        ) : !ready ? (
          <FanSkeletonRows rows={3} variant="entity" ariaLabel={t.loading} />
        ) : !authenticated ? (
          <div className={styles.guestStack}>
            <FanLockedRows rows={3} />
            <GuestLoginAction locale={locale} returnTo={typeof window === "undefined" ? `/c/${slug}/certifications?locale=${locale}` : `${window.location.pathname}${window.location.search}${window.location.hash}`} variant="primary" />
          </div>
        ) : (
          <div className={styles.list}>
            <ShareProofHistoryRows slug={slug} locale={locale} classes={{ row: styles.row, copy: styles.rowCopy, status: styles.status }} empty={historyItems.length ? null : <p className={styles.state}>{t.historyEmpty}</p>} />
            {historyItems.length ? (
              historyItems.map((item) => (
                <Link
                  key={item.id}
                  href={
                    `${item.actionHref}${item.actionHref.includes("?") ? "&" : "?"}submission=${encodeURIComponent(item.id)}` as Route
                  }
                  className={styles.row}
                >
                  <span className={styles.rowCopy}>
                    <strong>{knownCertificationTitle(locale, item) ?? <TranslatedText text={item.title} locale={locale} controls={false} />}</strong>
                    {item.membershipPlatform ? (
                      <small>
                        {membershipPlatformLabel(item.membershipPlatform)}
                      </small>
                    ) : null}
                    <small>
                      {new Intl.DateTimeFormat(locale, { calendar: "gregory",
                        dateStyle: "medium",
                      }).format(new Date(item.submittedAt))}{" "}
                      · {t.attempt(item.attemptNumber)}
                    </small>
                    {item.rejectionReason ? (
                      <span className={styles.reason}>
                        {item.rejectionReason}
                      </span>
                    ) : null}
                  </span>
                  <span className={styles.status} data-status={item.status}>
                    {item.status === "rejected" && item.membershipPlatform
                      ? locale === "ko" ? "보완 필요" : translate(locale, localizedMessages.m3fe001e864cd, "More proof needed")
                      : t[item.status]}
                  </span>
                  <ChevronRight aria-hidden="true" />
                </Link>
              ))
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
