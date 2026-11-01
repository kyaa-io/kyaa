import { notFound } from 'next/navigation';
import { z } from 'zod';
import { parseAppLocale } from '@/i18n/locales';
import { GroupRaffleScreen } from '@/features/group-raffle/raffle-screen';
export const dynamic='force-dynamic';
export default async function Page({params,searchParams}:{params:Promise<{pageId:string;raffleId:string}>;searchParams:Promise<{locale?:string}>}){
 if(process.env.KYAA_GROUPS_ENABLED!=='true')notFound();
 const [ids,query]=await Promise.all([params,searchParams]);if(!z.uuid().safeParse(ids.pageId).success||!z.uuid().safeParse(ids.raffleId).success)notFound();
 return <GroupRaffleScreen pageId={ids.pageId} raffleId={ids.raffleId} locale={parseAppLocale(query.locale)}/>;
}
