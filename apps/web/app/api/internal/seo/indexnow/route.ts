import { createIndexNowHandler, runIndexNow } from "@/server/seo/indexnow";
import { createIndexNowStoreFromEnvironment } from "@/server/seo/indexnow-store";
import { loadSearchPublicationSnapshot } from "@/server/seo/publication-snapshot";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request) {
  return createIndexNowHandler({
    secret: process.env.CRON_SECRET,
    production: process.env.VERCEL_ENV === "production",
    execute: () => runIndexNow({ store: createIndexNowStoreFromEnvironment(), loadSnapshot: loadSearchPublicationSnapshot }),
  })(request);
}
