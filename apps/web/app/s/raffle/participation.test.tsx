import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('@/features/auth/client/cognito-auth', () => ({ useByUsAuth: () => ({ authenticated: false, ready: true, login: vi.fn(), getAccessToken: vi.fn() }) }));
import { RaffleCountdown, RaffleEnterBlock, RaffleProvider, raffleCountdown } from './participation';

const closesAt = Date.parse('2026-11-30T23:59:59.999+09:00'), now = Date.parse('2026-11-13T02:00:00+09:00');
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); });
afterEach(() => { vi.useRealTimers(); });

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
