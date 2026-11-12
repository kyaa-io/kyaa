"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanGauge } from "@/components/fan-ui/fan-number";
import { FanState } from "@/components/fan-ui/fan-state";
import { FanText } from "@/components/fan-ui/fan-text";
import { FanMissionList, FanMissionRow, MissionDoneStamp } from "@/features/dukjil/ui/fan-mission-row";
import { playStampSlam } from "@/features/dukjil/ui/stamp-slam";
import type { AppLocale } from "@/i18n/locales";
import { FIRST_STEP_IDS, FIRST_STEPS_PATH, firstStepHref, type FirstStepId } from "../domain/first-steps";
import { firstStepsCopy } from "./first-steps-copy";
import { useFirstSteps } from "./use-first-steps";
import styles from "./first-steps-screen.module.css";

/** 걸음마다 ink-v1 도장 한 벌(같은 화풍). 행 그림과 여권 위 도장이 같은 모양이다. */
export const FIRST_STEP_STAMP: Record<FirstStepId, string> = {
  join: "/images/stamps/ink-v1/invite.webp",
  passport: "/images/stamps/ink-v1/welcome.webp",
  attend: "/images/stamps/ink-v1/daily-checkin.webp",
};
/** 첫 걸음 전용 그림(빈 여권 + 도장 + 잉크): 390은 2:1, 768+는 정사각. 걸음을 마칠 때마다 여권 빈 면에 도장이 코드로 찍힌다. */
export const FIRST_STEPS_ART = { wide: "/images/onboarding/first-steps-wide.webp", square: "/images/onboarding/first-steps-square.webp" } as const;
const SLAM_SEEN = "kyaa:first-steps:slam";
/** 이 탭에서 이미 찍힘을 본 걸음 수. 그보다 앞선 도장·게이지 칸은 다시 움직이지 않는다(새로 마친 걸음만 한 번). */
const LANDED_SEEN = "kyaa:first-steps:landed";

function loginHref(locale: AppLocale) {
  return `/login?${new URLSearchParams({ returnTo: `${FIRST_STEPS_PATH}?locale=${locale}`, locale })}`;
}

/** 세 걸음을 다 마친 것을 처음 보는 순간 한 번 스탬프가 찍힌다(움직임 줄이기면 정지 그림, stamp-slam이 처리). */
function useCompletionStamp(complete: boolean) {
  useEffect(() => {
    if (!complete) return;
    try {
      if (window.sessionStorage.getItem(SLAM_SEEN)) return;
      window.sessionStorage.setItem(SLAM_SEEN, "1");
    } catch { return; }
    void playStampSlam();
  }, [complete]);
}

/** 새로 마친 걸음만 한 번 찍히게: 화면이 열릴 때 본 걸음 수를 읽어 두고, 그린 뒤 지금 걸음 수로 바꿔 둔다. */
function useLandedCount(doneCount: number, active: boolean) {
  const [landed] = useState(() => {
    try { return Number(window.sessionStorage.getItem(LANDED_SEEN)) || 0; } catch { return 0; }
  });
  useEffect(() => {
    if (!active) return;
    try { window.sessionStorage.setItem(LANDED_SEEN, String(doneCount)); } catch { /* storage blocked: stamps land on every visit */ }
  }, [active, doneCount]);
  return Math.min(landed, doneCount);
}

export function FirstStepsScreen({ locale }: { locale: AppLocale }) {
  const t = firstStepsCopy(locale);
  const view = useFirstSteps(locale);
  const member = view.status === "member" ? view : null;
  const facts = member?.facts ?? null;
  const doneCount = member?.progress.doneCount ?? 0;
  useCompletionStamp(Boolean(member?.progress.complete));
  const landed = useLandedCount(doneCount, member !== null);

  const detail = (id: FirstStepId) => {
    if (!member) return undefined;
    if (id === "join") return member.facts.joinedPages[0]?.name;
    if (id === "passport") return member.facts.passports[0]?.name;
    return member.streak > 0 ? t.streak(member.streak) : undefined;
  };

  /** 화면의 버튼은 하나: 비회원은 로그인, 회원은 다음 걸음(다 마치면 덕질), 실패는 다시 시도. 읽는 동안은 버튼 높이만큼 자리를 비워 둔다. */
  const primary: { href?: string; onClick?: () => void; label: string; variant: "primary" | "secondary" } | null = view.status === "guest"
    ? { href: loginHref(locale), label: t.login, variant: "primary" }
    : member
      ? member.progress.next
        ? { href: firstStepHref(member.progress.next, facts, locale), label: t.next[member.progress.next], variant: "primary" }
        : { href: `/benefits?locale=${locale}`, label: t.allDone, variant: "primary" }
      : view.status === "error"
        ? { onClick: view.retry, label: t.retry, variant: "secondary" }
        : null;

  return <div className={styles.layout} data-first-steps={view.status} data-complete={member?.progress.complete ? "true" : undefined} data-landed={landed}>
    <div className={styles.art}><div className={styles.canvas}>
      <picture>
        <source media="(min-width: 48rem)" srcSet={FIRST_STEPS_ART.square} width={1600} height={1600} />
        <img src={FIRST_STEPS_ART.wide} width={1774} height={887} alt="" fetchPriority="high" />
      </picture>
      {FIRST_STEP_IDS.map((id, index) => member?.progress.steps[index]?.done
        ? <span key={id} className={styles.pressed} data-step={id} data-landed={index < landed ? "" : undefined} style={{ "--stamp": `url(${FIRST_STEP_STAMP[id]})` } as CSSProperties} aria-hidden="true" />
        : null)}
    </div></div>
    <div className={styles.panel}>
      <div className={styles.head}>
        <FanHeading as="h1">{t.title}</FanHeading>
        <FanGauge value={doneCount} max={FIRST_STEP_IDS.length} segments={FIRST_STEP_IDS.length} label={t.progressLabel} valueText={`${doneCount}/${FIRST_STEP_IDS.length}`} className={styles.gauge} />
      </div>
      <FanMissionList framed className={styles.steps}>
        {FIRST_STEP_IDS.map((id, index) => {
          const done = member?.progress.steps[index]?.done ?? false;
          return <FanMissionRow key={id} dataMission={`first-step-${id}`} done={done}
            href={view.status === "guest" && id !== "join" ? loginHref(locale) : firstStepHref(id, facts, locale)}
            art={<span className={styles.rowStamp} style={{ "--stamp": `url(${FIRST_STEP_STAMP[id]})` } as CSSProperties} />}
            title={t.step[id]}
            detail={done ? detail(id) : undefined}
            trailing={done ? <MissionDoneStamp label={t.done} /> : <FanText role="label" className={styles.go}>{t.action[id]}</FanText>} />;
        })}
      </FanMissionList>
      {view.status === "error" ? <FanState kind="error" inline compact title={t.error} /> : null}
      <div className={styles.primary}>{primary === null
        ? null
        : primary.href
          ? <FanAction variant={primary.variant} href={primary.href} fullWidth>{primary.label}</FanAction>
          : <FanAction variant={primary.variant} onClick={primary.onClick} fullWidth>{primary.label}</FanAction>}</div>
    </div>
  </div>;
}
