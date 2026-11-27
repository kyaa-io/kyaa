import { z } from "zod";
import { readPastDrawArchive } from "@/server/raffle/past-draw-archive";
import { withWaveAccess } from "@/server/wave/access";

export const dynamic = "force-dynamic";

export const GET = withWaveAccess(async (request: Request) => {
  const query = new URL(request.url).searchParams;
  const locale = z.enum(["ko", "en"]).safeParse(query.get("locale") ?? "ko");
  const page = z.coerce.number().int().min(1).max(10000).safeParse(query.get("page") ?? 1);
  if (!locale.success || !page.success) return Response.json({ error: { code: "INVALID_QUERY" } }, { status: 400 });
  try {
    const items = await readPastDrawArchive(locale.data, new Date());
    const size = query.has("page") ? 12 : 3;
    const start = (page.data - 1) * size;
    return Response.json({ items: items.slice(start, start + size), hasMore: items.length > start + size }, {
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return Response.json({ error: { code: "RAFFLES_UNAVAILABLE" } }, { status: 503 });
  }
});
