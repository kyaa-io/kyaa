import { createMobileContentRouteHandlers, mobileContentUnavailable } from "@/server/mobile-content/dependencies";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function handle(request: Request, context: { params: Promise<{ slug: string }> }) {
  try { return await createMobileContentRouteHandlers().clips(request, (await context.params).slug); }
  catch { return mobileContentUnavailable(); }
}
export const GET = handle;
export const POST = handle;
