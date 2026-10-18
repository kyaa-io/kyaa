import { participationRoute } from "@/server/schedules/routes";
export async function POST(request: Request) { return participationRoute("suggestion-import", request); }
