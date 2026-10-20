import { expect, it } from "vitest";
import { adminReportSchema, reportInputSchema, targetTypeSchema } from "./content";
it("accepts private moderation targets only in the admin report contract", () => {
  for (const targetType of ["dm_message", "user_block"]) {
    expect(targetTypeSchema.safeParse(targetType).success).toBe(false);
    expect(reportInputSchema.safeParse({ targetType, targetId: "00000000-0000-4000-8000-000000000001", reason: "report", idempotencyKey: "00000000-0000-4000-8000-000000000002" }).success).toBe(false);
    expect(adminReportSchema.safeParse({ id: "00000000-0000-4000-8000-000000000001", targetType, targetId: "00000000-0000-4000-8000-000000000002", targetRevision: 1, reason: "report", status: "open", createdAt: "2026-10-20T00:00:00Z", target: { body: null, celebritySlug: null } }).success).toBe(true);
  }
});
