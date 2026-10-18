import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "../../supabase/migrations/20261119000000_schedule_import_places.sql"), "utf8");

it("searches only reviewed public schedule places behind the service role", () => {
  expect(sql).toContain("s.status='published'");
  expect(sql).toContain("c.status='published'");
  expect(sql).toContain("c.archived_at is null");
  expect(sql).toContain("limit p_limit");
  expect(sql).toContain("grant execute on function public.fan_web_search_schedule_places");
  expect(sql).toContain("to service_role");
});
