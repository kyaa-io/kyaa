import consent from "@/server/home-gallery/home-media-consent.json";
import { z } from "zod";
import { AuthError } from "@/features/auth/domain/auth-errors";
import { createHomeNoticeAdminDependencies } from "@/server/home-notice/home-notice-dependencies";
import { createClient } from "@/server/data/client";
import { loadServerEnv } from "@/server/config/env";

const kind = z.enum(["photo", "video"]);
const edit = z.object({ kind, action: z.enum(["select","remove","hide","rank"]), ids: z.array(z.string().min(1).max(200)).min(1).max(1000) });
async function handle(request: Request) {
  try {
    const deps = createHomeNoticeAdminDependencies();
    const actor = await deps.authorize({ authorization: request.headers.get("authorization") ?? "", correlationId: crypto.randomUUID() });
    if (actor.role === "viewer") return new Response(null, { status: 403 });
    const env = loadServerEnv();
    const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    if (request.method === "POST") {
      const change = edit.parse(await request.json());
      const { error } = await db.rpc("admin_edit_home_media", { p_kind: change.kind, p_action: change.action, p_ids: change.ids, p_editor: actor.appUserId });
      if (error) throw error;
      deps.invalidatePublicContent();
      return new Response(null, { status: 204 });
    }
    const { data, error } = await db.rpc("admin_home_media_candidates", { p_kind: kind.parse(new URL(request.url).searchParams.get("kind")), p_groups: process.env.KYAA_GROUPS_ENABLED === "true" });
    if (error) throw error;
    const items = (data ?? []).map((item: { creator?: { slug: string } }) => ({ ...item, consent: consent[item.creator?.slug as keyof typeof consent] ?? null }));
    return Response.json(items, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return new Response(null, { status: error instanceof AuthError ? error.status : error instanceof z.ZodError || error instanceof SyntaxError ? 400 : 503 });
  }
}
export const GET = handle;
export const POST = handle;
