import { withWaveAccess } from "@/server/wave/access";
import { z } from "zod";
import { createPublishedContentRepositoryFromEnvironment } from "@/server/content/published-content-repository";
import { recordRequestError } from "@/server/observability/http-5xx-log";
import type { YouTubeFailure } from "@/server/youtube/youtube-live-source";
import { readYouTubeUploads } from "@/server/youtube/youtube-uploads";

export const runtime = "nodejs";
const headers = { "cache-control": "private, no-store" };
async function waveOriginalGET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const slug = z.string().max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).safeParse((await context.params).slug);
  if (!slug.success) return Response.json({ error: { code: "NOT_FOUND" } }, { status: 404, headers });
  let failure: YouTubeFailure = { code: "YOUTUBE_UNAVAILABLE" };
  try {
    // Recheck publication for every request, even when the upstream videos are cached.
    const creator = await createPublishedContentRepositoryFromEnvironment().findBySlug("ko", slug.data);
    if (!creator) return Response.json({ error: { code: "NOT_FOUND" } }, { status: 404, headers });
    const source = creator.socialLinks.find(link => link.platform === "youtube");
    // No API key means the integration is not set up: show nothing instead of an error.
    if (source && !process.env.YOUTUBE_DATA_API_KEY) return Response.json({ items: [], nextCursor: null }, { headers });
    const items = source ? await readYouTubeUploads(source.url, { onFailure: cause => { failure = cause; } }) : [];
    if (items === null) throw new Error("YOUTUBE_UNAVAILABLE");
    return Response.json({ items, nextCursor: null }, { headers });
  } catch {
    recordRequestError({ name: "YouTubeRouteError", code: failure.code }, {
      routePath: "/api/celebrities/[slug]/youtube", handled: true, upstreamStatus: failure.upstreamStatus,
    });
    return Response.json({ error: { code: "YOUTUBE_UNAVAILABLE" } }, { status: 503, headers });
  }
}

export const GET = withWaveAccess(waveOriginalGET);
