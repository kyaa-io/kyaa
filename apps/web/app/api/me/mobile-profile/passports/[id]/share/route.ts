import {
  createMobileProfileRouteHandlers,
  mobileProfileUnavailable,
} from "@/server/mobile-profile/dependencies";
export const dynamic = "force-dynamic";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    return await createMobileProfileRouteHandlers().sharePassport(
      request,
      (await context.params).id,
    );
  } catch {
    return mobileProfileUnavailable();
  }
}
