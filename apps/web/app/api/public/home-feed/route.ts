import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { createGetPublicHomeFeed } from "@/server/fan-posts/home-feed";
import { feedFailure } from "@/server/fan-posts/feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    return await createGetPublicHomeFeed(createFanpageDependencies())(request);
  } catch (error) {
    return feedFailure(error);
  }
}
