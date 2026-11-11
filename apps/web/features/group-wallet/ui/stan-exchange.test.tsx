import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { StanExchange } from './stan-exchange';
import { StanWallet } from './stan-wallet';

const auth = vi.hoisted(() => ({ ready: true, authenticated: true, user: { id: 'owner-a' }, getAccessToken: vi.fn(async () => 'token') }));
const session = vi.hoisted(() => ({ ready: true, ownerId: 'owner-a', generation: 0 }));
vi.mock('@/features/auth/client/cognito-auth', () => ({ useByUsAuth: () => auth }));
vi.mock('@/components/byus-session-provider', () => ({ useByUsSession: () => session }));
const toast = vi.hoisted(() => vi.fn());
vi.mock('@/components/fan-ui/fan-toast', () => ({ showFanToast: toast }));
const ad = vi.hoisted(() => ({ unit: '/123/rewarded' as string | undefined, outcome: 'earned', requests: 0 }));
vi.mock('./google-rewarded-ad', () => ({
  rewardedAdUnit: () => ad.unit, loadRewardedGpt: async () => ({}),
  requestRewardedAd: (_gpt: unknown, _unit: string, onState: (state: string) => void) => { ad.requests++; queueMicrotask(() => { onState('showing'); onState(ad.outcome); if (ad.outcome === 'earned') setTimeout(() => onState('closed'), 5); }); return { show: () => true, cancel: () => {} }; },
}));

const SESSION = '20000000-0000-4000-8000-000000000002', LEDGER = '10000000-0000-4000-8000-000000000001';
type Call = { url: string; body?: Record<string, unknown> };
let calls: Call[] = [];
function serve(exchange: (body: Record<string, unknown>) => Response, sessionStatus = 'issued') {
  calls = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, body });
    if (url === '/api/me/wallet/ad-session') return Response.json({ sessionId: SESSION, status: sessionStatus, expiresAt: '2026-11-09T00:10:00Z' });
    if (url === '/api/me/wallet/ad-session/report') return Response.json({ sessionId: SESSION, status: body.event === 'granted' ? 'granted' : 'shown', expiresAt: '2026-11-09T00:10:00Z' });
    if (url === '/api/me/wallet/exchange') return exchange(body);
    return Response.json({});
  }));
}
const receipt = (body: Record<string, unknown>) => Response.json({ requestKey: body.requestKey, target: 'ticket', units: body.units, pointsSpent: Number(body.units) * 100, pointLedgerId: LEDGER, creditLedgerId: LEDGER, policyVersion: 'group-wallet-v1', createdAt: '2026-11-09T00:00:00Z', replayed: false });
const view = (points: number, locale: 'ko' | 'en' = 'ko') => render(<StanExchange locale={locale} points={points} pointCost={100} />);
const exchanges = () => calls.filter(call => call.url === '/api/me/wallet/exchange');
const sessions = () => calls.filter(call => call.url === '/api/me/wallet/ad-session');
beforeEach(() => { sessionStorage.clear(); toast.mockClear(); ad.unit = '/123/rewarded'; ad.outcome = 'earned'; ad.requests = 0; });

it('defaults to one ticket and keeps the stepper inside 1..max', () => {
  serve(receipt); view(350);
  const output = screen.getByRole('group', { name: '수량' }).querySelector('output')!;
  expect(output).toHaveTextContent('1장');
  fireEvent.click(screen.getByRole('button', { name: '수량 늘리기' })); fireEvent.click(screen.getByRole('button', { name: '수량 늘리기' }));
  expect(output).toHaveTextContent('3장');
  expect(screen.getByRole('button', { name: '수량 늘리기' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '수량 줄이기' })); fireEvent.click(screen.getByRole('button', { name: '수량 줄이기' }));
  expect(output).toHaveTextContent('1장'); expect(screen.getByRole('button', { name: '수량 줄이기' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '교환하기' })).toBeEnabled();
});

it('shows 0장 with the stepper and the exchange disabled below 100 points', () => {
  serve(receipt); view(99);
  expect(screen.getByRole('group', { name: '수량' }).querySelector('output')).toHaveTextContent('0장');
  for (const name of ['수량 줄이기', '수량 늘리기', '교환하기']) expect(screen.getByRole('button', { name })).toBeDisabled();
});

it('one press runs one ad and one exchange for all N tickets, then a toast and no dialog', async () => {
  serve(receipt); view(350);
  fireEvent.click(screen.getByRole('button', { name: '수량 늘리기' })); fireEvent.click(screen.getByRole('button', { name: '수량 늘리기' }));
  fireEvent.click(screen.getByRole('button', { name: '교환하기' }));
  await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: '응모권 +3장', tone: 'success' }));
  expect(ad.requests).toBe(1); expect(sessions()).toHaveLength(1);
  expect(exchanges()).toHaveLength(1); expect(exchanges()[0].body).toMatchObject({ target: 'ticket', units: 3, adSessionId: SESSION, policyVersion: 'group-wallet-v1' });
  expect(screen.queryByRole('dialog')).toBeNull(); expect(screen.queryByRole('button', { name: '확인' })).toBeNull();
  expect(sessionStorage.length).toBe(0);
});

it('a double press starts one session', async () => {
  serve(receipt); view(200);
  const button = screen.getByRole('button', { name: '교환하기' });
  fireEvent.click(button); fireEvent.click(button);
  await waitFor(() => expect(toast).toHaveBeenCalled());
  expect(sessions()).toHaveLength(1); expect(exchanges()).toHaveLength(1);
});

it.each([
  ['cancelled', '광고 시청이 완료되지 않았어요. 포인트는 차감되지 않았어요.'],
  ['no-fill', '지금은 볼 수 있는 광고가 없어요. 포인트는 차감되지 않았어요.'],
])('an ad that ends as %s never reaches the debit and keeps the existing message', async (outcome, title) => {
  ad.outcome = outcome; serve(receipt); view(300);
  fireEvent.click(screen.getByRole('button', { name: '교환하기' }));
  await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title, tone: 'error' })));
  expect(exchanges()).toHaveLength(0);
});

it('keeps the existing daily-limit text when the server refuses the session', async () => {
  serve(receipt);
  const refuse = vi.fn(async (url: string) => url === '/api/me/wallet/ad-session' ? Response.json({ error: { code: 'GROUP_WALLET_AD_DAILY_LIMIT' } }, { status: 429 }) : Response.json({}));
  vi.stubGlobal('fetch', refuse); view(300);
  fireEvent.click(screen.getByRole('button', { name: '교환하기' }));
  await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: '오늘은 더 교환할 수 없어요. 포인트는 차감되지 않았어요.', tone: 'error' })));
  expect(ad.requests).toBe(0);
});

it('a lost answer keeps the request; the check resends the same key and session with no second ad', async () => {
  let first = true;
  serve(body => { if (first) { first = false; throw new TypeError('network'); } return receipt(body); });
  view(300);
  fireEvent.click(screen.getByRole('button', { name: '수량 늘리기' })); fireEvent.click(screen.getByRole('button', { name: '수량 늘리기' }));
  fireEvent.click(screen.getByRole('button', { name: '교환하기' }));
  const check = await screen.findByRole('button', { name: '처리 결과 확인' });
  expect(JSON.parse(sessionStorage.getItem('kyaa-wallet-pending:owner-a')!)).toMatchObject({ units: 3, adSessionId: SESSION });
  expect(screen.getByRole('button', { name: '수량 줄이기' })).toBeDisabled();
  expect(screen.getByRole('group', { name: '수량' }).querySelector('output')).toHaveTextContent('3장');
  await act(async () => { fireEvent.click(check); });
  await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: '응모권 +3장', tone: 'success' }));
  expect(exchanges()).toHaveLength(2); expect(exchanges()[1].body).toEqual(exchanges()[0].body);
  expect(ad.requests).toBe(1); expect(sessions()).toHaveLength(1); expect(sessionStorage.length).toBe(0);
});

it('a refusal of the whole request drops the saved request', async () => {
  serve(() => Response.json({ error: { code: 'GROUP_WALLET_INSUFFICIENT_BALANCE' } }, { status: 409 })); view(300);
  fireEvent.click(screen.getByRole('button', { name: '교환하기' }));
  await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: '요청을 완료하지 못했어요.', tone: 'error' }));
  expect(sessionStorage.length).toBe(0); expect(screen.getByRole('button', { name: '교환하기' })).toBeInTheDocument();
});

it('names the toast with the ticket word in other languages', async () => {
  serve(receipt); view(200, 'en');
  fireEvent.click(screen.getByRole('button', { name: 'Increase quantity' }));
  fireEvent.click(screen.getByRole('button', { name: 'Exchange' }));
  await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: 'Tickets +2', tone: 'success' }));
});

it('shows the saved quantity, not today\'s maximum, while a saved request waits for its check', () => {
  sessionStorage.setItem('kyaa-wallet-pending:owner-a', JSON.stringify({ operation: 'exchange', requestKey: '40000000-0000-4000-8000-000000000004', policyVersion: 'group-wallet-v1', target: 'ticket', units: 2, adSessionId: SESSION }));
  serve(receipt); view(900);
  expect(screen.getByRole('button', { name: '처리 결과 확인' })).toBeInTheDocument();
  expect(screen.getByRole('group', { name: '수량' }).querySelector('output')).toHaveTextContent('2장');
});

const walletView = (points: number) => render(<StanWallet locale="ko" state={{ kind: 'ready', points, tickets: 4, pointCost: 100 }} stamps={4} hearts={0} links={{ hearts: '/passports' }} />);
it('reopens the wallet below cost and checks the same saved request after a lost exchange response', async () => {
  let first = true;
  serve(body => { if (first) { first = false; throw new TypeError('response lost after server commit'); } return receipt(body); });
  const initial = walletView(149);
  fireEvent.click(screen.getByRole('button', { name: '교환', exact: true }));
  fireEvent.click(await screen.findByRole('button', { name: '교환하기' }));
  await screen.findByRole('button', { name: '처리 결과 확인' });
  const saved = JSON.parse(sessionStorage.getItem('kyaa-wallet-pending:owner-a')!);
  expect(saved).toMatchObject({ units: 1, adSessionId: SESSION });
  initial.unmount();

  // Reconnecting sees the debit (49P) while the same request is still unresolved locally.
  walletView(49);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByRole('button', { name: '교환', exact: true })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: '교환', exact: true }));
  fireEvent.click(await screen.findByRole('button', { name: '처리 결과 확인' }));
  await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: '응모권 +1장', tone: 'success' }));
  expect(exchanges()).toHaveLength(2);
  expect(exchanges()[1].body).toEqual(exchanges()[0].body);
  expect(exchanges()[1].body?.requestKey).toBe(saved.requestKey);
  expect(sessions()).toHaveLength(1); expect(ad.requests).toBe(1);
  expect(sessionStorage.getItem('kyaa-wallet-pending:owner-a')).toBeNull();
  expect(screen.queryByRole('dialog')).toBeNull();
});

// The ad-session POSTs also announce a change, so only the announcements after the exchange request count.
it('closes the wallet sheet after a successful exchange and announces the wallet change', async () => {
  let before = -1; const changed = vi.fn(); window.addEventListener('kyaa:group-wallet-changed', changed);
  serve(body => { before = changed.mock.calls.length; return receipt(body); });
  walletView(350);
  fireEvent.click(screen.getByRole('button', { name: '교환', exact: true }));
  expect(await screen.findByRole('dialog')).toBeInTheDocument();
  expect(screen.getByRole('group', { name: '수량' }).querySelector('output')).toHaveTextContent('1장');
  fireEvent.click(screen.getByRole('button', { name: '교환하기' }));
  await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: '응모권 +1장', tone: 'success' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(exchanges()[0].body).toMatchObject({ units: 1 });
  expect(changed.mock.calls.length).toBeGreaterThan(before);
  window.removeEventListener('kyaa:group-wallet-changed', changed);
});

it('keeps the wallet sheet open and announces no wallet change when the exchange fails', async () => {
  let before = -1; const changed = vi.fn(); window.addEventListener('kyaa:group-wallet-changed', changed);
  serve(() => { before = changed.mock.calls.length; return Response.json({ error: { code: 'GROUP_WALLET_INSUFFICIENT_BALANCE' } }, { status: 409 }); });
  walletView(350);
  fireEvent.click(screen.getByRole('button', { name: '교환', exact: true }));
  fireEvent.click(await screen.findByRole('button', { name: '교환하기' }));
  await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: '요청을 완료하지 못했어요.', tone: 'error' }));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(changed.mock.calls.length).toBe(before);
  window.removeEventListener('kyaa:group-wallet-changed', changed);
});

it.each(['invalid', 'other-owner'])('does not unlock a low-balance wallet for %s pending data', kind => {
  const saved = { operation: 'exchange', requestKey: '40000000-0000-4000-8000-000000000004', policyVersion: 'group-wallet-v1', target: 'ticket', units: 1, adSessionId: SESSION };
  sessionStorage.setItem(kind === 'other-owner' ? 'kyaa-wallet-pending:owner-b' : 'kyaa-wallet-pending:owner-a', JSON.stringify(kind === 'invalid' ? { ...saved, requestKey: 'invalid' } : saved));
  serve(receipt); walletView(49);
  expect(screen.getByRole('button', { name: '교환', exact: true })).toBeDisabled();
  expect(exchanges()).toHaveLength(0);
});

it('shows the policy exchange rate with the ticket asset', () => {
  render(<StanExchange locale="ko" points={250} pointCost={100} />);
  expect(screen.getByText('100 P')).toBeInTheDocument();
  expect(screen.getByRole('img', { name: '응모권' })).toHaveAttribute('src', '/images/dukjil-duo/glyph-ticket-160.webp');
});
