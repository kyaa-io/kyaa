import { notFound } from "next/navigation";
import { WalletScreen } from "@/features/group-wallet/ui/wallet-screen";
import { parseAppLocale } from "@/i18n/locales";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<{ locale?: string; view?: string;creator?:string }> }) {
 if (process.env.KYAA_GROUPS_ENABLED !== "true") notFound();
 const query=await searchParams;
 return <WalletScreen locale={parseAppLocale(query.locale)} attendance={query.view==="attendance"} supportCreator={query.view==="support"&&query.creator&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(query.creator)?query.creator:undefined} />;
}
