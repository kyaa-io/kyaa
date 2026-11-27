import { createSignupRaffleDatabase } from "./database";
import { inRaffleWindow, rafflePolicySchema } from "../../features/benefit/domain/signup-event";

export type HomeScale = { asOf: string; closesAt: string; members: number | null; today: number | null; entrants: number | null };
let cache: { until: number; raffle: boolean; result: Promise<HomeScale> } | undefined;

export function readHomeScale(enabled: boolean) {
  const now = Date.now();
  const asOf = new Date(now).toISOString();
  const policy = rafflePolicySchema.parse({});
  const raffle = enabled && inRaffleWindow(asOf, policy);
  if (cache && cache.until > now && cache.raffle === raffle) return cache.result;
  const day = 86400000;
  const midnight = Math.floor((now + 9 * 3600000) / day) * day - 9 * 3600000;
  const result = (async () => {
    const db = createSignupRaffleDatabase();
    const membersAt = () => db.from("app_users").select("id", { count: "exact", head: true }).lt("created_at", asOf);
    // signup_raffle_entries.app_user_id is unique and references app_users.
    const counts = await Promise.allSettled([
      membersAt(), membersAt().gte("created_at", new Date(midnight).toISOString()),
      raffle ? db.from("signup_raffle_entries").select("id", { count: "exact", head: true }).gte("entered_at", policy.startsAt).lte("entered_at", asOf) : null,
    ]);
    const [members, today, entrants] = counts.map(row => row.status === "fulfilled" && !row.value?.error ? row.value?.count ?? null : null);
    return { asOf, closesAt: policy.closesAt, members, today, entrants };
  })();
  cache = { until: Math.min(now + 60000, midnight + day), raffle, result };
  return result;
}
