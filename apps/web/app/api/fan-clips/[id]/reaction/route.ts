import { createMobileContentRouteHandlers, mobileContentUnavailable } from "@/server/mobile-content/dependencies";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try { return await createMobileContentRouteHandlers().clipLike(request, (await context.params).id); }
  catch { return mobileContentUnavailable(); }
}
