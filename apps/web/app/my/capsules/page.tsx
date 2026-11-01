import { notFound } from "next/navigation";
import { parseAppLocale } from "@/i18n/locales";
import { CapsuleScreen } from "@/features/group-capsule/capsule-screen";
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<{locale?:string;pageId?:string}>}){
 if(process.env.KYAA_GROUPS_ENABLED!=='true')notFound();
 const query=await searchParams;
 return <CapsuleScreen locale={parseAppLocale(query.locale)} pageId={query.pageId&&/^[0-9a-f-]{36}$/i.test(query.pageId)?query.pageId:undefined}/>;
}
