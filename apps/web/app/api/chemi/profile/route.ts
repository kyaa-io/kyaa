import { chemiProfileRoute } from "@/server/chemi-profile/dependencies";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return chemiProfileRoute("getProfile", request); }
