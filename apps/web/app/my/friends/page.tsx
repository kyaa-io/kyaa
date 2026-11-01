import { notFound } from "next/navigation";
import { parseAppLocale } from "@/i18n/locales";
import { GroupSocialScreen } from "@/features/group-social/screen";
export default async function FriendsPage({searchParams}:{searchParams:Promise<{locale?:string;profileId?:string;conversationId?:string}>}) {
 if(process.env.KYAA_GROUPS_ENABLED!=="true")notFound();
 const query=await searchParams;
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 return <GroupSocialScreen locale={parseAppLocale(query.locale)} profileId={query.profileId&&uuid.test(query.profileId)?query.profileId:undefined} conversationId={query.conversationId&&uuid.test(query.conversationId)?query.conversationId:undefined}/>;
}
