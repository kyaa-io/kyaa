import {notFound} from 'next/navigation';
import {GroupGiftManager} from '@/components/admin/group-gift-manager';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<{lang?:string}>}){if(process.env.KYAA_GROUPS_ENABLED!=='true')notFound();return <GroupGiftManager locale={(await searchParams).lang==='en'?'en':'ko'}/>;}
