import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const sql = readFileSync(resolve(process.cwd(), "../../supabase/migrations/20261016000000_mobile_benefits.sql"), "utf8");

describe("mobile benefit migration contract", () => {
  it("is disabled and tester-only until explicitly configured", () => {
    expect(sql).toContain("enabled boolean not null default false");
    expect(sql).toContain("tester_only boolean not null default true");
    expect(sql).not.toMatch(/^insert into public\.mobile_benefit_policies/im);
  });
  it("serializes request, balances, and inventory while consuming free tickets first", () => {
    expect(sql).toContain("mobile-benefit-request:");
    expect(sql).toContain("phase1:ticket:balance:");
    expect(sql).toContain("mobile-store-paid:");
    expect(sql).toMatch(/least\(v_free,p\.ticket_cost\)/);
    expect(sql).toMatch(/mobile_benefit_instant_prizes[\s\S]*for update/);
    expect(sql).toContain("MOBILE_BENEFIT_PHYSICAL_FREE_ONLY");
    expect(sql).toContain("extensions.gen_random_bytes(32)");
    expect(sql).not.toContain("digest(p_request_key::text");
    expect(sql).toMatch(/sum\(weight\)[\s\S]*where policy_id=p\.id;/);
    expect(sql).toContain("mobile_benefit_paid_allocations");
    expect(sql).toContain("mobile-benefit-daily:");
    expect(sql).toMatch(/select \* into existing[\s\S]*daily_limit[\s\S]*mobile_benefit_draw_requests/);
  });
  it("snapshots recipient deadlines and requires complete administrator-confirmed consent copy", () => {
    expect(sql).toContain("recipient_deadline_at");
    expect(sql).toContain("mobile_benefit_consent_documents_complete");
    expect(sql).toContain("create_admin_mobile_benefit_consent");
    expect(sql).toContain("set_admin_mobile_benefit_consent_active");
  });
  it("keeps history append-only and server-only", () => {
    expect(sql).toContain("mobile_benefit_draw_requests_immutable");
    expect(sql).toContain("force row level security");
    expect(sql).toMatch(/grant execute on function public\.read_owned_mobile_benefit_catalog[\s\S]*to service_role/);
    expect(sql).toContain("scrub_account_deletion_before_mobile_benefits");
  });
});
