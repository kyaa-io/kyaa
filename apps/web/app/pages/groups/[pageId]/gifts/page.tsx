import {notFound,redirect} from 'next/navigation';
import {z} from 'zod';
import {groupsEnabled} from '@/features/groups/domain/availability';
import {parseAppLocale} from '@/i18n/locales';
export const dynamic='force-dynamic';
/** 선물 신청은 운영 관리 탭 안으로 옮겼다. 옛 주소는 그 탭으로 보낸다. */
export default async function Page({params,searchParams}:{params:Promise<{pageId:string}>;searchParams:Promise<{locale?:string|string[];view?:string}>}){if(!groupsEnabled())notFound();const[p,q]=await Promise.all([params,searchParams]);if(!z.uuid().safeParse(p.pageId).success)notFound();redirect(`/pages/groups/${p.pageId}/manage?section=gifts&locale=${parseAppLocale(q.locale)}${q.view==='history'?'':'&new=1'}`);}
