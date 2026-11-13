import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
vi.mock('@/server/signup-event/local', () => ({ localSignupEnabled: () => true }));
vi.mock('./participation', () => {
  const Null = () => null;
  return { RaffleProvider: ({ children }: { children: ReactNode }) => children, RaffleEnterBlock: Null, RaffleBoostAction: Null, RaffleInvitedFriends: Null, RaffleMoreAction: Null, RaffleStickyCta: Null, RaffleShare: Null, RaffleCountdown: Null, RaffleOdds: Null };
});
vi.mock('@/features/raffle-cards/card-float', () => ({ RaffleCardFloat: () => null }));
vi.mock('@/components/fan-shell/fan-app-shell', () => ({ FanAppFrame: ({ children }: { children: ReactNode }) => children }));
import Page from './page';
it('matches approved prizes, steps and date without unconfirmed time or rewards', async () => {
  const view = render(await Page({ searchParams: Promise.resolve({ locale: 'ko' }) }));
  // v5.1: 키 비주얼 제목이 무슨 이벤트인지 말한다(사용자 2026-11-13 "상단에 신규 가입 이벤트")
  expect(screen.getByRole('heading', { level: 1, name: 'KYAA 래플 신규 가입 이벤트' })).toBeTruthy();
  for (const text of ['US$400', '총 17명', '11월 10일 ~ 11월 30일', 'Visa 기프트카드', '참여 방법', '필수', 'US$100', 'US$50', 'US$25', 'US$10', '1명', '2명', '4명', '10명', '응모 및 당첨 안내', '하루 최대 3회', '당첨 확률 올리기', '선택']) expect(screen.getAllByText(text).length).toBeGreaterThan(0);
  expect(screen.queryByText(/버튼 한 번이면 끝|팬 신분증|응모는 한 번|당첨 기회가 1번씩/)).toBeNull();
  expect(screen.queryByText(/상품 확정 전|당첨 기회 올리기/)).toBeNull();
  expect(screen.getAllByText('신규 가입 이벤트')).toHaveLength(1);
  expect(screen.queryByText(/Amazon/)).toBeNull();
  // v5: 총액·총인원은 히어로에 한 번씩만(경품 구역에서 반복하지 않는다)
  expect(screen.getAllByText('US$400')).toHaveLength(1);
  expect(screen.getAllByText('총 17명')).toHaveLength(1);
  expect(screen.queryByText('총 US$400')).toBeNull();
  // v5.2: 총액·무엇을·몇 명·기간이 키 비주얼 한 덩어리에 있다(화면 결정 "히어로 총 US$400 + 총 17명 + 마감 한 덩어리")
  const hero = view.container.querySelector('header')!;
  for (const text of ['US$400', 'Visa 기프트카드', '총 17명', '11월 10일 ~ 11월 30일']) expect(hero.textContent).toContain(text);
  // 큰 글자 줄 왼쪽 광학 정렬: 키 비주얼에서 줄 머리에 오는 글자 넷
  expect([...hero.querySelectorAll('[data-fan-display-optical]')].map(node => node.textContent)).toEqual(['KYAA 래플', '신규 가입 이벤트', 'US$400', '11월 10일 ~ 11월 30일']);
  // 응모만 필수, 나머지는 기회(사용자 결정 2026-11-13 "여러개하면 래플권 여러개"): 당첨 확률 올리기에 기회가 붙는 행동 전부와 그 값
  const bonus = view.container.querySelector('[data-block="raffle-bonus"]')!;
  expect([...bonus.querySelectorAll('[data-row="raffle-bonus"]')].map(row => `${row.getAttribute('data-kind')} ${row.querySelector('[data-raffle-plus]')?.textContent}`)).toEqual(['passport +1', 'community +1', 'comment +1', 'attend +1', 'invite +3']);
  expect([...bonus.querySelectorAll('[data-fan-activity-stamp]')].map(node => node.getAttribute('data-fan-activity-stamp'))).toEqual(['passport', 'community', 'comment', 'attendance', 'invite']);
  for (const text of ['커뮤니티 가입', '내 링크로 가입·응모한 친구 1명마다(인원 제한 없음)']) expect(bonus.textContent).toContain(text);
  expect(bonus.querySelectorAll('[data-row="raffle-bonus"]')[0]!.textContent).toContain('한 번');
  // 같은 숫자 두 번 금지: 더 즐기기에는 +값이 없다
  const more = view.container.querySelector('[data-block="raffle-more"]')!;
  expect(more.querySelectorAll('[data-raffle-plus]')).toHaveLength(0);
  // 안내 목록: 응모만 하면 추첨 대상, 기회 합산, 친구 초대 무제한
  expect(screen.getByText(/응모만 하면 추첨 대상/)).toBeTruthy();
  expect(screen.getByText(/Fan Passport \+1 \+ 커뮤니티 가입 \+1/)).toBeTruthy();
  expect(screen.getByText(/친구 1명당 당첨 기회 \+3\(인원 제한 없음/)).toBeTruthy();
});
