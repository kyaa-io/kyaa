import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
vi.mock('@/server/signup-event/local', () => ({ localSignupEnabled: () => true }));
vi.mock('./participation', () => {
  const Null = () => null;
  return { RaffleProvider: ({ children }: { children: ReactNode }) => children, RaffleEnterBlock: Null, RaffleBoostAction: Null, RaffleMoreAction: Null, RaffleStickyCta: Null, RaffleShare: Null };
});
vi.mock('@/features/raffle-cards/card-float', () => ({ RaffleCardFloat: () => null }));
vi.mock('@/components/fan-shell/fan-app-shell', () => ({ FanAppFrame: ({ children }: { children: ReactNode }) => children }));
import Page from './page';
it('matches approved prizes, steps and date without unconfirmed time or rewards', async () => {
  render(await Page({ searchParams: Promise.resolve({ locale: 'ko' }) }));
  // v5.1: 키 비주얼 제목이 무슨 이벤트인지 말한다(사용자 2026-11-13 "상단에 신규 가입 이벤트")
  expect(screen.getByRole('heading', { level: 1, name: 'KYAA 래플 신규 가입 이벤트' })).toBeTruthy();
  for (const text of ['US$400', '총 17명', '11월 10일 ~ 11월 30일', 'Visa 기프트카드', '참여 방법', '필수', 'US$100', 'US$50', 'US$25', 'US$10', '1명', '2명', '4명', '10명', '응모 및 당첨 안내', '1회당 +1', '하루 최대 3회', '당첨 확률 올리기', '선택']) expect(screen.getAllByText(text).length).toBeGreaterThan(0);
  expect(screen.queryByText(/버튼 한 번이면 끝|팬 신분증|응모는 한 번|당첨 기회가 1번씩/)).toBeNull();
  expect(screen.queryByText(/상품 확정 전|당첨 기회 올리기/)).toBeNull();
  expect(screen.getAllByText('신규 가입 이벤트')).toHaveLength(1);
  expect(screen.queryByText(/Amazon/)).toBeNull();
  // v5: 총액·총인원은 히어로에 한 번씩만(경품 구역에서 반복하지 않는다)
  expect(screen.getAllByText('US$400')).toHaveLength(1);
  expect(screen.getAllByText('총 17명')).toHaveLength(1);
  expect(screen.queryByText('총 US$400')).toBeNull();
});
