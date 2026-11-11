import { expect, it } from 'vitest';
import { isSignupEventEligible } from './signup-event';
it('uses the inclusive KST signup dates', () => {
  expect(isSignupEventEligible('2026-11-10T14:59:59Z')).toBe(false);
  expect(isSignupEventEligible('2026-11-10T15:00:00Z')).toBe(true);
  expect(isSignupEventEligible('2026-11-24T14:59:59Z')).toBe(true);
  expect(isSignupEventEligible('2026-11-24T15:00:00Z')).toBe(false);
  expect(isSignupEventEligible('invalid')).toBe(false);
});
