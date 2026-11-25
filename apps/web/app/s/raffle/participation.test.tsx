import { resetGa4ForTests, startGa4 } from '@/features/analytics/client/ga4-client';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const auth = vi.hoisted(() => ({ authenticated: false, ready: true, login: vi.fn(), getAccessToken: vi.fn(async () => 'token') }));
vi.mock('@/features/auth/client/cognito-auth', () => ({ useByUsAuth: () => auth }));
import { RaffleBoostAction, RaffleCountdown, RaffleEnterBlock, RaffleMoreAction, RaffleOdds, RaffleProvider, raffleCountdown } from './participation';
import { raffleOddsText } from '@/i18n/catalogs/signup-raffle-longform';

const closesAt = Date.parse('2026-11-30T23:59:59.999+09:00'), now = Date.parse('2026-11-13T02:00:00+09:00');
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); auth.authenticated = false; window.localStorage.clear(); window.sessionStorage.clear(); auth.login.mockClear(); cleanup(); });

it('splits the time left into D-day and a fixed-width clock', () => {
  expect(raffleCountdown(closesAt - now)).toEqual({ day: 'D-17', clock: '21:59:59', urgent: false });
  expect(raffleCountdown(3 * 3600_000 + 4 * 60_000 + 5000)).toEqual({ day: 'D-DAY', clock: '03:04:05', urgent: true });
  expect(raffleCountdown(-1).clock).toBe('00:00:00');
});

it('ticks every second and disappears once the raffle closes', () => {
  render(<RaffleProvider locale="ko" closed={false} closesAt={closesAt} now={now}><RaffleCountdown /></RaffleProvider>);
  expect(screen.getByRole('timer', { name: '12월 13일 23:59 마감' }).textContent).toBe('D-1721:59:59');
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
    if (url === '/api/notifications/preferences') {
      return json({ preferences: { marketingNotifications: init?.method === 'PATCH' } });
    }
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
  const writeText = vi.fn(async (_url: string) => {});
  vi.stubGlobal('navigator', { ...navigator, share, clipboard: { writeText } });
  render(<RaffleProvider locale="ko" closed={false} closesAt={closesAt} now={now}><RaffleEnterBlock /><RaffleBoostAction kind="invite" /></RaffleProvider>);
  expect(screen.queryByText(/내 당첨 기회/)).toBeNull();
  await settle();
  expect(screen.getByText('응모 완료')).toBeTruthy();
  // 응모 뒤 주인공은 서버가 센 당첨 기회 수(도장과 같은 결과 줄)
  const result = document.querySelector('[data-state="entered"][role="status"]')!;
  expect(result.querySelector('[data-raffle-chances]')?.textContent).toBe('내 당첨 기회8회');
  expect(result.querySelector('[data-fan-print="stamp"]')).toBeTruthy();
  // 초대 카드: 혜택 한 줄(제목) · 조건 · 내 현황(서버 값 2명 → +6회)
  const card = document.querySelector('[data-raffle-invite]')!;
  expect(screen.getByRole('heading', { level: 3, name: '친구 1명 초대할 때마다 당첨 기회 +3' })).toBeTruthy();
  expect(card.textContent).toContain('이벤트 기간에 내 링크로 새로 가입하고 응모한 친구만 해당돼요');
  expect(card.querySelector('[data-raffle-friends="2"]')?.textContent).toBe('2명 참여 · 당첨 기회 +6회');
  expect(calls.map(call => `${call.method} ${call.url}`).sort()).toEqual([
    'GET /api/notifications/preferences', 'GET /api/signup-event/entry', 'POST /api/community-stamps/invite-code',
  ]);
  const consent = screen.getByRole('checkbox', { name: /이벤트·혜택/ }) as HTMLInputElement;
  expect(consent.checked).toBe(false);
  fireEvent.click(consent);
  await settle();
  expect(consent.checked).toBe(true);
  expect(calls.at(-1)?.body).toBe(JSON.stringify({ marketingNotifications: true }));
  fireEvent.click(consent);
  await settle();
  expect(calls.at(-1)?.body).toBe(JSON.stringify({ marketingNotifications: false }));
  // 응모 뒤에는 초대 버튼이 화면의 다음 행동(primary)
  const invite = screen.getByRole('button', { name: '친구 초대하기' });
  expect(invite.getAttribute('data-fan-action-emphasis')).toBe('primary');
  fireEvent.click(invite);
  await settle();
  fireEvent.click(screen.getByRole('button', { name: '초대 링크 복사' }));
  await settle();
  expect(screen.getByRole('button', { name: '링크를 복사했어요' })).toBeTruthy();
  expect(writeText).toHaveBeenCalledWith(share.mock.calls[0]![0].url);
  expect(share).toHaveBeenCalledTimes(1);
  const url = new URL(share.mock.calls[0]![0].url);
  expect(url.pathname).toBe('/s/raffle');
  expect(url.searchParams.get('invite')).toBe(mine);
  // 당첨 확률 올리기 행의 초대 버튼도 같은 내 링크를 공유한다
  fireEvent.click(screen.getByRole('button', { name: '초대 링크 공유' }));
  await settle();
  expect(share).toHaveBeenCalledTimes(2);
  expect(share.mock.calls[1]![0].url).toBe(share.mock.calls[0]![0].url);
});

it('shows the empty invite status with the invite stamp before anyone joins, and copies when there is no share sheet', async () => {
  auth.authenticated = true;
  server({ entered: false, passportReceived: false, communityJoined: false, friends: 0 });
  const writeText = vi.fn(async (_url: string) => {});
  vi.stubGlobal('navigator', { ...navigator, share: undefined, clipboard: { writeText } });
  render(<RaffleProvider locale="ko" closed={false} closesAt={closesAt} now={now}><RaffleEnterBlock /></RaffleProvider>);
  await settle();
  const status = document.querySelector('[data-raffle-friends="0"]')!;
  expect(status.textContent).toBe('아직 초대로 응모한 친구가 없어요');
  expect(status.querySelector('[data-fan-activity-stamp="invite"]')).toBeTruthy();
  // 응모 전에는 분홍 버튼이 응모 하나뿐이라 초대 버튼은 보조
  const invite = screen.getByRole('button', { name: '친구 초대하기' });
  expect(invite.getAttribute('data-fan-action-emphasis')).toBeNull();
  fireEvent.click(invite);
  await settle();
  expect(new URL(writeText.mock.calls[0]![0]).searchParams.get('invite')).toBe(mine);
  expect(screen.getByRole('button', { name: '링크를 복사했어요' })).toBeTruthy();
});

it('tells an invited friend who invited them and that the inviter gets +3, with a general line when the name is unknown', () => {
  const named = render(<RaffleProvider locale="ko" closed={false} closesAt={closesAt} now={now} invite={friendCode} inviterName="보석"><RaffleEnterBlock /></RaffleProvider>);
  const banner = document.querySelector('[data-raffle-invited="named"]')!;
  expect(banner.textContent).toBe('보석님이 초대했어요가입하고 응모하면 보석님이 당첨 기회 +3을 받아요');
  // 응모 버튼 바로 위
  expect(banner.nextElementSibling?.textContent).toBe('래플 응모하기');
  // 비로그인은 내 현황이 없다(값을 지어내지 않는다)
  expect(document.querySelector('[data-raffle-friends]')).toBeNull();
  named.unmount();
  render(<RaffleProvider locale="en" closed={false} closesAt={closesAt} now={now} invite={friendCode}><RaffleEnterBlock /></RaffleProvider>);
  expect(document.querySelector('[data-raffle-invited="friend"]')?.textContent).toBe('A friend invited youSign up and enter, and your friend gets 3 extra chances');
});

it('keeps a friend\'s invite code through sign-in and sends it with the entry once', async () => {
  // 비로그인으로 초대 주소에 들어옴: 코드를 적어 두고 로그인으로 보낸다
  const first = render(<RaffleProvider locale="ko" closed={false} closesAt={closesAt} now={now} invite={friendCode}><RaffleEnterBlock /></RaffleProvider>);
  expect(screen.getByText(/친구가 초대했어요/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '래플 응모하기' }));
  expect(auth.login).toHaveBeenCalled();
  expect(window.localStorage.getItem('kyaa:raffle:invite')).toBe(friendCode);
  first.unmount();
  // 가입하고 돌아옴(주소에 코드 없음): 다시 누르지 않아도 응모하고, 적어 둔 코드를 함께 보낸다
  auth.authenticated = true;
  const calls = server({ entered: false, passportReceived: false, communityJoined: false, chances: 0, friends: 0 });
  render(<RaffleProvider locale="ko" closed={false} closesAt={closesAt} now={now}><RaffleEnterBlock /></RaffleProvider>);
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

describe('result after the draw', () => {
  const closedAt = closesAt + 86_400_000;
  const answer = (body: unknown, ok = true) => vi.stubGlobal('fetch', vi.fn(async () => ({ ok, json: async () => body })));
  it.each([
    [{ state: 'pending' }, true], [{ state: 'not-entered' }, true], [{ state: 'won', usd: 50 }, false], [{ state: 'lost' }, false],
  ])('shows 결과 확인 only once the server has a stored draw for an entrant (%o)', async (body, hidden) => {
    auth.authenticated = true;
    answer(body);
    render(<RaffleProvider locale="ko" closed closesAt={closesAt} now={closedAt}><RaffleEnterBlock /></RaffleProvider>);
    await settle();
    expect(screen.getByText('응모가 마감됐어요')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '결과 확인' }) === null).toBe(hidden);
    expect(vi.mocked(fetch).mock.calls[0]![0]).toBe('/api/signup-event/result');
  });
  it('asks nothing before the close or without sign-in, and hides the entry when the result cannot be read', async () => {
    answer({ state: 'won', usd: 10 });
    render(<RaffleProvider locale="ko" closed closesAt={closesAt} now={closedAt}><RaffleEnterBlock /></RaffleProvider>);
    await settle();
    expect(fetch).not.toHaveBeenCalled();
    cleanup();
    auth.authenticated = true;
    answer(null, false);
    render(<RaffleProvider locale="ko" closed closesAt={closesAt} now={closedAt}><RaffleEnterBlock /></RaffleProvider>);
    await settle();
    expect(screen.queryByRole('button', { name: '결과 확인' })).toBeNull();
  });
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
  expect(steps().map(step => step.textContent)).toEqual(['1래플 응모하기 누르기', '로그인 완료']);
  expect(steps()[1]!.hasAttribute('data-done')).toBe(true);
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

it('shows a signed-out fan the two steps: enter, then sign up or log in', () => {
  const view = render(<RaffleProvider locale="en" closed={false} closesAt={closesAt} now={now}><RaffleEnterBlock /></RaffleProvider>);
  expect([...view.container.querySelectorAll('[data-row="raffle-step"]')].map(step => step.textContent)).toEqual(['1Tap Enter the raffle', "2Sign up or log in and you're entered"]);
  expect(view.container.querySelector('button.lg, button')?.textContent).toBe('Enter the raffle');
});

it('enters right after coming back from sign-up when the fan tapped Enter signed out', async () => {
  const view = render(<RaffleProvider locale="ko" closed={false} closesAt={closesAt} now={now}><RaffleEnterBlock /></RaffleProvider>);
  fireEvent.click(screen.getByRole('button', { name: '래플 응모하기' }));
  expect(auth.login).toHaveBeenCalledTimes(1);
  expect(window.sessionStorage.getItem('kyaa:raffle:enter')).toBe('1');
  view.unmount();
  auth.authenticated = true;
  const calls = server({ entered: false, passportReceived: false, communityJoined: false });
  render(<RaffleProvider locale="ko" closed={false} closesAt={closesAt} now={now}><RaffleEnterBlock /></RaffleProvider>);
  await settle();
  expect(calls.filter(call => call.url.includes('/entry')).map(call => call.method)).toEqual(['GET', 'POST']);
  expect(screen.getByText('응모 완료')).toBeTruthy();
  expect(window.sessionStorage.getItem('kyaa:raffle:enter')).toBeNull();
});

it('does not enter a signed-in fan who never tapped Enter', async () => {
  auth.authenticated = true;
  const calls = server({ entered: false, passportReceived: false, communityJoined: false });
  render(<RaffleProvider locale="ko" closed={false} closesAt={closesAt} now={now}><RaffleEnterBlock /></RaffleProvider>);
  await settle();
  expect(calls.filter(call => call.url.includes('/entry')).map(call => call.method)).toEqual(['GET']);
  expect(screen.getByRole('button', { name: '래플 응모하기' })).toBeTruthy();
});

// RAFFLE-FUNNEL-CHECK-1123: X 앱 안 브라우저에서는 로그인이 끝나지 않고, 브라우저를 옮기면 sessionStorage의 응모 의도가 사라졌다.
describe('in-app browser and entry intent in the address (?enter=1)', () => {
  const xApp = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22B83 Twitter for iPhone';
  const safari = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
  const at = (path: string) => window.history.replaceState(null, '', path);
  const asAgent = (ua: string) => vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(ua);
  afterEach(() => { vi.restoreAllMocks(); at('/'); });
  const block = (locale: 'en' | 'ko' = 'en') => render(<RaffleProvider locale={locale} closed={false} closesAt={closesAt} now={now}><RaffleEnterBlock /></RaffleProvider>);

  it.each([
    ['X', xApp], ['Instagram', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Mobile/22B83 Instagram 350.0.2.15.84'],
    ['Facebook', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Mobile/22B83 [FBAN/FBIOS;FBAV/500.0]'],
    ['TikTok', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 musical_ly_36.5.0 BytedanceWebview/d8a21c6'],
    ['KakaoTalk', 'Mozilla/5.0 (Linux; Android 14; SM-S918N; wv) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36 KAKAOTALK/11.0.0'],
  ])('tells a signed-out fan in the %s app to open the browser, right under the Enter button', (_name, ua) => {
    asAgent(ua);
    const view = block();
    const guide = view.container.querySelector('[data-raffle-inapp]')!;
    expect(guide.textContent).toContain('Open in your browser to enter: tap ··· (top right) → Open in browser');
    expect(guide.previousElementSibling?.textContent).toBe('Enter the raffle');
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeTruthy();
  });

  it('copies the raffle link with ?enter=1, keeping the invite code and dropping the hash', async () => {
    asAgent(xApp);
    const writeText = vi.fn(async (_text: string) => {});
    Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: { writeText } });
    at(`/s/raffle?invite=${friendCode}#prizes`);
    block();
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    await settle();
    const url = new URL(writeText.mock.calls[0]![0]);
    expect(url.pathname).toBe('/s/raffle');
    expect(Object.fromEntries(url.searchParams)).toEqual({ invite: friendCode, enter: '1' });
    expect(url.hash).toBe('');
    expect(screen.getByRole('button', { name: 'Link copied' })).toBeTruthy();
  });

  it('shows a selectable link when the clipboard is blocked', async () => {
    asAgent(xApp);
    Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn(async () => { throw new Error('denied'); }) } });
    at('/s/raffle');
    block();
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    await settle();
    expect((screen.getByRole('textbox', { name: 'Copy link' }) as HTMLInputElement).value).toMatch(/\/s\/raffle\?enter=1$/);
  });

  it('shows the Korean guide too, and nothing in an ordinary browser or once signed in', async () => {
    asAgent(xApp);
    const ko = block('ko');
    expect(ko.container.querySelector('[data-raffle-inapp]')?.textContent).toContain('브라우저에서 열어 응모하세요: 오른쪽 위 ··· → 브라우저에서 열기');
    ko.unmount();
    vi.restoreAllMocks(); asAgent(safari);
    const plain = block();
    expect(plain.container.querySelector('[data-raffle-inapp]')).toBeNull();
    plain.unmount();
    vi.restoreAllMocks(); asAgent(xApp);
    auth.authenticated = true;
    server({ entered: false, passportReceived: false, communityJoined: false });
    const signedIn = block();
    await settle();
    expect(signedIn.container.querySelector('[data-raffle-inapp]')).toBeNull();
  });

  it('puts ?enter=1 in the address before sending a signed-out fan to sign in, so the login return carries it', () => {
    at('/s/raffle?locale=en');
    block();
    fireEvent.click(screen.getByRole('button', { name: 'Enter the raffle' }));
    expect(auth.login).toHaveBeenCalledOnce();
    expect(window.location.pathname + window.location.search).toBe('/s/raffle?locale=en&enter=1');
    expect(window.sessionStorage.getItem('kyaa:raffle:enter')).toBe('1');
  });

  it('enters once when a signed-in fan arrives with ?enter=1 from another browser, then strips the param', async () => {
    auth.authenticated = true;
    at('/s/raffle?enter=1&locale=en');
    const calls = server({ entered: false, passportReceived: false, communityJoined: false });
    const first = block();
    await settle();
    expect(calls.filter(call => call.url.includes('/entry')).map(call => call.method)).toEqual(['GET', 'POST']);
    expect(screen.getByText("You're in")).toBeTruthy();
    expect(window.location.search).toBe('?locale=en');
    // 다시 열어도(새로고침·뒤로 가기) 또 응모하지 않는다
    first.unmount();
    calls.length = 0;
    block();
    await settle();
    expect(calls.filter(call => call.url.includes('/entry')).map(call => call.method)).toEqual(['GET']);
  });

  it('does not post again for a fan who already entered, and still strips the param', async () => {
    auth.authenticated = true;
    at('/s/raffle?enter=1');
    const calls = server({ entered: true, passportReceived: false, communityJoined: false, chances: 1 });
    block();
    await settle();
    expect(calls.filter(call => call.url.includes('/entry')).map(call => call.method)).toEqual(['GET']);
    expect(window.location.search).toBe('');
  });

  it('does nothing for a signed-out visitor with ?enter=1 and keeps the param for after sign-in', async () => {
    at('/s/raffle?enter=1');
    const calls = server({ entered: false });
    block();
    await settle();
    expect(calls).toEqual([]);
    expect(window.location.search).toBe('?enter=1');
    expect(screen.getByRole('button', { name: 'Enter the raffle' })).toBeTruthy();
  });

  it('shows the error row with Try again when the automatic entry fails', async () => {
    auth.authenticated = true;
    at('/s/raffle?enter=1');
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('invite-code')) return json({ code: mine, redeemed: false, redemptionState: 'none' });
      return init?.method === 'POST' ? { ok: false, json: async () => ({}) } : json({ entered: false });
    }));
    block();
    await settle();
    expect(screen.getByRole('alert').textContent).toContain('Could not enter');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(window.location.search).toBe('');
  });

  it('keeps the sessionStorage path working in the same tab', async () => {
    window.sessionStorage.setItem('kyaa:raffle:enter', '1');
    auth.authenticated = true;
    at('/s/raffle');
    const calls = server({ entered: false, passportReceived: false, communityJoined: false });
    block();
    await settle();
    expect(calls.filter(call => call.url.includes('/entry')).map(call => call.method)).toEqual(['GET', 'POST']);
  });
});

it.each([
  [true, true, undefined, 'direct'],
  [true, true, 'registered', 'invite'],
  [true, false, 'registered', undefined],
  [false, false, undefined, undefined],
] as const)('measures only newly committed raffle entries (%s, %s, %s)', async (ok, newEntry, invite, method) => {
  auth.authenticated = true;
  window.history.replaceState(null, '', '/s/raffle?enter=1');
  const gtag = vi.fn();
  window.gtag = gtag;
  startGa4('G-TEST', '/s/raffle');
  try {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('invite-code')) return json({ code: mine, redeemed: false, redemptionState: 'none' });
      if (init?.method === 'POST') return { ok, json: async () => ({ entered: true, newEntry, invite }) };
      return json({ entered: false });
    }));
    render(<RaffleProvider locale="en" closed={false} closesAt={closesAt} now={now} invite={invite ? friendCode : undefined}><RaffleEnterBlock /></RaffleProvider>);
    await settle();
    expect(gtag.mock.calls.filter(([command]) => command === 'event')).toEqual(
      method ? [['event', 'raffle_enter', { campaign: 'raffle-1125', method }]] : [],
    );
  } finally {
    resetGa4ForTests();
    delete window.gtag;
    document.getElementById('kyaa-ga4')?.remove();
    window.history.replaceState(null, '', '/');
  }
});
