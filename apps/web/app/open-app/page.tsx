import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { parseAppLocale } from "@/i18n/locales";
import { AppLinkFallback } from "@/features/app-link/ui/app-link-fallback";
import { readKyaaStoreLinks, resolveAppLinkDestination } from "@/server/app-link/destination";
import { resolveAppLinkPresentation } from "@/server/app-link/presentation";
import { isNativeAppAvailable, openAppWebPath } from "@/server/app-link/open-app-redirect";

export const metadata:Metadata={title:"Open kyaa",robots:{index:false,follow:false}};
export default async function Page({searchParams}:{searchParams:Promise<{returnTo?:string|string[];locale?:string|string[];invalid?:string|string[]}>}){
 const query=await searchParams;
 // The proxy answers first with a 302; this keeps the screen hidden if a request ever reaches the page.
 if(!isNativeAppAvailable()){
  const params=new URLSearchParams();
  for(const [key,value] of Object.entries(query))for(const item of [value].flat())if(item!==undefined)params.append(key,item);
  redirect(openAppWebPath(params));
 }
 const locale=parseAppLocale(query.locale),destination=resolveAppLinkDestination(query.returnTo);
 if(query.returnTo!==undefined&&!destination.valid)redirect(`/open-app?locale=${encodeURIComponent(locale)}&invalid=1`);
 const params=new URLSearchParams({returnTo:destination.returnTo,locale});
 const presentation=await resolveAppLinkPresentation(destination,locale);
 return <AppLinkFallback locale={locale} destination={destination} presentation={presentation} stores={readKyaaStoreLinks()} sharePath={`/open-app?${params}`}/>;
}
