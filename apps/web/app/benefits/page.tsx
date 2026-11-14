import { GroupBenefitsScreen } from "@/features/groups/ui/group-benefits-screen";
import { parseAppLocale, toContentLocale } from "@/i18n/locales";
import { BenefitsScreen, type BenefitLocale } from "@/features/benefit/ui/benefit-screen";
import { cookies } from "next/headers";
import { loadServerSelectedBias } from "@/server/my/server-selected-bias";
import { loadServerEnv } from "@/server/config/env";
import { createHomeBannerRepository } from "@/server/content/home-banner-repository";

function locale(value: string | string[] | undefined): BenefitLocale { return parseAppLocale(value); }
/** 덕질배너1: the published banner of the dukjil_mid slot. A failed read is an empty slot, so the tab keeps its spacing. */
async function dukjilBanner(locale: BenefitLocale) {
  try {
    const environment = loadServerEnv();
    return (await createHomeBannerRepository({ url: environment.SUPABASE_URL, serviceRoleKey: environment.SUPABASE_SERVICE_ROLE_KEY }).listSlots(toContentLocale(locale), "dukjil")).dukjil_mid;
  } catch { return undefined; }
}
function slug(value: string | string[] | undefined) { return typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) ? value : undefined; }

export default async function BenefitsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  if(process.env.KYAA_GROUPS_ENABLED === "true") { const appLocale = locale(query.locale); const [initialHeart, banner] = await Promise.all([loadServerSelectedBias(appLocale), dukjilBanner(appLocale)]); return <GroupBenefitsScreen locale={appLocale} initialHeart={initialHeart} signedOut={!(await cookies()).has("privy-session")} banner={banner} />; }
  return <BenefitsScreen locale={locale(query.locale)} initialCelebrity={slug(query.celebrity)} />;
}
