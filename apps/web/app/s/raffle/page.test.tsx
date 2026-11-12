import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
vi.mock('@/server/signup-event/local', () => ({ localSignupEnabled: () => true }));
vi.mock('./participation', () => {
  const Null = () => null;
  return { RaffleProvider: ({ children }: { children: ReactNode }) => children, RaffleHeroAction: Null, RaffleStatus: Null, RaffleStepAction: Null, RaffleStickyCta: Null, RaffleShare: Null };
});
vi.mock('@/components/fan-shell/fan-app-shell', () => ({ FanAppFrame: ({ children }: { children: ReactNode }) => children }));
import Page from './page';
it('matches approved prizes, steps and date without unconfirmed time or rewards', async () => {
  render(await Page({ searchParams: Promise.resolve({ locale: 'ko' }) }));
  expect(screen.getByRole('heading', { level: 1, name: 'KYAA 래플' })).toBeTruthy();
  for (const text of ['US$400', '17명 · 11월 30일 마감', 'US$100', 'US$50', 'US$25', 'US$10', '1명', '2명', '4명', '10명']) expect(screen.getAllByText(text).length).toBeGreaterThan(0);
  expect(screen.getByText('Fan Passport를 받으세요.')).toBeTruthy();
  expect(screen.queryByText(/신규 가입|상품 확정 전/)).toBeNull();
});
