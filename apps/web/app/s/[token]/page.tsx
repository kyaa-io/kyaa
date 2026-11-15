import { parseAppLocale } from "@/i18n/locales";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NO_INDEX, openGraphLocale, shareOrigin } from "@/seo/metadata";
import { communityShareTokenSchema } from "@/features/community-stamps/domain/community-stamps";
import { copyFor } from "@/features/community-stamps/ui/shared-passport-copy";
import { loadSeoCreator } from "@/server/seo/public-content";
import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { readSharedPassportActivity } from "@/server/community-stamps/shared-passport";
import { SharedPassportLanding } from "@/features/community-stamps/ui/shared-passport-landing";

export const dynamic = "force-dynamic";
/** The link preview follows the link's `?locale=`: title and description are the landing's own headline and body, the picture is the shared Passport's card. */
export async function generateMetadata({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ locale?: string }> }): Promise<Metadata> {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const locale = parseAppLocale(query.locale), c = copyFor(locale), title = `${c.title} | kyaa`;
  // The picture is this Passport's own card; the picture route falls back to the headline card when the link does not resolve.
  const picture = new URLSearchParams({ locale, ...(communityShareTokenSchema.safeParse(token).success ? { token } : {}) });
  const images = [{ url: `${shareOrigin()}/share/passport.png?${picture}`, width: 1200, height: 630, alt: c.title }];
  return {
    title, description: c.body, robots: NO_INDEX, referrer: "no-referrer",
    openGraph: { title, description: c.body, type: "website", siteName: "kyaa", locale: openGraphLocale(locale), images },
    twitter: { card: "summary_large_image", title, description: c.body, images },
  };
}

export default async function SharedPassportPage({ params, searchParams }: {
  params: Promise<{ token: string }>; searchParams: Promise<{ locale?: string }>;
}) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const locale = parseAppLocale(query.locale);
  const link = await readSharedPassportActivity(token, createFanpageDependencies());
  if (!link) notFound();
  const creator = await loadSeoCreator(link.creator, locale);
  if (!creator) notFound();
  return <SharedPassportLanding token={token} locale={locale} activity={link}
    creator={{ slug: creator.slug, name: creator.name, image: { url: creator.image.url, alt: creator.image.alt } }} />;
}
