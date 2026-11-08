import {describe,expect,it} from 'vitest';
import {APP_LOCALES} from '@/i18n/locales';
import {rewardedStopMessage,type RewardedStopKind} from './rewarded-copy';
const kinds:RewardedStopKind[]=['incomplete','unavailable','unsupported','unconfigured','failed','dailyLimit','rateLimited','sessionExpired'];
describe('rewardedStopMessage',()=>{
 it('keeps the existing text when nothing was exchanged',()=>{
  expect(rewardedStopMessage('ko','dailyLimit',0)).toBe('오늘은 더 교환할 수 없어요. 포인트는 차감되지 않았어요.');
  expect(rewardedStopMessage('ko','incomplete',0)).toBe('광고 시청이 완료되지 않았어요. 포인트는 차감되지 않았어요.');
 });
 it('drops the deduction sentence at the daily limit once a unit was exchanged',()=>{
  expect(rewardedStopMessage('ko','dailyLimit',2)).toBe('오늘은 더 교환할 수 없어요.');
 });
 it('says only the stopped ad was not charged when an ad stops after an exchange',()=>{
  expect(rewardedStopMessage('ko','incomplete',1)).toBe('광고 시청이 완료되지 않았어요. 멈춘 광고분은 포인트가 차감되지 않았어요.');
  expect(rewardedStopMessage('en','failed',1)).toBe('The ad couldn’t be loaded. No points were deducted for the ad that stopped.');
 });
 it('has a distinct non-empty variant for every locale and kind',()=>{
  for(const l of APP_LOCALES)for(const k of kinds){const m=rewardedStopMessage(l,k,1);expect(m.length).toBeGreaterThan(4);expect(m).not.toBe(rewardedStopMessage(l,k,0));}
 });
});
