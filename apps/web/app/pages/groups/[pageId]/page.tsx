import { notFound,redirect } from "next/navigation";
import { z } from "zod";
import { parseAppLocale } from "@/i18n/locales";
import { groupsEnabled } from "@/features/groups/domain/availability";
import { safeGroupReturnTo } from "@/features/groups/domain/contracts";
import { GroupDetailScreen } from "@/features/groups/ui/group-detail";
export const dynamic = "force-dynamic";
export default async function Page({params,searchParams}:{params:Promise<{pageId:string}>;searchParams:Promise<{locale?:string|string[];tab?:string;room?:string;post?:string;category?:string;search?:string;sort?:string;cursor?:string;returnTo?:string}>}) {
  if(!groupsEnabled())notFound();
  const [{pageId},query]=await Promise.all([params,searchParams]);if(!z.string().uuid().safeParse(pageId).success)notFound();
  if(query.tab==='manage')redirect(`/pages/groups/${pageId}/manage?locale=${parseAppLocale(query.locale)}`);
  const tab=['home','board','rooms','activities','news','events','collection','members','info','manage'].includes(query.tab??'')?query.tab:'home';
  return <GroupDetailScreen locale={parseAppLocale(query.locale)} pageId={pageId} tab={tab} initialReturnTo={safeGroupReturnTo(query.returnTo)} initialRoomId={z.uuid().safeParse(query.room).success?query.room:undefined} initialPostId={z.uuid().safeParse(query.post).success?query.post:undefined} initialBoardState={{category:query.category==="notice"||query.category==="free"?query.category:"all",search:query.search??"",sort:query.sort==="popular"?"popular":"recent",cursor:z.uuid().safeParse(query.cursor).success?query.cursor:undefined}}/>;
}
