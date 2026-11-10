"use client";
import { useEffect, useRef, useState } from "react";
import { FanAction, fanActionClassName } from "@/components/fan-ui/fan-action";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import { FanIconButton } from "@/components/fan-ui/fan-icon-button";
import { Minus, Plus } from "@/components/fan-ui/fan-icons";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import { showFanToast } from "@/components/fan-ui/fan-toast";
import { GroupRequestError, useGroupRequest } from "@/features/groups/ui/use-group-resource";
import type { AppLocale } from "@/i18n/locales";
import { exchangeSchema } from "@/server/group-wallet/domain";
import { walletCopy } from "./copy";
import { loadRewardedGpt, requestRewardedAd, rewardedAdUnit, type RewardedAdState } from "./google-rewarded-ad";
import { rewardedExchangeCopy, rewardedQuantityCopy, rewardedStopMessage, type RewardedStopKind } from "./rewarded-copy";
import { runRewardedSession } from "./rewarded-session";
import { MAX_EXCHANGE_UNITS as MAX_UNITS, usePendingExchange, type PendingExchange as Pending, type PendingExchangeState } from "./use-pending-exchange";
import styles from "./stan-wallet.module.css";

const STOP_KIND_BY_CODE: Record<string, RewardedStopKind> = { GROUP_WALLET_AD_DAILY_LIMIT: "dailyLimit", GROUP_WALLET_AD_RATE_LIMITED: "rateLimited", GROUP_WALLET_AD_SESSION_INVALID: "sessionExpired", GROUP_WALLET_AD_GATE_CLOSED: "unavailable", GROUP_WALLET_AD_CONFIG_MISSING: "unavailable" };
/** The server refused the request as a whole: nothing was spent, so the saved request is dropped. */
const FINAL_CODES = new Set(["GROUP_WALLET_INVALID", "GROUP_WALLET_REQUEST_CONFLICT", "GROUP_WALLET_POLICY_CHANGED", "GROUP_WALLET_INSUFFICIENT_BALANCE", "GROUP_WALLET_REWARDS_NOT_STARTED", "GROUP_WALLET_TARGET_UNAVAILABLE", "GROUP_WALLET_AD_SESSION_INVALID", "GROUP_WALLET_AD_DAILY_LIMIT", "GROUP_WALLET_AD_RATE_LIMITED", "GROUP_WALLET_AD_CONFIG_MISSING", "GROUP_WALLET_AD_SESSION_REQUIRED", "GROUP_WALLET_AD_GATE_CLOSED", "GROUP_WALLET_WRITE_FENCED"]);

/** Ticket count as it reads in the card and the toast ("3장" in Korean, the number alone elsewhere). */
const unitsText = (locale: AppLocale, units: number) => `${units.toLocaleString(locale)}${locale === "ko" ? "장" : ""}`;

/** B13: the one place an exchange starts. [− N +] picks the tickets (default: as many as the points cover), one press runs one ad for all of them,
 *  and the result is a toast. The request is saved before it is sent, so a lost answer is checked with the same key instead of spending twice. */
type ExchangeProps = { locale: AppLocale; points: number; pointCost: number };
export function StanExchange(props: ExchangeProps & { pendingRequest?: PendingExchangeState }) {
  return props.pendingRequest ? <StanExchangeContent {...props} pendingRequest={props.pendingRequest} /> : <StandaloneExchange {...props} />;
}
function StandaloneExchange(props: ExchangeProps) {
  const pendingRequest = usePendingExchange();
  return <StanExchangeContent {...props} pendingRequest={pendingRequest} />;
}
function StanExchangeContent({ locale, points, pointCost, pendingRequest }: ExchangeProps & { pendingRequest: PendingExchangeState }) {
  const w = walletCopy(locale), rewarded = rewardedExchangeCopy(locale), q = rewardedQuantityCopy(locale);
  const { request } = useGroupRequest();
  const { storageKey, storageReady, pending, setPending } = pendingRequest;
  const maxQty = Math.max(0, Math.min(MAX_UNITS, Math.floor(points / pointCost)));
  const [picked, setPicked] = useState<number | null>(null);
  const qty = maxQty === 0 ? 0 : Math.min(Math.max(1, picked ?? maxQty), maxQty);
  const [ad, setAd] = useState<RewardedAdState | null>(null), [busy, setBusy] = useState(false);
  const alive = useRef(true), running = useRef(false), unsupported = useRef(false), control = useRef<{ show(): boolean; cancel(): void } | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; control.current?.cancel(); };
  }, [storageKey]);
  // The press is the opt-in: the ad opens as soon as it is ready.
  useEffect(() => { if (ad === "ready") control.current?.show(); }, [ad]);
  const stop = (kind: RewardedStopKind, retry?: () => void) => showFanToast({ title: rewardedStopMessage(locale, kind, 0), tone: "error", ...(retry ? { action: { label: w.retry, onClick: retry } } : {}) });
  const forget = () => { try { sessionStorage.removeItem(storageKey); } catch { /* nothing stored */ } setPending(null); };

  async function submit(input: Pending) {
    if (running.current) return;
    running.current = true; setBusy(true);
    try {
      try { sessionStorage.setItem(storageKey, JSON.stringify(input)); } catch { /* the request still goes out with its key */ }
      setPending(input);
      // A check after a lost answer sends the same key and session: the server replays a committed exchange and never debits twice.
      const { operation, ...body } = input;
      const result = exchangeSchema.parse(await request(`/api/me/wallet/${operation}`, { method: "POST", body: JSON.stringify(body) }));
      if (!alive.current) return;
      forget(); setPicked(null);
      showFanToast({ title: `${w.tickets} +${unitsText(locale, result.units)}`, tone: "success" });
    } catch (error) {
      if (!alive.current) return;
      const code = error instanceof GroupRequestError ? error.code : undefined;
      if (code && FINAL_CODES.has(code)) forget();
      const kind = code ? STOP_KIND_BY_CODE[code] : undefined;
      if (kind) stop(kind); else showFanToast({ title: code && FINAL_CODES.has(code) ? w.error : w.pending, tone: "error" });
    } finally { running.current = false; if (alive.current) { setBusy(false); setAd(null); } }
  }

  // Points move only after the server granted the watched ad; cancel, no-fill and failures never reach the debit.
  async function start(units: number) {
    if (!storageReady) return;
    if (unsupported.current) { stop(rewardedAdUnit() ? "unsupported" : "unconfigured"); return; }
    const input = { operation: "exchange" as const, requestKey: crypto.randomUUID(), policyVersion: "group-wallet-v1" as const, target: "ticket" as const, units };
    control.current = await runRewardedSession({
      post: (path, body) => request(path, { method: "POST", body: JSON.stringify(body) }),
      unit: rewardedAdUnit(), loadGpt: loadRewardedGpt, requestAd: requestRewardedAd, alive: () => alive.current,
      onState: state => {
        if (state === "unsupported") { unsupported.current = true; stop(rewardedAdUnit() ? "unsupported" : "unconfigured"); }
        else if (state === "cancelled") stop("incomplete");
        else if (state === "no-fill") stop("unavailable", () => void start(units));
        else if (state === "error") stop("failed", () => void start(units));
        setAd(state === "closed" || state === "cancelled" || state === "no-fill" || state === "unsupported" || state === "error" ? (running.current ? "earned" : null) : state);
      },
      onGranted: id => { setAd("earned"); void submit({ ...input, adSessionId: id }); },
      onRefused: error => {
        control.current = null; setAd(null);
        const code = error instanceof GroupRequestError ? error.code : undefined, kind = code ? STOP_KIND_BY_CODE[code] : undefined;
        if (kind) stop(kind); else if (code === "GROUP_WALLET_INSUFFICIENT_BALANCE") showFanToast({ title: w.error, tone: "error" }); else stop("failed");
      },
    });
  }

  const working = busy || ad === "loading" || ad === "ready" || ad === "showing" || ad === "earned";
  // Reading the saved request takes one effect; the controls stay enabled meanwhile (no disabled flash) and a press waits for it.
  const locked = working;
  const pick = (n: number) => setPicked(Math.min(Math.max(1, n), maxQty));
  return <div className={styles.exchange}>
    <div className={styles.exchangeRate}>
      <span>{pointCost.toLocaleString(locale)} P</span><span aria-hidden="true">→</span>
      <span className={styles.exchangeTicket}><img src="/images/dukjil-duo/glyph-ticket-80.webp" width={32} height={32} alt={w.tickets} />{unitsText(locale, 1)}</span>
    </div>
    <span className={styles.quantityLabel}>{q.quantity}</span>
    <div className={styles.stepper} role="group" aria-label={q.quantity}>
      <FanIconButton aria-label={q.decrease} disabled={locked || Boolean(pending) || qty <= 1} onClick={() => pick(qty - 1)}><FanIcon icon={Minus} /></FanIconButton>
      {/* A saved request is checked with its own quantity, so the card shows that one, not today's maximum. */}
      <output aria-live="polite" aria-label={`${q.quantity} ${pending?.units ?? qty}`}>{unitsText(locale, pending?.units ?? qty)}</output>
      <FanIconButton aria-label={q.increase} disabled={locked || Boolean(pending) || qty >= maxQty} onClick={() => pick(qty + 1)}><FanIcon icon={Plus} /></FanIconButton>
    </div>
    <FanAction variant="primary" className={styles.exchangeAction} loading={working} disabled={locked || (!pending && qty < 1)} onClick={() => { if (pending) void submit(pending); else void start(qty); }}>{pending ? w.recover : rewarded.action}</FanAction>
  </div>;
}

/** While the balance loads: the same boxes as the ready row, drawn as plain marks (nothing to press or announce), so the card keeps its
 *  height in every language (long labels stack at 390). */
export function StanExchangeLoading({ locale }: { locale: AppLocale }) {
  return <div className={styles.exchange} aria-hidden="true" data-exchange-loading="">
    <span className={styles.stepper}><span className={styles.stepperSlot}><FanIcon icon={Minus} /></span><FanSkeleton width={32} height={20} /><span className={styles.stepperSlot}><FanIcon icon={Plus} /></span></span>
    <span className={fanActionClassName("secondary", { className: styles.exchangeAction })} aria-disabled="true">{rewardedExchangeCopy(locale).action}</span>
  </div>;
}
