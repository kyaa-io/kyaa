import { createMobileContentRouteHandlers, mobileContentUnavailable } from "@/server/mobile-content/dependencies";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ passportId: string }> }) {
  try {
    return await createMobileContentRouteHandlers().favoriteAlbum(request, (await context.params).passportId);
  } catch {
    return mobileContentUnavailable();
  }
}
