"use client";

import { useEffect, useState } from "react";
import type { WaveStagePresentationResponse, WaveStagePresentationScope } from "../domain/presentation";
import type { WaveStageTikTokResponse } from "../domain/tiktok-metrics";
import type { PublicDashboardData } from "@/features/public-live-dashboard/domain/public-live-dashboard";
import type { StageLocale } from "./wave-stage-copy";
import styles from "./wave-stage.module.css";

export type PresentationScene = "dashboard" | "missions" | "records";
export type PresentationProps = {
  presentation?: WaveStagePresentationResponse | null; tiktok?: WaveStageTikTokResponse | null;
  scope?: WaveStagePresentationScope; onScopeChange?: (scope: WaveStagePresentationScope) => void;
  presentationFailed?: boolean; tiktokFailed?: boolean;
};
const copy = {
  ko: {
    dashboard: "팬 참여 현황", missions: "현장에서 함께한 순간", records: "팬 활동이 남긴 기록", all: "누적 활동", day: "행사 당일", scope: "집계 기간",
    fans: "활동한 팬", reservations: "10.22 LIVE 예약", passports: "발급된 패스포트", likes: "팬페이지 좋아요", comments: "응원 댓글", viewers: "현재 시청자 · TikTok 제공", offline: "방송 대기", unavailable: "확인할 수 없음", checking: "불러오는 중", refresh: "갱신", stale: "갱신에 실패했습니다. 마지막 확인값입니다.",
    allNote: "활동한 팬은 예약·패스포트·좋아요·응원에 참여한 회원을 중복 없이 집계합니다. 예약은 10.22 LIVE, 나머지는 크리에이터별 누적 기록입니다.",
    dayNote: "10.22 00:00–24:00 KST에 기록된 활동입니다. 예약은 10.22 LIVE, 나머지는 크리에이터별 기록입니다. 활동한 팬은 중복을 제외합니다.",
    attendees: "현장 체크인", missionNote: "선택한 기간에 체크인한 참가자의 현재 미션 완료 현황입니다. 미션 완료와 온체인 기록은 별도로 집계합니다.",
    chainNote: "GIWA Sepolia · 전체 서비스 누적 검증값", transactions: "활동 트랜잭션", credentials: "발급된 인증", passportsChain: "패스포트 인증", wallets: "활동 지갑", proof: "실제 기록 확인", proofNote: "검증된 활동 1건의 트랜잭션을 탐색기에서 확인합니다.", noProof: "표시할 검증 기록이 없습니다.",
    missionNames: ["행사 체크인", "행사 사진", "팬페이지 좋아요", "자기소개", "친구 맺기", "DM 인사", "LIVE 응원", "인사이트 후기", "퀴즈 정답", "웹사이트 응원"],
  },
  en: {
    dashboard: "Fan participation", missions: "Moments at the event", records: "Fan activity onchain", all: "All recorded activity", day: "Event day", scope: "Period",
    fans: "Engaged fans", reservations: "Oct 22 LIVE reservations", passports: "Passports issued", likes: "Fan page likes", comments: "Cheer comments", viewers: "Current viewers · reported by TikTok", offline: "Not live", unavailable: "Unavailable", checking: "Loading", refresh: "Updated", stale: "Refresh failed. Last confirmed values shown.",
    allNote: "Engaged fans are distinct members with a reservation, Passport, like or cheer. Reservations cover the Oct 22 LIVE; other metrics cover each creator’s recorded activity.",
    dayNote: "Activity recorded on Oct 22, 00:00–24:00 KST. Reservations cover the Oct 22 LIVE; other metrics cover each creator. Engaged fans are deduplicated.",
    attendees: "Event check-ins", missionNote: "Current mission completion for participants who checked in during the selected period. Mission completion and onchain records are counted separately.",
    chainNote: "GIWA Sepolia · verified totals across the service", transactions: "Action transactions", credentials: "Minted credentials", passportsChain: "Passport credentials", wallets: "Active wallets", proof: "View a real record", proofNote: "Open one verified activity transaction in the explorer.", noProof: "No verified record to display.",
    missionNames: ["Event check-in", "Event photo", "Fan page like", "Introduction", "Friendship", "DM greeting", "LIVE cheer", "Insight review", "Quiz correct", "Website cheer"],
  },
};
const missionKeys = ["checkin", "event-photo", "fanpage-like", "introduction", "friendship", "dm-greeting", "live-cheer", "insight-review", "quiz-correct", "website-cheer"];
const count = (value: number | null | undefined, locale: StageLocale) => value == null ? "—" : value.toLocaleString(locale);
export function stageTime(value: string, locale: StageLocale) {
  return new Date(value).toLocaleString(locale === "ko" ? "ko-KR" : "en-GB", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Seoul", hour12: false });
}

export function WavePresentationPanel({ scene, locale, presentation, tiktok, metrics, scope = "all", onScopeChange, presentationFailed, tiktokFailed, metricsFailed }: PresentationProps & { scene: PresentationScene; locale: StageLocale; metrics: PublicDashboardData | null; metricsFailed?: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => { if (!document.hidden) setNow(Date.now()); }, 15_000); return () => clearInterval(timer); }, []);
  const t = copy[locale], onchain = metrics?.onchain.state === "available" ? metrics.onchain : null;
  const data = presentation?.scope === scope ? presentation : null;
  return <>
    <header className={styles.sectionHeading}><div><p className={styles.eyebrow}>KYAA WAVE · 2026.10.22</p><h2>{t[scene]}</h2></div><span className={styles.sceneNumber}>{scene === "dashboard" ? "01" : scene === "missions" ? "02" : "03"}<small> / 03</small></span></header>
    {scene !== "records" && <div className={styles.scopeRow}><div className={styles.views} aria-label={t.scope}>{(["all", "event-day"] as const).map(value => <button key={value} type="button" aria-pressed={scope === value} onClick={() => onScopeChange?.(value)}>{value === "all" ? t.all : t.day}</button>)}</div>{data && <time dateTime={data.asOf}>{t.refresh} {stageTime(data.asOf, locale)} KST</time>}</div>}
    {scene === "dashboard" && <>
      <div className={styles.presentationCreators}>{(["changha", "wena"] as const).map(slug => {
        const creator = data?.creators.find(item => item.slug === slug);
        const live = tiktok?.creators.find(item => item.slug === slug);
        const liveFresh = live && now - Date.parse(live.observedAt) <= 90_000 && Date.parse(live.observedAt) <= now + 30_000;
        return <section key={slug} className={styles.presentationCreator}>
          <h3>{creator?.name ?? (slug === "changha" ? "창하 · CHANGHA" : "We;Na")}</h3>
          <div className={styles.fanTotal}><strong>{count(creator?.engagedFans, locale)}</strong><span>{t.fans}</span></div>
          <div className={styles.viewerRow}><span>{t.viewers}</span><strong>{!live || tiktokFailed || !liveFresh || live.state === "unavailable" ? "—" : live.state === "offline" ? t.offline : count(live.viewers, locale)}</strong></div>
          {live && <p className={styles.observed}>{!liveFresh || tiktokFailed || live.state === "unavailable" || (live.state === "live" && live.viewers === null) ? `${t.unavailable} · ` : ""}{stageTime(live.observedAt, locale)} KST</p>}
          <dl className={styles.engagementMetrics}>{([[t.reservations, creator?.reservations], [t.passports, creator?.passports], [t.likes, creator?.likes], [t.comments, creator?.comments]] as const).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{count(value, locale)}</dd></div>)}</dl>
        </section>;
      })}</div>
      <p className={styles.metricNote}>{scope === "all" ? t.allNote : t.dayNote}</p>
    </>}
    {scene === "missions" && <>
      <div className={styles.missionSummary}><span>{t.attendees}</span><strong>{count(data?.missions.participants, locale)}</strong></div>
      <dl className={styles.missionGrid}>{missionKeys.map((key, index) => {
        const completed = data?.missions.items.find(item => item.key === key)?.completed;
        return <div key={key}><dt><span className={styles.missionIndex}>{String(index + 1).padStart(2, "0")}</span>{t.missionNames[index]}</dt><dd>{count(completed, locale)}<span> / {count(data?.missions.participants, locale)}</span></dd><div className={styles.progressTrack} aria-hidden="true"><span style={{ width: `${data?.missions.participants && completed != null ? completed / data.missions.participants * 100 : 0}%` }} /></div></div>;
      })}</dl>
      <p className={styles.metricNote}>{t.missionNote}</p>
    </>}
    {scene === "records" && <>
      <p className={styles.chainScope}>{t.chainNote}</p>
      <dl className={styles.recordMetrics}>{([[t.transactions, onchain?.metrics.currentActionTransactions], [t.passportsChain, onchain?.metrics.passportCredentials], [t.credentials, onchain?.metrics.mintedCredentials], [t.wallets, onchain?.metrics.uniqueActiveWallets]] as const).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{count(value, locale)}</dd></div>)}</dl>
      <div className={styles.proof}><div><h3>{t.proof}</h3><p>{onchain?.proof ? t.proofNote : onchain ? t.noProof : t.unavailable}</p></div>{onchain?.proof && <a href={`https://sepolia-explorer.giwa.io/tx/${onchain.proof.txHash}`} target="_blank" rel="noopener noreferrer">{onchain.proof.txHash.slice(0, 10)}…{onchain.proof.txHash.slice(-8)} ↗</a>}</div>
      {onchain && <p className={styles.metricNote}><time dateTime={onchain.asOf}>{t.refresh} {stageTime(onchain.asOf, locale)} KST</time></p>}
      {metricsFailed && <p className={styles.sourceStatus} role="status">{t.stale}</p>}
    </>}
    {scene !== "records" && (presentationFailed ? <p className={styles.sourceStatus} role="status">{data ? t.stale : t.unavailable}</p> : !data ? <p className={styles.sourceStatus} role="status">{t.checking}</p> : null)}
  </>;
}
