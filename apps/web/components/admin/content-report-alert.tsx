"use client";
import { useByUsAuth as usePrivy } from "@/features/auth/client/cognito-auth";
import { useEffect } from "react";
import Link from "../fan-ui/hover-prefetch-link";
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
  if (resource.state.status === "error" || resource.refreshFailed) return <Link className={styles.reportAlert} href="/admin/content-reports">{locale === "ko" ? "신고 수를 불러오지 못했어요" : "Check report notifications"}</Link>;
  const { openCount, overdueCount } = resource.state.data;
  return <Link className={styles.reportAlert} href="/admin/content-reports" aria-live="polite">{locale === "ko" ? `처리할 신고 ${openCount}건${overdueCount ? ` · 기한 지남 ${overdueCount}건` : ""}` : `${openCount} open reports${overdueCount ? ` · ${overdueCount} overdue` : ""}`}</Link>;
}
