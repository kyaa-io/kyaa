import './mock';
import { missionLocale } from '../../app/s/x/mission-context';
import { createRoot } from 'react-dom/client';
import { FanAppFrame } from '@/components/fan-shell/fan-app-shell';
import { XMission, xLikeMission } from '../../app/s/x/x-mission';
import { followMission } from '../../app/follow/follow-event';
import '../../app/globals.css';
const locale = missionLocale(new URLSearchParams(location.search).get('locale') ?? undefined, navigator.language);
// ?event=follow draws the /follow (X opening event) config
const mission = new URLSearchParams(location.search).get('event') === 'follow' ? followMission : xLikeMission;
createRoot(document.getElementById('root')!).render(<FanAppFrame locale={locale} currentPath={mission.path} mainId="x-mission-main"><XMission locale={locale} mission={mission} /></FanAppFrame>);
