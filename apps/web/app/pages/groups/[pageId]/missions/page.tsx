import { notFound } from 'next/navigation';
import { z } from 'zod';
import { parseAppLocale } from '@/i18n/locales';
import { groupsEnabled } from '@/features/groups/domain/availability';
import { GroupMissionsOverview } from '@/features/groups/ui/group-mission-screen';
export const dynamic='force-dynamic';
export default async function Page({params,searchParams}:{params:Promise<{pageId:string}>;searchParams:Promise<{locale?:string}>}){
 if(!groupsEnabled())notFound();
 const [{pageId},query]=await Promise.all([params,searchParams]);
 if(!z.uuid().safeParse(pageId).success)notFound();
 return <GroupMissionsOverview pageId={pageId} locale={parseAppLocale(query.locale)}/>;
}
