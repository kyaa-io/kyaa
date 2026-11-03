import { notFound } from 'next/navigation';
import { parseAppLocale } from '@/i18n/locales';
import { ArtistPresenceSettings } from '@/features/groups/ui/artist-presence-settings';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<{locale?:string}>}){
 if(process.env.KYAA_GROUPS_ENABLED!=='true')notFound();
 return <ArtistPresenceSettings locale={parseAppLocale((await searchParams).locale)}/>;
}
