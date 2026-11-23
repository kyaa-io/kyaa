"use client";
import { useEffect, useState } from "react";
import { z } from "zod";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanSkeletonRows } from "@/components/fan-ui/fan-skeleton";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { useAdminSession } from "@/components/admin/use-admin-session";
import base from "./admin-overview-dashboard.module.css";
import styles from "./web-analytics-dashboard.module.css";

const rowsSchema = z.array(z.object({
  ad_id: z.uuid(), advertiser: z.enum(["beepio", "chillsa"]),
  impressions: z.number().int().nonnegative(), clicks: z.number().int().nonnegative(),
}));
type Rows = z.infer<typeof rowsSchema>;
const rate = (row: Rows[number]) => row.impressions ? (row.clicks * 100 / row.impressions).toFixed(2) + "%" : "—";

export function BannerMonthReport({ locale, refresh }: { locale: "ko" | "en"; refresh: number }) {
  const session = useAdminSession();
  const owner = session.status === "authorized" ? session.admin.email : null;
  const { getAccessToken } = useByUsAuth();
  const [month, setMonth] = useState(() => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 7));
  const [result, setResult] = useState<{ month: string; owner: string; rows: Rows | null }>();
  const ko = locale === "ko";
  useEffect(() => {
    if (!owner || !month) return;
    const controller = new AbortController();
    async function read() {
      const token = await getAccessToken();
      if (!token) throw Error();
      const response = await fetch("/api/admin/analytics/banner-month?month=" + month, {
        headers: { Authorization: "Bearer " + token }, signal: controller.signal, cache: "no-store",
      });
      if (!response.ok) throw Error();
      return rowsSchema.parse(await response.json());
    }
    void read().catch(() => null).then(rows => {
      if (!controller.signal.aborted) setResult({ month, owner: owner!, rows });
    });
    return () => controller.abort();
  }, [owner, month, getAccessToken, refresh]);
  if (!owner) return null;
  const headers = ko ? ["광고주", "광고 ID", "노출", "클릭", "클릭률"] : ["Advertiser", "Ad ID", "Impressions", "Clicks", "CTR"];
  const rows = result?.owner === owner && result.month === month ? result.rows : undefined;
  const cells = rows?.map(row => [row.advertiser, row.ad_id, row.impressions, row.clicks, rate(row)]);
  const csv = [[ko ? "월(KST)" : "Month (KST)", ...headers], ...(cells ?? []).map(row => [month, ...row])].map(row => row.join(",")).join("\r\n");
  return <section className={base.panel}>
    <div className={base.panelHeading}><FanHeading>{ko ? "광고별 월간 성과" : "Monthly ad performance"}</FanHeading>
      <label>{ko ? "조회 월 (한국 시간)" : "Month (KST)"} <input type="month" value={month} onChange={e => setMonth(e.target.value)} /></label></div>
    {cells?.length ? <><div className={styles.tableScroll}><table className={styles.table}>
      <thead><tr>{headers.filter((_, i) => i !== 1).map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
      <tbody>{cells.map(([advertiser, id, impressions, clicks, ctr]) => <tr key={id}>
        <th scope="row" title={String(id)}>{advertiser}</th><td>{impressions}</td><td>{clicks}</td><td>{ctr}</td>
      </tr>)}</tbody>
    </table></div><a download={'ad-report-' + month + '.csv'} href={'data:text/csv;charset=utf-8,' + encodeURIComponent('\uFEFF' + csv)}>{ko ? "CSV 받기" : "Download CSV"}</a></> :
      rows === undefined ? <FanSkeletonRows rows={2} ariaLabel={ko ? "광고 성과 조회 중" : "Loading ad report"} /> : <p role="status">{rows === null ? (ko ? "광고 성과를 불러오지 못했습니다." : "Could not load report.") : (ko ? "조회할 광고가 없습니다." : "No ads.")}</p>}
  </section>;
}
