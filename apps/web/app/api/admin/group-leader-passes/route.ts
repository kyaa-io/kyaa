import { leaderPassRoute } from "@/server/groups/dependencies";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return leaderPassRoute("list", request); }
export async function POST(request: Request) { return leaderPassRoute("issue", request); }
