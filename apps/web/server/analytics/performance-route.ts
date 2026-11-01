import "server-only";
import { performanceMetricSchema, type PerformanceMetric } from "@/features/analytics/domain/performance-metric";
import { boundedJson, CertificationBodyError } from "../certification/certification-http";
import { isAwsHosting, runtimeEnvironment } from "../config/hosting";
import { requireSameAppOrigin } from "../config/app-origin";
import { logWebVital } from "./performance-logger";

const response = (status: number) => new Response(null, { status, headers: { "cache-control": "private, no-store" } });

export function createPerformanceHandler(log: (metric: PerformanceMetric) => void = logWebVital) {
  return async (request: Request): Promise<Response> => {
    if (!isAwsHosting()) return response(404);
    try {
      const configuredUrl = runtimeEnvironment()["NEXT_PUBLIC_APP_URL"];
      if (!configuredUrl) return response(403);
      requireSameAppOrigin(request, new URL(configuredUrl).origin);
    } catch { return response(403); }
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) return response(415);
    try {
      const metric = performanceMetricSchema.parse(await boundedJson(request, 512));
      try { log(metric); } catch { /* Measurement failure does not affect visitors. */ }
      return response(204);
    } catch (error) {
      return response(error instanceof CertificationBodyError && error.code === "BODY_TOO_LARGE" ? 413 : 400);
    }
  };
}
