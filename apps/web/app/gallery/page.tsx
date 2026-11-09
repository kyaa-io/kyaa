import type { Metadata } from "next";
import { FanAppFrame, FanContentContainer } from "@/components/fan-shell/fan-app-shell";
import { homeGalleryCopy, type HomeGalleryPage } from "@/features/home/domain/home-gallery";
import { HomeGalleryScreen } from "@/features/home/ui/home-gallery-page";
import { parseAppLocale, toContentLocale } from "@/i18n/locales";
import { publicMetadata } from "@/seo/metadata";
import { createPublicHomeGalleryRepository } from "@/server/home-gallery/home-gallery-dependencies";

export const dynamic = "force-dynamic";
type Props = { searchParams: Promise<{ locale?: string | string[]; cursor?: string | string[] }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const locale = parseAppLocale((await searchParams).locale);
  const { title } = homeGalleryCopy[locale];
  return publicMetadata({ path: "/gallery", locale, title: `${title} | kyaa`, description: title });
}

export default async function HomeGalleryPage({ searchParams }: Props) {
  const params = await searchParams;
  const locale = parseAppLocale(params.locale);
  const cursor = typeof params.cursor === "string" ? params.cursor : null;
  // A bad cursor or a failed read shows the empty row, never an error page.
  const page: HomeGalleryPage = await createPublicHomeGalleryRepository().listPublished(toContentLocale(locale), { limit: 24, cursor })
    .catch(() => ({ items: [], nextCursor: null }));
  return <FanAppFrame locale={locale} currentPath="/gallery" mainId="gallery-main">
    <FanContentContainer as="main" id="gallery-main" tabIndex={-1}>
      <HomeGalleryScreen locale={locale} items={page.items} nextCursor={page.nextCursor} />
    </FanContentContainer>
  </FanAppFrame>;
}
