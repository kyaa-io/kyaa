"use client";

import { useByUsAuth as usePrivy } from "@/features/auth/client/cognito-auth";
import { CircleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import type { AdminLocale } from "../../../components/admin/operations-shell";
import { useAdminSession } from "../../../components/admin/use-admin-session";
import {
  acquisitionAnalyticsSchema,
  type AcquisitionAnalyticsData,
} from "../domain/acquisition-analytics";
import base from "./admin-overview-dashboard.module.css";
import styles from "./web-analytics-dashboard.module.css";

type Days = 7 | 30 | 90;
type State =
  | { status: "loading" }
  | { status: "ready"; owner: string; data: AcquisitionAnalyticsData }
  | { status: "error" | "unauthenticated" | "denied" };

const number = (value: number, locale: AdminLocale) =>
  new Intl.NumberFormat(locale).format(value);

const channelLabels = {
  direct: { ko: "직접 방문", en: "Direct" }, search: { ko: "검색", en: "Search" },
  social: { ko: "소셜", en: "Social" }, email: { ko: "이메일", en: "Email" },
  paid: { ko: "광고", en: "Paid" }, referral: { ko: "외부 사이트", en: "Referral" },
  internal: { ko: "사이트 내부", en: "Internal" },
} as const;
const landingLabels = {
  home: { ko: "홈", en: "Home" }, creator_directory: { ko: "팬페이지 목록", en: "Fan page directory" },
  creator: { ko: "팬페이지", en: "Fan page" }, live_directory: { ko: "LIVE 목록", en: "LIVE directory" },
  live: { ko: "LIVE", en: "LIVE" }, benefit: { ko: "혜택·선물", en: "Benefits & gifts" },
  fan_guide: { ko: "팬 가이드", en: "Fan guide" },
} as const;
const columns = [
  ["acquisitions", "유입 회원", "Acquired members"],
  ["accountCreated", "가입 완료", "Account created"],
  ["profileCompleted", "프로필 완료", "Profile completed"],
  ["reservationCompleted", "예약 완료", "Reservation completed"],
  ["benefitEntered", "혜택 응모", "Benefit entered"],
] as const;

export function AcquisitionAnalyticsContent({ data, locale }: { data: AcquisitionAnalyticsData; locale: AdminLocale }) {
  const ko = locale === "ko";
  const cells = (counts: AcquisitionAnalyticsData["totals"]) => columns.map(([key]) => <td key={key}>{counts[key].state === "available" ? number(counts[key].value ?? 0, locale) : (ko ? "비공개" : "Hidden")}</td>);
  return <section className={`${base.panel} ${styles.outbound}`} aria-labelledby="acquisition-title">
    <div className={base.panelHeading}><div>
      <h2 id="acquisition-title">{ko ? "유입 후 회원 전환" : "Member conversions after acquisition"}</h2>
      <p>{ko ? "선택 기간에 유입된 회원의 채널·첫 화면별 완료 현황" : "Completed actions by channel and landing for members acquired in this period"}</p>
    </div></div>
    <p id="acquisition-scroll-hint" className={`${styles.measurementNote} ${styles.acquisitionHint}`}>{ko ? "표를 좌우로 움직이면 완료 수치를 볼 수 있습니다." : "Scroll horizontally to see completion counts."}</p>
    <div className={`${styles.tableScroll} ${styles.acquisitionScroll}`} tabIndex={0} role="region" aria-describedby="acquisition-scroll-hint" aria-label={ko ? "유입 후 회원 전환 상세 목록" : "Member acquisition conversion details"}>
      <table className={`${styles.table} ${styles.acquisitionTable}`}><thead><tr>
        <th scope="col">{ko ? "채널" : "Channel"}</th><th scope="col">{ko ? "첫 화면" : "Landing"}</th>
        {columns.map(([key, korean, english]) => <th scope="col" key={key}>{ko ? korean : english}</th>)}
      </tr></thead><tbody>
        <tr><th scope="row">{ko ? "전체" : "Total"}</th><td>—</td>{cells(data.totals)}</tr>
        {data.rows.map(row => <tr key={`${row.channel}:${row.landing}`}><th scope="row">{channelLabels[row.channel][locale]}</th><td>{landingLabels[row.landing][locale]}</td>{cells(row)}</tr>)}
      </tbody></table>
    </div>
    {data.rows.length === 0 && <p className={styles.empty}>{ko ? "이 기간에 기록된 회원 유입이 없습니다." : "No identified acquisitions were recorded in this period."}</p>}
    <p className={styles.measurementNote}>{ko
      ? "UTC 기준 선택 기간의 첫 회원 유입을 기준으로, 이후 이 기간 안에 완료된 행동을 각각 집계합니다. 신규 회원 수가 아니며 이전 방문 이력은 제외 조건이 아닙니다. 1~4명인 값과 이를 역산할 수 있는 합계는 비공개입니다."
      : "Uses each member’s first identified acquisition within the selected UTC period and counts each later completed action independently within that period. This is not a new-member count; earlier visits do not exclude members. Counts of 1–4 and totals that could reveal them are hidden."}</p>
    <p className={styles.measurementNote}>{ko
      ? "익명 방문과 회원을 연결하지 않습니다. 검색어별 노출·클릭은 Search Console에서 확인하세요."
      : "Anonymous visits are not joined to members. Use Search Console for search-query impressions and clicks."}</p>
  </section>;
}

export function AcquisitionAnalyticsStatus({ status, locale }: { status: "loading" | "error" | "unauthenticated" | "denied"; locale: AdminLocale }) {
  const ko = locale === "ko";
  if (status === "loading") return <section className={base.loading} role="status"><div className={base.skeletonChart} /><span>{ko ? "유입 후 회원 전환을 불러오고 있습니다." : "Loading member acquisition conversions…"}</span></section>;
  return <section className={styles.outboundError} role="alert"><CircleAlert aria-hidden="true" /><div><h2>{ko ? "유입 후 회원 전환을 불러오지 못했습니다" : "Could not load member acquisition conversions"}</h2><p>{status === "denied" ? (ko ? "이 집계를 볼 권한이 없습니다." : "You do not have access to this report.") : status === "unauthenticated" ? (ko ? "관리자 로그인이 만료되었습니다." : "Your admin session has expired.") : (ko ? "잠시 후 새로고침해 주세요. 방문 통계는 계속 확인할 수 있습니다." : "Refresh to try again. Web traffic remains available.")}</p></div></section>;
}

export function AcquisitionAnalytics({
  days,
  refresh,
  locale,
}: {
  days: Days;
  refresh: number;
  locale: AdminLocale;
}) {
  const session = useAdminSession();
  const { getAccessToken } = usePrivy();
  const owner = session.status === "authorized" ? session.admin.email : null;
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    if (session.status !== "authorized") return;
    const controller = new AbortController();
    setState({ status: "loading" });
    void (async () => {
      try {
        const token = await getAccessToken();
        if (controller.signal.aborted) return;
        if (!token) { setState({ status: "unauthenticated" }); return; }
        const response = await fetch(`/api/admin/analytics/acquisition?days=${days}`, {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (response.status === 401 || response.status === 403) {
          setState({ status: response.status === 401 ? "unauthenticated" : "denied" });
          return;
        }
        if (!response.ok) { setState({ status: "error" }); return; }
        const data = acquisitionAnalyticsSchema.parse(await response.json());
        if (!controller.signal.aborted) setState({ status: "ready", owner: owner ?? "", data });
      } catch {
        if (!controller.signal.aborted) setState({ status: "error" });
      }
    })();
    return () => controller.abort();
  }, [session.status, owner, getAccessToken, days, refresh]);

  if (session.status !== "authorized") return null;
  const visible: State = state.status === "ready" && (state.owner !== owner || state.data.days !== days)
    ? { status: "loading" }
    : state;
  if (visible.status === "ready") return <AcquisitionAnalyticsContent data={visible.data} locale={locale} />;
  return <AcquisitionAnalyticsStatus status={visible.status} locale={locale} />;
}
