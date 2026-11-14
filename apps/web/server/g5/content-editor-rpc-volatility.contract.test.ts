import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = resolve(process.cwd(), "../../supabase/migrations");

type Fn = { volatility: "volatile" | "stable" | "immutable"; locksActor: boolean };

function finalFunctions(): Map<string, Fn> {
  const fns = new Map<string, Fn>();
  for (const file of readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    const sql = readFileSync(resolve(migrationsDir, file), "utf8");
    const create =
      /create\s+(?:or\s+replace\s+)?function\s+public\.(\w+)\s*\([^$]*?\$(\w*)\$([\s\S]*?)\$\2\$/gi;
    for (const m of sql.matchAll(create)) {
      const header = m[0].slice(0, m[0].indexOf(`$${m[2]}$`));
      const volatility = /\bimmutable\b/i.test(header)
        ? "immutable"
        : /\bstable\b/i.test(header)
          ? "stable"
          : "volatile";
      fns.set(m[1], { volatility, locksActor: /require_content_editor\s*\(/i.test(m[3]) });
    }
    for (const m of sql.matchAll(
      /alter\s+function\s+public\.(\w+)\s*\([^)]*\)\s+(volatile|stable|immutable)\b/gi,
    )) {
      const fn = fns.get(m[1]);
      if (fn) fn.volatility = m[2].toLowerCase() as Fn["volatility"];
    }
  }
  return fns;
}

describe("require_content_editor callers", () => {
  it("stay volatile: it takes SELECT ... FOR UPDATE, which PostgREST read-only transactions reject", () => {
    const offenders = [...finalFunctions()]
      .filter(([, fn]) => fn.locksActor && fn.volatility !== "volatile")
      .map(([name, fn]) => `${name} (${fn.volatility})`);
    expect(offenders).toEqual([]);
  });
});
