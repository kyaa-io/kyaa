import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@/app/globals.css';
import { CertificationPanel } from '@/features/certification/ui/certification-panel';
import { QuizEntryScreen } from '@/features/quiz/ui/quiz-entry-screen';
function App() {
  const [, tick] = useState(0);
  useEffect(() => { const f = () => tick(n => n + 1); window.addEventListener('f10-nav', f); window.addEventListener('popstate', f); return () => { window.removeEventListener('f10-nav', f); window.removeEventListener('popstate', f); }; }, []);
  const q = new URLSearchParams(location.search); const locale = (q.get('locale') ?? 'ko') as 'ko' | 'en';
  const key = location.pathname + location.search;
  if (location.pathname === '/c/elina/verify') return <QuizEntryScreen key={key} slug="elina" locale={locale} />;
  if (location.pathname === '/elina') return <h1 id="home">creator home</h1>;
  return <div key={key} style={{ maxWidth: 1100, margin: '0 auto', padding: 16 }}><CertificationPanel slug="elina" locale={locale} /></div>;
}
createRoot(document.getElementById('root')!).render(<App />);
