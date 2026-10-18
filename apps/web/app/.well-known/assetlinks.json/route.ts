import { appAssociationResponse } from "@/server/app-link/association";

export const dynamic = "force-dynamic";
export function GET(request: Request) { return appAssociationResponse(request, "android"); }
