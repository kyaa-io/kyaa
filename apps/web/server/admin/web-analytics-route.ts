import "server-only";

import { AuthError } from "../../features/auth/domain/auth-errors";
import { webAnalyticsDaysSchema } from "../../features/analytics/domain/web-analytics";
import type { AdminSession } from "./admin-session-gate";
import type { AdminReportInput, AdminWeeklyReportInput } from "./ledger-analytics-repository";

const privateHeaders = { "cache-control": "private, no-store", vary: "Authorization" };
const failure = (status: number, code: string) => Response.json({ error: { code } }, { status, headers: privateHeaders });

/** GET ?days=7|30|90 for an admin-only ledger report (web traffic, funnel). */
export function createGetAdminLedgerReportHandler<T>(dependencies: {
  authorize(input: { authorization: string; correlationId: string }): Promise<AdminSession>;
  read(input: AdminReportInput): Promise<T>;
  unavailableCode: string;
}) {
  return async (request: Request) => {
    try {
      const admin = await dependencies.authorize({
        authorization: request.headers.get("authorization") ?? "",
        correlationId: crypto.randomUUID(),
      });
      const params = new URL(request.url).searchParams;
      if ([...params.keys()].some((key) => key !== "days" || params.getAll(key).length !== 1)) {
        return failure(400, "INVALID_QUERY");
      }
      const daysInput = params.get("days") ?? "7";
      if (!/^(7|30|90)$/.test(daysInput)) return failure(400, "INVALID_QUERY");
      const days = webAnalyticsDaysSchema.parse(Number(daysInput));
      const data = await dependencies.read({ adminAppUserId: admin.appUserId, adminAllowlistId: admin.allowlistId, days });
      return Response.json(data, { status: 200, headers: privateHeaders });
    } catch (error) {
      if (error instanceof AuthError) {
        return failure(error.status, error.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN");
      }
      return failure(503, dependencies.unavailableCode);
    }
  };
}

/** GET with no query for the admin-only weekly report (eight KST weeks); a read-only admin may read it. */
export function createGetAdminWeeklyReportHandler<T>(dependencies: {
  authorize(input: { authorization: string; correlationId: string }): Promise<AdminSession>;
  read(input: AdminWeeklyReportInput): Promise<T>;
  unavailableCode: string;
}) {
  return async (request: Request) => {
    try {
      const admin = await dependencies.authorize({
        authorization: request.headers.get("authorization") ?? "",
        correlationId: crypto.randomUUID(),
      });
      if ([...new URL(request.url).searchParams.keys()].length > 0) return failure(400, "INVALID_QUERY");
      const data = await dependencies.read({ adminAppUserId: admin.appUserId, adminAllowlistId: admin.allowlistId });
      return Response.json(data, { status: 200, headers: privateHeaders });
    } catch (error) {
      if (error instanceof AuthError) {
        return failure(error.status, error.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN");
      }
      return failure(503, dependencies.unavailableCode);
    }
  };
}
