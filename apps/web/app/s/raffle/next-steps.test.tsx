import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { APP_LOCALES } from '@/i18n/locales';
import { raffleNextSteps, raffleNextStepsKeys, raffleNextStepsText } from '@/i18n/catalogs/raffle-next-steps';
import { RaffleNextSteps, raffleOpensAt } from './next-steps';

afterEach(cleanup);
const closesAt = Date.parse('2026-12-13T23:59:59+09:00');
const nextDayAt = Date.parse('2026-11-21T00:00:00+09:00');
const base = {
  locale: 'ko' as const, passport: false, attendedToday: false, closesAt, nextDayAt, dday: 'D-15',
  hrefs: { pick: '/passports?locale=ko', attend: '/pages/groups?locale=ko' },
  invite: { onShare: vi.fn(), disabled: false, label: '초대' }, onStep: vi.fn(),
};

it('writes every key in every one of the 13 app languages', () => {
  for (const locale of APP_LOCALES) for (const key of raffleNextStepsKeys) expect(raffleNextSteps[locale][key].trim(), `${locale}.${key}`).not.toBe('');
  for (const locale of APP_LOCALES) {
    expect(raffleNextSteps[locale].streak, locale).toContain('{n}');
    expect(raffleNextSteps[locale].opens, locale).toContain('{time}');
    expect(raffleNextSteps[locale].inApp, locale).toContain('···');
  }
  expect(raffleNextStepsText('en', 'streak', { n: 3 })).toBe('3-day streak');
});

it('makes the first unfinished step the one primary action and counts finished ones', () => {
  render(<RaffleNextSteps {...base} />);
  const row = (step: string) => document.querySelector(`[data-step="${step}"]`)!;
  expect(document.querySelector('[data-raffle-next-count]')?.textContent).toBe('0/3');
  expect(row('pick').querySelector('a')?.getAttribute('data-fan-action-emphasis')).toBe('primary');
  expect(row('attend').querySelector('a')?.getAttribute('data-fan-action-emphasis')).toBeNull();
  expect(row('invite').querySelector('button')?.getAttribute('data-fan-action-emphasis')).toBeNull();
  expect(row('pick').textContent).toContain('+1');
  expect(row('invite').textContent).toContain('+3');
});

it('checks finished steps, moves the primary action on, and shows the friend line', () => {
  render(<RaffleNextSteps {...base} passport attendedToday friends={2} invite={{ ...base.invite, status: '2명 참여 · 당첨 기회 +6회' }} />);
  expect(document.querySelector('[data-raffle-next-count]')?.textContent).toBe('3/3');
  expect(document.querySelectorAll('[data-done-mark]')).toHaveLength(2);
  expect(document.querySelector('[data-step="pick"] a')).toBeNull();
  expect(document.querySelector('[data-raffle-next-friends]')?.textContent).toBe('2명 참여 · 당첨 기회 +6회');
});

it('promises tomorrow with the streak, the local time it opens and the days left', () => {
  render(<RaffleNextSteps {...base} streak={3} />);
  const tomorrow = document.querySelector('[data-raffle-tomorrow]')!;
  expect(tomorrow.textContent).toContain('내일 출석하면 +1');
  expect(tomorrow.querySelector('[data-raffle-streak="3"]')?.textContent).toBe('3일 연속 출석');
  expect(tomorrow.querySelector('[data-raffle-opens]')?.textContent).toBe(`${raffleOpensAt('ko', nextDayAt)} 열려요`);
  expect(tomorrow.querySelector('[data-raffle-dday]')?.textContent).toBe('D-15');
});

it('leaves out the streak before the first check-in and the whole promise on the last day', () => {
  const view = render(<RaffleNextSteps {...base} streak={0} />);
  expect(view.container.querySelector('[data-raffle-streak]')).toBeNull();
  view.rerender(<RaffleNextSteps {...base} nextDayAt={closesAt + 1000} />);
  expect(view.container.querySelector('[data-raffle-tomorrow]')).toBeNull();
});

it('reports which step was tapped and shares with the invite button', () => {
  const onStep = vi.fn(), onShare = vi.fn();
  render(<RaffleNextSteps {...base} onStep={onStep} invite={{ ...base.invite, onShare }} />);
  fireEvent.click(document.querySelector('[data-step="pick"] a')!);
  fireEvent.click(screen.getByRole('button', { name: '초대' }));
  expect(onStep.mock.calls).toEqual([['pick'], ['invite']]);
  expect(onShare).toHaveBeenCalledTimes(1);
});
