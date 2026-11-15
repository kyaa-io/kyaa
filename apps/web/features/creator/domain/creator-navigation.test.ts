import { resolve } from "node:path";
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { creatorHomeHref, creatorSlugFromHomePath, isCreatorHandle, RESERVED_CREATOR_HANDLES } from "./creator-navigation";

// 앱 경로는 생겼지만 DB 제약(celebrities_slug_not_reserved)에는 아직 넣지 않은 이름. 다음 예약 migration에서 SQL에 넣고 여기서 지운다.
// follow: 2026-11-16 X 오픈 이벤트(/follow). 11/15 작업은 migration 금지 범위였다.
const RESERVED_IN_APP_ONLY: readonly string[] = ["follow"];
describe("creator public handles", () => {
  it.each(["elina", "changha", "yuna", "jenny-jeong", "aryeom", "park-myungho", "ifewknow", "thisisj-official", "new-creator-2026"])("preserves %s without aliases", (slug) => {
    expect(creatorHomeHref(slug)).toBe(`/${slug}`);
    expect(creatorHomeHref(slug, "en")).toBe(`/${slug}?locale=en`);
    expect(creatorSlugFromHomePath(`/${slug}`)).toBe(slug);
    expect(creatorSlugFromHomePath(`/c/${slug}`)).toBe(slug);
    expect(creatorSlugFromHomePath(`/c/${slug}/verify`)).toBeNull();
  });
  it.each([...RESERVED_CREATOR_HANDLES, "이퓨", "Elina", "../my", "a_b", "-elina", "elina-", ""])("rejects reserved or invalid %s", (slug) => {
    expect(isCreatorHandle(slug)).toBe(false);
    expect(creatorSlugFromHomePath(`/${slug}`)).toBeNull();
  });
  it("keeps SQL registration rules aligned with the application", () => {
    const migrationDirectory = resolve(process.cwd(), "../../supabase/migrations");
    const latestPolicyMigration = readdirSync(migrationDirectory)
      .filter((name) => name.endsWith(".sql") && readFileSync(resolve(migrationDirectory, name), "utf8").includes("add constraint celebrities_slug_not_reserved"))
      .sort()
      .at(-1);
    expect(latestPolicyMigration).toBeDefined();
    const sql = readFileSync(resolve(migrationDirectory, latestPolicyMigration!), "utf8");
    for (const array of sql.matchAll(/array\[([\s\S]*?)\]::text\[\]/g)) {
      const values = [...array[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
      expect(values.sort()).toEqual(RESERVED_CREATOR_HANDLES.filter((handle) => !RESERVED_IN_APP_ONLY.includes(handle)).sort());
    }
  });
  it("reserves every static top-level app route and public directory", () => {
    for (const directory of ["app", "public"]) {
      const entries = readdirSync(resolve(process.cwd(), directory), { withFileTypes: true });
      for (const entry of entries.filter((item) => item.isDirectory() && /^[a-z0-9-]+$/.test(item.name))) {
        expect(RESERVED_CREATOR_HANDLES, `${directory}/${entry.name}`).toContain(entry.name);
      }
    }
  });
});
