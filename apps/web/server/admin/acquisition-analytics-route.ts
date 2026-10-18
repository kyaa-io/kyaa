import "server-only";
import { AuthError } from "@/features/auth/domain/auth-errors";
import { webAnalyticsDaysSchema } from "@/features/analytics/domain/web-analytics";
import type { AdminSession } from "./admin-session-gate";
import type { AcquisitionAnalyticsRepository } from "./acquisition-analytics-repository";

const headers = { "cache-control": "private, no-store", vary: "Authorization" };
const failure = (status: number, code: string) => Response.json({ error: { code } }, { status, headers });

export function createGetAcquisitionAnalyticsHandler(dependencies: {
  authorize(input: { authorization: string; correlationId: string }): Promise<AdminSession>;
  repository: AcquisitionAnalyticsRepository;
}) {
  return async (request: Request) => {
    try {
      const admin = await dependencies.authorize({ authorization: request.headers.get("authorization") ?? "", correlationId: crypto.randomUUID() });
      const params = new URL(request.url).searchParams;
      if ([...params.keys()].some(key => key !== "days" || params.getAll(key).length !== 1)) return failure(400, "INVALID_QUERY");
      const input = params.get("days") ?? "7";
      if (!/^(7|30|90)$/.test(input)) return failure(400, "INVALID_QUERY");
      const days = webAnalyticsDaysSchema.parse(Number(input));
      const data = await dependencies.repository.read({ adminAppUserId: admin.appUserId, adminAllowlistId: admin.allowlistId, days });
      return Response.json(data, { status: 200, headers });
    } catch (error) {
      if (error instanceof AuthError) return failure(error.status, error.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN");
      return failure(503, "ACQUISITION_ANALYTICS_UNAVAILABLE");
    }
  };
}
