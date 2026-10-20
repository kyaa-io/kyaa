import { handleRunmusic } from "@/server/runmusic/dependencies";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => handleRunmusic(request, "campaign", "read");
