"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Gift, History } from "lucide-react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanState } from "@/components/fan-ui/fan-state";
import type { AppLocale } from "@/i18n/locales";
import { toContentLocale } from "@/i18n/locales";
import { luckyCopy } from "@/i18n/catalogs/features__lucky";
import { raffleListSchema, raffleStatus } from "@/features/benefit/domain/raffle";
import { creatorRaffleHref } from "@/features/benefit/domain/raffle-navigation";
import { formatRaffleDateTime } from "@/features/benefit/ui/benefit-presentation";
import { useFanpageResource } from "@/features/fanpage/ui/use-fanpage-resource";
import { useCheerEvent, CheerEventFeedback, cheerEventHref } from "@/features/fanpage/ui/cheer-event";
import { cheerEventCopy } from "@/features/fanpage/domain/cheer-event-copy";
import styles from "./lucky-panel.module.css";

const parseRaffles = (value: unknown) => raffleListSchema.parse(value);
export function LuckyPanel({ locale, creator }: { locale: AppLocale; creator: { slug: string; name: string } }) {
  // Reset the selected category when the supported creator changes.
  return <CreatorLuckyPanel key={creator.slug} locale={locale} creator={creator} />;
}
function CreatorLuckyPanel({ locale, creator }: { locale: AppLocale; creator: { slug: string; name: string } }) {
  const t = luckyCopy(locale), c = cheerEventCopy(locale);
  const [ended, setEnded] = useState(false);
  const [now, setNow] = useState(Date.now);
  const raffles = useFanpageResource(`/api/celebrities/${encodeURIComponent(creator.slug)}/raffles?locale=${toContentLocale(locale)}`, parseRaffles);
  const cheer = useCheerEvent(creator.slug, locale);
  const retryRaffles = raffles.retry, refreshCheer = cheer.refresh;
  const items = raffles.state.status === "ready" ? raffles.state.data.raffles : [];
  const event = cheer.event;
  const eventStatus = event ? now >= Date.parse(event.entryClosesAt) ? "closed" : event.status : null;
  const visible = items.filter(item => ["closed", "cancelled"].includes(raffleStatus(item, now)) === ended);
  const showCheer = event && (eventStatus === "closed") === ended;
  const boundary = [...items.flatMap(item => [item.entryOpensAt, item.entryClosesAt]), event?.entryOpensAt, event?.entryClosesAt].filter((date): date is string => !!date).map(Date.parse).filter(at => at > now).sort((a, b) => a - b)[0];
  useEffect(() => {
    if (!boundary) return;
    const timer = window.setTimeout(() => { setNow(Date.now()); retryRaffles(); refreshCheer(); }, Math.min(boundary - Date.now() + 1, 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [boundary, retryRaffles, refreshCheer]);
  return <section className={styles.panel} aria-label={t.heading}>
    <header className={styles.heading}><div><p>{creator.name}</p><h2>{t.heading}</h2></div><FanAction variant="text" href={`/my/raffles?locale=${locale}`} leadingIcon={<History />}>{t.history}</FanAction></header>
    <nav className={styles.filters} aria-label={t.heading}><button type="button" aria-pressed={!ended} onClick={() => setEnded(false)}>{t.ongoing}</button><button type="button" aria-pressed={ended} onClick={() => setEnded(true)}>{t.ended}</button></nav>
    <div className={styles.layout}>
      <div className={styles.intro}><img src="/images/lotto/mix.png" alt="" width={1080} height={1080} /><div><span>KYAA LUCKY DRAW</span><h3>{creator.name}</h3><p>{t.heading}</p></div></div>
      <div className={styles.events}>
        <section className={styles.section} aria-label={t.tickets}><h3>{t.tickets}</h3>
          {raffles.state.status === "loading" ? <FanState kind="loading" title={t.loading} /> : raffles.state.status === "error" ? <FanState kind="error" title={t.error} actions={<FanAction variant="neutral" onClick={raffles.retry}>{t.retry}</FanAction>} /> : visible.length === 0 ? <p className={styles.empty}>{t.empty}</p> : visible.map(raffle => <article className={styles.card} key={raffle.id}>
            <div className={styles.prize}>{raffle.imageUrl ? <img src={raffle.imageUrl} alt="" loading="lazy" /> : <Gift aria-hidden="true" />}</div>
            <div className={styles.cardBody}><span className={styles.status}>{t[raffleStatus(raffle, now)]}</span><h4>{raffle.title}</h4><p>{raffle.summary}</p><p className={styles.meta}>{t.winners} · {raffle.winnerQuantity}</p>{raffle.entryClosesAt && <p className={styles.meta}>{t.deadline} · <time dateTime={raffle.entryClosesAt}>{formatRaffleDateTime(raffle.entryClosesAt, locale)}</time></p>}{raffle.benefitId && <FanAction variant="text" href={creatorRaffleHref(creator.slug, raffle.benefitId, locale)} trailingIcon={<ArrowRight />}>{t.details}</FanAction>}</div>
          </article>)}
        </section>
        <section className={styles.section} aria-label={t.comments}><h3>{t.comments}</h3><CheerEventFeedback status={cheer.status} refreshFailed={cheer.refreshFailed} refresh={cheer.refresh} locale={locale} />
          {showCheer ? <article className={styles.commentEvent}><span className={styles.status}>{eventStatus === "closed" ? c.closed : eventStatus === "upcoming" ? c.upcoming : t.open}</span><h4>{creator.name} · {t.comments}</h4><p>{c.terms}</p><p>{t.free}</p><div className={styles.cheerPrizes}>{event.prizes.map(prize => <div key={prize.benefitId}>{prize.imageUrl ? <img src={prize.imageUrl} alt="" loading="lazy" /> : <Gift aria-hidden="true" />}<span><strong>{prize.title}</strong><small>{c.winners.replace("{count}", String(prize.winnerQuantity))}</small></span></div>)}</div>{event.participation && <p role="status">{event.participation.entered ? c.entered : c.autoEntry}{event.participation.reserved ? ` · ${c.reserved}` : ""} · {event.participation.weight}×</p>}<p>{event.reservationAvailable ? c.reserveIntro : c.reservationClosed}</p><p className={styles.meta}>{t.deadline} · <time dateTime={event.entryClosesAt}>{formatRaffleDateTime(event.entryClosesAt, locale)}</time></p><p className={styles.meta}>{c.earlyClose}</p><FanAction variant="neutral" href={cheerEventHref(creator.slug, locale)} trailingIcon={<ArrowRight />}>{t.details}</FanAction></article> : cheer.status === "ready" && !cheer.refreshFailed ? <p className={styles.empty}>{t.empty}</p> : null}
        </section>
      </div>
    </div>
  </section>;
}
