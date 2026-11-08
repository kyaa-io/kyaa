import { GroupBenefitsScreen } from "@/features/groups/ui/group-benefits-screen";
import { parseStanTab } from "@/features/groups/ui/stan-tab";
import { parseAppLocale } from "@/i18n/locales";
import { BenefitsScreen, type BenefitLocale } from "@/features/benefit/ui/benefit-screen";
import { cookies } from "next/headers";
import { loadServerSelectedBias } from "@/server/my/server-selected-bias";

function locale(value: string | string[] | undefined): BenefitLocale { return parseAppLocale(value); }
function slug(value: string | string[] | undefined) { return typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) ? value : undefined; }

export default async function BenefitsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  if(process.env.KYAA_GROUPS_ENABLED === "true") { const appLocale = locale(query.locale); return <GroupBenefitsScreen locale={appLocale} initialHeart={await loadServerSelectedBias(appLocale)} signedOut={!(await cookies()).has("privy-session")} tab={parseStanTab(query.tab)} />; }
  return <BenefitsScreen locale={locale(query.locale)} initialCelebrity={slug(query.celebrity)} />;
}
