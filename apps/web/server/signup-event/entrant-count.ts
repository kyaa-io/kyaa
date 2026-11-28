import { createSignupRaffleDatabase } from "./database";

let cached: { until: number; count: Promise<number | null> } | undefined;

async function countEntries() {
  try {
    const { count, error } = await createSignupRaffleDatabase().from("signup_raffle_entries")
      .select("id", { count: "exact", head: true });
    return error ? null : count ?? null;
  } catch {
    return null;
  }
}

export function readEntrantCount() {
  const now = Date.now();
  if (!cached || cached.until <= now) cached = { until: now + 60_000, count: countEntries() };
  return cached.count;
}
