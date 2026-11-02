import {notFound} from 'next/navigation';
import {z} from 'zod';
import {parseAppLocale} from '@/i18n/locales';
import {GroupEventSupportScreen} from '@/features/groups/ui/group-event-support-screen';
export const dynamic='force-dynamic';
export default async function Page({params,searchParams}:{params:Promise<{pageId:string;eventId:string}>;searchParams:Promise<{locale?:string;view?:string}>}){if(process.env.KYAA_GROUPS_ENABLED!=='true')notFound();const [ids,q]=await Promise.all([params,searchParams]);if(!z.uuid().safeParse(ids.pageId).success||!z.uuid().safeParse(ids.eventId).success)notFound();return <GroupEventSupportScreen {...ids} locale={parseAppLocale(q.locale)} history={q.view==='history'}/>;}
