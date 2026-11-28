import { listPublicPastRaffles } from "@/server/raffle/public-past-raffles";
import { withWaveAccess } from "@/server/wave/access";

export const dynamic = "force-dynamic";

async function getRecent(request: Request) {
  const locale = new URL(request.url).searchParams.get("locale") ?? "ko";
  if (locale !== "ko" && locale !== "en") return Response.json({ error: { code: "INVALID_LOCALE" } }, { status: 400 });
  try {
    const results = await listPublicPastRaffles(locale, new Date());
    results.sort((a, b) => Date.parse(b.raffle.entryClosesAt!) - Date.parse(a.raffle.entryClosesAt!));
    return Response.json({ items: results.slice(0, 3) }, { headers: { "cache-control": "public, max-age=30, stale-while-revalidate=60" } });
  } catch {
    return Response.json({ error: { code: "RAFFLES_UNAVAILABLE" } }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
export const GET = withWaveAccess(getRecent);
