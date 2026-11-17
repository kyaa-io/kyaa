import { chemiProfileRoute } from "@/server/chemi-profile/dependencies";
export const dynamic = "force-dynamic";
export async function POST(request: Request) { return chemiProfileRoute("postPartner", request); }
export async function DELETE(request: Request) { return chemiProfileRoute("deletePartner", request); }
