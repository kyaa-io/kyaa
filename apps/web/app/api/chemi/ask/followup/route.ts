import { askRoute } from "@/server/chemi-ask/routes";

export const dynamic = "force-dynamic";
export const POST = (request: Request) => askRoute("followup", request);
