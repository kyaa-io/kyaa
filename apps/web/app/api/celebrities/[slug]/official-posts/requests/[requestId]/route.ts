import { createMobileContentRouteHandlers, mobileContentUnavailable } from "@/server/mobile-content/dependencies";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ slug: string; requestId: string }> }) {
  try { const { slug, requestId } = await context.params; return await createMobileContentRouteHandlers().officialPostStatus(request, slug, requestId); }
  catch { return mobileContentUnavailable(); }
}
