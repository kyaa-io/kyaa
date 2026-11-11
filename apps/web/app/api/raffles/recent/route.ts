import { createPublishedContentRepositoryFromEnvironment } from "@/server/content/published-content-repository";
import { createRaffleDependencies } from "@/server/raffle/raffle-dependencies";
import { raffleStatus } from "@/features/benefit/domain/raffle";
import { withWaveAccess } from "@/server/wave/access";

export const dynamic = "force-dynamic";

async function getRecent(request: Request) {
  const locale = new URL(request.url).searchParams.get("locale") ?? "ko";
  if (locale !== "ko" && locale !== "en") return Response.json({ error: { code: "INVALID_LOCALE" } }, { status: 400 });
  try {
    const creators = await createPublishedContentRepositoryFromEnvironment().list(locale);
    const repository = createRaffleDependencies();
    const now = new Date();
    const results = [];
    for (let i = 0; i < creators.length; i += 8) {
      const batch = await Promise.all(creators.slice(i, i + 8).map(async creator => {
        const { raffles } = await repository.list({ celebritySlug: creator.slug, locale, now });
        return raffles.filter(raffle => raffleStatus(raffle, now.getTime()) === "closed" && raffle.entryClosesAt).map(raffle => ({ raffle, creator: { slug: creator.slug, name: creator.name } }));
      }));
      results.push(...batch.flat());
    }
    results.sort((a, b) => Date.parse(b.raffle.entryClosesAt!) - Date.parse(a.raffle.entryClosesAt!));
    return Response.json({ items: results.slice(0, 3) }, { headers: { "cache-control": "public, max-age=30, stale-while-revalidate=60" } });
  } catch {
    return Response.json({ error: { code: "RAFFLES_UNAVAILABLE" } }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
export const GET = withWaveAccess(getRecent);
