import { cronOwnerResponse } from "@/server/cron/owner";
import { createIndexNowHandler, runIndexNow } from "@/server/seo/indexnow";
import { createIndexNowStoreFromEnvironment } from "@/server/seo/indexnow-store";
import { loadSearchPublicationSnapshot } from "@/server/seo/publication-snapshot";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request) {
  const ownership = cronOwnerResponse(request);
  if (ownership) return ownership;
  return createIndexNowHandler({
    secret: process.env.CRON_SECRET,
    production: process.env.VERCEL_ENV === "production" || (process.env.HOSTING_PROVIDER === "aws" && process.env.APP_ENV === "prod"),
    execute: () => runIndexNow({ store: createIndexNowStoreFromEnvironment(), loadSnapshot: loadSearchPublicationSnapshot }),
  })(request);
}
