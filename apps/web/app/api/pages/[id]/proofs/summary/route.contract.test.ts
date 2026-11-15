import { expect, it } from "vitest";
import { readFileSync } from "node:fs";

it("serves the proof tab counts through the shared proof handlers and maps failures the same way", () => {
  const source = readFileSync(`${process.cwd()}/app/api/pages/[id]/proofs/summary/route.ts`, "utf8");
  expect(source).toContain("createProofRouteHandlers().summary(");
  expect(source).toContain("proofFailure(error)");
  expect(source).not.toMatch(/export async function (POST|PUT|PATCH|DELETE)/);
});

it("the summary SQL exposes counts only and is closed to every role but service_role", () => {
  const sql = readFileSync(`${process.cwd()}/../../supabase/migrations/20261227190001_proof_tab_summary.sql`, "utf8");
  expect(sql).toContain("s.status = 'approved' and s.proof_type is distinct from 'sns_post'");
  expect(sql).toContain("count(distinct s.app_user_id)");
  expect(sql).not.toMatch(/nickname|object_path|post_body|rejection_reason|jsonb_agg\(s\./);
  expect(sql).not.toMatch(/update\s+public|insert\s+into|delete\s+from/i);
  expect(sql).toContain("from public, anon, authenticated, service_role");
  expect(sql).toContain("to service_role");
});
