/** Local event policy. No wallet debit and no production activation. */
export const signupEvent = {
  id: 'signup-20261111',
  startsAt: '2026-11-10T15:00:00.000Z',
  endsAtExclusive: '2026-11-24T15:00:00.000Z',
  prize: '상품 확정 전',
} as const;

export function isSignupEventEligible(createdAt: string): boolean {
  const time = Date.parse(createdAt);
  return time >= Date.parse(signupEvent.startsAt) && time < Date.parse(signupEvent.endsAtExclusive);
}
