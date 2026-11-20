"use client";

import { useReadingCopy } from "@/features/chemi/i18n/reading-ui";
import { ReadingText } from "@/features/chemi/i18n/reading-ui";
import { useEffect, useMemo, useState } from "react";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { ChevronDown, ChevronUp } from "@/components/fan-ui/fan-icons";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanDialog } from "@/components/fan-ui/fan-dialog";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanState } from "@/components/fan-ui/fan-state";
import { FanText } from "@/components/fan-ui/fan-text";
import { FanSkeleton, FanSkeletonRows, FanSkeletonStatus } from "@/components/fan-ui/fan-skeleton";
import { showFanToast } from "@/components/fan-ui/fan-toast";
import { celebrateReward } from "@/components/fan-ui/reward-celebration";
import { EarnBadge } from "@/features/dukjil/ui/earn-badge";
import type { AppLocale } from "@/i18n/locales";
import {
  bestDomain,
  domainLabels,
  domainLine,
  domainLong,
  domains,
  overallHeadline,
  pickReasons,
  reasonView,
  signNames,
  starCharacters,
  starSayLine,
  todayDo,
  todayDont,
  worstDomain,
  type StarCharacterId,
  type StarDomain,
} from "./copy";
import { withParticle } from "./particle";
import { Legal, Reaction, Toolbar, art } from "./parts";
import { signList, type StarReading } from "./reading";
import { StarShareCard } from "./share-card";
import { StarRating } from "./stars";
import styles from "./result.module.css";

/** 저장된 결과를 불러오는 동안 보이는 모양. 요청은 부른 쪽이 한다. */
export function StarResultSkeleton({
  locale,
  character,
  failed,
  onRetry,
}: {
  locale: AppLocale;
  character: StarCharacterId;
  failed?: boolean;
  onRetry?: () => void;
}) {
  const uiText = useReadingCopy();
  const name = starCharacters.find((c) => c.id === character)?.name ?? "창하";
  return (
    <section data-star-result="" className={styles.layout}>
      <Toolbar name={name} back={`/chemi?locale=${locale}`} />
      <div className={styles.main}>
        <header className={styles.head}>
          <FanSkeleton width="30%" />
          <FanSkeleton width="65%" />
          {failed ? (
            <FanState
              bodyTitle
              className={styles.failedHero}
              inline
              kind="error"
              title={uiText("resultFailure")}
              actions={
                <FanAction size="sm" onClick={onRetry}>
                  <ReadingText id="retry" />
                </FanAction>
              }
            />
          ) : (
            <>
              <FanSkeletonStatus locale={locale} />
              <FanSkeleton shape="block" className={styles.hero} />
            </>
          )}
        </header>
        <div className={styles.panel} aria-hidden="true">
          <FanSkeleton width="30%" />
          <FanSkeletonRows rows={4} />
        </div>
      </div>
      <div className={styles.errorCta} aria-hidden="true">
        <FanSkeleton shape="block" />
      </div>
    </section>
  );
}

export function StarResult({
  locale,
  reading,
  character,
  backHref,
  onChart,
}: {
  locale: AppLocale;
  reading: StarReading;
  character: StarCharacterId;
  /** 뒤로 가기를 눌렀을 때 갈 곳. */
  backHref: string;
  onChart: () => void;
}) {
  const uiText = useReadingCopy();
  const { authenticated, getAccessToken } = useByUsAuth();
  const [points, setPoints] = useState(reading.reward?.points ?? 0);
  const [sharing, setSharing] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const { result } = reading;
  const name = starCharacters.find((c) => c.id === character)?.name ?? "창하";
  const stars = result.stars;
  const best = bestDomain(stars);
  const worst = worstDomain(stars);
  const sunName = signList(result.signs.sun, (sign) => signNames[sign].full);
  const sunBare = signList(result.signs.sun, (sign) => signNames[sign].bare);
  const moonBare = signList(result.signs.moon, (sign) => signNames[sign].bare);
  const signOf = useMemo(() => {
    const byBody = new Map(result.natal.map((planet) => [planet.body, planet.sign]));
    return (target: string) => byBody.get(target) ?? null;
  }, [result.natal]);
  const reasons = pickReasons(result.reasons).map((reason) => reasonView(reason, signOf, reading.kstDate));

  // 처음 만든 결과의 보상 연출과 오늘 받은 몫을 한 번 가져온다.
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      if (!reading.replayed && reading.reward)
        celebrateReward({
          locale,
          points: reading.reward.points,
          stamps: Number(Boolean(reading.reward.stamp)),
        });
      if (!authenticated) return;
      const response = await fetch("/api/chemi/rewards/today", {
        headers: { Authorization: `Bearer ${await getAccessToken()}` },
        signal: controller.signal,
      });
      if (!response.ok) return;
      const today = await response.json();
      if (controller.signal.aborted) return;
      if (today.claimedPoints > 0) celebrateReward({ locale, points: today.claimedPoints });
      setPoints(
        today.grants?.find((item: { character: string }) => item.character === character)?.points ??
          reading.reward?.points ??
          0,
      );
    }
    void load().catch(() => {});
    return () => controller.abort();
  }, [reading, authenticated, getAccessToken, locale, character]);

  /** 공유 링크를 만들어 복사하거나(copy) 기기 공유창으로 보낸다(send). */
  async function share(via: "copy" | "send") {
    if (sharing) return;
    setSharing(true);
    try {
      const headers = {
        Authorization: `Bearer ${await getAccessToken()}`,
        "Content-Type": "application/json",
      };
      const response = await fetch("/api/chemi/shares", {
        method: "POST",
        headers,
        body: JSON.stringify({ readingId: reading.readingId, character }),
      });
      if (!response.ok) throw Error();
      const card = await response.json();
      const href = new URL(card.url, location.origin).href;
      if (via === "send") await navigator.share({ title: overallHeadline[stars.overall - 1], url: href });
      else {
        await navigator.clipboard.writeText(href);
        showFanToast({ title: uiText("copyDone"), tone: "success" });
      }
      setShareOpen(false);
      await fetch(`/api/chemi/shares/${encodeURIComponent(card.shareId)}/done`, {
        method: "POST",
        headers,
        body: JSON.stringify({ via }),
      }).catch(() => {});
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      showFanToast({ title: uiText("copyFailed"), tone: "error" });
    } finally {
      setSharing(false);
    }
  }

  const canSend = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const shareAction = (
    <FanAction fullWidth onClick={() => setShareOpen(true)}>
      <ReadingText id="share" />
    </FanAction>
  );
  const rows: readonly (StarDomain | "overall")[] = ["overall", ...domains];
  const lineOf = (key: StarDomain | "overall") =>
    key === "overall" ? "" : domainLine[key][stars[key] - 1];
  const chartCards = (
    <div className={styles.cards}>
      <div className={styles.card}>
        <FanText role="meta"><ReadingText id="sun" /></FanText>
        <FanText role="item">{sunBare}</FanText>
      </div>
      <div className={styles.card}>
        <FanText role="meta"><ReadingText id="moon" /></FanText>
        <FanText role="item">{moonBare}</FanText>
      </div>
    </div>
  );

  return (
    <article data-star-result="" className={styles.layout}>
      <Toolbar name={name} back={backHref} />
      <div className={styles.main}>
        <header className={styles.head}>
          <FanText as="p" role="meta">
            {uiText("skyBy", { name, subject: withParticle(name, "이가"), date: new Intl.DateTimeFormat(locale, { month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(reading.kstDate)) })} · {sunName}
          </FanText>
          <div className={styles.titleRow}>
            <FanHeading as="h1">{overallHeadline[stars.overall - 1]}</FanHeading>
          </div>
          <FanText as="p" role="meta">
            {result.timeKnown ? uiText("withTime") : uiText("noTime")}
          </FanText>
          <StarRating
            value={stars.overall}
            label={uiText("overallStars", { count: stars.overall })}
            size={20}
            tone="accent"
          />
          <picture className={styles.hero}>
            <source media="(min-width: 48rem)" srcSet={`${art}/hero-${character}-l-v1.webp`} />
            <img src={`${art}/head-${character}-v1.webp`} alt="" />
          </picture>
        </header>
        <section className={`${styles.panel} ${styles.domainPanel}`}>
          <div className={styles.rewardRow}>
            {points > 0 && <EarnBadge locale={locale} points={points} variant="inline" />}
            {reading.reward?.stamp && <FanText role="meta"><ReadingText id="stamp" /></FanText>}
            {Boolean(reading.reward?.exp) && (
              <FanText role="meta">{uiText("affinityGain", { exp: reading.reward?.exp ?? 0 })}</FanText>
            )}
            {points > 0 && <FanText role="meta">{uiText("shareOf", { name })}</FanText>}
          </div>
          <ul className={styles.domains}>
            {rows.map((key) => {
              const isBest = key === best;
              return (
                <li data-row="star"
                  key={key}
                  className={`${styles.domain} ${key === "overall" ? styles.overallRow : ""}`}
                  data-best={isBest || undefined}
                >
                  <div className={styles.domainHead}>
                    <FanText role="label">{domainLabels[key]}</FanText>
                    <StarRating
                      value={stars[key]}
                      label={uiText("ratedStars", { domain: domainLabels[key], count: stars[key] })}
                    />
                    {isBest && (
                      <FanText role="label" className={styles.bright}>
                        <ReadingText id="highlight" />
                      </FanText>
                    )}
                  </div>
                  <FanText as="p" role="body">
                    {key === "overall"
                      ? overallHeadline[stars.overall - 1]
                      : isBest
                        ? domainLong[key][stars[key] - 1]
                        : lineOf(key)}
                  </FanText>
                </li>
              );
            })}
          </ul>
        </section>
        <div className={`${styles.todaySec} ${styles.twoCol}`}>
          <section className={styles.section}>
            <FanHeading><ReadingText id="today" /></FanHeading>
            <div className={styles.doDont}>
              <div>
                <span className={styles.bright}>
                  <FanHeading as="h3"><ReadingText id="do" /></FanHeading>
                </span>
                <ul>
                  {todayDo[best].map((item) => (
                    <li data-row="star" key={item}>
                      <FanText role="body">{item}</FanText>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <FanHeading as="h3"><ReadingText id="avoid" /></FanHeading>
                <ul>
                  {todayDont[worst].map((item) => (
                    <li data-row="star" key={item}>
                      <FanText role="body">{item}</FanText>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
          <section className={styles.section}>
            <FanHeading><ReadingText id="why" /></FanHeading>
            <ul className={styles.reasons}>
              {reasons.map((reason) => (
                <li data-row="star" key={reason.title + reason.aspect}>
                  <div className={styles.reasonHead}>
                    <FanText as="strong" role="item">
                      {reason.title}
                    </FanText>
                    <FanText role="meta">{reason.aspect}</FanText>
                    <span className={styles.tag}>
                      <FanIcon icon={reason.up ? ChevronUp : ChevronDown} />
                      <FanText role="meta">
                        {domainLabels[reason.domain]} {reason.up ? uiText("help") : uiText("pressure")}
                      </FanText>
                    </span>
                  </div>
                  <FanText role="meta" className={styles.when}>
                    {reason.when}
                  </FanText>
                  <FanText as="p" role="body">
                    {reason.text}
                  </FanText>
                </li>
              ))}
            </ul>
          </section>
        </div>
        <div className={styles.mobileActions}>{shareAction}</div>
      </div>
      <aside className={styles.side}>
        <Reaction
          character={character}
          name={name}
          line={starSayLine(character, best, stars[best])}
          action={
            <FanAction variant="primary" fullWidth href={`/chemi?locale=${locale}`}>
              <ReadingText id="otherFortunes" />
            </FanAction>
          }
          extra={<div className={styles.desktopOnly}>{shareAction}</div>}
        />
        <section className={`${styles.section} ${styles.chartSec}`}>
          <div className={styles.sectionHead}>
            <FanHeading><ReadingText id="chart" /></FanHeading>
            <FanAction variant="text" size="sm" onClick={onChart}>
              <ReadingText id="viewAll" /><span aria-hidden="true"> ›</span>
            </FanAction>
          </div>
          {chartCards}
        </section>
        <Legal />
      </aside>
      <FanDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        title={uiText("share")}
        closeLabel={uiText("close")}
        responsive
        secondary={canSend ? { label: uiText("copyLink"), onClick: () => void share("copy") } : undefined}
        primary={
          canSend
            ? { label: uiText("send"), loading: sharing, onClick: () => void share("send") }
            : { label: uiText("copyLink"), loading: sharing, onClick: () => void share("copy") }
        }
      >
        <StarShareCard
          character={character}
          name={name}
          dateText={uiText("skyBy", { name, subject: withParticle(name, "이가"), date: new Intl.DateTimeFormat(locale, { month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(reading.kstDate)) })}
          headline={overallHeadline[stars.overall - 1]!}
          overall={stars.overall}
          sign={sunName}
          best={best}
          bestStar={stars[best]}
          line={starSayLine(character, best, stars[best])}
        />
      </FanDialog>
    </article>
  );
}
