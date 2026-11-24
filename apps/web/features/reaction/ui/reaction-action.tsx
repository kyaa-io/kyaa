"use client";
import { throwIfAborted } from "@/features/reliability/client/throw-if-aborted";

import type { AppLocale } from "@/i18n/locales";
import { messages as localizedMessages } from "@/i18n/catalogs/features__reaction__ui__reaction-action";
import { additionalLocales, translate } from "@/i18n/messages";
import { creatorHomeHref } from "@/features/creator/domain/creator-navigation";

import { getSessionStorage } from "@/features/reliability/client/session-storage";
import { withRequestDeadline } from "@/features/reliability/client/request-deadline";

import { useByUsAuth as usePrivy } from "@/features/auth/client/cognito-auth";
import Link from "../../../components/fan-ui/hover-prefetch-link";
import type { Route } from "next";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AuthIntentLink } from "../../../components/auth-intent-link";
import { consumeAuthIntent, readAuthIntent } from "../../../components/auth-intent";
import { notifyFanActivityUpdated, subscribeFanActivityUpdates } from "../../../components/fan-ui/fan-activity-updates";
import { ArrowRight } from "../../../components/icons";
import { Star } from "../../../components/fan-ui/fan-icons";
import { FanAction, FanActionStatus, fanActionClassName } from "../../../components/fan-ui/fan-action";
import { reactionResultSchema, type ReactionResult } from "../domain/reaction";
import styles from "./reaction-action.module.css";
import { AccessibleOverlay } from "@/components/ui/overlay/accessible-overlay";
import { StampArtwork } from "../../passport/ui/passport-stamp-artwork";

const copy = {
  ko: { title: "좋아요 남기기", body: "좋아하는 마음을 팬 활동 기록에 남겨보세요.", action: "좋아요 남기기", working: "남기는 중…", checking: "확인하는 중…", done: "좋아요를 남겼어요", error: "좋아요를 남기지 못했어요. 잠시 후 다시 시도해 주세요.", statusError: "좋아요 기록을 확인하지 못했어요. 다시 시도해 주세요.", retry: "다시 확인", passport: "패스포트 만들기", later: "나중에 할게요" },
  get mn() { return this.en; },
  en: { title: "Leave a like", body: "Save your first like as a Stamp in your Fan Passport.", action: "Leave a like", working: "Recording…", checking: "Checking…", done: "Like recorded", error: "We couldn't save your like. Try again in a moment.", statusError: "We couldn't check your like. Try again in a moment.", retry: "Check again", passport: "Create Fan Passport", later: "Maybe later" },

  ...additionalLocales((translationLocale) => ({ title: localizedMessages.m6f6dac867f8e[translationLocale], body: localizedMessages.mf0c0b01e1250[translationLocale], action: localizedMessages.m0be227a6d2b5[translationLocale], working: localizedMessages.me443ebcd1615[translationLocale], checking: localizedMessages.m130d18b3ca08[translationLocale], done: localizedMessages.mbd195f4596d0[translationLocale], error: localizedMessages.m3ee403208b42[translationLocale], statusError: localizedMessages.mab6d207fe534[translationLocale], retry: localizedMessages.ma338c790832e[translationLocale], passport: localizedMessages.m1641d12dfb0d[translationLocale], later: localizedMessages.m5c5e45421dcb[translationLocale] }))
} as const;

/**
 * 같은 사용자·같은 페이지의 좋아요 칩과 이벤트 카드는 POST를 한 번만 보낸다. 한쪽이 보내는 동안 다른 쪽도 '남기는 중'으로 잠기고,
 * 끝나면 `notifyFanActivityUpdated`로 다른 쪽이 서버 값을 다시 읽어 함께 '완료'가 된다.
 */
const postingKeys = new Set<string>();
const postingListeners = new Set<() => void>();
const setPosting = (key: string, on: boolean) => { if (on) postingKeys.add(key); else postingKeys.delete(key); postingListeners.forEach((listener) => listener()); };
const subscribePosting = (listener: () => void) => { postingListeners.add(listener); return () => { postingListeners.delete(listener); }; };

type CheckState = "checking" | "ready" | "error";
type ActionState = "idle" | "working" | "done" | "error";

/**
 * Each Privy owner and creator gets a separate stateful instance. This prevents
 * a completed CTA or an in-flight response from a prior account being reused.
 */
export function ReactionAction({ slug, locale, variant = "card", showRewardDialog = true }: { slug: string; locale: AppLocale; variant?: "card" | "compact" | "header" | "event"; showRewardDialog?: boolean }) {
  const { ready, authenticated, getAccessToken, user } = usePrivy();
  const ownerId = user?.id;
  return <ReactionActionForOwner key={`${ready ? "ready" : "loading"}:${authenticated ? "authenticated" : "guest"}:${ownerId ?? "unknown"}:${slug}`} slug={slug} locale={locale} variant={variant} showRewardDialog={showRewardDialog} ready={ready} authenticated={authenticated} ownerId={ownerId} getAccessToken={getAccessToken} />;
}

function ReactionActionForOwner({ slug, locale, variant, showRewardDialog, ready, authenticated, ownerId, getAccessToken }: {
  showRewardDialog: boolean;
  variant: "card" | "compact" | "header" | "event";
  slug: string;
  locale: AppLocale;
  ready: boolean;
  authenticated: boolean;
  ownerId: string | undefined;
  getAccessToken: () => Promise<string | null>;
}) {
  const [checkState, setCheckState] = useState<CheckState>(authenticated ? "checking" : "ready");
  const [actionState, setActionState] = useState<ActionState>("idle");
  const [result, setResult] = useState<ReactionResult | null>(null);
  const [showModal, setShowModal] = useState(false);
  const checkStateRef = useRef(checkState);
  const postInFlight = useRef<Promise<void> | null>(null);
  const readAbort = useRef<AbortController | null>(null);
  const postAbort = useRef<AbortController | null>(null);
  const resumedIntent = useRef<string | null>(null);
  const knownReaction = useRef(false);
  const tokenProvider = useRef(getAccessToken);
  const t = copy[locale];

  useEffect(() => {
    tokenProvider.current = getAccessToken;
  }, [getAccessToken]);

  useEffect(() => {
    checkStateRef.current = checkState;
  }, [checkState]);

  useEffect(() => () => {
    readAbort.current?.abort();
    postAbort.current?.abort();
  }, []);

  const postReaction = useCallback(async (fromVerifiedAuthIntent = false) => {
    const postingKey = `${ownerId}:${slug}`;
    if (!ready || !authenticated || postInFlight.current || postingKeys.has(postingKey)) return;
    if (!fromVerifiedAuthIntent && (checkStateRef.current !== "ready" || knownReaction.current)) return;
    const controller = new AbortController();
    postAbort.current = controller;
    setPosting(postingKey, true);
    const operation = (async () => {
      setActionState("working");
      try {
        const token = await tokenProvider.current();
        if (!token) throw new Error("missing token");
        if (controller.signal.aborted) return;
        const response = await fetch(`/api/celebrities/${encodeURIComponent(slug)}/reactions`, {
          method: "POST", headers: { authorization: `Bearer ${token}` }, signal: controller.signal, cache: "no-store",
        });
        const body = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok) throw new Error(body?.error?.code ?? "reaction failed");
        const parsed = reactionResultSchema.parse(body);
        knownReaction.current = true;
        setResult(parsed);
        setActionState("done");
        setShowModal(showRewardDialog);
        notifyFanActivityUpdated(ownerId);
      } catch {
        if (!controller.signal.aborted) setActionState("error");
      } finally {
        if (postAbort.current === controller) postAbort.current = null;
        postInFlight.current = null;
        setPosting(postingKey, false);
      }
    })();
    postInFlight.current = operation;
    await operation;
  }, [authenticated, ownerId, ready, showRewardDialog, slug]);

  const resumeIntentIfNeeded = useCallback(() => {
    const id = new URLSearchParams(window.location.search).get("authIntent");
    if (!id || resumedIntent.current === id) return;
    const intent = readAuthIntent(getSessionStorage(), id);
    if (intent?.actionType !== "CREATE_REACTION" || intent.targetId !== slug) return;
    resumedIntent.current = id;
    consumeAuthIntent(getSessionStorage(), intent.id);
    void postReaction(true);
  }, [postReaction, slug]);

  const readExisting = useCallback(async () => {
    if (!ready || !authenticated) return;
    readAbort.current?.abort();
    const controller = new AbortController();
    readAbort.current = controller;
    setCheckState("checking");
    try {
      // Bound token refresh and body decoding as well as the network request.
      // Late SDK responses must not restart a timed-out lookup.
      const body = await withRequestDeadline(async (signal) => {
        const token = await tokenProvider.current();
        throwIfAborted(signal);
        if (!token) throw new Error("missing token");
        const response = await fetch(`/api/celebrities/${encodeURIComponent(slug)}/reactions`, {
          headers: { authorization: `Bearer ${token}` }, signal, cache: "no-store",
        });
        if (!response.ok) throw new Error("reaction lookup failed");
        return response.json();
      }, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (body?.reaction === null) {
        // A reaction is append-only. Do not let a briefly stale read after our
        // successful POST reopen its CTA while the database projection catches up.
        if (!knownReaction.current) {
          setResult(null);
          setActionState("idle");
          resumeIntentIfNeeded();
        }
      } else {
        const parsed = reactionResultSchema.safeParse(body?.reaction);
        if (!parsed.success) throw new Error("reaction lookup invalid");
        knownReaction.current = true;
        setResult(parsed.data);
        setActionState("done");
      }
      setCheckState("ready");
    } catch (error) {
      if (!controller.signal.aborted && (error as DOMException).name !== "AbortError") setCheckState("error");
    } finally {
      if (readAbort.current === controller) readAbort.current = null;
    }
  }, [authenticated, ready, resumeIntentIfNeeded, slug]);

  useEffect(() => {
    if (!ready || !authenticated) return;
    void readExisting();
    return () => readAbort.current?.abort();
  }, [authenticated, readExisting, ready]);

  useEffect(() => {
    if (!ready || !authenticated) return;
    return subscribeFanActivityUpdates(ownerId, () => { void readExisting(); });
  }, [authenticated, ownerId, readExisting, ready]);

  const verificationHref = result ? `/c/${slug}/verify?locale=${locale}&source=reaction&reactionId=${result.reactionId}` : `/c/${slug}/verify?locale=${locale}`;
  const checking = authenticated && checkState === "checking";
  const sharedPosting = useSyncExternalStore(subscribePosting, () => postingKeys.has(`${ownerId}:${slug}`), () => false);
  const working = actionState === "working" || (sharedPosting && actionState !== "done");
  const rewardModal = actionState === "done" && result && showModal && <AccessibleOverlay open onClose={() => setShowModal(false)} labelledBy="reaction-modal-title" backdropClassName={styles.backdrop} contentClassName={styles.modal}>
    <div className={styles.stampReward}><StampArtwork type="first_reaction" locale={locale} /></div>
    <h2 id="reaction-modal-title">{locale === "ko" ? "첫 좋아요 스탬프를 받았어요" : translate(locale, localizedMessages.m2e387fe4594c, "You earned your First Like Stamp")}</h2>
    {result.passportExists ? null : <p>{locale === "ko" ? "첫 좋아요 스탬프를 보관했어요. 팬 인증을 마치고 패스포트를 만들면 스탬프함에 담겨요." : translate(locale, localizedMessages.m3cadbfa88dd5, "Your First Like Stamp is saved. Complete fan verification to add it to your Fan Passport.")}</p>}
    <Link href={(result.passportExists ? `/passports?locale=${locale}#collection` : verificationHref) as Route}>{result.passportExists ? locale === "ko" ? "내 패스포트 보기" : translate(locale, localizedMessages.mca4d55210ded, "View my Passports") : t.passport}</Link>
    <button type="button" onClick={() => setShowModal(false)}>{t.later}</button>
  </AccessibleOverlay>;
  const sectionClass = variant === "compact" ? styles.compact : variant === "header" ? styles.pill : variant === "event" ? styles.event : styles.card;
  const sectionLabel = variant === "compact" || variant === "header" ? t.title : undefined;
  if (variant === "event") {
    // 이벤트 카드의 큰 주 버튼. 칩과 같은 요청·같은 문구를 쓰고, 끝난 뒤에는 누를 수 없는 결과 표시(FanActionStatus)로 바뀐다.
    const star = <Star strokeWidth={1.5} />;
    const doneLabel = locale === "ko" ? "좋아요 완료" : translate(locale, localizedMessages.reactionEventLiked, "Liked");
    return <div className={sectionClass} id="event-like" data-reaction-complete={actionState === "done" ? "true" : undefined}>
      {ready && !authenticated ? <AuthIntentLink emphasis="primary" className={fanActionClassName("primary", { fullWidth: true, size: "lg" })} focusKey="event-like" locale={locale} input={{ sourcePath: creatorHomeHref(slug), sourceQuery: `?locale=${locale}`, actionType: "CREATE_REACTION", targetType: "celebrity", targetId: slug, returnAnchor: "#event-like" }}>{star}{t.action}</AuthIntentLink>
        : ready && actionState === "done" ? <FanActionStatus size="lg" leadingIcon={star}>{doneLabel}</FanActionStatus>
        : <FanAction variant="primary" size="lg" fullWidth leadingIcon={star} onClick={() => void (checkState === "error" ? readExisting() : postReaction())} disabled={!ready || checking || working} loading={!ready || checking || working}>{!ready || working ? t.working : checking ? t.checking : checkState === "error" ? t.retry : t.action}</FanAction>}
      {checkState === "error" ? <p role="alert" className={styles.error}>{t.statusError}</p> : null}
      {actionState === "error" && checkState !== "error" ? <p role="alert" className={styles.error}>{t.error}</p> : null}
      {rewardModal}
    </div>;
  }
  return <section className={sectionClass} id="first-reaction" aria-label={sectionLabel} aria-labelledby={variant === "card" ? "first-reaction-title" : undefined} data-reaction-complete={actionState === "done" ? "true" : undefined}>
    {variant === "card" && <><span className={styles.icon} aria-hidden="true"><Star strokeWidth={1.5} /></span>
    <div className={styles.copy}><h2 id="first-reaction-title">{t.title}</h2><span>{t.body}</span></div></>}
    {!ready ? <button disabled><Star strokeWidth={1.5} />{t.working}</button>
      : !authenticated ? <AuthIntentLink focusKey="first-reaction" locale={locale} input={{ sourcePath: creatorHomeHref(slug), sourceQuery: `?locale=${locale}`, actionType: "CREATE_REACTION", targetType: "celebrity", targetId: slug, returnAnchor: "#first-reaction" }}><Star strokeWidth={1.5} />{t.action}<ArrowRight /></AuthIntentLink>
      : checkState === "error" ? <button type="button" onClick={() => void readExisting()}><Star strokeWidth={1.5} />{t.retry}<ArrowRight /></button>
      : <button type="button" onClick={() => void postReaction()} disabled={checking || working || actionState === "done"}><Star strokeWidth={1.5} />{checking ? t.checking : working ? t.working : actionState === "done" ? (variant !== "card" && locale === "ko" ? "좋아요 완료" : t.done) : t.action}<ArrowRight /></button>}
    {!showRewardDialog && <span role="status">{actionState === "done" ? t.done : ""}</span>}
    {checkState === "error" ? <p role="alert" className={styles.error}>{t.statusError}</p> : null}
    {actionState === "error" && checkState !== "error" ? <p role="alert" className={styles.error}>{t.error}</p> : null}
    {rewardModal}
  </section>;
}
