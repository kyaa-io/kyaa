// 합성 fixture: 덕질 지갑 카드 안 수량 선택·광고 1회 교환·중단 상태를 로컬에서 렌더링한다(B13). 운영·dev 증거 아님.
import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import '@/app/globals.css';
import { FanToastViewport } from '@/components/fan-ui/fan-toast-viewport';
import { StanWallet } from '@/features/group-wallet/ui/stan-wallet';
import { WalletCard } from '@/features/group-wallet/ui/wallet-card';
import { GROUP_WALLET_CHANGED_EVENT, useGroupResource } from '@/features/groups/ui/use-group-resource';
import type { AppLocale } from '@/i18n/locales';
import { walletSchema } from '@/server/group-wallet/domain';
const q = new URLSearchParams(location.search);
const w = window as unknown as { __plan?: string[]; __posts: string[]; __bodies: unknown[] };
w.__plan = (q.get('plan') ?? '').split(',').filter(Boolean); w.__posts = []; w.__bodies = [];
let points = Number(q.get('points') ?? 2450), tickets = 12, seq = 1, remaining = q.has('remaining') ? Number(q.get('remaining')) : undefined;
const base = () => ({ sequence: seq, points, tickets, policyVersion: 'group-wallet-v1', pointCost: 100, writeFenced: false, ...(remaining === undefined ? {} : { exchangesRemainingToday: remaining }), attendance: { date: '2026-11-05', checkedIn: true, streak: 3, nextBonusIn: 4, days: [] } });
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
const ids = { n: 0 };
const uid = () => `30000000-0000-4000-8000-${String(++ids.n).padStart(12, '0')}`;
window.fetch = (async (url: string, init?: RequestInit) => {
  const u = String(url), body = init?.body ? JSON.parse(String(init.body)) : {};
  if (u === '/api/me/wallet') return q.has('hold') ? new Promise<Response>(() => {}) : json(base());
  if (u === '/api/me/wallet/ad-session') { w.__posts.push('session'); if (remaining === 0) return json({ error: { code: 'GROUP_WALLET_AD_DAILY_LIMIT' } }, 429); return json({ sessionId: uid(), status: 'issued' }); }
  if (u === '/api/me/wallet/ad-session/report') return json({ sessionId: body.sessionId, status: body.event === 'granted' ? 'granted' : 'shown' });
  if (u === '/api/me/wallet/exchange') {
    w.__posts.push('exchange'); w.__bodies.push(body);
    if (remaining === 0) return json({ error: { code: 'GROUP_WALLET_AD_DAILY_LIMIT' } }, 429);
    points -= 100 * body.units; tickets += body.units; seq += 1; if (remaining !== undefined) remaining -= 1;
    return json({ requestKey: body.requestKey, target: body.target, units: body.units, pointsSpent: 100 * body.units, pointLedgerId: uid(), creditLedgerId: uid(), policyVersion: 'group-wallet-v1', createdAt: '2026-11-05T00:00:00Z', replayed: false });
  }
  return json({});
}) as typeof fetch;
const parse = (value: unknown) => walletSchema.parse(value);
const page = document.createElement('style');
page.textContent = 'body{margin:0;background:var(--color-surface)}#root{box-sizing:border-box;max-width:1100px;margin:0 auto;padding:24px 16px}';
document.head.append(page);
function Harness({ locale }: { locale: AppLocale }) {
  const wallet = useGroupResource('/api/me/wallet', parse), { retry } = wallet;
  useEffect(() => { window.addEventListener(GROUP_WALLET_CHANGED_EVENT, retry); return () => window.removeEventListener(GROUP_WALLET_CHANGED_EVENT, retry); }, [retry]);
  const state = wallet.data ? { kind: 'ready' as const, points: wallet.data.points, tickets: wallet.data.tickets, pointCost: wallet.data.pointCost } : { kind: 'loading' as const };
  return <><StanWallet locale={locale} state={state} stamps={4} hearts={3} links={{ hearts: '#' }} /><FanToastViewport /></>;
}
/** ?my=1: the MY 내 지갑 card in every state, side by side at the MY column width (360px from 1024px). */
function MyCards({ locale }: { locale: AppLocale }) {
  const ready = (points: number, tickets: number) => ({ kind: 'ready' as const, points, tickets, pointCost: 100 });
  return <div data-my-cards>{([['ready', ready(121, 4), 0], ['zero', ready(0, 0), 0], ['big', ready(1234567, 98765), 4321], ['loading', { kind: 'loading' as const }, 'loading'], ['guest', { kind: 'guest' as const, action: null }, 'locked'], ['failed', { kind: 'failed' as const }, 'missing']] as const).map(([name, state, hearts]) =>
    <div key={name} data-state={name}><WalletCard locale={locale} title={locale === 'ko' ? '내 지갑' : 'My wallet'} href="#" hearts={hearts} state={state} /></div>)}</div>;
}
if (q.has('my')) page.textContent += '[data-my-cards]{display:grid;gap:16px;max-width:360px}';
createRoot(document.getElementById('root')!).render(q.has('my') ? <MyCards locale={(q.get('locale') as AppLocale) ?? 'ko'} /> : <Harness locale={(q.get('locale') as AppLocale) ?? 'ko'} />);
