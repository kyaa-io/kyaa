import { songSearchRoute } from "@/server/schedules/song-search-route";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return songSearchRoute(request); }
