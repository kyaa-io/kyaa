import { createMobileContentRouteHandlers, mobileContentUnavailable } from "@/server/mobile-content/dependencies";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try { return await createMobileContentRouteHandlers().removeClipComment(request, (await context.params).id); }
  catch { return mobileContentUnavailable(); }
}
