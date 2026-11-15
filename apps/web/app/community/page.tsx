import { notFound } from "next/navigation";
import { parseAppLocale, toContentLocale } from "@/i18n/locales";
import { communityCopy } from "@/i18n/catalogs/features__community";
import { publicMetadata } from "@/seo/metadata";
import { createPublishedContentRepositoryFromEnvironment } from "@/server/content/published-content-repository";
import { parseCommunityTab, selectCommunityCreator } from "@/features/community/domain/navigation";
import { CommunityScreen } from "@/features/community/ui/community-screen";

export const dynamic = "force-dynamic";
type Query = { locale?: string; creator?: string | string[]; tab?: string; media?: string };

export async function generateMetadata({ searchParams }: { searchParams: Promise<Query> }) {
  const locale = parseAppLocale((await searchParams).locale), copy = communityCopy(locale);
  return publicMetadata({ path: "/community", locale, title: `${copy.title} | kyaa`, description: copy.intro });
}

export default async function CommunityPage({ searchParams }: { searchParams: Promise<Query> }) {
  const query = await searchParams, locale = parseAppLocale(query.locale);
  if (Array.isArray(query.creator)) notFound();
  const repository = createPublishedContentRepositoryFromEnvironment(), contentLocale = toContentLocale(locale);
  // A failed unlisted read empties only the menu and the default pick (no unlisted creator mixed in); a ?creator= link still opens.
  const [all, unlisted] = await Promise.all([repository.list(contentLocale), repository.listUnlistedSlugs().catch(() => null)]);
  const listed = unlisted === null ? [] : all.filter(({ slug }) => !unlisted.has(slug));
  // An unlisted creator stays out of the default pick and the menu, but its own link (?creator=) still opens.
  const creator = selectCommunityCreator(listed, query.creator) ?? (query.creator === undefined ? undefined : all.find(({ slug }) => slug === query.creator));
  if (query.creator !== undefined && !creator) notFound();
  const creators = creator && !listed.includes(creator) ? [...listed, creator] : listed;
  return <CommunityScreen key={`${creator?.slug}:${locale}:${query.tab}`} creators={creators} creator={creator} locale={locale} tab={parseCommunityTab(query.tab)} mediaOnly={query.media === "1"} />;
}
