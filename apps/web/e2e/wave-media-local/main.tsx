import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { WaveMediaFeed } from '../../features/fanpage/ui/wave-media';
import { FAN_ACTIVITY_UPDATED, subscribeFanActivityUpdates } from '../../components/fan-ui/fan-activity-updates';
import { parseAppLocale } from '../../i18n/locales';
import '../../app/globals.css';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
const locale = parseAppLocale(new URLSearchParams(location.search).get('locale') ?? undefined);
function App() {
 const [updates, setUpdates] = useState(0), [receipts, setReceipts] = useState(0);
 useEffect(() => subscribeFanActivityUpdates('did:privy:participation-local-fixture', () => setUpdates(value => value + 1)), []);
 useEffect(() => { const received = () => setReceipts(value => value + 1); window.addEventListener(FAN_ACTIVITY_UPDATED, received); return () => window.removeEventListener(FAN_ACTIVITY_UPDATED, received); }, []);
 return <main style={{ maxWidth: 960, margin: '32px auto', padding: '0 16px' }}><aside aria-label="Local fixture controls" style={{ marginBottom: 24 }}><p>Local synthetic API · mission updates: <output>{updates}</output> · successful receipts: <output>{receipts}</output></p></aside><WaveMediaFeed locale={locale} /></main>;
}
createRoot(document.getElementById('root')!).render(<App />);
