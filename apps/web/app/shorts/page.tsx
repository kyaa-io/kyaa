import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FanAppFrame, FanContentContainer } from "@/components/fan-shell/fan-app-shell";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { ShortsCatalog } from "@/features/home/ui/shorts-catalog";
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
  if (params.offset !== undefined && (typeof params.offset !== "string" || !/^(0|[1-9]\d*)$/.test(params.offset) || Number(params.offset) > 2147483635)) redirect(`/shorts?locale=${locale}`);
  const catalog = await createPublicHomeGalleryRepository().listShortsCatalog(toContentLocale(locale));
  return <FanAppFrame locale={locale} currentPath="/shorts" mainId="shorts-main"><FanContentContainer as="main" id="shorts-main" tabIndex={-1}>
    <div className={styles.page}><FanHeading as="h1">{shortsTitle[locale]}</FanHeading>
      {catalog.items.length ? <ShortsCatalog catalog={catalog} locale={locale} initialVideo={typeof params.video === "string" ? params.video : undefined} /> : <p className={styles.empty}>{shortsEmpty[locale]}</p>}
    </div>
  </FanContentContainer></FanAppFrame>;
}
