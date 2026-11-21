import { createHomeBannerRepository } from "@/server/content/home-banner-repository";
import { loadServerEnv } from "@/server/config/env";
import { toContentLocale } from "@/i18n/locales";
import { withHomeGuideBanners } from "@/features/home/domain/home-banner";
import { notFound } from "next/navigation";
import { parseAppLocale } from "@/i18n/locales";
import { groupsEnabled } from "@/features/groups/domain/availability";
import { GroupDirectory } from "@/features/groups/ui/group-directory";
import { loadTodayFanpages } from "@/server/groups/today-fanpage-instance";
import { groupRoute } from "@/server/groups/dependencies";
import { groupApiQuery, groupListSchema } from "@/features/groups/domain/contracts";
import { discoveryCopy } from "@/features/groups/ui/discovery-copy";
import { contentPageMetadata, pageCopy } from "@/seo/metadata";
export const dynamic = "force-dynamic";
type Query = {locale?:string|string[];mine?:string;type?:string;search?:string;sort?:string;owned?:string;artistRole?:string};
export async function generateMetadata({searchParams}:{searchParams:Promise<Query>}) {
  const locale=parseAppLocale((await searchParams).locale);
  return contentPageMetadata({path:"/pages/groups",locale,title:`${discoveryCopy(locale).title} | kyaa`,description:pageCopy.celebrities[locale].description});
}
/** The first page of the list a guest sees with no filter, read the way the browser reads /api/groups without a sign-in. A failed read leaves the list to the browser. */
async function readGuestDirectory(locale:"ko"|"en") {
  try {
    const response=await groupRoute("directory",new Request(`http://localhost${groupApiQuery({type:"all",sort:"discovery",limit:"20"})}&locale=${locale}`));
    return response.ok?groupListSchema.parse(await response.json()):undefined;
  } catch { return undefined; }
}
export default async function Page({searchParams}:{searchParams:Promise<Query>}) {
  if(!groupsEnabled())notFound();
  const query=await searchParams;
  const locale=parseAppLocale(query.locale), environment=loadServerEnv();
  const bannerRepository=createHomeBannerRepository({url:environment.SUPABASE_URL,serviceRoleKey:environment.SUPABASE_SERVICE_ROLE_KEY});
  const unfiltered=!query.mine&&!query.type&&!query.search&&!query.sort&&!query.owned&&!query.artistRole;
  const [discoveryBanners,homeBanners,todayFanpages,initialList]=await Promise.all([bannerRepository.list(toContentLocale(locale),"groups"),bannerRepository.list(toContentLocale(locale),"home"),loadTodayFanpages(toContentLocale(locale)),unfiltered?readGuestDirectory(toContentLocale(locale)):undefined]);
  return <GroupDirectory initialList={initialList} promoOrder={todayFanpages.map(item=>item.slug)} banners={withHomeGuideBanners(discoveryBanners,homeBanners)} locale={parseAppLocale(query.locale)} initialType={query.type==="fan"||query.type==="brand"||query.type==="hobby"?query.type:"all"} initialSearch={query.search??""} initialSort={query.sort==="popular"?"popular":"recent"} initialOwned={query.owned==="1"} initialMine={query.mine==="joined"||query.mine==="bookmarked"?query.mine:undefined}/>;
}
