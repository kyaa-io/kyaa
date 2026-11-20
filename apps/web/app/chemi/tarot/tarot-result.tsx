"use client";

import { useReadingCopy, ReadingText } from "@/features/chemi/i18n/reading-ui";
import Link from "@/components/fan-ui/hover-prefetch-link";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import { ChevronRight } from "@/components/fan-ui/fan-icons";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import { FanTag } from "@/components/fan-ui/fan-tag";
import { FanText } from "@/components/fan-ui/fan-text";
import { celebrateReward } from "@/components/fan-ui/reward-celebration";
import { EarnBadge } from "@/features/dukjil/ui/earn-badge";
import { CHEMI_PASSPORT_DAILY_POINTS } from "@/features/chemi/domain/reward";
import { TAROT_DECK, TAROT_DECK_SIZE, tarotFace, tarotTitle } from "@/features/chemi/tarot/deck";
import { tarotCharacter, tarotFaceThumb, type TarotCharacter } from "@/features/chemi/tarot/script";
import type { AppLocale } from "@/i18n/locales";
import type { TarotMeaning } from "./use-tarot-meaning";
import { kstDate, type TarotAuth, type TarotDraw, type TarotReward } from "./types";
import styles from "./tarot.module.css";




type Rewards = { reward: TarotReward; replayed: boolean; points: number };

export function TarotResult({
  locale,
  character,
  draw,
  member,
  auth,
  meaning,
  headers,
  onAsk,
}: {
  locale: AppLocale;
  character: TarotCharacter;
  draw: TarotDraw;
  member: boolean;
  auth: TarotAuth;
  meaning: TarotMeaning;
  headers: () => Promise<Record<string, string>>;
  /** 저장된 내 카드일 때만 준다: 이 결과로 질문하기. */
  onAsk?: () => void;
}) {
  const uiText = useReadingCopy();
  const person = tarotCharacter(character);
  // 지난 날의 결과 링크로 열었으면 오늘 받은 것을 이 카드의 보상으로 보여 주지 않는다.
  const today = draw.date === kstDate();
  const [rewards, setRewards] = useState<Rewards | null>(null);
  const [keepSave, setKeepSave] = useState(true);
  const celebrated = useRef(false);
  const authorize = useRef(headers);
  useLayoutEffect(() => {
    authorize.current = headers;
  });

  // 회원: 이 최애로 오늘 받은 것을 서버 값 그대로 읽는다. 다시 온 장면에서 열었으면 먼저 한 번 맞춘다(같은 카드 · 같은 날, 중복 지급 없음).
  useEffect(() => {
    if (!member || !today) return;
    const controller = new AbortController();
    const signal = controller.signal;
    void (async () => {
      const authorization = await authorize.current();
      let reward = draw.reward;
      let replayed = draw.replayed;
      if (draw.settle) {
        const response = await fetch("/api/chemi/readings", {
          method: "POST",
          headers: authorization,
          signal,
          body: JSON.stringify({ content: "tarot", kind: "daily", character, position: 0 }),
        });
        if (response.ok) {
          const data = (await response.json()) as { reward?: TarotReward; replayed?: boolean };
          reward = data.reward ?? {};
          replayed = Boolean(data.replayed);
        }
      }
      let points = reward.points ?? 0;
      const today = await fetch("/api/chemi/rewards/today", { headers: authorization, signal });
      if (today.ok) {
        const grants = ((await today.json()) as { grants?: { character: string; points: number }[] }).grants;
        points = grants?.find((grant) => grant.character === character)?.points ?? points;
      }
      if (!signal.aborted) setRewards({ reward, replayed, points });
    })().catch(() => !signal.aborted && setRewards({ reward: draw.reward, replayed: draw.replayed, points: draw.reward.points ?? 0 }));
    return () => controller.abort();
    // draw 는 같은 카드면 같은 값이다: 값이 같은데 새 객체라고 다시 맞추지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member, today, draw.card, draw.readingId, draw.settle, character]);

  useEffect(() => {
    if (!rewards || celebrated.current || rewards.replayed || rewards.points <= 0) return;
    celebrated.current = true;
    celebrateReward({ locale, points: rewards.points, stamps: Number(Boolean(rewards.reward.stamp)) });
  }, [rewards, locale]);

  const alt = TAROT_DECK[draw.card][2];
  const direction = uiText(draw.reversed ? "reversed" : "upright");
  const content = meaning.card?.dir[draw.reversed ? "down" : "up"];
  const slotLine = draw.slot ? ` · ${uiText("deckSlot", { total: TAROT_DECK_SIZE, slot: draw.slot })}` : "";

  const rewardRow = member && today ? <RewardRow character={character} name={person.name} rewards={rewards} locale={locale} /> : null;
  const saveBox = !member ? (
    keepSave ? (
      <div className={styles.save}>
        <p>
          <FanText role="label"><ReadingText id="unsaved" /></FanText>
          <FanText role="meta"><ReadingText id="saveHint" /></FanText>
        </p>
        <div className={styles.saveActions}>
          <FanAction onClick={auth.login}><ReadingText id="loginSave" /></FanAction>
          <FanAction variant="text" onClick={() => setKeepSave(false)}>
            <ReadingText id="withoutSaving" />
          </FanAction>
        </div>
      </div>
    ) : (
      <p className={styles.saveOff}>
        <FanText role="label"><ReadingText id="unsaved" /></FanText>
        <FanText role="meta"><ReadingText id="saveHint" /></FanText>
      </p>
    )
  ) : null;
  const askAction = onAsk ? (
    <FanAction variant="primary" fullWidth onClick={onAsk}>
      <ReadingText id="askFromResult" />
    </FanAction>
  ) : null;
  const failed = meaning.status === "error";
  const pair = failed ? null : (
    <div className={styles.pair}>
      <FanText role="meta">{uiText("todayPair", { name: person.name })}</FanText>
      {content ? <FanHeading as="h3">{content.pair}</FanHeading> : <FanSkeleton width="70%" height={22} />}
    </div>
  );

  return (
    <article className={styles.result} data-reversed={draw.reversed || undefined} data-result="">
      <div className={styles.colMain}>
        <header className={styles.head}>
          <FanText as="p" role="meta">{`${uiText("cardDay", { date: new Intl.DateTimeFormat(locale, { month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(draw.date)) })}${slotLine}`}</FanText>
          <div className={styles.nameRow}>
            <FanHeading as="h1">{tarotTitle(draw.card)}</FanHeading>
            <FanTag tone="fan">{direction}</FanTag>
          </div>
        </header>
        <div className={styles.hero} data-reversed={draw.reversed || undefined}>
          <img className={styles.cloth} src="/chemi/tarot/cloth-390.webp" alt="" />
          <img className={styles.cardFace} src={tarotFace(draw.card)} alt={alt} />
        </div>
        <div className={styles.pairPanel}>
          {pair}
          {rewardRow}
          {saveBox}
          {askAction}
        </div>

        <section className={styles.mean} data-failed={failed || undefined}>
          <div className={styles.meanBody}>
            {failed ? (
              <Retry onRetry={meaning.retry} />
            ) : (
              <>
                <FanHeading><ReadingText id="meaning" /></FanHeading>
                {content ? (
                  <>
                    <FanText as="p" role="item" className={styles.lead}>
                      {content.lead}
                    </FanText>
                    <dl className={styles.rows}>
                      {content.rows.map(([label, text]) => (
                        <div key={label}>
                          <FanText as="dt" role="meta">
                            {label}
                          </FanText>
                          <FanText as="dd" role="body">
                            {text}
                          </FanText>
                        </div>
                      ))}
                    </dl>
                  </>
                ) : (
                  <Placeholder />
                )}
              </>
            )}
          </div>
          <div className={styles.pairSide}>{pair}</div>
        </section>

        <section className={styles.sym} hidden={failed}>
          <FanHeading><ReadingText id="symbol" /></FanHeading>
          {meaning.card ? (
            <FanText as="p" role="body">
              {meaning.card.symbol}
            </FanText>
          ) : (
            <Placeholder rows={3} />
          )}
        </section>

        <footer className={styles.legal}>
          <FanText as="p" role="meta">
            <ReadingText id="fun" />
          </FanText>
          <FanText as="p" role="meta">
            <ReadingText id="ai" />
          </FanText>
        </footer>
      </div>

      <div className={styles.colAside}>
        <div className={styles.said}>
          <div className={styles.react}>
            <img src={tarotFaceThumb(character)} alt="" />
            <span>
              <FanText role="label">{person.name}</FanText>
              {content ? (
                <FanText role="body">{content.react[person.voice]}</FanText>
              ) : failed ? null : (
                <FanSkeleton width="80%" />
              )}
            </span>
          </div>
          <div className={styles.asideReward}>
            {rewardRow}
            {saveBox}
            {askAction}
          </div>
        </div>
        <section className={styles.keys} hidden={failed}>
          <FanHeading><ReadingText id="keywords" /></FanHeading>
          {meaning.card ? (
            <dl className={styles.rows}>
              {(["up", "down"] as const).map((side, index) => (
                <div key={side} aria-current={Number(draw.reversed) === index ? "true" : undefined}>
                  <FanText as="dt" role="meta">
                    {uiText(index ? "reversed" : "upright")}
                  </FanText>
                  <dd>
                    <ul className={styles.words}>
                      {meaning.card[side].split(" · ").map((word) => (
                        <li key={word} data-row="">
                          <FanText role={Number(draw.reversed) === index ? "item" : "body"}>{word}</FanText>
                        </li>
                      ))}
                    </ul>
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <Placeholder rows={2} />
          )}
        </section>
      </div>
    </article>
  );
}

function Placeholder({ rows = 4 }: { rows?: number }): ReactNode {
  return (
    <div className={styles.placeholder} aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <FanSkeleton key={index} width={index % 2 ? "70%" : "100%"} />
      ))}
    </div>
  );
}

function Retry({ onRetry }: { onRetry: () => void }) {
  return (
    <div className={styles.retry} role="alert">
      <FanText as="p" role="body">
        <ReadingText id="loadFailure" />
      </FanText>
      <FanAction size="sm" onClick={onRetry}>
        <ReadingText id="retry" />
      </FanAction>
    </div>
  );
}

/** 받은 것을 적는 한 줄. 서버가 준 값만 그리고, 없는 값은 칸도 만들지 않는다. 패스포트가 없으면 받으러 가는 링크가 된다. */
function RewardRow({ character, name, rewards, locale }: { character: TarotCharacter; name: string; rewards: Rewards | null; locale: AppLocale }) {
  const uiText = useReadingCopy();
  if (!rewards) return <div className={styles.rewardRow} aria-hidden="true"><FanSkeleton width="60%" /></div>;
  const { reward, replayed, points } = rewards;
  const parts: ReactNode[] = [];
  if (points > 0 && !replayed) parts.push(<EarnBadge key="points" locale={locale} points={points} variant="inline" />);
  if (reward.stamp) parts.push(<FanText key="stamp" role="meta"><ReadingText id="stamp" /></FanText>);
  if (reward.exp) parts.push(<FanText key="exp" role="meta">{uiText("affinityGain", { exp: reward.exp })}</FanText>);
  if (reward.week) parts.push(<FanText key="week" role="meta">{uiText("weekDays", { days: reward.week })}</FanText>);
  if (replayed && points > 0 && parts.length === 0) parts.push(<FanText key="received" role="meta">{uiText("receivedToday", { name })}</FanText>);
  if (points <= 0 && character !== "dosa")
    return (
      <Link className={styles.rewardRow} data-link="" href={`/c/${character}`}>
        <FanText className={styles.go} role="label">{uiText("passportReward", { points: CHEMI_PASSPORT_DAILY_POINTS })}</FanText>
        {reward.exp ? <FanText role="meta">{uiText("affinityGain", { exp: reward.exp })}</FanText> : null}
        <FanIcon icon={ChevronRight} size={16} className={styles.goArrow} />
      </Link>
    );
  if (parts.length === 0) return null;
  return <p className={styles.rewardRow}>{parts}</p>;
}
