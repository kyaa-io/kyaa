import { headers } from 'next/headers';
import { FanAppFrame } from '@/components/fan-shell/fan-app-shell';
import { missionLocale } from './mission-context';
import { XMission } from './x-mission';
export const metadata = { title: 'KYAA · X Mission' };
export default async function Page({ searchParams }: { searchParams: Promise<{ locale?: string }> }) {
 const { locale } = await searchParams;
 const resolved = missionLocale(locale, (await headers()).get('accept-language') ?? '');
 return <FanAppFrame locale={resolved} currentPath="/s/x" mainId="x-mission-main"><XMission locale={resolved} /></FanAppFrame>;
}
