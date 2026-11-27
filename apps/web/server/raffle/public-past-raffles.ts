import { createPublishedContentRepositoryFromEnvironment } from "@/server/content/published-content-repository";
import { createRaffleDependencies } from "@/server/raffle/raffle-dependencies";
import { raffleStatus } from "@/features/benefit/domain/raffle";

export async function listPublicPastRaffles(locale: "ko" | "en", now: Date) {
  const creators = await createPublishedContentRepositoryFromEnvironment().list(locale);
  const repository = createRaffleDependencies();
  const results = [];
  for (let i = 0; i < creators.length; i += 8) {
    const batch = await Promise.all(creators.slice(i, i + 8).map(async creator => {
      const { raffles } = await repository.list({ celebritySlug: creator.slug, locale, now });
      return raffles.filter(raffle => raffleStatus(raffle, now.getTime()) === "closed" && raffle.entryClosesAt).map(raffle => ({ raffle, creator: { slug: creator.slug, name: creator.name, image: creator.image.url } }));
    }));
    results.push(...batch.flat());
  }
  return results;
}
