import { withWaveAccess } from "@/server/wave/access";
import { z } from "zod";
import { officialVideoChannel, officialVideoChannelUrl } from "@/features/fanpage/domain/official-video-channels";
import { readOfficialEmbedVideoId } from "@/server/youtube/youtube-uploads";

export const runtime = "nodejs";
const headers = { "cache-control": "private, no-store" };
async function waveOriginalGET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const slug = z.string().max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).safeParse((await context.params).slug);
  const channel = slug.success ? officialVideoChannel(slug.data) : undefined;
  if (!channel) return Response.json({ error: { code: "NOT_FOUND" } }, { status: 404, headers });
  // No videoId is a normal answer (no playable upload, key missing, API down): the page then shows only the YouTube link.
  return Response.json({ videoId: channel.videoId ?? await readOfficialEmbedVideoId(officialVideoChannelUrl(channel.id)) }, { headers });
}

export const GET = withWaveAccess(waveOriginalGET);
