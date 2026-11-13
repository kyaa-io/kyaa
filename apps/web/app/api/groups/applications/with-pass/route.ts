import { leaderPassRoute } from "@/server/groups/dependencies";
export const dynamic = "force-dynamic";
export async function POST(request: Request) { return leaderPassRoute("submit", request); }
