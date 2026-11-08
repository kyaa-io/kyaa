"use client";

import { useByUsAuth as usePrivy } from "@/features/auth/client/cognito-auth";
import { CircleAlert } from "@/components/fan-ui/fan-icons";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import { useEffect, useState } from "react";
import type { AdminLocale } from "../../../components/admin/operations-shell";
import { useAdminSession } from "../../../components/admin/use-admin-session";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FUNNEL_STEPS, funnelAnalyticsSchema, funnelRates, type FunnelAnalyticsData } from "../domain/funnel-analytics";
import base from "./admin-overview-dashboard.module.css";
import styles from "./web-analytics-dashboard.module.css";

type Days = 7 | 30 | 90;
type State =
  | { status: "loading" }
  | { status: "ready"; owner: string; data: FunnelAnalyticsData }
  | { status: "error" | "unauthenticated" | "denied" };

const stepLabels = {
  visitors: ["방문 세션", "Visit sessions"],
  accountCreated: ["가입", "Sign-ups"],
  fanVerified: ["첫 팬 인증", "First fan verification"],
  firstActivity: ["첫 활동", "First activity"],
} as const;

export function FunnelAnalyticsContent({ data, locale }: { data: FunnelAnalyticsData; locale: AdminLocale }) {
  const ko = locale === "ko";
  const rates = funnelRates(data);
  const number = new Intl.NumberFormat(locale);
  const percent = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 });
  const since = data.pageViewsSince && Date.parse(data.pageViewsSince) > Date.parse(data.from)
    ? new Intl.DateTimeFormat(locale, { timeZone: "UTC", month: "short", day: "numeric" }).format(new Date(data.pageViewsSince))
    : null;
  return <section className={`${base.panel} ${styles.outbound}`} aria-labelledby="funnel-title">
    <div className={`${base.panelHeading} ${styles.funnelHeading}`}><FanHeading id="funnel-title">{ko ? "가입 퍼널" : "Signup funnel"}</FanHeading></div>
    <div className={styles.tableScroll} tabIndex={0} role="region" aria-label={ko ? "가입 퍼널 단계" : "Signup funnel steps"}>
      <table className={styles.table}><thead><tr>
        <th scope="col">{ko ? "단계" : "Step"}</th>
        <th scope="col">{ko ? "수" : "Count"}</th>
        <th scope="col">{ko ? "이전 단계 대비" : "Of previous step"}</th>
        <th scope="col">{ko ? "방문 회원 중" : "Of visiting members"}</th>
      </tr></thead><tbody>
        {FUNNEL_STEPS.map((step) => <tr key={step}>
          <th scope="row">{stepLabels[step][ko ? 0 : 1]}{step === "visitors" && (since !== null || data.pageViewsSince === null)
            ? <span className={styles.funnelSince}>{data.pageViewsSince === null ? (ko ? "수집 기록 없음" : "Not collected yet") : (ko ? `${since}부터 수집` : `Collected since ${since}`)}</span>
            : null}</th>
          <td>{number.format(data.steps[step])}</td>
          <td>{rates[step] === null ? "—" : percent.format(rates[step])}</td>
          <td>{number.format(step === "visitors" ? data.visitedMembers.visited : data.visitedMembers[step])}</td>
        </tr>)}
      </tbody></table>
    </div>
  </section>;
}

function FunnelAnalyticsStatus({ status, locale }: { status: "loading" | "error" | "unauthenticated" | "denied"; locale: AdminLocale }) {
  const ko = locale === "ko";
  if (status === "loading") return <section className={base.loading} role="status"><div className={base.skeletonChart} /><span>{ko ? "가입 퍼널을 불러오고 있습니다." : "Loading the signup funnel…"}</span></section>;
  return <section className={`${styles.outboundError} ${styles.funnelHeading}`} role="alert"><FanIcon icon={CircleAlert} /><div><FanHeading>{ko ? "가입 퍼널을 불러오지 못했습니다" : "Could not load the signup funnel"}</FanHeading><p>{status === "denied" ? (ko ? "이 집계를 볼 권한이 없습니다." : "You do not have access to this report.") : status === "unauthenticated" ? (ko ? "관리자 로그인이 만료되었습니다." : "Your admin session has expired.") : (ko ? "잠시 후 새로고침해 주세요." : "Refresh to try again.")}</p></div></section>;
}

export function FunnelAnalytics({ days, refresh, locale }: { days: Days; refresh: number; locale: AdminLocale }) {
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
        const response = await fetch(`/api/admin/analytics/funnel?days=${days}`, {
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
        const data = funnelAnalyticsSchema.parse(await response.json());
        if (!controller.signal.aborted) setState({ status: "ready", owner: owner ?? "", data });
      } catch {
        if (!controller.signal.aborted) setState({ status: "error" });
      }
    })();
    return () => controller.abort();
  }, [session.status, owner, getAccessToken, days, refresh]);

  if (session.status !== "authorized") return null;
  const visible: State = state.status === "ready" && (state.owner !== owner || state.data.days !== days) ? { status: "loading" } : state;
  if (visible.status === "ready") return <FunnelAnalyticsContent data={visible.data} locale={locale} />;
  return <FunnelAnalyticsStatus status={visible.status} locale={locale} />;
}
