"use client";
import { usePrivy } from "@privy-io/react-auth";
import { useEffect } from "react";
import Link from "next/link";
import styles from "./operations.module.css";
import { adminReportSummarySchema } from "@/features/fan-posts/domain/content";
import { useOwnedFanResource } from "../fan-ui/use-owned-fan-resource";

const parse = (value: unknown) => adminReportSummarySchema.parse(value);
export function ContentReportAlert({ locale }: { locale: "ko" | "en" }) {
  const auth = usePrivy();
  const resource = useOwnedFanResource("/api/admin/content-reports/summary", parse, auth);
  const refresh = resource.retry;
  useEffect(() => {
    const update = () => { if (document.visibilityState !== "hidden") refresh(); };
    const timer = setInterval(update, 60_000);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => { clearInterval(timer); window.removeEventListener("focus", update); document.removeEventListener("visibilitychange", update); };
  }, [refresh]);
  if (resource.state.status === "loading") return null;
  if (resource.state.status === "error" || resource.refreshFailed) return <Link className={styles.reportAlert} href="/admin/content-reports">{locale === "ko" ? "신고 알림 확인 필요" : "Check report notifications"}</Link>;
  const { openCount, overdueCount } = resource.state.data;
  return <Link className={styles.reportAlert} href="/admin/content-reports" aria-live="polite">{locale === "ko" ? `미처리 신고 ${openCount}건${overdueCount ? ` · 기한 초과 ${overdueCount}건` : ""}` : `${openCount} open reports${overdueCount ? ` · ${overdueCount} overdue` : ""}`}</Link>;
}
