import { createSocialRouteHandlers, socialUnavailable } from "@/server/social/dependencies";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { try { return await createSocialRouteHandlers().listFriends(request); } catch { return socialUnavailable(); } }
export async function POST(request: Request) { try { return await createSocialRouteHandlers().requestFriend(request); } catch { return socialUnavailable(); } }
