import { createMobileContentRouteHandlers, mobileContentUnavailable } from "@/server/mobile-content/dependencies";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function handle(request: Request, context: { params: Promise<{ id: string }> }) {
  try { return await createMobileContentRouteHandlers().clip(request, (await context.params).id); }
  catch { return mobileContentUnavailable(); }
}
export const GET = handle;
export const DELETE = handle;
