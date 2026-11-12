import { FanAppFrame, FanContentContainer } from "@/components/fan-shell/fan-app-shell";
import { parseAppLocale } from "@/i18n/locales";
import { TierGuide } from "@/features/rewards/ui/tier-guide";
export default async function TierGuidePage({searchParams}: {searchParams:Promise<{locale?:string|string[]}>}) {
 const locale=parseAppLocale((await searchParams).locale);
 return <FanAppFrame locale={locale} currentPath="/notices" mainId="tier-guide-main"><FanContentContainer as="main" id="tier-guide-main" tabIndex={-1}><TierGuide locale={locale}/></FanContentContainer></FanAppFrame>;
}
