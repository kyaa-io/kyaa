import { chemiProfileRoute } from "@/server/chemi-profile/dependencies";
export const dynamic = "force-dynamic";
export async function PUT(request: Request) { return chemiProfileRoute("putBirth", request); }
export async function DELETE(request: Request) { return chemiProfileRoute("deleteBirth", request); }
