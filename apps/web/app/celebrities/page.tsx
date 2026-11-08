import { redirect } from "next/navigation";
import type { Route } from "next";
import { groupsEnabled } from "@/features/groups/domain/availability";
import { toContentLocale } from "@/i18n/locales";
import { parseAppLocale } from "@/i18n/locales";
import { publicMetadata, pageCopy } from "@/seo/metadata";
import { CelebrityDirectory } from "../../components/celebrity-directory";
import { parseCreatorRoleFilter } from "../../features/creator/domain/creator-role";
import { createPublishedContentRepositoryFromEnvironment } from "../../server/content/published-content-repository";

export const dynamic = "force-dynamic";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ locale?: string | string[] }> }) {
  const locale = parseAppLocale((await searchParams).locale);
  return publicMetadata({ path: "/celebrities", locale, ...pageCopy.celebrities[locale] });
}

export default async function CelebritiesPage({ searchParams }: { searchParams: Promise<{ locale?: string | string[]; owned?: string | string[]; q?: string | string[]; sort?: string | string[]; role?: string | string[] }> }) {
  const { locale: requestedLocale, owned, q, sort, role } = await searchParams;
  const locale = parseAppLocale(requestedLocale);
  if(groupsEnabled()){
    const params=new URLSearchParams({locale,type:'fan'});
    for(const [key,value] of Object.entries({owned,search:q,sort,role})){
      const text=Array.isArray(value)?value[0]:value;if(text)params.set(key,text);
    }
    redirect(`/pages/groups?${params}` as Route);
  }
  const repository = createPublishedContentRepositoryFromEnvironment();
  const [publishedCelebrities, primaryLives, unlisted] = await Promise.all([
    repository.list(toContentLocale(locale)),
    repository.listPrimaryLives(toContentLocale(locale)),
    repository.listUnlistedSlugs(),
  ]);
  const livesByCelebrity = new Map(primaryLives.map((live) => [live.celebritySlug, live]));
  const celebrities = publishedCelebrities.map((celebrity) => ({
    ...celebrity,
    upcomingLive: livesByCelebrity.get(celebrity.slug) ?? null,
  }));
  const initialOwnedOnly = owned === "1" ? true : owned !== undefined || role !== undefined || q !== undefined || sort !== undefined ? false : undefined;
  return <CelebrityDirectory celebrities={celebrities} unlistedSlugs={[...unlisted]} locale={locale} initialRole={initialOwnedOnly ? "all" : parseCreatorRoleFilter(role)} initialOwnedOnly={initialOwnedOnly} initialQuery={typeof q === "string" ? q : q?.[0] ?? ""} initialSort={sort === "name-asc" || sort === "live-first" ? sort : "published"} />;
}
