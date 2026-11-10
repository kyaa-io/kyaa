import type { AppLocale } from "@/i18n/locales";
import type { PublishedCelebrity } from "@/server/content/content-domain";
import { CreatorMediaPanel } from "@/features/media/ui/creator-media-panel";
import { CreatorBoardPreview } from "./creator-board-preview";
import styles from "./creator-home-highlights.module.css";

export function CreatorHomeHighlights({ celebrity, locale, channelId }: { celebrity: PublishedCelebrity; locale: AppLocale; channelId: string | null }) {
  return <div className={styles.highlights}>
    <CreatorMediaPanel key={`${celebrity.slug}:${locale}`} slug={celebrity.slug} locale={locale} channelId={channelId} socialLinks={celebrity.socialLinks} preview />
    <CreatorBoardPreview slug={celebrity.slug} locale={locale} />
  </div>;
}
