import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const auth = vi.hoisted(() => ({ authenticated: false, ready: true, login: vi.fn(), getAccessToken: vi.fn(async () => 'token') }));
vi.mock('@/features/auth/client/cognito-auth', () => ({ useByUsAuth: () => auth }));
import { RaffleBoostAction, RaffleCountdown, RaffleEnterBlock, RaffleInvitedFriends, RaffleMoreAction, RaffleOdds, RaffleProvider, raffleCountdown } from './participation';
import { raffleOddsText } from '@/i18n/catalogs/signup-raffle-longform';

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

it('uses short action labels inside the boost rows and full labels elsewhere', () => {
  render(<RaffleProvider locale="ko" closed={false} closesAt={closesAt} now={now}><RaffleMoreAction kind="passport" short /><RaffleMoreAction kind="community" short /><RaffleMoreAction kind="passport" /></RaffleProvider>);
  expect(screen.getByRole('link', { name: '받기' })).toBeTruthy();
  expect(screen.getByRole('link', { name: '가입' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Fan Passport 받기' })).toBeTruthy();
});

it('always shows the odds rule, and my current odds only from server counts', async () => {
  const view = render(<RaffleProvider locale="ko" closed={false} closesAt={closesAt} now={now}><RaffleOdds /></RaffleProvider>);
  expect(screen.getByText('당첨 확률 ≈ 내 당첨 기회 ÷ 전체 당첨 기회 × 17명')).toBeTruthy();
  expect(view.container.querySelector('[data-raffle-odds-mine]')).toBeNull();
  cleanup();
  auth.authenticated = true;
  server({ entered: true, passportReceived: false, communityJoined: false, chances: 3, friends: 0, totalChances: 120, winChance: 0.404 });
  render(<RaffleProvider locale="ko" closed={false} closesAt={closesAt} now={now}><RaffleOdds /></RaffleProvider>);
  await settle();
  expect(document.querySelector('[data-raffle-odds-mine]')?.textContent).toBe('지금 내 확률 약 40% (내 기회 3회 · 전체 120회)');
});

it('rounds small odds to one decimal', () => {
  expect(raffleOddsText('ko', 0.0094, 1, 2000)).toBe('지금 내 확률 약 0.9% (내 기회 1회 · 전체 2000회)');
  expect(raffleOddsText('en', 1, 5, 20)).toBe('Your odds now about 100% (your 5 of 20 chances)');
  expect(raffleOddsText('ko', 0.0004, 1, 100000)).toBe('지금 내 확률 약 0.1% 미만 (내 기회 1회 · 전체 100000회)');
});

it('numbers the two steps and checks the first one after entering', () => {
  const view = render(<RaffleProvider locale="ko" closed={false} closesAt={closesAt} now={now} preview="in"><RaffleEnterBlock /></RaffleProvider>);
  const steps = () => [...view.container.querySelectorAll('[data-row="raffle-step"]')];
  expect(steps().map(step => step.textContent)).toEqual(['1래플 응모하기를 한 번 누르면 참여 완료', '2아래 활동으로 당첨 기회 더 받기(선택)']);
  fireEvent.click(screen.getByRole('button', { name: '래플 응모하기' }));
  act(() => { vi.advanceTimersByTime(500); });
  expect(steps()[0]!.hasAttribute('data-done')).toBe(true);
});

it('shows the same ticking clock large in the key visual', () => {
  render(<RaffleProvider locale="ko" closed={false} closesAt={closesAt} now={now}><RaffleCountdown hero /></RaffleProvider>);
  const timer = screen.getByRole('timer');
  expect(timer.getAttribute('data-size')).toBe('hero');
  expect(timer.textContent).toBe('D-1721:59:59');
});

it('tells a signed-out fan to sign in first in step 1', () => {
  const view = render(<RaffleProvider locale="ko" closed={false} closesAt={closesAt} now={now}><RaffleEnterBlock /></RaffleProvider>);
  expect(view.container.querySelector('[data-row="raffle-step"]')?.textContent).toBe('1로그인한 뒤 래플 응모하기를 한 번 누르면 참여 완료');
});
