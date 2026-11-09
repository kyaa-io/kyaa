import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { createGetPublicPopularPosts } from "@/server/popular-board/popular-posts";
import { readPopularPostPageImage } from "@/server/popular-board/page-images";
import { feedFailure } from "@/server/fan-posts/feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    return await createGetPublicPopularPosts(createFanpageDependencies(), { groupsEnabled: process.env.KYAA_GROUPS_ENABLED === "true", pageImage: readPopularPostPageImage })(request);
  } catch (error) {
    return feedFailure(error);
  }
}
