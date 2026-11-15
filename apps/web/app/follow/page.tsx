import { headers } from 'next/headers';
import { FanAppFrame } from '@/components/fan-shell/fan-app-shell';
import { missionLocale } from '../s/x/mission-context';
import { XMission } from '../s/x/x-mission';
import { followEventPath, followMission } from './follow-event';
export const metadata = { title: 'KYAA · X Opening Event' };
export default async function Page({ searchParams }: { searchParams: Promise<{ locale?: string }> }) {
 const { locale } = await searchParams;
 const resolved = missionLocale(locale, (await headers()).get('accept-language') ?? '');
 return <FanAppFrame locale={resolved} currentPath={followEventPath} mainId="x-mission-main"><XMission locale={resolved} mission={followMission} /></FanAppFrame>;
}
