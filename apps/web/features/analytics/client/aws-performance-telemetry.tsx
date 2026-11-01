"use client";

import { useState } from "react";
import { useReportWebVitals } from "next/web-vitals";
import { performanceMetricSchema, type PerformanceMetric } from "../domain/performance-metric";
import { isPublicTelemetryPath } from "./vercel-telemetry-policy";

function routeKind(pathname: string): PerformanceMetric["routeKind"] {
  if (pathname === "/") return "home";
  if (/^\/(?:celebrities|live|benefits)$/.test(pathname)) return "public-list";
  if (/^\/(?:guide|privacy|terms|pages\/)/.test(pathname)) return "public-info";
  return "public-detail";
}

export function createPerformanceReporter() {
  const initialPath = typeof window === "undefined" ? "" : window.location.pathname;
  const sampled = isPublicTelemetryPath(initialPath) && Math.random() < 0.1;
  let sent = 0;
  return (metric: { name: string; value: number }) => {
    // Vitals may arrive after SPA navigation to a private screen.
    if (!sampled || sent >= 10 || !isPublicTelemetryPath(window.location.pathname)) return;
    const parsed = performanceMetricSchema.safeParse({ name: metric.name, value: metric.value, routeKind: routeKind(initialPath) });
    if (!parsed.success) return;
    sent += 1;
    try {
      void fetch("/api/analytics/performance", {
        method: "POST",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
        keepalive: true,
      }).catch(() => undefined);
    } catch { /* Measurement must never interrupt the page. */ }
  };
}

export function AwsPerformanceTelemetry() {
  const [report] = useState(() => createPerformanceReporter());
  useReportWebVitals(report);
  return null;
}
