import { createSignupRaffleDatabase } from "./database";

let cache: { until: number; count: Promise<number | null> } | undefined;

async function countIssued(asOf: Date) {
  try {
    const { count, error } = await createSignupRaffleDatabase().from("fan_passports")
      .select("id", { count: "exact", head: true }).eq("business_status", "issued")
      .lt("issued_at", asOf.toISOString());
    return error ? null : count;
  } catch {
    return null;
  }
}

export function readIssuedPassports() {
  const now = Date.now();
  if (!cache || now >= cache.until) cache = { until: now + 60_000, count: countIssued(new Date(now)) };
  return cache.count;
}
