// 합성 fixture: 응모권 교환 수량 선택·진행·중단 상태를 로컬에서 렌더링한다. 운영·dev 증거 아님.
import { createRoot } from 'react-dom/client';
import '@/app/globals.css';
import { WalletExchangeDialog } from '@/features/group-wallet/ui/wallet-screen';
const q = new URLSearchParams(location.search);
const w = window as unknown as { __plan?: string[]; __posts: string[] };
w.__plan = (q.get('plan') ?? '').split(',').filter(Boolean); w.__posts = [];
let points = Number(q.get('points') ?? 2450), remaining = q.has('remaining') ? Number(q.get('remaining')) : undefined, seq = 1, hearts = 3;
const base = () => ({ sequence: seq, points, hearts, tickets: 12, policyVersion: 'group-wallet-v1', pointCost: 100, writeFenced: false, ...(remaining === undefined ? {} : { exchangesRemainingToday: remaining }), attendance: { date: '2026-11-05', checkedIn: true, streak: 3, nextBonusIn: 4, days: [] } });
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
const ids = { n: 0 };
const uid = () => `30000000-0000-4000-8000-${String(++ids.n).padStart(12, '0')}`;
window.fetch = (async (url: string, init?: RequestInit) => {
  const u = String(url), body = init?.body ? JSON.parse(String(init.body)) : {};
  if (u === '/api/me/wallet') return json(base());
  if (u.endsWith('/history')) return json({ entries: [] });
  if (u === '/api/me/wallet/ad-session') { w.__posts.push('session'); return json({ sessionId: uid(), status: 'issued' }); }
  if (u === '/api/me/wallet/ad-session/report') return json({ sessionId: body.sessionId, status: body.event === 'granted' ? 'granted' : 'shown' });
  if (u === '/api/me/wallet/exchange') {
    w.__posts.push('exchange');
    if (q.get('limitAt') && w.__posts.filter(p => p === 'exchange').length >= Number(q.get('limitAt'))) return json({ error: { code: 'AD_DAILY_LIMIT' } }, 429);
    points -= 100; hearts += 1; seq += 1; if (remaining !== undefined) remaining -= 1;
    return json({ requestKey: body.requestKey, target: body.target, units: 1, pointsSpent: 100, pointLedgerId: uid(), creditLedgerId: uid(), policyVersion: 'group-wallet-v1', createdAt: '2026-11-05T00:00:00Z', replayed: false });
  }
  return json({});
}) as typeof fetch;
createRoot(document.getElementById('root')!).render(<WalletExchangeDialog locale={(q.get('locale') as 'ko') ?? 'ko'} open onClose={() => {}} />);
