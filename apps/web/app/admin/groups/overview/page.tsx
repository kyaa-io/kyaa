import {notFound} from 'next/navigation';
import {GroupAdminOverview} from '@/components/admin/group-admin-overview';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<{lang?:string}>}){
 if(process.env.KYAA_GROUPS_ENABLED!=='true')notFound();
 return <GroupAdminOverview locale={(await searchParams).lang==='en'?'en':'ko'}/>;
}
