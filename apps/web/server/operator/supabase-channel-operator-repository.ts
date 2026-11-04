import "server-only";

import { type SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/server/data/client";
import { createSupabaseAdminSessionRepository } from "../admin/supabase-admin-session-repository";
import type { ChannelOperatorRepository } from "./channel-operator-gate";

type DatabaseClient = Pick<SupabaseClient, "from">;

export function createSupabaseChannelOperatorRepository(
  config: { url: string | undefined; serviceRoleKey: string | undefined },
  client?: DatabaseClient,
): ChannelOperatorRepository {
  const database = client ?? createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const base = createSupabaseAdminSessionRepository(config, database);
  return {
    ...base,
    async listActiveChannelIds(appUserId) {
      const { data, error } = await database
        .from("channel_operators")
        .select("celebrity_id")
        .eq("app_user_id", appUserId)
        .eq("status", "active");
      if (error) throw new Error(`channel operator lookup failed: ${error.message}`);
      return (data ?? []).map((row) => row.celebrity_id as string);
    },
    async appendOperatorAudit(event) {
      const { error } = await database.from("audit_logs").insert({
        actor_app_user_id: event.actorAppUserId,
        actor_admin_allowlist_id: event.actorAdminAllowlistId,
        action: event.action,
        entity_type: "channel_operator_session",
        entity_id: null,
        correlation_id: event.correlationId,
        before_after_summary: event.summary,
      });
      if (error) throw new Error(`channel operator audit append failed: ${error.message}`);
    },
  };
}

export type OperatorChannel = { id: string; slug: string; status: "draft" | "published"; nameKo: string; nameEn: string };

export async function listOperatorChannels(
  config: { url: string | undefined; serviceRoleKey: string | undefined },
  channelIds: string[] | null,
): Promise<OperatorChannel[]> {
  const database = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  let query = database
    .from("celebrities")
    .select("id,slug,status,celebrity_localizations(locale,name)")
    .in("status", ["draft", "published"])
    .order("slug");
  if (channelIds !== null) query = query.in("id", channelIds);
  const { data, error } = await query;
  if (error) throw new Error(`channel list failed: ${error.message}`);
  return (data ?? []).map((row) => {
    const names = (Array.isArray(row.celebrity_localizations) ? row.celebrity_localizations : []) as { locale: string; name: string }[];
    const ko = names.find((item) => item.locale === "ko")?.name ?? row.slug;
    return { id: row.id, slug: row.slug, status: row.status, nameKo: ko, nameEn: names.find((item) => item.locale === "en")?.name ?? ko };
  });
}
