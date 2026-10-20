import { withWaveAccess } from "@/server/wave/access";
import { chzzkChannelId } from "@/features/fanpage/domain/chzzk-posts";
import { readChzzkPost } from "@/server/chzzk/community";
import { createPublishedContentRepositoryFromEnvironment } from "@/server/content/published-content-repository";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = withWaveAccess(async (_request: Request, context: { params: Promise<{ slug: string; postId: string }> }) => {
  const { slug, postId } = await context.params;
  if (!/^[1-9]\d{0,14}$/.test(postId)) return Response.json({ error: "not_found" }, { status: 404 });
  try {
    const creator = await createPublishedContentRepositoryFromEnvironment().findBySlug("ko", slug);
    const channel = creator ? chzzkChannelId(creator.socialLinks) : null;
    const post = channel ? await readChzzkPost(postId, undefined, channel) : null;
    return post ? Response.json(post, { headers: { "cache-control": "private, no-store" } }) : Response.json({ error: "not_found" }, { status: 404 });
  } catch { return Response.json({ error: "chzzk_unavailable" }, { status: 503 }); }
});
