import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { parseAppLocale } from "@/i18n/locales";
import { AppLinkFallback } from "@/features/app-link/ui/app-link-fallback";
import { readKyaaStoreLinks, resolveAppLinkDestination } from "@/server/app-link/destination";
import { resolveAppLinkPresentation } from "@/server/app-link/presentation";

export const metadata:Metadata={title:"Open kyaa",robots:{index:false,follow:false}};
export default async function Page({searchParams}:{searchParams:Promise<{returnTo?:string|string[];locale?:string|string[];invalid?:string|string[]}>}){
 const query=await searchParams,locale=parseAppLocale(query.locale),destination=resolveAppLinkDestination(query.returnTo);
 if(query.returnTo!==undefined&&!destination.valid)redirect(`/open-app?locale=${encodeURIComponent(locale)}&invalid=1`);
 const params=new URLSearchParams({returnTo:destination.returnTo,locale});
 const presentation=await resolveAppLinkPresentation(destination,locale);
 return <AppLinkFallback locale={locale} destination={destination} presentation={presentation} stores={readKyaaStoreLinks()} sharePath={`/open-app?${params}`}/>;
}
