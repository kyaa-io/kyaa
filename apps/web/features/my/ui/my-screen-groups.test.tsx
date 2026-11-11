import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { MyScreen } from './my-screen';
import { GroupsReleaseProvider } from '@/features/groups/ui/groups-release';

const slot = (slotNo: number, kind: string, state: 'filled' | 'empty') => ({ slotNo, kind, state, stampId: null, clearedAt: null });
const roadmap = (passportId: string, filled: number) => ({
  passportId, celebrityId: '20000000-0000-4000-8000-000000000001', hearts: 0,
  pages: [{ pageNo: 1, filled, claimable: false, claimed: false, locked: false, lockedReason: null,
    slots: ['quiz', 'checkin', 'post', 'comment', 'share', 'invite', 'subscription', 'steady_checkin', 'proof'].map((kind, index) => slot(index + 1, kind, index < filled ? 'filled' : 'empty')) }],
});
const stage = (key: string, tier: string, subdivision: number, rank: number, minimumScore: number) => ({ key, tier, subdivision, rank, minimumScore });
const data = vi.hoisted(() => ({
  wallet: { points: 375, hearts: 4, tickets: 9, pointCost: 100 } as Record<string, number>,
  rewards: [] as unknown[],
  gifts: undefined as undefined | { unreadCount: number; singleUnreadId: string | null },
  summary: null as unknown,
}));
const passportA = '10000000-0000-4000-8000-000000000001';
const passportB = '10000000-0000-4000-8000-000000000002';
const giftId = '50000000-0000-4000-8000-000000000001';
const reward = (id: string) => ({ rewardResultId: id, winnerId: null, benefitId: '30000000-0000-4000-8000-000000000001', title: '선물', campaignId: '40000000-0000-4000-8000-000000000001', result: 'not_selected', method: null, status: 'not_selected', enteredTickets: 1, recipientRequired: false, updatedAt: '2026-11-05T00:00:00.000Z', benefitHref: '/benefits/30000000-0000-4000-8000-000000000001' });
const makeSummary = () => ({
  profile: { nickname: '별빛' },
  creators: [
    { celebrity: { slug: 'nchive', name: '엔카이브', image: '/nchive.jpg', isPublic: true }, relationship: 'passport', passport: { id: passportA, tier: 'Silver', score: 15, remainingToNextTier: 35, stageProgress: { policyVersion: 3, current: stage('silver-1', 'Silver', 1, 2, 0), next: stage('silver-2', 'Silver', 2, 3, 0), remaining: 3, progressPercent: 0, unit: "stamps" as const } }, ticketBalance: 12, firstReaction: null },
    { celebrity: { slug: 'second', name: '두번째', image: '/second.jpg', isPublic: true }, relationship: 'passport', passport: { id: passportB, tier: 'Bronze', score: 3, remainingToNextTier: 7, stageProgress: { policyVersion: 3, current: stage('bronze-1', 'Bronze', 1, 1, 0), next: stage('silver-1', 'Silver', 1, 2, 0), remaining: 1, progressPercent: 66, unit: "stamps" as const } }, ticketBalance: 0, firstReaction: null },
    { celebrity: { slug: 'unverified', name: '미인증 최애', image: '/u.jpg', isPublic: true }, relationship: 'first_reaction_only', passport: null, ticketBalance: 0, firstReaction: null },
  ],
  live: { upcoming: [], history: [] },
  rewards: { items: data.rewards, entries: 0, availableCount: 0 },
  collection: { recent: [], stampCount: 0, passportCount: 2, collectibleCount: 0 },
  unreadNotificationCount: 0,
  ...(data.gifts ? { gifts: data.gifts } : {}),
});
vi.mock('@/features/auth/client/cognito-auth', () => ({ useByUsAuth: () => ({ ready: true, authenticated: true, user: { id: 'owner-a' } }) }));
vi.mock('@/components/byus-session-provider', () => ({ useByUsSession: () => ({ ready: true }) }));
vi.mock('@/components/fan-ui/use-owned-fan-resource', () => ({ useOwnedFanResource: () => ({ state: { status: 'ready', data: makeSummary() }, retry: vi.fn() }) }));
vi.mock('@/features/profile/ui/use-avatar', () => ({ useAvatar: () => ({ state: { status: 'loading' } }) }));
vi.mock('@/features/community-stamps/ui/use-community-stamps', () => ({ useCommunityStamps: () => ({ state: { status: 'ready', data: { stamps: [{ id: 'stamp-a', kind: 'welcome', celebritySlug: null, issuedAt: '2026-11-02T00:00:00Z', mint: { status: 'queued', txHash: null, tokenId: null } }] } }, retry: vi.fn() }) }));
vi.mock('@/features/dukjil/ui/dukjil-provider', () => ({ DukjilProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>, useDukjil: () => ({ status: 'on' }) }));
vi.mock('@/features/group-wallet/ui/wallet-screen', () => ({ WalletExchangeDialog: ({ open }: { open: boolean }) => open ? <div role="dialog" aria-label="교환" /> : null }));
vi.mock('@/features/groups/ui/use-group-resource', () => ({
  GROUP_WALLET_CHANGED_EVENT: 'kyaa:wallet-changed',
  useGroupResource: (url: string | null) => {
    const base = { loading: false, error: null, retry: vi.fn() };
    if (!url) return { ...base, data: undefined };
    if (url.includes(`/passports/${passportA}/roadmap`)) return { ...base, data: roadmap(passportA, 3) };
    if (url.includes(`/passports/${passportB}/roadmap`)) return { ...base, data: roadmap(passportB, 1) };
    if (url.startsWith('/api/me/dukjil/today')) return { ...base, data: { kstDate: '2026-11-07', policyActive: true, totalPoints: 0, actions: {}, attendance: { attendedToday: true, streak: url.includes('nchive') ? 3 : 0, nextBonusIn: null }, hasPassport: true } };
    return { ...base, data: data.wallet };
  },
}));
vi.mock('@/components/fan-shell/fan-app-shell', () => ({ FanAppFrame: ({ children }: { children: React.ReactNode }) => <div>{children}</div>, FanContentContainer: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));

const renderMy = (locale: 'ko' | 'en' | 'ru' | 'ja' = 'ko') => render(<GroupsReleaseProvider enabled><MyScreen locale={locale} /></GroupsReleaseProvider>);
const before = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
beforeEach(() => { window.localStorage.clear(); data.wallet = { points: 375, hearts: 4, tickets: 9, pointCost: 100 }; data.rewards = []; data.gifts = undefined; });

it('puts the selected passport tier next to the name', () => {
  renderMy();
  const name = screen.getByRole('heading', { level: 1, name: '별빛님' });
  expect(within(name.parentElement as HTMLElement).getByText(/실버|Silver/)).toBeInTheDocument();
});

it('orders the screen profile, notice, passport, shortcuts and shows stamps in one place', () => {
  data.gifts = { unreadCount: 1, singleUnreadId: giftId };
  renderMy();
  const name = screen.getByRole('heading', { level: 1, name: '별빛님' });
  const notice = screen.getByRole('heading', { name: '당첨 선물이 도착했어요' });
  const passport = screen.getByRole('heading', { name: '내 패스포트' });
  const shortcuts = screen.getByRole('heading', { name: '바로가기' });
  expect(screen.queryByRole('heading', { name: '내 최애' })).toBeNull();
  [name, notice, passport, shortcuts].reduce((previous, current) => { expect(before(previous, current)).toBe(true); return current; });
  expect(screen.queryByRole('heading', { name: '함께 모은 스탬프' })).toBeNull();
  expect(screen.queryByText('미인증 최애')).toBeNull();
});

it('ends the screen with the logout row after the shortcuts', () => {
  renderMy();
  const shortcuts = screen.getByRole('heading', { name: '바로가기' });
  const logout = screen.getByRole('button', { name: '로그아웃' });
  expect(before(shortcuts, logout)).toBe(true);
  expect(screen.queryByRole('dialog', { name: '로그아웃' })).toBeNull();
});

it('shows stamp progress and the next tier with earned stamps in colour and the rest locked', () => {
  renderMy();
  const card = screen.getByRole('region', { name: '내 패스포트' });
  expect(within(card).getByText('이번 쪽 3/9')).toBeInTheDocument();
  expect(within(card).getByRole('progressbar', { name: '패스포트 이번 쪽 스탬프 3/9칸' })).toHaveAttribute('aria-valuenow', '33');
  expect(within(card).getByText('실버 2까지 도장 3칸')).toBeInTheDocument();
  expect(within(card).getAllByRole('listitem').filter(item => item.getAttribute('data-state') === 'filled')).toHaveLength(3);
  expect(within(card).getAllByRole('listitem').filter(item => item.getAttribute('data-state') === 'empty')).toHaveLength(6);
  expect(within(card).getByLabelText('출석, 찍힘')).toBeInTheDocument();
  expect(within(card).getAllByLabelText(/아직 안 찍힘/)).toHaveLength(6);
  expect(within(card).getByRole('link', { name: '자세히 보기' })).toHaveAttribute('href', `/passports/${passportA}?locale=ko`);
  expect(card.textContent).not.toMatch(/가입기념/);
  // 작은 여권 그림에도 받은 스탬프가 찍혀 있다.
  expect(card.querySelectorAll('[data-passport-slot]')).toHaveLength(3);
});

it('switches the passport card to the other favorite', () => {
  renderMy();
  fireEvent.click(screen.getByRole('button', { name: /두번째/ }));
  const card = screen.getByRole('region', { name: '내 패스포트' });
  expect(within(card).getByText('이번 쪽 1/9')).toBeInTheDocument();
  expect(within(card).getByText('실버까지 도장 1칸')).toBeInTheDocument();
});

it('does not duplicate the wallet on MY', () => {
  renderMy();
  expect(screen.queryByRole('heading', { name: '내 지갑' })).toBeNull();
  expect(document.querySelector('[data-wallet-card="my"]')).toBeNull();
});

it('shows the gift notice from the server count: one gift opens it directly, several open the list, none shows nothing', () => {
  data.gifts = { unreadCount: 1, singleUnreadId: giftId };
  const one = renderMy();
  expect(screen.getByRole('link', { name: '선물 열어보기' })).toHaveAttribute('href', `/my/gifts/${giftId}?locale=ko`);
  one.unmount();
  data.gifts = { unreadCount: 2, singleUnreadId: null };
  const several = renderMy();
  expect(screen.getByRole('link', { name: '선물 열어보기' })).toHaveAttribute('href', '/my/gifts?locale=ko');
  several.unmount();
  data.gifts = { unreadCount: 0, singleUnreadId: null };
  renderMy();
  expect(screen.queryByRole('heading', { name: '당첨 선물이 도착했어요' })).toBeNull();
});

it('does not mark a gift read by following the notice link or by opening the list, and ignores the old browser record', () => {
  window.localStorage.setItem('kyaa:my:raffle-results-seen:owner-a', JSON.stringify([giftId]));
  data.gifts = { unreadCount: 1, singleUnreadId: giftId };
  const first = renderMy();
  fireEvent.click(screen.getByRole('link', { name: '선물 열어보기' }));
  expect(screen.getByRole('heading', { name: '당첨 선물이 도착했어요' })).toBeInTheDocument();
  first.unmount();
  renderMy();
  expect(screen.getByRole('heading', { name: '당첨 선물이 도착했어요' })).toBeInTheDocument();
  expect(window.localStorage.getItem('kyaa:my:raffle-results-seen:owner-a')).toBeNull();
});

it('lights the gift link only while something is unread and names the count', () => {
  data.gifts = { unreadCount: 0, singleUnreadId: null };
  const none = renderMy();
  const plain = screen.getAllByRole('link', { name: '선물' });
  expect(plain.map(link => link.getAttribute('href'))).toEqual(['/my/gifts?locale=ko', '/my/gifts?locale=ko']);
  expect(document.querySelector('[data-gift-glow]')).toBeNull();
  none.unmount();
  data.gifts = { unreadCount: 2, singleUnreadId: null };
  renderMy();
  const lit = screen.getByRole('link', { name: '선물, 안 읽은 선물 2개' });
  expect(lit.querySelector('[data-gift-glow]')).not.toBeNull();
  expect(lit.compareDocumentPosition(screen.getByRole('link', { name: '알림' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it('shows no notice when there is no gift', () => {
  renderMy();
  expect(screen.queryByRole('heading', { name: '당첨 선물이 도착했어요' })).toBeNull();
});

it('puts every shortcut in one grid', () => {
  renderMy();
  const grid = screen.getByRole('navigation', { name: '바로가기' });
  expect(within(grid).getAllByRole('link').map(link => link.textContent)).toEqual(['내 최애', '활동 내역', '내 응모 내역', '선물', '예약한 LIVE', '신청 내역', '친구와 메시지', '접수한 신고', '문의 내역']);
  expect(within(grid).getByRole('link', { name: '내 응모 내역' })).toHaveAttribute('href', '/my/raffles?locale=ko');
  expect(within(grid).getByRole('link', { name: '내 최애' })).toHaveAttribute('href', '/celebrities?locale=ko');
  expect(grid.querySelectorAll('img[src^="/images/my/shortcuts/"]')).toHaveLength(10);
  // 로그아웃은 같은 목록의 마지막 칸이고, 따로 놓인 로그아웃 줄은 없다.
  const logout = within(grid).getByRole('button', { name: '로그아웃' });
  expect(logout.querySelector('img')).toHaveAttribute('src', '/images/my/shortcuts/logout.webp');
  expect(grid.lastElementChild).toBe(logout);
  expect(screen.getAllByRole('button', { name: '로그아웃' })).toHaveLength(1);
});

