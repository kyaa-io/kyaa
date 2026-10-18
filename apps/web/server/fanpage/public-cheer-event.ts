import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { ContentLocale } from "../content/content-domain";
import { cheerEventResponseSchema } from "../../features/fanpage/domain/cheer-event";

/** Render public campaign content before hydration; owner state is always checked on the client. */
export async function readPublicCheerEvent(slug: string, locale: ContentLocale) {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return undefined;
  try {
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await db.rpc("read_celebrity_cheer_event_live_state", { p_slug: slug, p_app_user_id: null, p_locale: locale }).abortSignal(AbortSignal.timeout(3000));
    if (error) return undefined;
    const parsed = cheerEventResponseSchema.parse(data);
    return parsed.event ? { ...parsed.event, participation: null } : null;
  } catch { return undefined; }
}
