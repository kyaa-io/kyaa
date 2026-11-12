import { createRoot } from 'react-dom/client';
import { GroupPresence } from '@/features/groups/ui/group-presence';
import '@/app/globals.css';
import 'pretendard/dist/web/static/pretendard.css';
createRoot(document.getElementById('root')!).render(<main style={{ maxWidth: 1080, margin: '40px auto', padding: '0 16px' }}><div style={{ display: 'flex', gap: 16, alignItems: 'center' }}><div style={{ width: 96, height: 96, flex: 'none', borderRadius: 12, background: '#efadc3' }} aria-hidden="true"/><div><h1 style={{ margin: '0 0 8px', fontSize: 26 }}>예시 팬페이지</h1><GroupPresence pageId="example" locale="ko" memberCount={25}/></div></div></main>);
