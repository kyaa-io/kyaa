import { groupActivityRoute } from "@/server/group-activities/dependencies";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return groupActivityRoute("admin-missions", request); }
