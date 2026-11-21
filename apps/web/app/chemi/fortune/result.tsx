"use client";
import { showShareReward } from "@/features/chemi/i18n/share-reward";
import { useReadingCopy } from "@/features/chemi/i18n/reading-ui";
import { ReadingText, ReadingTitle } from "@/features/chemi/i18n/reading-ui";
import { useEffect, useState } from "react";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { ChevronLeft, ChevronRight } from "@/components/fan-ui/fan-icons";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import { FanDisclosure } from "@/components/fan-ui/fan-collapsible";
import { FanState } from "@/components/fan-ui/fan-state";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanNumber, FanGauge } from "@/components/fan-ui/fan-number";
import { FanText } from "@/components/fan-ui/fan-text";
import { FanAction } from "@/components/fan-ui/fan-action";
import {
  FanSkeleton,
  FanSkeletonRows,
  FanSkeletonStatus,
} from "@/components/fan-ui/fan-skeleton";
import { showFanToast } from "@/components/fan-ui/fan-toast";
import { celebrateReward } from "@/components/fan-ui/reward-celebration";
import { EarnBadge } from "@/features/dukjil/ui/earn-badge";
import type { AppLocale } from "@/i18n/locales";
import { withTopic } from "@/features/chemi/domain/korean-particle";
import { fortuneCharacters, fortuneTalkLine, type FortuneCharacterId } from "./lines";
import { parseNewFortune, todayKst, type FortuneReading as Reading } from "./reading";
import {
  band,
  flowNotes,
  kstDate,
  kstDayStart,
  kstWeekday,
  periodHours,
  periodNotes,
  spiritNotes,
  stageNotes,
} from "./result-copy";
import { DatePurchase } from "./date-purchase";
import { dayCardKind } from "./deep/copy";
import { DayCardThumb } from "./deep/day-card";
import deep from "./deep/deep.module.css";
import { deepHref } from "./deep/screen";
import styles from "./result.module.css";

const exampleKeys = {
  fandom: ["depthFandomA", "depthFandomB"],
  people: ["depthPeopleA", "depthPeopleB"],
  work: ["depthWorkA", "depthWorkB"],
  rest: ["depthRestA", "depthRestB"],
  love: ["depthLoveA", "depthLoveB"],
  money: ["depthMoneyA", "depthMoneyB"],
} as const;
const summaryKeys = { high: "depthHigh", mid: "depthMid", low: "depthLow" } as const;
const voiceKeys = { changha: "depthChangha", elina: "depthElina", yuna: "depthYuna", dosa: "depthDosa" } as const;

export function FortuneResult({
  locale,
  from,
  initial,
  pending = false,
  backHref,
  onAsk,
  character = "changha",
  paidPreview = false,
}: {
  /** 결제 연결 전에는 DEV 시험 모드에서만 날짜 지정(포인트)을 보인다. */
  paidPreview?: boolean;
  character?: FortuneCharacterId;
  locale: AppLocale;
  from?: string;
  /** 뒤로 가기를 눌렀을 때 갈 곳. 기본은 케미 탭. */
  backHref?: string;
  /** 대화 장면에서 이미 받은 결과. 있으면 다시 요청하지 않는다. */
  initial?: Reading;
  /** 저장된 결과를 불러오는 중. 요청은 부른 쪽이 하고, 여기서는 불러오는 모양만 그린다. */
  pending?: boolean;
  /** 내 풀이를 볼 때만 준다: 주 버튼이 이 결과로 질문하기가 된다. */
  onAsk?: () => void;
}) {
  const uiText = useReadingCopy();
  const { ready, authenticated, user, getAccessToken, login } = useByUsAuth();
  const [attempt, retry] = useState(0);
  const [reading, setReading] = useState<Reading>();
  const [points, setPoints] = useState(0);
  const [line, setLine] = useState("");
  const [status, setStatus] = useState("loading");
  const [sharing, setSharing] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;
    setStatus("loading");
    async function load() {
      if (pending) return;
      if (from) {
        const response = await fetch(
          `/api/chemi/shares/${encodeURIComponent(from)}`,
          { signal },
        );
        if (!response.ok) throw Error();
        const card = await response.json();
        if (signal.aborted) return;
        setLine(card.line ?? "");
        setStatus(card.gone || !card.line ? "empty" : "shared");
        return;
      }
      if (!ready) return;
      if (!authenticated) {
        setStatus("guest");
        return;
      }
      const headers = {
        Authorization: `Bearer ${await getAccessToken()}`,
        "Content-Type": "application/json",
      };
      let data: Reading;
      if (initial) data = initial;
      else {
        const response = await fetch("/api/chemi/readings", {
          method: "POST",
          headers,
          signal,
          body: JSON.stringify({
            content: "fortune",
            kind: "daily",
            character,
          }),
        });
        const body = await response.json();
        if (signal.aborted) return;
        if (body?.error?.code === "CHEMI_BIRTH_REQUIRED") {
          setStatus("empty");
          return;
        }
        const parsed = response.ok ? parseNewFortune(body) : null;
        if (!parsed) throw Error();
        data = parsed;
      }
      setReading(data);
      setPoints(data.reward?.points ?? 0);
      setStatus("result");
      if (!data.replayed && data.reward)
        celebrateReward({
          locale,
          points: data.reward.points,
          stamps: Number(Boolean(data.reward.stamp)),
        });
      const rewards = await fetch("/api/chemi/rewards/today", {
        headers,
        signal,
      });
      if (rewards.ok) {
        const today = await rewards.json();
        if (signal.aborted) return;
        if (today.claimedPoints > 0)
          celebrateReward({ locale, points: today.claimedPoints });
        setPoints(
          today.grants?.find(
            (item: { character: string }) => item.character === character,
          )?.points ??
            data.reward?.points ??
            0,
        );
      }
    }
    void load().catch(() => {
      if (!signal.aborted)
        setStatus((current) => (current === "result" ? current : "error"));
    });
    return () => controller.abort();
  }, [ready, authenticated, user?.id, getAccessToken, from, attempt, locale, initial, character, pending]);

  async function share() {
    if (!reading || sharing) return;
    setSharing(true);
    try {
      const headers = {
        Authorization: `Bearer ${await getAccessToken()}`,
        "Content-Type": "application/json",
      };
      const response = await fetch("/api/chemi/shares", {
        method: "POST",
        headers,
        body: JSON.stringify({
          readingId: reading.readingId,
          character,
        }),
      });
      if (!response.ok) throw Error();
      const card = await response.json();
      await navigator.clipboard.writeText(
        new URL(card.url, location.origin).href,
      );
      showFanToast({ title: uiText("copyDone"), tone: "success" });
      await fetch(
        `/api/chemi/shares/${encodeURIComponent(card.shareId)}/done`,
        { method: "POST", headers, body: JSON.stringify({ via: "copy" }) },
      ).then(response => showShareReward(response, uiText)).catch(() => {});
    } catch {
      showFanToast({ title: uiText("copyFailed"), tone: "error" });
    } finally {
      setSharing(false);
    }
  }
  const name =
    fortuneCharacters.find((item) => item.id === character)?.name ?? "창하";
  const back = backHref ?? `/chemi?locale=${locale}`;
  const day = kstDayStart(reading?.kstDate);
  const toolbar = (
    <div className={styles.toolbar}>
      <FanAction
        href={back}
        ariaLabel={uiText("back")}
        leadingIcon={<FanIcon icon={ChevronLeft} />}
        className={styles.round}
      />
      <FanText role="label" className={styles.chip}>
        {name}
      </FanText>
      {status === "result" && (
        <FanText as="time" role="meta">
          {kstDate(day)} ({kstWeekday("ko", day)})
        </FanText>
      )}
    </div>
  );
  if (status === "guest")
    return (
      <FanState
        kind="auth"
        title={uiText("signInFortune")}
        actions={<FanAction onClick={login}><ReadingText id="login" /></FanAction>}
      />
    );
  if (status === "loading" || status === "error") {
    return (
      <section data-fortune-result="" className={styles.layout}>
        {toolbar}
        <div className={styles.main}>
          <header className={styles.head}>
            <FanSkeleton width="30%" />
            <FanSkeleton width="65%" />
            {status === "loading" ? (
              <>
                <FanSkeletonStatus locale={locale} />
                <FanSkeleton shape="block" className={styles.hero} />
              </>
            ) : (
              <FanState
                bodyTitle
                className={styles.failedHero}
                inline
                kind="error"
                title={uiText("resultFailure")}
                actions={
                  <FanAction size="sm" onClick={() => retry((n) => n + 1)}>
                    <ReadingText id="retry" />
                  </FanAction>
                }
              />
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
  if (status === "shared")
    return (
      <section className={styles.layout}>
        {toolbar}
        <div className={styles.panel}>
          <FanHeading as="h1"><ReadingTitle id="fortune" /></FanHeading>
          <FanState inline kind="info" title={line} />
        </div>
      </section>
    );
  if (status === "empty" || !reading || reading.result.locked)
    return (
      <FanState
        kind="empty"
        title={uiText("noResult")}
        action={{ href: back, label: uiText("backPlay") }}
      />
    );
  const { result } = reading;
  const headline = reading.styled?.headline || result.grade.name;
  const top = (
    [
      [uiText("fandom"), "fandom", result.fields.fandom],
      [uiText("people"), "people", result.fields.people],
      [uiText("work"), "work", result.fields.work],
      [uiText("health"), "rest", result.fields.rest],
    ] as const
  );
  const more = [
    ...top,
    [uiText("love"), "love", result.fields.love],
    [uiText("money"), "money", result.fields.money],
  ] as const;
  const best = Math.max(...top.map(([, , value]) => value));
  const bar = (label: string, value: number, key?: string) => (
    <div className={styles.barRow} key={key ?? label}>
      <FanText role="meta">{label}</FanText>
      <FanNumber locale={locale} value={value} />
      <span
        className={styles.bar}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        data-top={value === best || undefined}
      >
        <i style={{ width: `${value}%` }} />
      </span>
    </div>
  );
  const stage = stageNotes[result.evidence.stage];
  const spirit = spiritNotes[result.evidence.spirit];
  const sayLine =
    reading.styled?.share?.line ??
    fortuneTalkLine(character, 4, {
      score: result.score,
      grade: result.grade.name,
      fandom: result.fields.fandom,
      money: result.fields.money,
      people: result.fields.people,
      luckyHour: result.luck.luckyHour,
      color: result.luck.color,
    });
  const soon = (title: string) => () => showFanToast({ title });
  // 오늘 날짜의 결과에만 그날의 카드(기념 카드·응원 부적)와 내일·이번 주 줄을 건다.
  const isToday = reading.kstDate === todayKst();
  const cardKind = isToday ? dayCardKind(result.score) : null;
  const deepTarget = { character, locale, readingId: reading.readingId };
  const actions = (
    <div className={styles.actions}>
      <FanAction disabled={sharing} onClick={share}>
        <ReadingText id="share" />
      </FanAction>
      <FanAction href={`/chemi?locale=${locale}`}><ReadingText id="otherGames" /></FanAction>
    </div>
  );
  return (
    <article data-fortune-result="" className={styles.layout}>
      {toolbar}
      <div className={styles.main}>
        <header className={styles.head}>
          <FanText as="p" role="meta">
            {uiText("todayBy", { pillar: result.evidence.dayPillar, name })}
          </FanText>
          <FanHeading as="h1">{headline}</FanHeading>
          <picture className={styles.hero}>
            <img
              src={
                character === "changha"
                  ? "/chemi/fortune/fortune-v1.webp"
                  : `/chemi/fortune/fortune-${character}-wide-v2.webp`
              }
              alt=""
            />
          </picture>
        </header>
        <section className={`${styles.panel} ${styles.scorePanel}`}>
          <div className={styles.score}>
            <FanNumber size="xl" locale={locale} value={result.score} />
            <FanHeading as="h2">{result.grade.name}</FanHeading>
            {cardKind && (
              <FanAction
                variant="text"
                className={deep.cardLink}
                href={deepHref("card", deepTarget)}
                trailingIcon={<DayCardThumb kind={cardKind} character={character} />}
              >
                <ReadingText id={cardKind} />
              </FanAction>
            )}
          </div>
          <div className={styles.rewardRow}>
            {points > 0 && (
              <EarnBadge locale={locale} points={points} variant="inline" />
            )}
            {reading.reward?.stamp && <FanText role="meta"><ReadingText id="stamp" /></FanText>}
            {Boolean(reading.reward?.exp) && (
              <FanText role="meta">{uiText("affinityGain", { exp: reading.reward?.exp ?? 0 })}</FanText>
            )}
            {points > 0 && <FanText role="meta">{uiText("shareOf", { name })}</FanText>}
          </div>
          <div className={styles.fields}>
            {more.map(([label, key, value]) => {
              const [first, second] = exampleKeys[key];
              return (
                <div key={key}>
                  {bar(label, value, key)}
                  <FanText as="p" role="body">{uiText(summaryKeys[band(value)])}</FanText>
                  <FanDisclosure label={uiText("more")} meta={label}>
                    <FanText as="p" role="label">{uiText(voiceKeys[character])}</FanText>
                    <ul><li data-row="">{uiText(first)}</li><li data-row="">{uiText(second)}</li></ul>
                  </FanDisclosure>
                </div>
              );
            })}
          </div>
        </section>
        <section className={`${styles.section} ${styles.flowSec}`}>
          <FanHeading><ReadingText id="todayFlow" /></FanHeading>
          <p>{flowNotes[result.grade.name]}</p>
        </section>
        <section className={`${styles.section} ${styles.timesSec}`}>
          <FanHeading><ReadingText id="timeWindow" /></FanHeading>
          <div className={styles.times}>
            {(
              [
                [uiText("morning"), "morning"],
                [uiText("afternoon"), "afternoon"],
                [uiText("night"), "night"],
              ] as const
            ).map(([label, key]) => (
              <div key={key}>
                {bar(label, result.periods[key])}
                <FanText as="p" role="meta">
                  {periodHours[key]} ·{" "}
                  {periodNotes[key][band(result.periods[key])]}
                </FanText>
              </div>
            ))}
          </div>
        </section>
        {(stage || spirit) && (
          <section className={`${styles.section} ${styles.starsSec}`}>
            <FanHeading><ReadingText id="cycle" /></FanHeading>
            <dl className={styles.stars}>
              {stage && (
                <div>
                  <FanText as="dt" role="meta">
                    <ReadingText id="lifeStage" />
                  </FanText>
                  <dd>
                    <FanText as="strong" role="item">
                      {result.evidence.stage} · {stage[0]}
                    </FanText>
                    <FanText as="p" role="meta">
                      {stage[1]}
                    </FanText>
                  </dd>
                </div>
              )}
              {spirit && (
                <div>
                  <FanText as="dt" role="meta">
                    <ReadingText id="spirits" />
                  </FanText>
                  <dd>
                    <FanText as="strong" role="item">
                      {result.evidence.spirit.replace(/살$/, "")} · {spirit[0]}
                    </FanText>
                    <FanText as="p" role="meta">
                      {spirit[1]}
                    </FanText>
                  </dd>
                </div>
              )}
            </dl>
          </section>
        )}
        <section className={`${styles.panel} ${styles.whyPanel}`}>
          <FanDisclosure label={uiText("whyScore")}>
            <dl className={styles.facts}>
              {Object.entries({
                [uiText("tableDaypillar")]: result.evidence.dayPillar,
                [uiText("tableYearpillar")]: result.evidence.yearPillar,
                [uiText("tableRelation")]: result.evidence.relation,
                [uiText("tableStage")]: result.evidence.stage,
                [uiText("tableTengod")]: result.evidence.tenGod,
                [uiText("tableUseful")]: result.evidence.useful,
                [uiText("tableBasis")]: result.evidence.timeBasis,
              }).map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <FanText as="dd" role="label">
                    {value}
                  </FanText>
                </div>
              ))}
            </dl>
          </FanDisclosure>
          <FanDisclosure label={uiText("luck")}>
            <dl className={styles.facts}>
              {Object.entries({
                [uiText("tableColor")]: result.luck.color,
                [uiText("tableNumber")]: result.luck.number,
                [uiText("tableDirection")]: result.luck.direction,
                [uiText("tableItem")]: result.luck.item,
                [uiText("tableLuckyhour")]:
                  result.luck.luckyHour &&
                  uiText("hourRange", { start: result.luck.luckyHour.start, end: result.luck.luckyHour.end }),
                [uiText("tableResthour")]:
                  result.luck.restHour &&
                  uiText("hourRange", { start: result.luck.restHour.start, end: result.luck.restHour.end }),
              }).map(
                ([label, value]) =>
                  value != null && (
                    <div key={label}>
                      <dt>{label}</dt>
                      <FanText as="dd" role="label">
                        {value}
                      </FanText>
                    </div>
                  ),
              )}
            </dl>
          </FanDisclosure>
        </section>
        <div className={styles.mobileActions}>{actions}</div>
      </div>
      <aside className={styles.side}>
        <section className={styles.reaction}>
          <img src={`/chemi/fortune/avatar-${character}-v1.jpg`} alt="" />
          <FanText as="strong" role="item" className={styles.said}>
            {uiText("theirWords", { name })}
          </FanText>
          <FanText as="p" role="body">
            {sayLine}
          </FanText>
          <div className={styles.cta}>
            <FanAction variant="primary" fullWidth {...(onAsk ? { onClick: onAsk } : { href: `/chemi?locale=${locale}` })}>
              <ReadingText id={onAsk ? "askFromResult" : "otherFortunes"} />
            </FanAction>
          </div>
          <div className={styles.desktopOnly}>{actions}</div>
        </section>
        {paidPreview && <DatePurchase key={character} character={character} locale={locale} />}
        <nav className={styles.nextList} aria-label={uiText("more")}>
          {isToday &&
            (["tomorrow", "week"] as const).map((view) => (
              <FanAction variant="text" key={view} className={styles.nextItem} href={deepHref(view, deepTarget)}>
                <span className={styles.nextRow}>
                  <FanText role="item">
                    <ReadingText id={view === "tomorrow" ? "deepTomorrow" : "deepWeek"} />
                  </FanText>
                  <FanIcon icon={ChevronRight} />
                </span>
              </FanAction>
            ))}
          {[uiText("friends"), uiText("history"), uiText("charm")].map(
            (label) => (
              <FanAction
                variant="text"
                key={label}
                className={styles.nextItem}
                onClick={soon(uiText("comingSoon", { subject: withTopic(label), label }))}
              >
                <span className={styles.nextRow}>
                  <FanText role="item">{label}</FanText>
                  <FanIcon icon={ChevronRight} />
                </span>
              </FanAction>
            ),
          )}
        </nav>
        <footer className={styles.legal}>
          <FanText as="p" role="meta">
            <ReadingText id="fun" />
          </FanText>
        </footer>
      </aside>
    </article>
  );
}
