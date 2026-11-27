import { createSignupRaffleDatabase } from "./database";

export type HomeScale = { asOf: string; members: number | null; passports: number | null };
let cache: { until: number; result: Promise<HomeScale> } | undefined;

export function readHomeScale() {
  const now = Date.now();
  if (cache && cache.until > now) return cache.result;
  const asOf = new Date(now).toISOString();
  const result = (async () => {
    const db = createSignupRaffleDatabase();
    const counts = await Promise.allSettled([
      db.from("app_users").select("id", { count: "exact", head: true }).lt("created_at", asOf),
      db.from("fan_passports").select("id", { count: "exact", head: true })
        .eq("business_status", "issued").lt("issued_at", asOf),
    ]);
    const [members, passports] = counts.map(row =>
      row.status === "fulfilled" && !row.value.error ? row.value.count ?? null : null);
    return { asOf, members, passports };
  })();
  cache = { until: now + 60000, result };
  return result;
}
