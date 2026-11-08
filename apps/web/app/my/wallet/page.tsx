import { notFound, redirect } from "next/navigation";
import { WalletScreen } from "@/features/group-wallet/ui/wallet-screen";
import { parseAppLocale } from "@/i18n/locales";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<{ locale?: string; view?: string;creator?:string }> }) {
 if (process.env.KYAA_GROUPS_ENABLED !== "true") notFound();
 const query=await searchParams;
 if (query.view === "support") redirect(`/benefits?locale=${parseAppLocale(query.locale)}`);
 if (query.view !== "attendance") redirect(`/benefits?tab=history&locale=${parseAppLocale(query.locale)}`);
 return <WalletScreen locale={parseAppLocale(query.locale)} attendance={query.view==="attendance"} />;
}
