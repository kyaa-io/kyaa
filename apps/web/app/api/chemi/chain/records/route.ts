import { recordsRoute } from "@/server/chemi-chain/records";
export const GET = (request: Request) => recordsRoute(request);
