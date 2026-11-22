import { askRoute } from "@/server/chemi-ask/routes";

export const dynamic = "force-dynamic";
export const GET = (request: Request) => askRoute("evidence", request);
