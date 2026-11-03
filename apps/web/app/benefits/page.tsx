import { GroupBenefitsScreen } from "@/features/groups/ui/group-benefits-screen";
import { parseAppLocale } from "@/i18n/locales";
import { BenefitsScreen, type BenefitLocale } from "@/features/benefit/ui/benefit-screen";

function locale(value: string | string[] | undefined): BenefitLocale { return parseAppLocale(value); }
function slug(value: string | string[] | undefined) { return typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) ? value : undefined; }

export default async function BenefitsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  if(process.env.KYAA_GROUPS_ENABLED === "true") return <GroupBenefitsScreen locale={locale(query.locale)} />;
  return <BenefitsScreen locale={locale(query.locale)} initialCelebrity={slug(query.celebrity)} />;
}
