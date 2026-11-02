import { notFound } from 'next/navigation';
import { z } from 'zod';
import { groupsEnabled } from '@/features/groups/domain/availability';
import { parseAppLocale } from '@/i18n/locales';
import { GroupManageScreen } from '@/features/groups/ui/group-manage-screen';
export const dynamic='force-dynamic';
export default async function Page({params,searchParams}:{params:Promise<{pageId:string}>;searchParams:Promise<{locale?:string|string[];section?:string;giftApplicationId?:string}>}){
 if(!groupsEnabled())notFound();const [p,q]=await Promise.all([params,searchParams]);if(!z.uuid().safeParse(p.pageId).success)notFound();return <GroupManageScreen pageId={p.pageId} locale={parseAppLocale(q.locale)} initialSection={q.section} initialGiftId={z.uuid().safeParse(q.giftApplicationId).success?q.giftApplicationId:undefined}/>;
}
