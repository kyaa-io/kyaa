import { headers } from 'next/headers';
import { missionLocale } from './mission-context';
import { XMission } from './x-mission';
export const metadata = { title: 'KYAA · X Mission' };
export default async function Page({ searchParams }: { searchParams: Promise<{ locale?: string }> }) {
 const { locale } = await searchParams;
 return <XMission locale={missionLocale(locale, (await headers()).get('accept-language') ?? '')} />;
}
