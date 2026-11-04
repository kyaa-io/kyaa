import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { createGetPublicPopularPosts } from "@/server/popular-board/popular-posts";
import { feedFailure } from "@/server/fan-posts/feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    return await createGetPublicPopularPosts(createFanpageDependencies(), { groupsEnabled: process.env.KYAA_GROUPS_ENABLED === "true" })(request);
  } catch (error) {
    return feedFailure(error);
  }
}
