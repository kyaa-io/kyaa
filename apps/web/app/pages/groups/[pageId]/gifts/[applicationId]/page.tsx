import {notFound} from 'next/navigation';
import {z} from 'zod';
import {groupsEnabled} from '@/features/groups/domain/availability';
import {parseAppLocale} from '@/i18n/locales';
import {GroupGiftScreen} from '@/features/groups/ui/group-gift-screen';
export const dynamic='force-dynamic';
export default async function Page({params,searchParams}:{params:Promise<{pageId:string;applicationId:string}>;searchParams:Promise<{locale?:string|string[]}>}){if(!groupsEnabled())notFound();const[p,q]=await Promise.all([params,searchParams]);if(!z.uuid().safeParse(p.pageId).success||!z.uuid().safeParse(p.applicationId).success)notFound();return <GroupGiftScreen pageId={p.pageId} applicationId={p.applicationId} locale={parseAppLocale(q.locale)}/>;}
