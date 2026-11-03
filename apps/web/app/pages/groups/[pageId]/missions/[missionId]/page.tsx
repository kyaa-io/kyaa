import { notFound } from 'next/navigation';
import { z } from 'zod';
import { parseAppLocale } from '@/i18n/locales';
import { GroupMissionScreen } from '@/features/groups/ui/group-mission-screen';
export const dynamic='force-dynamic';
export default async function Page({params,searchParams}:{params:Promise<{pageId:string;missionId:string}>;searchParams:Promise<{locale?:string;view?:string}>}){
 if(process.env.KYAA_GROUPS_ENABLED!=='true')notFound();const [ids,q]=await Promise.all([params,searchParams]);if(!z.uuid().safeParse(ids.pageId).success||!z.uuid().safeParse(ids.missionId).success)notFound();return <GroupMissionScreen {...ids} locale={parseAppLocale(q.locale)} view={q.view==='submission'?'submission':'conditions'}/>;
}
