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
  summary: null as unknown,
}));
const passportA = '10000000-0000-4000-8000-000000000001';
const passportB = '10000000-0000-4000-8000-000000000002';
const reward = (id: string) => ({ rewardResultId: id, winnerId: null, benefitId: '30000000-0000-4000-8000-000000000001', title: '선물', campaignId: '40000000-0000-4000-8000-000000000001', result: 'not_selected', method: null, status: 'not_selected', enteredTickets: 1, recipientRequired: false, updatedAt: '2026-11-05T00:00:00.000Z', benefitHref: '/benefits/30000000-0000-4000-8000-000000000001' });
const makeSummary = () => ({
  profile: { nickname: '별빛' },
  creators: [
    { celebrity: { slug: 'nchive', name: '엔카이브', image: '/nchive.jpg', isPublic: true }, relationship: 'passport', passport: { id: passportA, tier: 'Silver', score: 15, remainingToNextTier: 35, stageProgress: { policyVersion: 3, current: stage('silver-1', 'Silver', 1, 2, 10), next: stage('silver-2', 'Silver', 2, 3, 50), remaining: 35, progressPercent: 30 } }, ticketBalance: 12, firstReaction: null },
    { celebrity: { slug: 'second', name: '두번째', image: '/second.jpg', isPublic: true }, relationship: 'passport', passport: { id: passportB, tier: 'Bronze', score: 3, remainingToNextTier: 7 }, ticketBalance: 0, firstReaction: null },
    { celebrity: { slug: 'unverified', name: '미인증 최애', image: '/u.jpg', isPublic: true }, relationship: 'first_reaction_only', passport: null, ticketBalance: 0, firstReaction: null },
  ],
  live: { upcoming: [], history: [] },
  rewards: { items: data.rewards, entries: 0, availableCount: 0 },
  collection: { recent: [], stampCount: 0, passportCount: 2, collectibleCount: 0 },
  unreadNotificationCount: 0,
});
vi.mock('@/features/auth/client/cognito-auth', () => ({ useByUsAuth: () => ({ ready: true, authenticated: true, user: { id: 'owner-a' } }) }));
vi.mock('@/components/byus-session-provider', () => ({ useByUsSession: () => ({ ready: true }) }));
vi.mock('@/components/fan-ui/use-owned-fan-resource', () => ({ useOwnedFanResource: () => ({ state: { status: 'ready', data: makeSummary() }, retry: vi.fn() }) }));
vi.mock('@/features/profile/ui/use-avatar', () => ({ useAvatar: () => ({ state: { status: 'loading' } }) }));
vi.mock('@/features/community-stamps/ui/use-community-stamps', () => ({ useCommunityStamps: () => ({ state: { status: 'ready', data: { stamps: [{ id: 'stamp-a', kind: 'welcome', celebritySlug: null, issuedAt: '2026-11-02T00:00:00Z' }] } }, retry: vi.fn() }) }));
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
beforeEach(() => { window.localStorage.clear(); data.wallet = { points: 375, hearts: 4, tickets: 9, pointCost: 100 }; data.rewards = []; });

it('puts the selected passport tier next to the name', () => {
  renderMy();
  const name = screen.getByRole('heading', { level: 1, name: '별빛님' });
  expect(within(name.parentElement as HTMLElement).getByText(/실버|Silver/)).toBeInTheDocument();
});

it('orders the screen profile, notice, passport, wallet, favorites, shortcuts and shows stamps in one place', () => {
  data.rewards = [reward('50000000-0000-4000-8000-000000000001')];
  renderMy();
  const name = screen.getByRole('heading', { level: 1, name: '별빛님' });
  const notice = screen.getByRole('heading', { name: '래플 결과가 발표됐어요' });
  const passport = screen.getByRole('heading', { name: '내 패스포트' });
  const wallet = screen.getByRole('heading', { name: '내 지갑' });
  const favorites = screen.getByRole('heading', { name: '내 최애' });
  const shortcuts = screen.getByRole('heading', { name: '바로가기' });
  [name, notice, passport, wallet, favorites, shortcuts].reduce((previous, current) => { expect(before(previous, current)).toBe(true); return current; });
  expect(screen.queryByRole('heading', { name: '함께 모은 도장' })).toBeNull();
  expect(screen.queryByText('미인증 최애')).toBeNull();
});

it('shows stamp progress and the next tier with earned stamps in colour and the rest locked', () => {
  renderMy();
  const card = screen.getByRole('region', { name: '내 패스포트' });
  expect(within(card).getByText('도장 3/9')).toBeInTheDocument();
  expect(within(card).getByRole('progressbar', { name: '도장 3/9' })).toHaveAttribute('aria-valuenow', '33');
  expect(within(card).getByText('실버 2까지 35점')).toBeInTheDocument();
  expect(within(card).getAllByRole('listitem').filter(item => item.getAttribute('data-state') === 'filled')).toHaveLength(3);
  expect(within(card).getAllByRole('listitem').filter(item => item.getAttribute('data-state') === 'empty')).toHaveLength(6);
  expect(within(card).getByLabelText('출석, 찍힘')).toBeInTheDocument();
  expect(within(card).getAllByLabelText(/아직 안 찍힘/)).toHaveLength(6);
  expect(within(card).getByRole('link', { name: '자세히 보기' })).toHaveAttribute('href', `/passports/${passportA}?locale=ko`);
  expect(card.textContent).not.toMatch(/가입기념/);
});

it('switches the passport card to the other favorite', () => {
  renderMy();
  fireEvent.click(screen.getByRole('button', { name: /두번째/ }));
  const card = screen.getByRole('region', { name: '내 패스포트' });
  expect(within(card).getByText('도장 1/9')).toBeInTheDocument();
  expect(within(card).getByText('실버까지 7점')).toBeInTheDocument();
});

it('uses the same ad-based exchange wording as 덕질 and enables it only when the points cover the rate', () => {
  const { unmount } = renderMy();
  const wallet = screen.getByRole('region', { name: '내 지갑' });
  expect(within(wallet).getByText('375P')).toBeInTheDocument();
  expect(within(wallet).getByText('9장')).toBeInTheDocument();
  expect(within(wallet).getByText('100 P')).toBeInTheDocument();
  expect(within(wallet).getByText('1장')).toBeInTheDocument();
  expect(screen.queryByText('포인트로 교환하기')).toBeNull();
  const exchange = within(wallet).getByRole('button', { name: '광고 보고 교환하기' });
  expect(exchange).toBeEnabled();
  fireEvent.click(exchange);
  expect(screen.getByRole('dialog', { name: '교환' })).toBeInTheDocument();
  unmount();
  data.wallet = { points: 40, hearts: 0, tickets: 0, pointCost: 100 };
  renderMy();
  expect(screen.getByRole('button', { name: '광고 보고 교환하기' })).toBeDisabled();
});

it('puts the raffle result above the passport and hides it once the result is opened, until a new result arrives', () => {
  data.rewards = [reward('50000000-0000-4000-8000-000000000001')];
  const first = renderMy();
  const link = screen.getByRole('link', { name: /내 결과 확인/ });
  expect(link).toHaveAttribute('href', '/my/raffles?locale=ko');
  fireEvent.click(link);
  expect(screen.queryByRole('heading', { name: '래플 결과가 발표됐어요' })).toBeNull();
  first.unmount();
  renderMy();
  expect(screen.queryByRole('heading', { name: '래플 결과가 발표됐어요' })).toBeNull();
  cleanupAndRerender();
});
function cleanupAndRerender() {
  data.rewards = [reward('50000000-0000-4000-8000-000000000001'), reward('50000000-0000-4000-8000-000000000002')];
  document.body.innerHTML = '';
  renderMy();
  expect(screen.getByRole('heading', { name: '래플 결과가 발표됐어요' })).toBeInTheDocument();
}

it('shows no notice when there is no result', () => {
  renderMy();
  expect(screen.queryByRole('heading', { name: '래플 결과가 발표됐어요' })).toBeNull();
});

it('adds streak and stamp progress to each favorite with a fan page link', () => {
  renderMy();
  const favorites = screen.getByRole('region', { name: '내 최애' });
  expect(within(favorites).getByText('연속 3일 · 도장 3/9')).toBeInTheDocument();
  expect(within(favorites).getByText('도장 1/9')).toBeInTheDocument();
  expect(within(favorites).getAllByRole('link', { name: '팬페이지 보기' })[0]).toHaveAttribute('href', '/nchive?locale=ko');
});

it('puts the four frequent shortcuts in a grid and the rest in a list', () => {
  renderMy();
  const grid = screen.getByRole('navigation', { name: '바로가기' });
  expect(within(grid).getAllByRole('link').map(link => link.textContent)).toEqual(['활동 내역', '내 응모 내역', '받은 혜택', '예약한 LIVE']);
  expect(within(grid).getByRole('link', { name: '내 응모 내역' })).toHaveAttribute('href', '/my/raffles?locale=ko');
  const rest = screen.getByRole('navigation', { name: '그 밖의 바로가기' });
  expect(within(rest).getAllByRole('link').map(link => link.textContent)).toEqual(['신청 내역', '친구와 메시지', '접수한 신고', '문의 내역']);
});

it.each([['en', 'View fan page'], ['ru', 'Посмотреть страницу фанатов'], ['ja', 'ファンページを見る']] as const)('names the favorite row link as the fan page action in %s, not as the favorites heading', (locale, label) => {
  renderMy(locale);
  expect(screen.getAllByRole('link', { name: label })[0]).toHaveAttribute('href', '/nchive?locale=' + locale);
});
