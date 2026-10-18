import { createInvitationContentAdminRouteHandlers, invitationContentAdminUnavailable } from "@/server/community-stamps/invitation-content-admin-dependencies";

export const dynamic = "force-dynamic";
export async function GET(request: Request) { try { return await createInvitationContentAdminRouteHandlers().read(request); } catch { return invitationContentAdminUnavailable(); } }
export async function POST(request: Request) { try { return await createInvitationContentAdminRouteHandlers().create(request); } catch { return invitationContentAdminUnavailable(); } }
