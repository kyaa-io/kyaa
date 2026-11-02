import {notFound} from 'next/navigation';
import {parseAppLocale} from '@/i18n/locales';
import {GroupOwnReports} from '@/features/groups/ui/group-own-reports';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<{locale?:string}>}){if(process.env.KYAA_GROUPS_ENABLED!=='true')notFound();return <GroupOwnReports locale={parseAppLocale((await searchParams).locale)}/>;}
