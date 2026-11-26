import { createClient } from "@/server/data/client";
import { htmlLimitedBots } from "@/seo/bots";

export function isOutboundPreview(request: Request): boolean {
  // ponytail: header filtering excludes known previews, not all bots; add verified bot detection if abuse affects reporting.
  const userAgent = request.headers.get("user-agent") ?? "";
  // Meta scans can use regular browser UAs and refer from Facebook.
  const facebookLinkScan = /^https:\/\/(?:www\.)?facebook\.com(?:[/?#]|$)/i
    .test(request.headers.get("referer") ?? "");
  return htmlLimitedBots.test(userAgent) || /bot|crawler|spider|meta-external/i.test(userAgent)
    || facebookLinkScan
    || /prefetch|prerender/i.test(`${request.headers.get("purpose") ?? ""} ${request.headers.get("sec-purpose") ?? ""}`)
    || request.headers.has("next-router-prefetch");
}

export async function recordOutboundVisit(campaign: string): Promise<void> {
  try {
    const database = createClient(process.env.SUPABASE_URL || undefined, process.env.SUPABASE_SERVICE_ROLE_KEY || undefined, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { error } = await database.from("outbound_link_visits")
      .insert({ campaign })
      .abortSignal(AbortSignal.timeout(1_500));
    if (error) throw error;
  } catch {
    // Keep the destination reachable even when measurement is unavailable.
    console.error("outbound_link_visit_failed", { campaign });
  }
}
