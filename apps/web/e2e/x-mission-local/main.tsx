import './mock';
import { missionLocale } from '../../app/s/x/mission-context';
import { createRoot } from 'react-dom/client';
import { FanAppFrame } from '@/components/fan-shell/fan-app-shell';
import { XMission, xLikeMission } from '../../app/s/x/x-mission';
import { followEvent } from '../../app/follow/follow-event';
import { FollowMission } from '../../app/follow/follow-mission';
import '../../app/globals.css';
const locale = missionLocale(new URLSearchParams(location.search).get('locale') ?? undefined, navigator.language);
// ?event=follow draws the /follow (X opening event) screen: mission cards with the Gleam widget
const follow = new URLSearchParams(location.search).get('event') === 'follow';
createRoot(document.getElementById('root')!).render(<FanAppFrame locale={locale} currentPath={follow ? followEvent.path : xLikeMission.path} mainId="x-mission-main">{follow ? <FollowMission locale={locale} event={followEvent} /> : <XMission locale={locale} mission={xLikeMission} />}</FanAppFrame>);
