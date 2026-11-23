import { expect, it } from 'vitest';
import { signupRaffleText } from '@/i18n/catalogs/signup-raffle';

it('says "1 winner" for the single US$100 prize and keeps the plural elsewhere', () => {
  expect(signupRaffleText('en', 'prizeCount', 1)).toBe('1 winner');
  expect(signupRaffleText('en', 'prizeCount', 2)).toBe('2 winners');
  expect(signupRaffleText('ko', 'prizeCount', 1)).toBe('1명');
  expect(signupRaffleText('es', 'prizeCount', 1)).toBe('1 ganador');
  expect(signupRaffleText('es', 'prizeCount', 10)).toBe('10 ganadores');
});
