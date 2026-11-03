import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "../../supabase/migrations/20261208052000_community_media_feed.sql"), "utf8");
const behavior = readFileSync(resolve(process.cwd(), "../../supabase/tests/unified_creator_feed.sql"), "utf8");

describe("media-only community feed SQL", () => {
  it("uses existing viewer-visible post JSON and filters before the page limit", () => {
    expect(sql).toContain("fan_web_content_target(p_app_user_id,'fan_post',p.id,p_locale) is not null");
    expect(sql).toContain("fan_web_post_json(p_app_user_id,p.id,p_locale)");
    const candidates = sql.slice(sql.indexOf("candidates as materialized"), sql.indexOf("), page as"));
    expect(candidates.indexOf("jsonb_array_length(item->'assets')>0")).toBeLessThan(candidates.indexOf("limit "));
    expect(candidates).toContain("item->'video'<>'null'::jsonb");
    expect(candidates).toContain("(0,created_at,'fan_post'::text,id)<(p_before_rank,p_before_at,p_before_kind,p_before_id)");
  });

  it("adds a required media overload without replacing the old RPC", () => {
    expect(sql).toContain("p_media_only boolean,\n  p_app_user_id uuid");
    expect(sql).not.toMatch(/drop function|create or replace function/);
    expect(sql).toContain("from public,anon,authenticated,service_role");
    expect(sql).toContain(") to service_role");
    expect(behavior).toContain("media visibility/filter must precede limit");
    expect(behavior).toContain("media image/video cursor failed");
    expect(behavior).toContain("ordinary RPC overload changed existing feed");
    expect(behavior).toContain("media guest private/text/cheer leak");
  });
});
