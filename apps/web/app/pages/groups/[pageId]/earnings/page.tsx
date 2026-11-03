import {notFound} from 'next/navigation';
import {z} from 'zod';
import {parseAppLocale} from '@/i18n/locales';
import {GroupEarningsScreen} from '@/features/groups/ui/group-earnings-screen';
export const dynamic='force-dynamic';
export default async function Page({params,searchParams}:{params:Promise<{pageId:string}>;searchParams:Promise<{locale?:string|string[];cursor?:string|string[]}>}){
 if(process.env.KYAA_GROUPS_ENABLED!=='true')notFound();
 const [ids,q]=await Promise.all([params,searchParams]);
 const cursor=z.string().max(2048).optional().safeParse(q.cursor);
 if(!z.uuid().safeParse(ids.pageId).success||!cursor.success)notFound();
 return <GroupEarningsScreen pageId={ids.pageId} locale={parseAppLocale(q.locale)} cursor={cursor.data}/>;
}
