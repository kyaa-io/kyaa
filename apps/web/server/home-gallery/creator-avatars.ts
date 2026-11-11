import "server-only";
import { creatorPresentationRole } from "@/components/fan-ui/creator-image-config";
import type { HomeShort } from "@/features/home/domain/home-gallery";
import { createPublishedContentRepositoryFromEnvironment, type PublishedContentRepository } from "@/server/content/published-content-repository";

type Avatar = NonNullable<HomeShort["creator"]["avatar"]>;
export type CreatorAvatarReader = (locale: "ko" | "en", slugs: readonly string[]) => Promise<Readonly<Record<string, Avatar>>>;

const TTL_MS = 5 * 60_000;
const role = creatorPresentationRole("avatar");

/** Reads each creator's profile image from the published creator record. A failed or missing read leaves that creator on the default icon. */
export function createCreatorAvatarReader(getRepository: () => PublishedContentRepository = createPublishedContentRepositoryFromEnvironment): CreatorAvatarReader {
  const cache = new Map<string, { at: number; avatar: Avatar | null }>();
  return async (locale, slugs) => {
    const now = Date.now();
    const found: Record<string, Avatar> = {};
    let repository: PublishedContentRepository | null = null;
    await Promise.all(slugs.map(async slug => {
      const key = `${locale}:${slug}`, hit = cache.get(key);
      if (hit && now - hit.at < TTL_MS) { if (hit.avatar) found[slug] = hit.avatar; return; }
      try {
        repository ??= getRepository();
        const celebrity = await repository.findBySlug(locale, slug);
        const binding = celebrity?.image.photos?.[role];
        const avatar = celebrity?.image.url ? { src: celebrity.image.url, ...(binding ? { photos: { [role]: binding } } : {}) } : null;
        cache.set(key, { at: now, avatar });
        if (avatar) found[slug] = avatar;
      } catch { /* default icon */ }
    }));
    return found;
  };
}
