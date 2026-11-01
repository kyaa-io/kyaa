import { notFound } from "next/navigation";
import { parseAppLocale } from "@/i18n/locales";
import { groupsEnabled } from "@/features/groups/domain/availability";
import { GroupApplication } from "@/features/groups/ui/group-application";
export const dynamic = "force-dynamic";
export default async function Page({searchParams}:{searchParams:Promise<{locale?:string|string[];kind?:string}>}) {
  if(!groupsEnabled())notFound();
  const query=await searchParams;
  return <GroupApplication locale={parseAppLocale(query.locale)} initialKind={query.kind==="fan"||query.kind==="brand"?query.kind:"hobby"}/>;
}
