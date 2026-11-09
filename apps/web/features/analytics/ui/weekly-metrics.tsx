"use client";

import { useByUsAuth as usePrivy } from "@/features/auth/client/cognito-auth";
import { CircleAlert, Download } from "@/components/fan-ui/fan-icons";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { useEffect, useState } from "react";
import type { AdminLocale } from "../../../components/admin/operations-shell";
import { useAdminSession } from "../../../components/admin/use-admin-session";
import { goalPercent, MEMBER_GOAL, WEEKLY_COLUMNS, weeklyMetricsCsv, weeklyMetricsSchema, type WeeklyMetricsData } from "../domain/weekly-metrics";
import base from "./admin-overview-dashboard.module.css";
import styles from "./web-analytics-dashboard.module.css";

type State =
  | { status: "loading" }
  | { status: "ready"; owner: string; data: WeeklyMetricsData }
  | { status: "error" | "unauthenticated" | "denied" };

const monthDay = (value: string) => value.slice(5).replace("-", "/");

export function WeeklyMetricsContent({ data, locale }: { data: WeeklyMetricsData; locale: AdminLocale }) {
  const ko = locale === "ko";
  const number = new Intl.NumberFormat(locale);
  const percent = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const download = () => {
    const url = URL.createObjectURL(new Blob([weeklyMetricsCsv(data, locale)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `kyaa-weekly-${data.weeks[data.weeks.length - 1]!.weekStart}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
  return <section className={`${base.panel} ${styles.outbound}`} aria-labelledby="weekly-title">
    <div className={`${base.panelHeading} ${styles.funnelHeading}`}>
      <FanHeading id="weekly-title">{ko ? "주간" : "Weekly"}</FanHeading>
      <FanAction variant="secondary" size="sm" leadingIcon={<FanIcon icon={Download} />} onClick={download}>{ko ? "CSV 내려받기" : "Download CSV"}</FanAction>
    </div>
    <div className={styles.tableScroll} tabIndex={0} role="region" aria-label={ko ? "주간 지표 최근 8주" : "Weekly metrics, last 8 weeks"}>
      <table className={`${styles.table} ${styles.weeklyTable}`}><thead><tr>
        {WEEKLY_COLUMNS.map(([key, labelKo, labelEn]) => <th key={key} scope="col">{ko ? labelKo : labelEn}</th>)}
      </tr></thead><tbody>
        {[...data.weeks].reverse().map((week) => <tr key={week.weekStart}>
          <th scope="row">{monthDay(week.weekStart)} – {monthDay(week.weekEnd)}
            {week.inProgress ? <span className={styles.funnelSince}>{ko ? "집계 중" : "In progress"}</span> : null}</th>
          <td>{number.format(week.signups)}</td>
          <td>{number.format(week.activeMembers)}</td>
          <td>{number.format(week.posts)}</td>
          <td>{number.format(week.comments)}</td>
          <td>{number.format(week.pointsGranted)}</td>
          <td>{number.format(week.heartsGranted)}</td>
          <td>{number.format(week.cumulativeSignups)}
            <span className={styles.funnelSince}>{ko ? `${number.format(MEMBER_GOAL)}명 중 ` : `of ${number.format(MEMBER_GOAL)} · `}{percent.format(goalPercent(week.cumulativeSignups))}%</span></td>
        </tr>)}
      </tbody></table>
    </div>
    <details className={base.definitions}><summary>{ko ? "주간 지표 집계 기준" : "How weekly metrics are measured"}</summary><div>
      <p>{ko
        ? "주는 한국 시간 월요일 0시부터 일요일 24시까지이고 이번 주는 집계 중입니다. 가입은 계정이 만들어진 수, 주간 활성은 로그인한 상태에서 화면을 보거나 출석·글·댓글·응원 등을 한 번 이상 한 회원 수입니다. 글과 댓글은 지금 숨김·삭제되지 않은 팬게시판과 모임 글·댓글, 포인트와 하트 지급은 원장에 쌓인 지급 합계이며 차감·정정은 빼지 않습니다. 누적 가입은 그 주 끝까지 만들어진 계정 수이고 시험 계정과 목록에서 내린 시험 페이지의 활동은 모두 뺍니다."
        : "Weeks run Monday 00:00 to Sunday 24:00 Korea time, and the current week is still counting. Sign-ups are accounts created; weekly active is members who, while signed in, viewed a screen or checked in, posted, commented or cheered at least once. Posts and comments are fan board and group posts and comments that are not hidden or removed now. Points and hearts granted are ledger credits; deductions and corrections are not netted. Total sign-ups is accounts created up to the end of that week. Test accounts and activity on unlisted test pages are left out."}</p>
    </div></details>
  </section>;
}

function WeeklyMetricsStatus({ status, locale }: { status: "loading" | "error" | "unauthenticated" | "denied"; locale: AdminLocale }) {
  const ko = locale === "ko";
  if (status === "loading") return <section className={base.loading} role="status"><div className={base.skeletonChart} /><span>{ko ? "주간 지표를 불러오고 있습니다." : "Loading the weekly metrics…"}</span></section>;
  return <section className={`${styles.outboundError} ${styles.funnelHeading}`} role="alert"><FanIcon icon={CircleAlert} /><div><FanHeading>{ko ? "주간 지표를 불러오지 못했습니다" : "Could not load the weekly metrics"}</FanHeading><p>{status === "denied" ? (ko ? "이 집계를 볼 권한이 없습니다." : "You do not have access to this report.") : status === "unauthenticated" ? (ko ? "관리자 로그인이 만료되었습니다." : "Your admin session has expired.") : (ko ? "잠시 후 새로고침해 주세요." : "Refresh to try again.")}</p></div></section>;
}

export function WeeklyMetrics({ refresh, locale }: { refresh: number; locale: AdminLocale }) {
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
        const response = await fetch("/api/admin/analytics/weekly", {
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
        const data = weeklyMetricsSchema.parse(await response.json());
        if (!controller.signal.aborted) setState({ status: "ready", owner: owner ?? "", data });
      } catch {
        if (!controller.signal.aborted) setState({ status: "error" });
      }
    })();
    return () => controller.abort();
  }, [session.status, owner, getAccessToken, refresh]);

  if (session.status !== "authorized") return null;
  const visible: State = state.status === "ready" && state.owner !== owner ? { status: "loading" } : state;
  if (visible.status === "ready") return <WeeklyMetricsContent data={visible.data} locale={locale} />;
  return <WeeklyMetricsStatus status={visible.status} locale={locale} />;
}
