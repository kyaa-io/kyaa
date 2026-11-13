import './mock';
import { createRoot } from 'react-dom/client';
import { XMission } from '../../app/s/x/x-mission';
import '../../app/globals.css';
const locale = new URLSearchParams(location.search).get('locale') === 'ko' ? 'ko' : 'en';
createRoot(document.getElementById('root')!).render(<XMission locale={locale} />);
