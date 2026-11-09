import { withWaveAccess } from "@/server/wave/access";
import { createPublicHomeGalleryRepository } from "../../../../server/home-gallery/home-gallery-dependencies";
import { createPublicHomeGalleryHandler } from "../../../../server/home-gallery/home-gallery-routes";

export const dynamic = "force-dynamic";

export const GET = withWaveAccess(createPublicHomeGalleryHandler(createPublicHomeGalleryRepository));
