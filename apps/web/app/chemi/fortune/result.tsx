"use client";
import { useEffect, useState } from "react";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { ChevronLeft } from "@/components/fan-ui/fan-icons";
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
import type { FortuneReading as Reading } from "./reading";
import {
  band,
  flowNotes,
  fieldNotes,
  kstDate,
  kstDayStart,
  kstWeekday,
  periodHours,
  periodNotes,
  spiritNotes,
  stageNotes,
} from "./result-copy";
import styles from "./result.module.css";

export function FortuneResult({
  locale,
  from,
  initial,
  backHref,
  character = "changha",
}: {
  character?: FortuneCharacterId;
  locale: AppLocale;
  from?: string;
  /** 뒤로 가기를 눌렀을 때 갈 곳. 기본은 케미 탭. */
  backHref?: string;
  /** 대화 장면에서 이미 받은 결과. 있으면 다시 요청하지 않는다. */
  initial?: Reading;
}) {
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
        data = await response.json();
        if (signal.aborted) return;
        if ((data as { error?: { code?: string } }).error?.code === "CHEMI_BIRTH_REQUIRED") {
          setStatus("empty");
          return;
        }
        if (!response.ok || !data.result) throw Error();
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
  }, [ready, authenticated, user?.id, getAccessToken, from, attempt, locale, initial, character]);

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
      showFanToast({ title: "결과를 복사했어요", tone: "success" });
      await fetch(
        `/api/chemi/shares/${encodeURIComponent(card.shareId)}/done`,
        { method: "POST", headers, body: JSON.stringify({ via: "copy" }) },
      ).catch(() => {});
    } catch {
      showFanToast({ title: "복사하지 못했어요", tone: "error" });
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
        ariaLabel="뒤로 가기"
        leadingIcon={<FanIcon icon={ChevronLeft} />}
        className={styles.round}
      />
      <FanText role="label" className={styles.chip}>
        {name}
      </FanText>
      {status === "result" && (
        <FanText as="time" role="meta">
          {kstDate("ko", day)} ({kstWeekday("ko", day)})
        </FanText>
      )}
    </div>
  );
  if (status === "guest")
    return (
      <FanState
        kind="auth"
        title="로그인하고 오늘의 운세를 확인하세요"
        actions={<FanAction onClick={login}>로그인</FanAction>}
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
                title="결과를 불러오지 못했습니다"
                actions={
                  <FanAction size="sm" onClick={() => retry((n) => n + 1)}>
                    다시 시도
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
          <FanHeading as="h1">오늘의 운세</FanHeading>
          <FanState inline kind="info" title={line} />
        </div>
      </section>
    );
  if (status === "empty" || !reading || reading.result.locked)
    return (
      <FanState
        kind="empty"
        title="오늘의 결과가 아직 없습니다"
        action={{ href: back, label: "놀기로 돌아가기" }}
      />
    );
  const { result } = reading;
  const headline = reading.styled?.headline || result.grade.name;
  const top = (
    [
      ["덕질", "fandom", result.fields.fandom],
      ["사람", "people", result.fields.people],
      ["일·학업", "work", result.fields.work],
      ["건강·쉼", "rest", result.fields.rest],
    ] as const
  );
  const more = [
    ...top,
    ["애정", "love", result.fields.love],
    ["금전", "money", result.fields.money],
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
  const actions = (
    <div className={styles.actions}>
      <FanAction disabled={sharing} onClick={share}>
        자랑하기
      </FanAction>
      <FanAction href={`/chemi?locale=${locale}`}>다른 주제</FanAction>
    </div>
  );
  return (
    <article data-fortune-result="" className={styles.layout}>
      {toolbar}
      <div className={styles.main}>
        <header className={styles.head}>
          <FanText as="p" role="meta">
            {result.evidence.dayPillar}일 · {name}가 본 나의 오늘
          </FanText>
          <FanHeading as="h1">{headline}</FanHeading>
          <picture className={styles.hero}>
            <source
              media="(min-width: 48rem)"
              srcSet={`/chemi/fortune/fortune-${character === "changha" ? "" : `${character}-`}v1.webp`}
            />
            <img
              src={`/chemi/fortune/fortune-${character === "changha" ? "" : `${character}-`}v1.webp`}
              alt=""
            />
          </picture>
        </header>
        <section className={`${styles.panel} ${styles.scorePanel}`}>
          <div className={styles.score}>
            <FanNumber size="xl" locale={locale} value={result.score} />
            <FanHeading as="h2">{result.grade.name}</FanHeading>
          </div>
          <div className={styles.rewardRow}>
            {points > 0 && (
              <EarnBadge locale={locale} points={points} variant="inline" />
            )}
            {reading.reward?.stamp && <FanText role="meta">스탬프 1개</FanText>}
            {Boolean(reading.reward?.exp) && (
              <FanText role="meta">친밀 +{reading.reward?.exp}</FanText>
            )}
            {points > 0 && <FanText role="meta">{name} 몫</FanText>}
          </div>
          <div className={styles.bars}>
            {top.map(([label, , value]) => bar(label, value))}
          </div>
          <FanDisclosure label="분야별 풀이">
            <div className={styles.fields}>
              {more.map(([label, key, value]) => (
                <div key={key}>
                  {bar(label, value, key)}
                  <FanText as="p" role="meta">
                    {fieldNotes[key][band(value)]}
                  </FanText>
                </div>
              ))}
            </div>
          </FanDisclosure>
        </section>
        <section className={`${styles.section} ${styles.flowSec}`}>
          <FanHeading>오늘의 흐름</FanHeading>
          <p>{flowNotes[result.grade.name]}</p>
        </section>
        <section className={`${styles.section} ${styles.timesSec}`}>
          <FanHeading>시간대</FanHeading>
          <div className={styles.times}>
            {(
              [
                ["오전", "morning"],
                ["오후", "afternoon"],
                ["밤", "night"],
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
            <FanHeading>오늘의 12운성 · 12신살</FanHeading>
            <dl className={styles.stars}>
              {stage && (
                <div>
                  <FanText as="dt" role="meta">
                    12운성
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
                    12신살
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
          <FanDisclosure label="왜 이 점수일까">
            <dl className={styles.facts}>
              {Object.entries({
                일진: result.evidence.dayPillar,
                세운: result.evidence.yearPillar,
                관계: result.evidence.relation,
                십이운성: result.evidence.stage,
                십신: result.evidence.tenGod,
                용신: result.evidence.useful,
                기준: result.evidence.timeBasis,
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
          <FanDisclosure label="오늘의 행운">
            <dl className={styles.facts}>
              {Object.entries({
                색: result.luck.color,
                숫자: result.luck.number,
                방향: result.luck.direction,
                물건: result.luck.item,
                "행운 시간":
                  result.luck.luckyHour &&
                  `${result.luck.luckyHour.start}~${result.luck.luckyHour.end}시`,
                "쉬어 갈 시간":
                  result.luck.restHour &&
                  `${result.luck.restHour.start}~${result.luck.restHour.end}시`,
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
            {name}의 한마디
          </FanText>
          <FanText as="p" role="body">
            {sayLine}
          </FanText>
          <div className={styles.cta}>
            <FanAction
              variant="primary"
              fullWidth
              onClick={soon("질문하기는 준비 중이에요")}
            >
              이 결과로 질문하기
            </FanAction>
          </div>
          <div className={styles.desktopOnly}>{actions}</div>
        </section>
        <nav className={styles.nextList} aria-label="더 보기">
          {["내일 운세", "친구와 오늘", "지난 기록", "특별 부적 만들기"].map(
            (label) => (
              <FanAction
                variant="text"
                key={label}
                className={styles.nextItem}
                onClick={soon(`${withTopic(label)} 준비 중이에요`)}
              >
                <FanText role="item">{label}</FanText>
                <span aria-hidden="true">›</span>
              </FanAction>
            ),
          )}
        </nav>
        <footer className={styles.legal}>
          <FanText as="p" role="meta">
            재미로 보는 풀이입니다. 중요한 결정의 근거로 쓰지 마세요.
          </FanText>
        </footer>
      </aside>
    </article>
  );
}
