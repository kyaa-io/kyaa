import { createHomeBannerVideoDependencies } from "../../../../server/g5/home-banner-manager-route-dependencies";
import { createPostHomeBannerVideoHandler } from "../../../../server/g5/home-banner-video-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) { return createPostHomeBannerVideoHandler(createHomeBannerVideoDependencies())(request); }
