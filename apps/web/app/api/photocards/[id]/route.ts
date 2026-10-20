import { createPhotocardRead } from "@/server/photocards/dependencies";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return createPhotocardRead()(request, (await context.params).id);
}
