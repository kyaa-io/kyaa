import { notFound } from "next/navigation";
import { parseAppLocale } from "@/i18n/locales";
import { groupsEnabled } from "@/features/groups/domain/availability";
import { GroupApplicationStatusScreen } from "@/features/groups/ui/group-application-status-screen";
import { GroupApplication } from "@/features/groups/ui/group-application";
export const dynamic = "force-dynamic";
export default async function Page({searchParams}:{searchParams:Promise<{locale?:string|string[];kind?:string;name?:string;view?:string;applicationId?:string}>}) {
  if(!groupsEnabled())notFound();
  const query=await searchParams;
  const locale=parseAppLocale(query.locale);
  // applicationId comes from the review result notification.
  if(query.view==="mine"||query.applicationId)return <GroupApplicationStatusScreen locale={locale}/>;
  return <GroupApplication locale={locale} initialKind={query.kind==="fan"||query.kind==="brand"?query.kind:"hobby"} initialName={query.name?.trim().slice(0,100)}/>;
}
