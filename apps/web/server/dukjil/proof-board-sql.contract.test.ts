import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "../../supabase/migrations/20261222163000_proof_board_reward_points.sql"), "utf8");
describe("public proof SQL contract (no database mutation)", () => {
  it("requires both approval and explicit consent, keeping pending and private proofs out", () => {
    expect(sql).toContain("s.status = 'approved' and s.publish_consent = true");
    expect(sql).toContain("p.visibility = 'public'");
    expect(sql).toContain("p.deleted_at is null and p.hidden_at is null");
    expect(sql).toContain("not public.fan_web_blocked(p_viewer, p.app_user_id)");
    expect(sql).toContain("cs.revoked_at is not null");
  });
  it("reads the award by author and submission, without rewriting consent or rewards", () => {
    expect(sql).toContain("l.app_user_id = g.app_user_id and l.action_key = 'proof' and l.source_key = g.submission_id::text");
    expect(sql).not.toMatch(/update\s+public|insert\s+into|delete\s+from/i);
    expect(sql).toContain("from public, anon, authenticated, service_role");
    expect(sql).toContain("to service_role");
  });
});
