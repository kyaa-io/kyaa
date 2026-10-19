import { handleParticipation } from "@/server/byus-day/participation-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const GET = (request: Request) => handleParticipation(request);
export const POST = (request: Request) => handleParticipation(request);
