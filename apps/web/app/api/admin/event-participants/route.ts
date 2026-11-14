import { createEventParticipantsHandler } from "@/server/admin/event-participants-route";
import { createFanpageDependencies } from "@/server/fanpage/dependencies";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return createEventParticipantsHandler(createFanpageDependencies())(request);
}
