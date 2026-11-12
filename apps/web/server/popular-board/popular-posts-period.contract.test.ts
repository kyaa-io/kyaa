import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

it("filters both post sources by the selected period before sorting and pagination", () => {
  const sql = readFileSync(resolve(process.cwd(), "../../supabase/migrations/20261224020000_popular_posts_period.sql"), "utf8");
  expect(sql).toContain("(length(def)-length(replace(def,old_source,'')))/length(old_source)<>2");
  expect(sql).toContain("when ''today'' then (date_trunc(''day'', now() at time zone ''Asia/Seoul'') at time zone ''Asia/Seoul'')");
  expect(sql).toContain("when ''month'' then now()-interval ''30 days''");
  expect(sql).toContain("else now()-interval ''7 days'' end");
  expect(sql).toContain("def:=replace(replace(def,old_source,source_filter),old_rank,rank_filter)");
});
