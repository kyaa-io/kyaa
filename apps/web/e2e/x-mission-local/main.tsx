import './mock';
import { missionLocale } from '../../app/s/x/mission-context';
import { createRoot } from 'react-dom/client';
import { XMission } from '../../app/s/x/x-mission';
import '../../app/globals.css';
const locale = missionLocale(new URLSearchParams(location.search).get('locale') ?? undefined, navigator.language);
createRoot(document.getElementById('root')!).render(<XMission locale={locale} />);
