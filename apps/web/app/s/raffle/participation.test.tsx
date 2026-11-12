import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const auth = vi.hoisted(() => ({ authenticated: false, ready: true, login: vi.fn(), getAccessToken: vi.fn(async () => 'token') }));
vi.mock('@/features/auth/client/cognito-auth', () => ({ useByUsAuth: () => auth }));
import { RaffleBoostAction, RaffleCountdown, RaffleEnterBlock, RaffleInvitedFriends, RaffleProvider, raffleCountdown } from './participation';

const closesAt = Date.parse('2026-11-30T23:59:59.999+09:00'), now = Date.parse('2026-11-13T02:00:00+09:00');
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); auth.authenticated = false; window.localStorage.clear(); cleanup(); });

it('splits the time left into D-day and a fixed-width clock', () => {
  expect(raffleCountdown(closesAt - now)).toEqual({ day: 'D-17', clock: '21:59:59', urgent: false });
  expect(raffleCountdown(3 * 3600_000 + 4 * 60_000 + 5000)).toEqual({ day: 'D-DAY', clock: '03:04:05', urgent: true });
  expect(raffleCountdown(-1).clock).toBe('00:00:00');
});

it('ticks every second and disappears once the raffle closes', () => {
  render(<RaffleProvider locale="ko" closed={false} closesAt={closesAt} now={now}><RaffleCountdown /></RaffleProvider>);
  expect(screen.getByRole('timer', { name: '11월 30일 23:59 마감' }).textContent).toBe('D-1721:59:59');
  act(() => { vi.advanceTimersByTime(2000); });
  expect(screen.getByRole('timer').textContent).toBe('D-1721:59:57');
  act(() => { vi.setSystemTime(closesAt + 1000); vi.advanceTimersByTime(1000); });
  expect(screen.queryByRole('timer')).toBeNull();
});

it('lands the entry stamp on the status only after entering', () => {
  const view = render(<RaffleProvider locale="ko" closed={false} closesAt={closesAt} now={now} preview="in"><RaffleEnterBlock /></RaffleProvider>);
  expect(view.container.querySelector('[data-fan-print="stamp"]')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '래플 응모하기' }));
  act(() => { vi.advanceTimersByTime(500); });
  expect(screen.getByText('응모 완료')).toBeTruthy();
  expect(view.container.querySelector('[data-fan-print="stamp"]')?.getAttribute('aria-hidden')).toBe('true');
  expect(screen.getByText('내 응모 1회')).toBeTruthy();
});

it('shows only the closed line after the deadline', () => {
  const view = render(<RaffleProvider locale="ko" closed closesAt={closesAt} now={closesAt + 1}><RaffleEnterBlock /><RaffleCountdown /></RaffleProvider>);
  expect(screen.getByText('응모가 마감됐어요')).toBeTruthy();
  expect(view.container.querySelector('button, [role="timer"]')).toBeNull();
});

const mine = 'AB2300000000000000000001', friendCode = 'CD4500000000000000000002';
const json = (body: unknown) => ({ ok: true, json: async () => body });
/** 서버 흉내: 응모 상태(GET/POST /api/signup-event/entry)와 내 초대 코드(POST /api/community-stamps/invite-code). */
function server(status: Record<string, unknown>) {
  const calls: Array<{ url: string; method: string; body?: string }> = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? 'GET', body: typeof init?.body === 'string' ? init.body : undefined });
    if (url.includes('invite-code')) return json({ code: mine, redeemed: false, redemptionState: 'none' });
    return json(init?.method === 'POST' ? { ...status, entered: true, ...(init.body ? { invite: 'registered' } : {}) } : status);
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}
const settle = async () => { for (let i = 0; i < 8; i++) await act(async () => { await Promise.resolve(); }); };

it('shows my chances and invited friends only from the server, and shares my own invite link', async () => {
  auth.authenticated = true;
  const calls = server({ entered: true, passportReceived: false, communityJoined: false, chances: 8, friends: 2 });
  const share = vi.fn(async (_data: { title?: string; url: string }) => {});
  vi.stubGlobal('navigator', { ...navigator, share });
  render(<RaffleProvider locale="ko" closed={false} closesAt={closesAt} now={now}><RaffleEnterBlock /><RaffleInvitedFriends /><RaffleBoostAction kind="invite" /></RaffleProvider>);
  expect(screen.queryByText(/내 당첨 기회/)).toBeNull();
  await settle();
  expect(screen.getByText('응모 완료')).toBeTruthy();
  // 응모 뒤 주인공은 서버가 센 당첨 기회 수(도장과 같은 결과 줄)
  const result = document.querySelector('[data-state="entered"][role="status"]')!;
  expect(result.querySelector('[data-raffle-chances]')?.textContent).toBe('내 당첨 기회8회');
  expect(result.querySelector('[data-fan-print="stamp"]')).toBeTruthy();
  expect(screen.getByText('초대한 친구 2명')).toBeTruthy();
  expect(calls.map(call => `${call.method} ${call.url}`)).toEqual(['GET /api/signup-event/entry', 'POST /api/community-stamps/invite-code']);
  fireEvent.click(screen.getByRole('button', { name: '초대 링크 공유' }));
  await settle();
  const url = new URL(share.mock.calls[0]![0].url);
  expect(url.pathname).toBe('/s/raffle');
  expect(url.searchParams.get('invite')).toBe(mine);
});

it('keeps a friend\'s invite code through sign-in and sends it with the entry once', async () => {
  // 비로그인으로 초대 주소에 들어옴: 코드를 적어 두고 로그인으로 보낸다
  const first = render(<RaffleProvider locale="ko" closed={false} closesAt={closesAt} now={now} invite={friendCode}><RaffleEnterBlock /></RaffleProvider>);
  fireEvent.click(screen.getByRole('button', { name: '래플 응모하기' }));
  expect(auth.login).toHaveBeenCalled();
  expect(window.localStorage.getItem('kyaa:raffle:invite')).toBe(friendCode);
  first.unmount();
  // 가입하고 돌아옴(주소에 코드 없음): 응모할 때 적어 둔 코드를 함께 보낸다
  auth.authenticated = true;
  const calls = server({ entered: false, passportReceived: false, communityJoined: false, chances: 0, friends: 0 });
  render(<RaffleProvider locale="ko" closed={false} closesAt={closesAt} now={now}><RaffleEnterBlock /></RaffleProvider>);
  await settle();
  fireEvent.click(screen.getByRole('button', { name: '래플 응모하기' }));
  await settle();
  const post = calls.find(call => call.method === 'POST' && call.url === '/api/signup-event/entry')!;
  expect(JSON.parse(post.body!)).toEqual({ invite: friendCode });
  expect(screen.getByText('응모 완료')).toBeTruthy();
  expect(window.localStorage.getItem('kyaa:raffle:invite')).toBeNull();
});

it('sends a signed-out fan to sign in instead of sharing a link without a code', () => {
  const share = vi.fn(async () => {});
  vi.stubGlobal('navigator', { ...navigator, share });
  auth.login.mockClear();
  render(<RaffleProvider locale="ko" closed={false} closesAt={closesAt} now={now}><RaffleBoostAction kind="invite" /></RaffleProvider>);
  fireEvent.click(screen.getByRole('button', { name: '초대 링크 공유' }));
  expect(auth.login).toHaveBeenCalledOnce();
  expect(share).not.toHaveBeenCalled();
});

it('ignores a malformed invite code from the address', () => {
  render(<RaffleProvider locale="ko" closed={false} closesAt={closesAt} now={now} invite={'<script>'}><RaffleEnterBlock /></RaffleProvider>);
  expect(window.localStorage.getItem('kyaa:raffle:invite')).toBeNull();
});
