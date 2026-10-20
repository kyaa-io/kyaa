import { handleRunmusic } from "@/server/runmusic/dependencies";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = (request: Request) => handleRunmusic(request, "admin", "receive");
