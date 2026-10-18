"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { bypassImageOptimization } from "@/components/fan-ui/public-image-policy";
import { FanState } from "@/components/fan-ui/fan-state";
import { FanAction } from "@/components/fan-ui/fan-action";
import type { Route } from "next";
import { usePrivy } from "@privy-io/react-auth";
import { X } from "lucide-react";
import type { AppLocale } from "@/i18n/locales";
import { toContentLocale } from "@/i18n/locales";
import { AccessibleOverlay } from "@/components/ui/overlay/accessible-overlay";
import { useByUsSession } from "@/components/byus-session-provider";
import { cheerEventResponseSchema, type CheerEventResponse } from "../domain/cheer-event";
import { cheerEventCopy, eventText } from "../domain/cheer-event-copy";
import { fanPageHref } from "../domain/board-navigation";
import { CheerComments } from "./cheer-comments";
import { useCommunityResource } from "./use-community-resource";
import styles from "./cheer-event.module.css";

export type CheerEvent = NonNullable<CheerEventResponse["event"]>;
type EventProps = { event: CheerEvent; slug: string; name: string; locale: AppLocale };
const parseEvent = (body: unknown) => cheerEventResponseSchema.parse(body);
export function useCheerEvent(slug: string, locale: AppLocale, initialEvent?: CheerEvent | null) {
  const resource = useCommunityResource(`/api/celebrities/${slug}/cheer-event?locale=${toContentLocale(locale)}&liveState=1`, parseEvent, true);
  const event = resource.state.status === "ready" && resource.state.data.event?.creatorSlug === slug ? resource.state.data.event : resource.state.status === "loading" && initialEvent?.creatorSlug === slug ? { ...initialEvent, participation: null } : null;
  const [clock, setClock] = useState(Date.now);
  const refresh = useRef(resource.retry);
  useEffect(() => { refresh.current = resource.retry; }, [resource.retry]);
  const opensAt = event?.reservationOpensAt, closesAt = event?.reservationClosesAt;
  const available = event?.reservationAvailable, campaignId = event?.campaignId;
  useEffect(() => {
    if (!opensAt || !closesAt) return;
    const boundary = [opensAt, closesAt].map(Date.parse).filter(at => at > Date.now()).sort((a, b) => a - b)[0];
    const sync = window.setTimeout(() => setClock(Date.now()), 0);
    const timer = boundary ? window.setTimeout(() => { setClock(Date.now()); refresh.current(); }, Math.min(boundary - Date.now() + 1, 2_147_483_647)) : undefined;
    return () => { window.clearTimeout(sync); window.clearTimeout(timer); };
  }, [opensAt, closesAt, available, campaignId]);
  return { event: event ? { ...event, reservationAvailable: event.reservationAvailable && event.status === "open" && clock >= Date.parse(event.reservationOpensAt) && clock < Date.parse(event.reservationClosesAt), ...(resource.refreshFailed ? { participation: null } : {}) } : null, status: resource.state.status === "loading" && event ? "ready" as const : resource.state.status, refreshFailed: resource.refreshFailed, refresh: resource.retry };
}
export function CheerEventFeedback({ status, refreshFailed, refresh, locale }: Pick<ReturnType<typeof useCheerEvent>, "status" | "refresh"> & { refreshFailed?: boolean; locale: AppLocale }) {
  const copy = cheerEventCopy(locale);
  if (status === "ready" && !refreshFailed) return null;
  return <FanState kind={status === "loading" ? "loading" : "error"} title={status === "loading" ? copy.loading : refreshFailed ? copy.refreshError : copy.loadError} actions={status !== "loading" && <FanAction variant="neutral" onClick={refresh}>{copy.retry}</FanAction>} />;
}
export function cheerEventHref(slug: string, locale: AppLocale) { return fanPageHref(slug, locale, "events").replace("#celebrity-content", "#event-cheers") as Route; }
export function localEventDay(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
export function cheerEventStorageKey(campaignId: string, creatorSlug: string, date = new Date()) { return `kyaa:cheer-event:${campaignId}:${creatorSlug}:${localEventDay(date)}`; }

function EntryAction({ event, slug, locale, onClick }: Pick<EventProps, "event" | "slug" | "locale"> & { onClick?: () => void }) {
  const copy = cheerEventCopy(locale);
  return <Link className={styles.primary} href={cheerEventHref(slug, locale)} onClick={onClick}>{copy.cta}<span className={styles.entryTag}>{copy.autoEntry}</span></Link>;
}
function EventDate({ event, locale }: Pick<EventProps, "event" | "locale">) {
  const date = new Intl.DateTimeFormat(locale, { calendar: "gregory", year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Seoul" });
  return <span className={styles.date}>{cheerEventCopy(locale).period} · <time dateTime={event.entryOpensAt}>{date.format(new Date(event.entryOpensAt))}</time> – <time dateTime={event.entryClosesAt}>{date.format(new Date(event.entryClosesAt))}</time></span>;
}
function DoubleReward({ locale, event }: Pick<EventProps, "locale" | "event">) {
  const copy = cheerEventCopy(locale);
  return <div className={styles.doubleReward} lang={locale}><strong>{copy.double}</strong><p>{event.reservationAvailable ? <>{copy.optional}<br />{copy.reserveIntro}</> : copy.reservationClosed}</p></div>;
}
function Prizes({ event, locale, compact = false }: Pick<EventProps, "event" | "locale"> & { compact?: boolean }) {
  const copy = cheerEventCopy(locale);
  return <div className={`${styles.prizes} ${compact ? styles.compactPrizes : ""}`}>{event.prizes.map((prize, index) => <article className={styles.prize} key={prize.benefitId}>
    <div className={styles.prizeImage}><Image unoptimized={prize.imageUrl ? bypassImageOptimization(prize.imageUrl) : false} sizes={compact ? "(max-width: 767px) 40vw, 240px" : "(max-width: 767px) 100vw, 560px"} src={prize.imageUrl ?? `/images/kyaa-wave/${index === 0 ? "starbucks-10000-voucher.jpg" : "eliena-cafe-01.jpg"}`} alt="" width={index === 0 ? 640 : 1400} height={index === 0 ? 640 : 580} data-voucher={index === 0 || undefined} /></div>
    <div className={styles.prizeText}><h3>{index === 0 ? copy.starbucks : index === 1 ? copy.eliena : prize.title}</h3><p>{copy.winners.replace("{count}", String(prize.winnerQuantity))}</p></div>
  </article>)}</div>;
}
function PromotionContent(props: EventProps & { onClick?: () => void }) {
  const copy = cheerEventCopy(props.locale);
  return <><div className={styles.promotionHeading}><p className={styles.eyebrow}>KYAA WAVE · {copy.deadline} · <time dateTime={props.event.entryClosesAt}>{new Intl.DateTimeFormat(props.locale, { calendar: "gregory", year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Seoul" }).format(new Date(props.event.entryClosesAt))}</time></p><h2>{eventText(copy.title, props.name)}</h2></div><div className={styles.promotionRewards}><DoubleReward locale={props.locale} event={props.event} /><Prizes {...props} compact /></div><div className={styles.promotionAction}><EntryAction {...props} onClick={props.onClick} /></div></>;
}
export function CheerEventBanner(props: EventProps) {
  if (props.event.status !== "open") return null;
  return <section className={styles.banner} aria-label={`KYAA WAVE · ${props.name}`}><PromotionContent {...props} /></section>;
}
export function CheerEventSidebar(props: EventProps) {
  if (props.event.status !== "open") return null;
  return <aside className={styles.sidebar}><PromotionContent {...props} /></aside>;
}
export function CheerEventDetail(props: EventProps & { onPosted: () => void }) {
  const { event, slug, name, locale, onPosted } = props, copy = cheerEventCopy(locale);
  const liveHref = `/live/${encodeURIComponent(event.liveSlug)}?locale=${locale}` as Route;
  return <section className={styles.detail} aria-label={`KYAA WAVE · ${name}`}>
    <header className={styles.detailHero}><div><div className={styles.heroMeta}><span className={styles.rewardPill}>{event.reservationAvailable ? copy.optional : copy.liveSchedule} {event.reservationAvailable && <b>{copy.double}</b>}</span><EventDate {...props} /></div><h2>{eventText(copy.detailTitle, name)}</h2><p>{copy.intro}</p>{event.status === "open" && <EntryAction {...props} />}{event.status !== "open" && <p role="status">{event.status === "closed" ? copy.closed : copy.upcoming}</p>}</div><Image sizes="(max-width: 767px) 100vw, (max-width: 1023px) 50vw, 560px" className={styles.creatorPhoto} src={`/images/kyaa-wave/${slug === "wena" ? "wena-group.webp" : "changha-landscape.webp"}`} width={slug === "wena" ? 2560 : 1672} height={slug === "wena" ? 2034 : 940} alt={name} /></header>
    <section className={styles.reservation} lang={locale}><strong className={styles.double}>{copy.double}</strong><div><p className={styles.eyebrow}>{event.reservationAvailable ? copy.optional : copy.liveSchedule}</p><h3>{event.participation?.reserved ? copy.reserved : event.reservationAvailable ? copy.reserve : copy.viewLive}</h3><p>{event.reservationAvailable ? copy.reserveIntro : copy.reservationClosed}</p><p>{copy.liveSchedule} · <time dateTime={event.liveStartsAt}>{new Intl.DateTimeFormat(locale, { calendar: "gregory", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul" }).format(new Date(event.liveStartsAt))} KST</time></p></div><Link className={styles.reserveButton} href={liveHref}>{event.participation?.reserved ? copy.reserved : event.reservationAvailable ? copy.reserve : copy.viewLive}{event.reservationAvailable && <span>{copy.double}</span>}</Link></section>
    <section className={styles.gifts}><h2>{copy.prizes}</h2><p>{copy.prizesIntro}</p><Prizes {...props} /></section>
    <div className={styles.entryLayout}><div><header className={styles.cheerIntro}><Image sizes="(max-width: 767px) 80px, (max-width: 1023px) 100px, 120px" src={`/images/kyaa-wave/${slug === "wena" ? "wena-profile.webp" : "changha-cheer.jpg"}`} width={160} height={160} alt="" /><div><p className={styles.eyebrow}>TO. {name}</p><h2>{eventText(copy.cheerTitle, name)}</h2><p>{copy.prizesIntro}</p></div></header>{event.participation?.entered && <p className={styles.confirmed} role="status">{copy.entered}{event.participation.reserved && <> · {copy.reserved} · {copy.double}</>}</p>}<CheerComments {...{ slug, name, locale, onPosted }} eventPresentation submissionClosed={event.status !== "open"} returnTo={cheerEventHref(slug, locale)} /></div><aside className={styles.rules}><h2>{copy.rules}</h2><p>{copy.prizesIntro}</p><h3>{copy.optional}</h3><p>{event.reservationAvailable ? copy.reserveIntro : copy.reservationClosed}</p><h3>{copy.result}</h3><hr /><p>{copy.terms}</p><p>{copy.earlyClose}</p><EventDate {...props} /></aside></div>
  </section>;
}

/** Wait for authentication, other overlays, and ongoing input before opening a campaign. */
export function CheerEventModal(props: EventProps & { enabled: boolean }) {
  return <ModalForCampaign key={`${props.event.campaignId}:${props.slug}`} {...props} />;
}
function ModalForCampaign(props: EventProps & { enabled: boolean }) {
  const auth = usePrivy(), session = useByUsSession();
  const [open, setOpen] = useState(false), [checked, setChecked] = useState(false);
  const [day, setDay] = useState(localEventDay);
  const shown = useRef(new Set<string>()), openRef = useRef(false);
  const titleId = useId(), copy = cheerEventCopy(props.locale);
  const key = cheerEventStorageKey(props.event.campaignId, props.slug);
  useEffect(() => {
    const check = () => {
      const today = localEventDay();
      setDay(today);
      if (!props.enabled || !auth.ready || !session.ready || props.event.status !== "open" || openRef.current || shown.current.has(key)) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"], [data-overlay-host]') || document.activeElement?.matches('input,textarea,select,[contenteditable="true"]')) return;
      try { if (localStorage.getItem(key) === "hidden") return; } catch { /* Storage is optional; closing and navigation always work. */ }
      shown.current.add(key); openRef.current = true; setChecked(false); setOpen(true);
    };
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    const interval = window.setInterval(check, 30_000);
    window.addEventListener("focus", check); document.addEventListener("focusout", check); document.addEventListener("visibilitychange", check);
    return () => { observer.disconnect(); window.clearInterval(interval); window.removeEventListener("focus", check); document.removeEventListener("focusout", check); document.removeEventListener("visibilitychange", check); };
  }, [props.enabled, props.event.status, auth.ready, session.ready, key, day]);
  function close() {
    if (checked) { try { localStorage.setItem(key, "hidden"); } catch { /* Storage is optional. */ } }
    openRef.current = false; setOpen(false);
  }
  if (!props.enabled || props.event.status !== "open") return null;
  return <AccessibleOverlay open={open} onClose={close} labelledBy={titleId} backdropClassName={styles.backdrop} contentClassName={styles.modal}>
    <header className={styles.modalHeader}><h2 id={titleId}>{eventText(copy.modalTitle, props.name)}</h2><button type="button" aria-label={copy.close} onClick={close}><X aria-hidden="true" /></button></header>
    <div className={styles.modalPromotion}><PromotionContent {...props} onClick={close} /></div>
    <footer className={styles.modalFooter}><label><input type="checkbox" checked={checked} onChange={event => setChecked(event.target.checked)} />{copy.hideToday}</label><button type="button" onClick={close}>{copy.close}</button></footer>
  </AccessibleOverlay>;
}
