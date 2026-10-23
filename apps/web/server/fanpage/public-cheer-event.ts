import "server-only";
import { createClient } from "@/server/data/client";
import type { ContentLocale } from "../content/content-domain";
import { cheerEventRewardsResponseSchema } from "../../features/fanpage/domain/cheer-event";

/** Render public campaign content before hydration; owner state is always checked on the client. */
export async function readPublicCheerEvent(slug: string, locale: ContentLocale) {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if ((!url || !key) && (!process.env.POSTGREST_URL || !process.env.POSTGREST_SERVICE_TOKEN)) return undefined;
  try {
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await db.rpc("read_celebrity_cheer_event_rewards", { p_slug: slug, p_app_user_id: null, p_locale: locale }).abortSignal(AbortSignal.timeout(3000));
    if (error) return undefined;
    const parsed = cheerEventRewardsResponseSchema.parse(data);
    return parsed.event ? { ...parsed.event, participation: null, photocard: parsed.event.photocard ? { ...parsed.event.photocard, eligible: null } : null } : null;
  } catch { return undefined; }
}
