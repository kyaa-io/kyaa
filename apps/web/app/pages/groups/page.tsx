import { createHomeBannerRepository } from "@/server/content/home-banner-repository";
import { loadServerEnv } from "@/server/config/env";
import { toContentLocale } from "@/i18n/locales";
import { withHomeGuideBanners } from "@/features/home/domain/home-banner";
import { notFound } from "next/navigation";
import { parseAppLocale } from "@/i18n/locales";
import { groupsEnabled } from "@/features/groups/domain/availability";
import { GroupDirectory } from "@/features/groups/ui/group-directory";
import { loadTodayFanpages } from "@/server/groups/today-fanpage-instance";
export const dynamic = "force-dynamic";
export default async function Page({searchParams}:{searchParams:Promise<{locale?:string|string[];mine?:string;type?:string;search?:string;sort?:string;owned?:string}>}) {
  if(!groupsEnabled())notFound();
  const query=await searchParams;
  const locale=parseAppLocale(query.locale), environment=loadServerEnv();
  const bannerRepository=createHomeBannerRepository({url:environment.SUPABASE_URL,serviceRoleKey:environment.SUPABASE_SERVICE_ROLE_KEY});
  const [discoveryBanners,homeBanners,todayFanpages]=await Promise.all([bannerRepository.list(toContentLocale(locale),"groups"),bannerRepository.list(toContentLocale(locale),"home"),loadTodayFanpages(toContentLocale(locale))]);
  return <GroupDirectory todayFanpages={todayFanpages} banners={withHomeGuideBanners(discoveryBanners,homeBanners)} locale={parseAppLocale(query.locale)} initialType={query.type==="fan"||query.type==="brand"||query.type==="hobby"?query.type:"all"} initialSearch={query.search??""} initialSort={query.sort==="popular"?"popular":"recent"} initialOwned={query.owned==="1"} initialMine={query.mine==="joined"||query.mine==="bookmarked"?query.mine:undefined}/>;
}
