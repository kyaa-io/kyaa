import {notFound} from 'next/navigation';
import {parseAppLocale} from '@/i18n/locales';
import {GroupReferralScreen} from '@/features/groups/ui/group-referral-screen';
import {referralCode,referralDestination} from '@/features/groups/ui/group-referral-link';
export const dynamic='force-dynamic';
export default async function InvitationsPage({searchParams}:{searchParams:Promise<{locale?:string;invite?:string;code?:string;destination?:string}>}){
 if(process.env.KYAA_GROUPS_ENABLED!=='true')notFound();
 const q=await searchParams;
 return <GroupReferralScreen locale={parseAppLocale(q.locale)} initialInvite={q.invite==='1'} code={referralCode(q.code)} destination={referralDestination(q.destination)}/>;
}
