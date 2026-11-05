import "server-only";
import { createClient } from "@/server/data/client";
import { loadServerEnv } from "@/server/config/env";

// record_dukjil_action and attend_creator take the creator's uuid, not the slug. Slug -> id never changes, so it is cached per process.
const cache = new Map<string, string>();
let client: ReturnType<typeof createClient> | null = null;

export async function resolveCreatorId(slug: string): Promise<string | null> {
  const hit = cache.get(slug);
  if (hit) return hit;
  if (!client) {
    const env = loadServerEnv();
    client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  const { data, error } = await client.from("celebrities").select("id").eq("slug", slug).maybeSingle();
  if (error) throw new Error(error.message);
  const id = (data as { id?: string } | null)?.id ?? null;
  if (id) cache.set(slug, id);
  return id;
}

// Batch slug -> id for the attendance list. Unknown slugs are left out of the returned map.
export async function resolveCreatorIds(slugs: string[]): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  const missing = slugs.filter((slug) => { const hit = cache.get(slug); if (hit) found.set(slug, hit); return !hit; });
  if (missing.length === 0) return found;
  if (!client) {
    const env = loadServerEnv();
    client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  const { data, error } = await client.from("celebrities").select("id, slug").in("slug", missing);
  if (error) throw new Error(error.message);
  for (const row of (data ?? []) as { id: string; slug: string }[]) { cache.set(row.slug, row.id); found.set(row.slug, row.id); }
  return found;
}

// Route ids are fan_passports.id; the stamp/roadmap/claim RPCs are keyed by (user, celebrity). Ownership is part of the lookup,
// so a passport that belongs to someone else resolves to null (404) exactly like a missing one.
export async function resolveOwnedPassportCreator(passportId: string, appUserId: string): Promise<string | null> {
  if (!client) {
    const env = loadServerEnv();
    client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  const { data, error } = await client.from("fan_passports").select("celebrity_id").eq("id", passportId).eq("app_user_id", appUserId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { celebrity_id?: string } | null)?.celebrity_id ?? null;
}
