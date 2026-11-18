import { recordsRoute } from "@/server/chemi-chain/records";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return recordsRoute(request, (await context.params).id);
}
