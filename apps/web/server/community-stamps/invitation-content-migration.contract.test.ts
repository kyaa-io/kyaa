import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "../../supabase/migrations/20261127000000_mobile_invitation_content.sql"), "utf8");
describe("invitation content SQL contract", () => {
  it("returns no invented fallback and rechecks public content at read time", () => {
    expect(sql).toContain("coalesce(jsonb_agg(content order by threshold),'[]'::jsonb)");
    expect(sql).toContain("post.visibility='public'");
    expect(sql).toContain("post.deleted_at is null and post.hidden_at is null");
    expect(sql).toContain("author.status='active'");
    expect(sql).toContain("celebrity.status='published'");
    expect(sql).toContain("public.fan_web_content_visible(p_app_user_id,'fan_post',post.id)");
    expect(sql).toContain("not public.fan_web_blocked(p_app_user_id,post.app_user_id)");
  });
  it("uses append-only, audited operator versions", () => {
    expect(sql).toContain("community_stamp_invitation_content_configs_immutable");
    expect(sql).toContain("community_stamp.invitation_content.created");
    expect(sql).toContain("max(config_version),0)+1");
  });
});
