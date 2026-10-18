import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "../../supabase/migrations/20261117000000_fanpage_cheer_threads.sql"),
  "utf8",
);

describe("fanpage cheer thread SQL contract", () => {
  it("derives threads from lounge rows and preserves visibility filters", () => {
    expect(sql).toContain("public.fan_lounge_messages");
    expect(sql).toContain("author.status='active'");
    expect(sql).toContain("reply.removed_at is null");
    expect(sql).toContain("not public.fan_web_blocked(p_app_user_id,reply.app_user_id)");
    expect(sql).toContain("not public.fan_web_blocked(p_app_user_id,reaction.app_user_id)");
  });

  it("keeps reply pagination explicit and the RPC service-role-only", () => {
    expect(sql).toContain("limit least(greatest(p_limit,1),51)");
    expect(sql).toContain("revoke all on function public.read_celebrity_cheer_replies");
    expect(sql).toContain("grant execute on function public.read_celebrity_cheer_replies");
    expect(sql).toContain("to service_role");
  });
});
