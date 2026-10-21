"use client";

import { useEffect, useState } from "react";
import type { WaveStagePresentationResponse, WaveStagePresentationScope } from "../domain/presentation";
import type { WaveStageTikTokResponse } from "../domain/tiktok-metrics";
import type { StageLocale } from "./wave-stage-copy";
import styles from "./wave-stage.module.css";

export type PresentationScene = "dashboard" | "records";
export type PresentationProps = {
  presentation?: WaveStagePresentationResponse | null; tiktok?: WaveStageTikTokResponse | null;
  scope?: WaveStagePresentationScope; onScopeChange?: (scope: WaveStagePresentationScope) => void;
  presentationFailed?: boolean; tiktokFailed?: boolean;
};
const copy = {
  ko: {
    dashboard: "팬 참여 현황", records: "팬 활동이 남긴 기록", all: "누적 활동", day: "행사 당일", scope: "집계 기간",
    fans: "활동한 팬", reservations: "10.22 LIVE 예약", passports: "발급된 패스포트", likes: "팬페이지 좋아요", comments: "응원 댓글", viewers: "현재 시청자 · TikTok 제공", offline: "방송 대기", unavailable: "확인할 수 없음", checking: "불러오는 중", refresh: "갱신", stale: "갱신에 실패했습니다. 마지막 확인값입니다.",
    allNote: "활동한 팬은 예약·패스포트·좋아요·응원에 참여한 회원을 중복 없이 집계합니다. 예약은 10.22 LIVE, 나머지는 크리에이터별 누적 기록입니다.",
    dayNote: "10.22 00:00–24:00 KST에 기록된 활동입니다. 예약은 10.22 LIVE, 나머지는 크리에이터별 기록입니다. 활동한 팬은 중복을 제외합니다.",
  },
  en: {
    dashboard: "Fan participation", records: "Fan activity onchain", all: "All recorded activity", day: "Event day", scope: "Period",
    fans: "Engaged fans", reservations: "Oct 22 LIVE reservations", passports: "Passports issued", likes: "Fan page likes", comments: "Cheer comments", viewers: "Current viewers · reported by TikTok", offline: "Not live", unavailable: "Unavailable", checking: "Loading", refresh: "Updated", stale: "Refresh failed. Last confirmed values shown.",
    allNote: "Engaged fans are distinct members with a reservation, Passport, like or cheer. Reservations cover the Oct 22 LIVE; other metrics cover each creator’s recorded activity.",
    dayNote: "Activity recorded on Oct 22, 00:00–24:00 KST. Reservations cover the Oct 22 LIVE; other metrics cover each creator. Engaged fans are deduplicated.",
  },
};
const count = (value: number | null | undefined, locale: StageLocale) => value == null ? "—" : value.toLocaleString(locale);
export function stageTime(value: string, locale: StageLocale) {
  return new Date(value).toLocaleString(locale === "ko" ? "ko-KR" : "en-GB", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Seoul", hour12: false });
}

export function WavePresentationPanel({ scene, locale, presentation, tiktok, scope = "all", onScopeChange, presentationFailed, tiktokFailed }: PresentationProps & { scene: PresentationScene; locale: StageLocale }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => { if (!document.hidden) setNow(Date.now()); }, 1_000); return () => clearInterval(timer); }, []);
  const t = copy[locale];
  const data = presentation?.scope === scope ? presentation : null;
  const onchain = data?.onchain.state === "available" ? data.onchain : null;
  const stale = presentationFailed || (onchain && (now - Date.parse(onchain.observedAt) > 90_000 || Date.parse(onchain.observedAt) > now + 30_000));
  const finalityLabel = onchain?.finality === "finalized" ? (locale === "ko" ? "최종 확정됨" : "Finalized") : (locale === "ko" ? "블록에 기록됨 · 최종 확정 대기" : "Recorded in block · awaiting finality");
  const difference = (chain: number | undefined, database: number | undefined) => chain == null || database == null ? "—" : count(database - chain, locale);
  const reference = (chain: number | undefined, database: number | undefined) => `DB ${count(database, locale)} · ${locale === "ko" ? "차이" : "Gap"} ${difference(chain, database)}`;
  return <>
    <header className={styles.sectionHeading}><div><p className={styles.eyebrow}>KYAA WAVE · 2026.10.22</p><h2>{t[scene]}</h2></div><span className={styles.sceneNumber}>{scene === "dashboard" ? "01" : "02"}<small> / 05</small></span></header>
    {<div className={styles.scopeRow}><div className={styles.views} aria-label={t.scope}>{(["all", "event-day"] as const).map(value => <button key={value} type="button" aria-pressed={scope === value} onClick={() => onScopeChange?.(value)}>{value === "all" ? t.all : t.day}</button>)}</div>{data && <time dateTime={data.asOf}>{t.refresh} {stageTime(data.asOf, locale)} KST</time>}</div>}
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
    {scene === "records" && <>
      <p className={styles.chainScope}>{locale === "ko" ? "GIWA Sepolia · 컨트랙트 직접 조회 · 차이 = DB − 온체인" : "GIWA Sepolia · direct contract counts · Gap = DB − onchain"}</p>
      <div className={`${styles.presentationCreators} ${styles.recordsCreators}`}>{(["changha", "wena"] as const).map(slug => {
        const creator = data?.creators.find(item => item.slug === slug);
        const chain = onchain?.creators.find(item => item.slug === slug);
        return <section key={slug} className={styles.presentationCreator}>
          <h3>{creator?.name ?? (slug === "changha" ? "창하 · CHANGHA" : "We;Na")}</h3>
          <div className={styles.fanTotal}>{chain ? <a className={styles.fanExplorerLink} href="https://sepolia-explorer.giwa.io/address/0xb6c5F48d770A732dEb374226EDa1E5Be209B7ED4?tab=internal_txns" target="wave-giwa-explorer" rel="noopener noreferrer" aria-label={locale === "ko" ? `${creator?.name ?? slug} 활동한 팬 ${count(chain.engagedFans, locale)}명 · GIWA 탐색기 열기 (새 창)` : `${creator?.name ?? slug}: ${count(chain.engagedFans, locale)} engaged fans · Open GIWA explorer (new window)`}><strong>{count(chain.engagedFans, locale)}</strong><span aria-hidden="true">↗</span></a> : <strong>—</strong>}<span>{t.fans}</span></div>
          <p className={styles.recordReference}>{reference(chain?.engagedFans, creator?.engagedFans)}</p>
          <dl className={styles.engagementMetrics}>{([["reservations", t.reservations], ["passports", t.passports], ["likes", t.likes], ["comments", t.comments]] as const).map(([key, label]) => <div key={key}><dt>{label}</dt><dd><span>{count(chain?.[key], locale)}</span><p className={styles.recordReference}>{reference(chain?.[key], creator?.[key])}</p></dd></div>)}</dl>
          <p className={styles.recordQueue}>{locale === "ko" ? "처리 대기" : "Pending"} {count(creator?.pending, locale)} · {locale === "ko" ? "실패" : "Failed"} {count(creator?.failed, locale)}</p>
        </section>;
      })}</div>
      <div className={styles.proof}><div><h3>{locale === "ko" ? "확인한 블록" : "Verified block"}</h3><p>{onchain ? `${finalityLabel} · #${onchain.blockNumber}${onchain.finalizedBlockNumber ? ` · ${locale === "ko" ? "최종 확정 블록" : "Finalized head"} #${onchain.finalizedBlockNumber}` : ""}` : t.unavailable}</p>{onchain && <p><time dateTime={onchain.observedAt}>{locale === "ko" ? "마지막 확인" : "Last checked"} {stageTime(onchain.observedAt, locale)} KST</time></p>}</div>{onchain && <a className={styles.contractLink} href={`https://sepolia-explorer.giwa.io/address/${onchain.contractAddress}`} target="wave-giwa-ledger" rel="noopener noreferrer">{onchain.contractAddress} ↗</a>}</div>
      {(!onchain || stale) && <p className={styles.sourceStatus} role="status">{onchain ? (locale === "ko" ? "최신 확인값이 아닙니다. 마지막으로 확인한 집계를 표시합니다." : "These counts are not current. Last verified values are shown.") : t.unavailable}</p>}
    </>}
    {scene !== "records" && (presentationFailed ? <p className={styles.sourceStatus} role="status">{data ? t.stale : t.unavailable}</p> : !data ? <p className={styles.sourceStatus} role="status">{t.checking}</p> : null)}
  </>;
}
