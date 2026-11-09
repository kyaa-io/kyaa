import { withWaveAccess } from "@/server/wave/access";
import { createPublicHomeNoticeRepository } from "../../../../server/home-notice/home-notice-dependencies";
import { createPublicHomeNoticesHandler } from "../../../../server/home-notice/home-notice-routes";

export const dynamic = "force-dynamic";

export const GET = withWaveAccess(createPublicHomeNoticesHandler(createPublicHomeNoticeRepository));
