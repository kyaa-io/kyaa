import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
vi.mock('@/server/signup-event/local', () => ({ localSignupEnabled: () => true }));
vi.mock('./participation', () => {
  const Null = () => null;
  return { RaffleProvider: ({ children }: { children: ReactNode }) => children, RaffleHeroAction: Null, RaffleBoostActions: Null, RaffleMoreAction: Null, RaffleTicket: Null, RaffleStickyCta: Null, RaffleShare: Null };
});
vi.mock('@/components/fan-shell/fan-app-shell', () => ({ FanAppFrame: ({ children }: { children: ReactNode }) => children }));
import Page from './page';
it('matches approved prizes, steps and date without unconfirmed time or rewards', async () => {
  render(await Page({ searchParams: Promise.resolve({ locale: 'ko' }) }));
  expect(screen.getByRole('heading', { level: 1, name: 'KYAA 래플' })).toBeTruthy();
  for (const text of ['US$400', '총 17명', '11월 30일 23:59 마감', 'Amazon 기프트카드', 'US$100', 'US$50', 'US$25', 'US$10', '1명', '2명', '4명', '10명', '1인 1응모', '응모 및 당첨 안내', '각각 하루 최대 3번']) expect(screen.getAllByText(text).length).toBeGreaterThan(0);
  expect(screen.queryByText(/버튼 한 번이면 끝|팬 신분증/)).toBeNull();
  expect(screen.queryByText(/신규 가입|상품 확정 전/)).toBeNull();
});
