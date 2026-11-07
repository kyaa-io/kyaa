// 합성 fixture: 팬 인증 원형 도장 그리드와 인증 시작 모달을 로컬에서 렌더링한다. 운영·dev 증거 아님.
import { createRoot } from 'react-dom/client';
import '@/app/globals.css';
import { CertificationPanel } from '@/features/certification/ui/certification-panel';
import { QuizEntryScreen } from '@/features/quiz/ui/quiz-entry-screen';
const view = new URLSearchParams(location.search).get('view') ?? 'grid';
createRoot(document.getElementById('root')!).render(
  view === 'quiz' ? <div><button id="opener" autoFocus>열기 버튼</button><QuizEntryScreen slug="elina" locale="ko" /></div>
  : <div style={{ maxWidth: 1100, margin: '0 auto', padding: 16 }}><CertificationPanel slug="elina" locale="ko" /></div>);
