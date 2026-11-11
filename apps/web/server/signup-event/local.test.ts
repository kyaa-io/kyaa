import { describe, it, expect } from 'vitest';
import { candidates, drawLocal, localSignupEnabled, maskedCsv, type LocalSnapshot } from './local';
const a = '00000000-0000-4000-8000-000000000001';
const b = '00000000-0000-4000-8000-000000000002';
const data: LocalSnapshot = { users: [a,b].map(id => ({id,createdAt:'2026-11-11T01:00:00Z'})), actions: [], draftWeights: {'share-click':2,'referral-signup':3,attendance:1,post:1} };
describe('local signup integration', () => {
 it('automatically enrolls once and deduplicates source evidence', () => {
  const action = {userId:a,kind:'attendance' as const,sourceId:'2026-11-11',occurredAt:'2026-11-11T02:00:00Z'};
  expect(candidates({...data,actions:[action,action] })).toEqual([{userId:a,entries:2},{userId:b,entries:1}]);
 });
 it('rejects self referrals and counts each referred signup once', () => {
  const action = {userId:a,kind:'referral-signup' as const,sourceId:'one',occurredAt:'2026-11-11T02:00:00Z',referredUserId:b};
  expect(candidates({...data,actions:[action,{...action,sourceId:'retry'},{...action,referredUserId:a}]} )[0].entries).toBe(4);
 });
 it('draws distinct members with stable retry and masks all identifiers', () => {
  expect(drawLocal(data,2,'retry')).toEqual(drawLocal(data,2,'retry'));
  const csv = maskedCsv(drawLocal(data,2,'retry'));
  expect(csv).not.toContain(a); expect(csv).not.toContain(b);
  expect(() => drawLocal(data,3)).toThrow('INVALID_WINNER_QUANTITY');
 });
 it('stays disabled by default and always in production', () => {
  expect(localSignupEnabled({})).toBe(false);
  expect(localSignupEnabled({NODE_ENV:'production',KYAA_SIGNUP_EVENT_LOCAL:'1'})).toBe(false);
 });
});
