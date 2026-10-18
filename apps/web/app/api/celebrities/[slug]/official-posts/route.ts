import { createMobileContentRouteHandlers, mobileContentUnavailable } from "@/server/mobile-content/dependencies";
import { invalidatePublicContentCache } from "@/server/cache/public-content-revalidation";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
async function handle(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const response = await createMobileContentRouteHandlers().officialPosts(request, (await context.params).slug);
    if (request.method === "POST" && response.ok) invalidatePublicContentCache();
    return response;
  }
  catch { return mobileContentUnavailable(); }
}
export const GET = handle;
export const POST = handle;
