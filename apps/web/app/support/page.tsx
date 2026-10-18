import { parseAppLocale, toContentLocale } from "@/i18n/locales";
import { createPublishedContentRepositoryFromEnvironment } from "@/server/content/published-content-repository";
import { SupportScreen, type SupportCreator } from "@/features/support/support-screen";
import { supportCopy } from "@/i18n/catalogs/features__support";
import { publicMetadata } from "@/seo/metadata";
export const dynamic="force-dynamic";
export async function generateMetadata({searchParams}:{searchParams:Promise<{locale?:string|string[]}>}) {
 const locale=parseAppLocale((await searchParams).locale),copy=supportCopy(locale);
 return publicMetadata({path:"/support",locale,title:`${copy.title} | kyaa`,description:copy.guest});
}
export default async function SupportPage({searchParams}:{searchParams:Promise<{locale?:string|string[];creator?:string|string[]}>}) {
 const query=await searchParams;const locale=parseAppLocale(query.locale);
 let creators:readonly SupportCreator[]=[];let directoryFailed=false;
 try {creators=await createPublishedContentRepositoryFromEnvironment().list(toContentLocale(locale));}catch{directoryFailed=true;}
 return <SupportScreen locale={locale} creators={creators} directoryFailed={directoryFailed} initialCreator={typeof query.creator==="string"?query.creator:undefined}/>;
}
