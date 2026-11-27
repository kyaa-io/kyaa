"use client";

import { useByUsAuth as usePrivy } from "@/features/auth/client/cognito-auth";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import { Check, CircleAlert, Link2 } from "@/components/fan-ui/fan-icons";
import { useEffect, useState } from "react";
import type { AdminLocale } from "../../../components/admin/operations-shell";
import { useAdminSession } from "../../../components/admin/use-admin-session";
import { signupTouchesSchema, type SignupTouchesData } from "../domain/signup-touches";
import { SHORT_LINKS, SHORT_LINK_PATTERNS } from "../domain/short-links";
import { AnalyticsLineChart } from "./analytics-line-chart";
import base from "./admin-overview-dashboard.module.css";
import styles from "./web-analytics-dashboard.module.css";

type Days = 7 | 30 | 90;
type State = { status: "loading" } | { status: "ready"; owner: string; data: SignupTouchesData } | { status: "error" | "unauthenticated" | "denied" };

const number = (value: number, locale: AdminLocale) => new Intl.NumberFormat(locale).format(value);

const pathLabels: Record<string, readonly [string, string]> = {
  unrecorded: ["기록 시작 전 가입", "Before recording"],
  no_cookie: ["쿠키 없음", "No cookie"],
  direct: ["직접 방문", "Direct"],
  invite: ["초대 코드", "Invite code"],
};
const appLabels: Record<string, readonly [string, string]> = {
  x: ["X 앱", "X app"], instagram: ["인스타그램 앱", "Instagram app"], threads: ["스레드 앱", "Threads app"],
  facebook: ["페이스북 앱", "Facebook app"], tiktok: ["틱톡 앱", "TikTok app"], telegram: ["텔레그램 앱", "Telegram app"],
  kakao: ["카카오톡 앱", "KakaoTalk app"], line: ["라인 앱", "LINE app"], webview: ["그 밖의 앱", "Other app"],
  browser: ["일반 브라우저", "Browser"], ...pathLabels,
};
const label = (labels: Record<string, readonly [string, string]>, value: string, locale: AdminLocale) =>
  labels[value]?.[locale === "ko" ? 0 : 1] ?? value;

function CountTable({ title, rows, labels, locale }: {
  title: string; rows: SignupTouchesData["paths"]; labels: Record<string, readonly [string, string]>; locale: AdminLocale;
}) {
  const ko = locale === "ko";
  return <section className={`${base.panel} ${styles.breakdown}`} aria-label={title}>
    <div className={base.panelHeading}><FanHeading>{title}</FanHeading></div>
    {rows.length === 0 ? <p className={styles.empty}>{ko ? "이 기간에 가입이 없습니다." : "No sign-ups in this period."}</p> :
      <div className={styles.tableScroll} tabIndex={0} role="region" aria-label={title}><table className={styles.table}>
        <thead><tr><th scope="col">{ko ? "항목" : "Source"}</th><th scope="col">{ko ? "가입" : "Sign-ups"}</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.label}><th scope="row">{label(labels, row.label, locale)}</th><td>{number(row.signups, locale)}</td></tr>)}</tbody>
      </table></div>}
  </section>;
}

export function SignupTouchesContent({ data, locale }: { data: SignupTouchesData; locale: AdminLocale }) {
  const ko = locale === "ko";
  const recent = [...data.pathHours].reverse().slice(0, 48);
  return <>
    <section className={base.panel} aria-labelledby="signup-touches-title">
      <div className={base.panelHeading}><div><FanHeading id="signup-touches-title">{ko ? `시간대별 가입 ${number(data.total, locale)}명` : `Sign-ups by hour: ${number(data.total, locale)}`}</FanHeading><p>{ko ? "한국 시간" : "Korea Standard Time"}</p></div></div>
      <div className={styles.traffic}><AnalyticsLineChart locale={locale} label={ko ? "가입" : "Sign-ups"} points={data.hourly.map((point) => ({ label: `${point.hour}${ko ? "시" : ":00"}`, value: point.signups }))} /></div>
    </section>
    <section className={base.panel} aria-labelledby="signup-days-title">
      <div className={base.panelHeading}><div><FanHeading id="signup-days-title">{ko ? "날짜별 가입" : "Sign-ups by day"}</FanHeading><p>{ko ? "한국 시간" : "Korea Standard Time"}</p></div></div>
      <div className={styles.traffic}><AnalyticsLineChart locale={locale} label={ko ? "가입" : "Sign-ups"} points={data.daily.map((point) => ({ label: point.date.slice(5), value: point.signups }))} /></div>
    </section>
    <div className={styles.breakdowns}>
      <CountTable title={ko ? "들어온 길별 가입(첫 방문)" : "Sign-ups by first visit"} rows={data.paths} labels={pathLabels} locale={locale} />
      <CountTable title={ko ? "앱 안 브라우저별 가입" : "Sign-ups by in-app browser"} rows={data.apps} labels={appLabels} locale={locale} />
    </div>
    <section className={`${base.panel} ${styles.outbound}`} aria-label={ko ? "시각별 들어온 길" : "First visit by hour"}>
      <div className={base.panelHeading}><FanHeading>{ko ? "시각별 들어온 길" : "First visit by hour"}</FanHeading></div>
      {recent.length === 0 ? <p className={styles.empty}>{ko ? "이 기간에 가입이 없습니다." : "No sign-ups in this period."}</p> :
        <div className={styles.tableScroll} tabIndex={0} role="region" aria-label={ko ? "시각별 들어온 길 목록" : "First visit by hour list"}><table className={styles.table}>
          <thead><tr><th scope="col">{ko ? "시각(KST)" : "Hour (KST)"}</th><th scope="col">{ko ? "들어온 길" : "First visit"}</th><th scope="col">{ko ? "가입" : "Sign-ups"}</th></tr></thead>
          <tbody>{recent.map((row) => <tr key={`${row.date}-${row.hour}-${row.label}`}>
            <th scope="row">{`${row.date.slice(5)} ${String(row.hour).padStart(2, "0")}:00`}</th><td>{label(pathLabels, row.label, locale)}</td><td>{number(row.signups, locale)}</td>
          </tr>)}</tbody>
        </table></div>}
    </section>
  </>;
}

export function ShortLinkList({ locale, origin = "https://kyaa.io" }: { locale: AdminLocale; origin?: string }) {
  const ko = locale === "ko";
  const [copied, setCopied] = useState<string | null>(null);
  // Page, then source / medium / campaign: short enough to wrap at a phone width.
  const opens = (path: string, tags: string[]) => `${path === "/" ? (ko ? "홈" : "Home") : path} · ${tags.join(" / ")}`;
  async function copy(code: string) {
    try { await navigator.clipboard.writeText(`${origin}/go/${code}`); setCopied(code); } catch { setCopied(null); }
  }
  return <section className={`${base.panel} ${styles.outbound}`} aria-labelledby="short-links-title">
    <div className={base.panelHeading}><FanHeading id="short-links-title">{ko ? "짧은 주소" : "Short links"}</FanHeading></div>
    <div className={styles.tableScroll} tabIndex={0} role="region" aria-label={ko ? "짧은 주소 목록" : "Short link list"}><table className={styles.table}>
      <thead><tr><th scope="col">{ko ? "주소 · 여는 곳" : "Address · opens"}</th><th scope="col">{ko ? "복사" : "Copy"}</th></tr></thead>
      <tbody>{SHORT_LINKS.map((link) => <tr key={link.code}>
          <th scope="row">{`kyaa.io/go/${link.code}`}<br /><span className={styles.measurementNote}>{opens(link.path, [link.utm.source, link.utm.medium, link.utm.campaign])}</span></th>
          <td><FanAction variant="neutral" size="sm" onClick={() => void copy(link.code)}
            ariaLabel={copied === link.code ? (ko ? `kyaa.io/go/${link.code} 복사됨` : `Copied kyaa.io/go/${link.code}`) : (ko ? `kyaa.io/go/${link.code} 복사` : `Copy kyaa.io/go/${link.code}`)}
            leadingIcon={<FanIcon icon={copied === link.code ? Check : Link2} size={20} />} /></td>
        </tr>)}
      {SHORT_LINK_PATTERNS.map((pattern) => <tr key={pattern}><th scope="row">{`kyaa.io/go/${pattern}`}<br /><span className={styles.measurementNote}>{pattern.startsWith("qr-") ? opens("/", ["qr", "offline", "<event>"]) : opens("/s/raffle", ["<site>", "referral", "sweeps_listing"])}</span></th><td>—</td></tr>)}
      </tbody>
    </table></div>
  </section>;
}

export function SignupTouches({ days, refresh, locale }: { days: Days; refresh: number; locale: AdminLocale }) {
  const session = useAdminSession();
  const { getAccessToken } = usePrivy();
  const owner = session.status === "authorized" ? session.admin.email : null;
  const [state, setState] = useState<State>({ status: "loading" });
  const ko = locale === "ko";

  useEffect(() => {
    if (session.status !== "authorized") return;
    const controller = new AbortController();
    setState({ status: "loading" });
    void (async () => {
      try {
        const token = await getAccessToken();
        if (controller.signal.aborted) return;
        if (!token) { setState({ status: "unauthenticated" }); return; }
        const response = await fetch(`/api/admin/analytics/signup-touches?days=${days}`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store", signal: controller.signal });
        if (controller.signal.aborted) return;
        if (response.status === 401 || response.status === 403) { setState({ status: response.status === 401 ? "unauthenticated" : "denied" }); return; }
        if (!response.ok) { setState({ status: "error" }); return; }
        const data = signupTouchesSchema.parse(await response.json());
        if (!controller.signal.aborted) setState({ status: "ready", owner: owner ?? "", data });
      } catch {
        if (!controller.signal.aborted) setState({ status: "error" });
      }
    })();
    return () => controller.abort();
  }, [session.status, owner, getAccessToken, days, refresh]);

  if (session.status !== "authorized") return null;
  const visible: State = state.status === "ready" && (state.owner !== owner || state.data.days !== days) ? { status: "loading" } : state;
  return <div className={base.content}>
    {visible.status === "ready" && <SignupTouchesContent data={visible.data} locale={locale} />}
    {visible.status === "loading" && <section className={base.loading} role="status"><div className={base.skeletonChart} /><span>{ko ? "들어온 길별 가입을 불러오고 있습니다." : "Loading sign-ups by first visit…"}</span></section>}
    {(visible.status === "error" || visible.status === "denied" || visible.status === "unauthenticated") && <section className={styles.outboundError} role="alert"><FanIcon icon={CircleAlert} /><div>
      <FanHeading>{ko ? "들어온 길별 가입을 불러오지 못했습니다" : "Could not load sign-ups by first visit"}</FanHeading>
      <p>{visible.status === "denied" ? (ko ? "이 집계를 볼 권한이 없습니다." : "You do not have access to this report.") : visible.status === "unauthenticated" ? (ko ? "관리자 로그인이 만료되었습니다." : "Your admin session has expired.") : (ko ? "잠시 후 새로고침해 주세요." : "Refresh to try again.")}</p>
    </div></section>}
    <ShortLinkList locale={locale} />
  </div>;
}
