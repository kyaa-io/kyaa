import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FanAppFrame, FanContentContainer } from "@/components/fan-shell/fan-app-shell";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanAction } from "@/components/fan-ui/fan-action";
import { homeGalleryCopy } from "@/features/home/domain/home-gallery";
import { HomeShorts } from "@/features/home/ui/home-shorts";
import { shortsTitle, shortsEmpty } from "@/features/home/ui/home-shorts-copy";
import { parseAppLocale, toContentLocale } from "@/i18n/locales";
import { publicMetadata } from "@/seo/metadata";
import { createPublicHomeGalleryRepository } from "@/server/home-gallery/home-gallery-dependencies";
import styles from "@/features/home/ui/home-gallery-page.module.css";

export const dynamic = "force-dynamic";
type Props = { searchParams: Promise<{ locale?: string | string[]; offset?: string | string[]; video?: string | string[] }> };
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const locale = parseAppLocale((await searchParams).locale), title = shortsTitle[locale];
  return publicMetadata({ path: "/shorts", locale, title: `${title} | kyaa`, description: title });
}
export default async function ShortsPage({ searchParams }: Props) {
  const params = await searchParams, locale = parseAppLocale(params.locale);
  const value = params.offset ?? "0";
  if (typeof value !== "string" || !/^(0|[1-9]\d*)$/.test(value) || Number(value) > 2147483635) redirect(`/shorts?locale=${locale}`);
  const offset = Number(value), page = await createPublicHomeGalleryRepository().listShortsPage(toContentLocale(locale), { offset, limit: 12 });
  return <FanAppFrame locale={locale} currentPath="/shorts" mainId="shorts-main"><FanContentContainer as="main" id="shorts-main" tabIndex={-1}>
    <div className={styles.page}><FanHeading as="h1">{shortsTitle[locale]}</FanHeading>
      {page.items.length ? <HomeShorts items={page.items} locale={locale} layout="grid" initialVideo={typeof params.video === "string" ? params.video : undefined} offset={offset} /> : <p className={styles.empty}>{shortsEmpty[locale]}</p>}
      {page.hasMore && <FanAction className={styles.more} href={`/shorts?locale=${locale}&offset=${offset + 12}`}>{homeGalleryCopy[locale].more}</FanAction>}
    </div>
  </FanContentContainer></FanAppFrame>;
}
