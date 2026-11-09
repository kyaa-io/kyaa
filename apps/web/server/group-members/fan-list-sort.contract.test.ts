import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const root = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const migration = read("supabase/migrations/20261220130000_fan_list_sort.sql");
describe("fan list sort migration contract", () => {
  it("patches the current reader with shape guards and preserves owner/RLS verification", () => {
    expect(migration).toContain("pg_catalog.pg_get_functiondef('public.read_group_public_people");
    expect(migration.match(/FAN_LIST_SORT_SHAPE/g)?.length).toBeGreaterThan(10);
    expect(migration).toContain("alter function public.read_group_fans");
    expect(migration).toContain("public.group_public_directory_owner_access()");
    expect(migration).toContain("public.group_public_directory_owner_check()");
    const ownerCheck = read("supabase/migrations/20261211400000_group_public_directory.sql");
    expect(ownerCheck).toContain("pg_catalog.has_table_privilege"); expect(ownerCheck).toContain("PUBLIC_DIRECTORY_OWNER_GAP");
    expect(migration).not.toMatch(/cron\./i);
  });
  it("uses ranking hearts, minimum first date, zero counts and all cursor keys", () => {
    expect(migration).toContain("public.heart_totals()");
    expect(migration).toContain("min(l.created_at)"); expect(migration).toContain("min(c.converted_at)");
    expect(migration).toContain("coalesce(h.hearts,0)");
    expect(migration).toContain("(-hearts,-stamps,-extract(epoch from last_active_at),app_user_id)>");
    expect(migration).toContain("order by hearts desc,stamps desc,last_active_at desc,app_user_id");
    expect(migration).toContain("p_mode<>'jjinfans' or stats.hearts>0");
  });
  it("has a rollback without dropping legacy functions", () => {
    const rollback = read("supabase/rollback/20261220130000_fan_list_sort.sql");
    expect(rollback).toContain("drop function public.read_group_fans");
    expect(rollback).not.toContain("drop function public.read_group_public_people");
    expect(rollback).toContain("FAN_LIST_SORT_SHAPE");
  });
});
describe("compressed fan toolbar contract", () => {
  it("keeps shared chips, 36/14/700, input 44/radius 8 and scrolling without gray fills", () => {
    const css = read("apps/web/features/groups/ui/group-members.module.css");
    expect(css).toMatch(/\.toolbar \.tabs[^}]*flex-wrap: nowrap[^}]*overflow-x: auto/);
    expect(css).toContain("scrollbar-width: none"); expect(css).toContain("min-height: var(--fan-chip-height); font-size: var(--fan-chip-size); font-weight: 700; border-radius: var(--radius-action)");
    expect(css).toMatch(/\.input[^}]*height: 44px[^}]*border-radius: var\(--radius-action\)/);
    expect(css).not.toMatch(/background:\s*var\(--color-soft\)/);
    expect(css).not.toMatch(/font-weight:\s*(?:500|600|650|750|850|900)/);
    expect(css).toContain("@media (min-width: 1024px)");
  });
});
