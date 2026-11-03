import { groupRoute } from "@/server/groups/dependencies";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return groupRoute("applications", request); }
export async function POST(request: Request) { return groupRoute("apply", request); }
