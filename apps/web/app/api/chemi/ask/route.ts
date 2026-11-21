import { askRoute } from "@/server/chemi-ask/routes";

export const dynamic = "force-dynamic";
export const GET = (request: Request) => askRoute("state", request);
export const POST = (request: Request) => askRoute("submit", request);
