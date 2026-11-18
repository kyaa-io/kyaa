"use client";
import { useEffect, useState } from "react";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
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
import type { computeDailyFortune } from "@/server/chemi-engine/fortune";
import styles from "./result.module.css";

type Reading = {
  readingId: string;
  result: ReturnType<typeof computeDailyFortune>;
  styled?: { headline?: string; share?: { line?: string } };
  reward?: { points?: number; stamp?: boolean; exp?: number };
};

export function FortuneResult({
  locale,
  from,
}: {
  locale: AppLocale;
  from?: string;
}) {
  const { ready, authenticated, user, getAccessToken } = useByUsAuth();
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
        setStatus("empty");
        return;
      }
      const headers = {
        Authorization: `Bearer ${await getAccessToken()}`,
        "Content-Type": "application/json",
      };
      const response = await fetch("/api/chemi/readings", {
        method: "POST",
        headers,
        signal,
        body: JSON.stringify({
          content: "fortune",
          kind: "daily",
          character: "changha",
        }),
      });
      const data = await response.json();
      if (signal.aborted) return;
      if (data.error?.code === "CHEMI_BIRTH_REQUIRED") {
        setStatus("empty");
        return;
      }
      if (!response.ok || !data.result) throw Error();
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
            (item: { character: string }) => item.character === "changha",
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
  }, [ready, authenticated, user?.id, getAccessToken, from, attempt, locale]);

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
          character: "changha",
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
  const back = `/chemi?locale=${locale}`;
  if (status === "loading" || status === "error") {
    return (
      <section className={styles.layout}>
        <header>
          <FanAction href={back} aria-label="놀기로 돌아가기" variant="text">
            ‹
          </FanAction>{" "}
          창하
          <div className={styles.placeholder}>
            <FanSkeleton width="30%" />
            <FanSkeleton width="65%" />
            {status === "loading" ? (
              <>
                <FanSkeletonStatus locale={locale} />
                <FanSkeleton shape="block" className={styles.hero} />
              </>
            ) : (
              <FanState
                className={styles.failedHero}
                inline
                kind="error"
                title="결과를 불러오지 못했습니다"
                actions={
                  <FanAction onClick={() => retry((n) => n + 1)}>
                    다시 시도
                  </FanAction>
                }
              />
            )}
          </div>
        </header>
        <div className={styles.desktopReaction} aria-hidden="true">
          <FanSkeletonRows rows={3} variant="entity" />
        </div>
        <div className={styles.panel} aria-hidden="true">
          <FanSkeleton width="30%" />
          <FanSkeletonRows rows={1} variant="entity" />
          <FanSkeletonRows rows={4} />
        </div>
      </section>
    );
  }
  if (status === "shared")
    return (
      <section>
        <FanHeading as="h1">오늘의 운세</FanHeading>
        <p>{line}</p>
        <FanAction href={back}>놀기</FanAction>
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
  const topics = (
    <FanAction
      onClick={() => showFanToast({ title: "다른 주제는 준비 중이에요" })}
    >
      다른 주제
    </FanAction>
  );
  const goodDay = (
    <FanAction
      onClick={() => showFanToast({ title: "좋은 날 찾기는 준비 중이에요" })}
    >
      좋은 날 찾기 · 준비 중
    </FanAction>
  );
  const reaction = (
    <aside className={styles.reaction}>
      <img src="/chemi/changha.png" alt="" />
      <strong>창하의 한마디</strong>
      {reading.styled?.share?.line && <p>{reading.styled.share.line}</p>}
      {points > 0 && (
        <EarnBadge locale={locale} points={points} variant="inline" />
      )}
      {Boolean(reading.reward?.exp) && (
        <small>친밀 +{reading.reward?.exp}</small>
      )}
      <div className={styles.cta}>
        <FanAction
          variant="primary"
          fullWidth
          onClick={() => showFanToast({ title: "질문하기는 준비 중이에요" })}
        >
          이 결과로 질문하기
        </FanAction>
      </div>
      <FanAction disabled={sharing} onClick={share}>
        자랑하기
      </FanAction>
      <div className={styles.desktopOnly}>{topics}</div>
    </aside>
  );
  return (
    <article data-fortune-result="" className={styles.layout}>
      <header>
        <FanAction href={back} aria-label="놀기로 돌아가기" variant="text">
          ‹
        </FanAction>{" "}
        <b>창하</b>{" "}
        <FanText as="time" role="meta">
          {new Intl.DateTimeFormat(locale, {
            timeZone: "Asia/Seoul",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(Date.now())}
        </FanText>
        <FanText as="p" role="meta">
          창하가 본 나의 오늘
        </FanText>
        <FanHeading as="h1">
          {reading.styled?.headline || result.grade.name}
        </FanHeading>
        <img className={styles.hero} src="/chemi/fortune.png" alt="" />
      </header>

      <div className={styles.desktopReaction}>
        {reaction}
        <section className={styles.panel}>
          <FanHeading>좋은 날 찾기</FanHeading>
          {goodDay}
        </section>
      </div>
      <section className={styles.panel}>
        <FanHeading>
          <FanNumber size="xl" locale={locale} value={result.score} />{" "}
          {result.grade.name}
        </FanHeading>
        <div className={styles.mobileReaction}>{reaction}</div>
        {(
          [
            ["덕질", result.fields.fandom],
            ["인연", result.fields.people],
            ["금전", result.fields.money],
            ["건강", result.fields.rest],
          ] as const
        ).map(([name, value]) => (
          <div className={styles.scoreRow} key={name}>
            <FanText role="meta">{name}</FanText>
            <FanText role="label">{value}</FanText>
            <FanGauge label={name} max={100} value={value} />
          </div>
        ))}
      </section>
      <section className={styles.panel}>
        <FanHeading>오늘의 운세</FanHeading>
        <details>
          <summary>계산 펼쳐보기</summary>
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
        </details>
        <details>
          <summary>오늘의 행운</summary>
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
        </details>
      </section>
      <div className={styles.mobileActions}>
        {topics}
        {goodDay}
      </div>
    </article>
  );
}
