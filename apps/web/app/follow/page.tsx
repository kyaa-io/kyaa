import { headers } from 'next/headers';
import { FanAppFrame } from '@/components/fan-shell/fan-app-shell';
import { DukjilGuideContent } from '@/features/dukjil-guide/ui/guide-content';
import { loadGuideModel } from '@/features/dukjil-guide/server/load-guide-model';
import guideStyles from '@/features/dukjil-guide/ui/guide-content.module.css';
import { missionLocale } from '../s/x/mission-context';
import { followEvent, followEventPath } from './follow-event';
import { FollowMission } from './follow-mission';
export const metadata = { title: 'KYAA · X Opening Event' };
/** 이벤트 카드(X 팔로우·리포스트 + 좋아요 도장) 아래에 덕질미션북 본문이 이어진다(사용자 11/16: /guide/dukjil 은 이 화면으로 합쳤다). */
export default async function Page({ searchParams }: { searchParams: Promise<{ locale?: string }> }) {
 const { locale } = await searchParams;
 const resolved = missionLocale(locale, (await headers()).get('accept-language') ?? '');
 const model = await loadGuideModel(resolved);
 return <FanAppFrame locale={resolved} currentPath={followEventPath} mainId="x-mission-main"><FollowMission locale={resolved} event={followEvent} below={<div className={guideStyles.page}><DukjilGuideContent locale={resolved} model={model} /></div>} /></FanAppFrame>;
}
