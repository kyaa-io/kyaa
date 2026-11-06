import { participationRoute } from "@/server/schedules/routes";
import { fanpageRequestMoved } from "./moved";
// New fan page applications go through group_applications. Earlier requests stay readable.
export async function GET(request: Request) { return participationRoute("requests", request); }
export async function POST(_request: Request) { return fanpageRequestMoved(); }
