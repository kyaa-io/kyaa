import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "../../../../supabase");
const NAME = "fan_session_revocation";

describe("fan session revocation migration", () => {
  const migrations = readdirSync(join(root, "migrations"));
  const own = migrations.filter((file) => file.endsWith(`_${NAME}.sql`));

  it("has a version no other migration shares, after the platform follower link that main already holds", () => {
    expect(own).toHaveLength(1);
    const version = own[0].split("_")[0];
    expect(version > "20261228210000").toBe(true);
    expect(migrations.filter((file) => file.split("_")[0] === version)).toEqual(own);
    expect(readdirSync(join(root, "rollbacks")).filter((file) => file.endsWith(`_${NAME}.sql`))).toEqual(own);
  });

  it("runs as one transaction that gives up after 3 seconds instead of queuing requests behind app_users", () => {
    for (const dir of ["migrations", "rollbacks"]) {
      const sql = readFileSync(join(root, dir, own[0]), "utf8").replace(/^(--.*\n)+/, "").trim();
      expect(sql).toMatch(/^begin;\s*(--.*\n\s*)?set local lock_timeout = '3s';/i);
      expect(sql).toMatch(/commit;$/i);
    }
  });
});
