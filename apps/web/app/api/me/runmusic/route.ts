import { handleRunmusic } from "@/server/runmusic/dependencies";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const GET = (request: Request) => handleRunmusic(request, "me", "read");
export const POST = (request: Request) => handleRunmusic(request, "me", "read");
