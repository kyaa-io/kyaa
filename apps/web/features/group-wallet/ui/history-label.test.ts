import {readdirSync,readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {expect,it} from 'vitest';
import {APP_LOCALES} from '@/i18n/locales';
import {walletHistoryLabel} from './history-label';
it('labels known ledger reasons in every locale without inventing an unknown reason',()=>{
 const knownSources = [
  'activity','benefit_entry','benefit_entry_refund','correction','dukjil_action','dukjil_correction','dukjil_proof',
  'exchange','fan_activity_reward','fan_point_exchange','group_raffle_refund','journey_completion','live_attendance',
  'live_participation','live_reservation','manual_certification','mission_completion','passport_verification','support','group_support',
 ];
 // Include literal producer kinds automatically so a new wallet write cannot silently ship without copy.
 const migrations = resolve(process.cwd(), '../../supabase/migrations');
 for (const file of readdirSync(migrations).filter(file=>file.endsWith('.sql'))) {
  const sql = readFileSync(join(migrations,file),'utf8');
  for (const match of sql.matchAll(/group_wallet_post\([^;]*?,\s*'(?:fan_point|ticket|support_voucher)'\s*,[^;]*?,\s*'([a-z_]+)'\s*,/g)) {
   knownSources.push(match[1]);
  }
 }
 expect(knownSources).toContain('chemi_reward');
 for(const locale of APP_LOCALES)for(const source of new Set(knownSources)){
  expect(walletHistoryLabel(locale,source)?.trim(),`${locale}: ${source}`).toBeTruthy();
 }
 expect(walletHistoryLabel('ko','chemi_reward')).toBe('케미 게임 보상');
 expect(walletHistoryLabel('ko','group_raffle_refund')).toBe('응모권 환급');
 expect(walletHistoryLabel('ko','passport_verification')).toBe('팬 인증');
 expect(walletHistoryLabel('ko','group_mission')).toBe('덕질 참여');
 expect(walletHistoryLabel('ko','dukjil_action')).toBe('활동 참여');
 expect(walletHistoryLabel('ko','live_participation')).toBe('활동 참여');
 expect(walletHistoryLabel('ko','unknown_legacy_source')).toBeNull();
});

const ACTIONS = ['post','comment','reaction','share','invite','quiz','subscription','live_reserve','live_attend','survey','mission','event_checkin','event_review','proof'] as const;
it('names a dukjil row after its real activity in every locale, each activity distinct from the generic name',()=>{
 for(const locale of APP_LOCALES){
  const generic=walletHistoryLabel(locale,'dukjil_action');
  const seen=new Set<string>();
  for(const actionKey of ACTIONS){
   const label=walletHistoryLabel(locale,'dukjil_action',{actionKey});
   expect(label,`${locale}:${actionKey}`).toBeTruthy();expect(label).not.toBe(generic);seen.add(label!);
  }
  expect(seen.size,`${locale} distinct`).toBeGreaterThanOrEqual(12);
 }
 expect(walletHistoryLabel('ko','dukjil_action',{actionKey:'post'})).toBe('글 쓰기');
 expect(walletHistoryLabel('ko','dukjil_action',{actionKey:'reaction'})).toBe('공감 누르기');
 expect(walletHistoryLabel('ko','dukjil_action',{actionKey:'quiz'})).toBe('입국 심사 퀴즈');
 expect(walletHistoryLabel('ko','dukjil_action',{actionKey:'checkin'})).toBe('출석체크');
 expect(walletHistoryLabel('en','dukjil_action',{actionKey:'comment'})).toBe('Comment');
 expect(walletHistoryLabel('ko','dukjil_proof')).toBe(walletHistoryLabel('ko','dukjil_action',{actionKey:'proof'}));
});
it('keeps the generic name when the activity is unknown (older rows, a tier bonus without its tier, unknown keys)',()=>{
 expect(walletHistoryLabel('ko','dukjil_action',{actionKey:null})).toBe('활동 참여');
 expect(walletHistoryLabel('ko','dukjil_action',{actionKey:'tier_bonus'})).toBe('활동 참여');
 expect(walletHistoryLabel('ko','dukjil_action',{actionKey:'something_new'})).toBe('활동 참여');
 expect(walletHistoryLabel('ko','live_participation')).toBe('활동 참여');
});
it('names a point-correction row by why it was reclaimed, in every locale',()=>{
 for(const locale of APP_LOCALES){
  const labels=[
   walletHistoryLabel(locale,'dukjil_correction',{actionKey:'post',correctionReason:'content_deleted'}),
   walletHistoryLabel(locale,'dukjil_correction',{actionKey:'comment',correctionReason:'content_deleted'}),
   walletHistoryLabel(locale,'dukjil_correction',{actionKey:'post',correctionReason:'content_hidden'}),
   walletHistoryLabel(locale,'dukjil_correction',{actionKey:null,correctionReason:'other'}),
  ];
  for(const label of labels)expect(label,locale).toBeTruthy();
  expect(new Set(labels).size,`${locale} distinct`).toBe(4);
 }
 expect(walletHistoryLabel('ko','dukjil_correction',{actionKey:'post',correctionReason:'content_deleted'})).toBe('글 삭제로 회수');
 expect(walletHistoryLabel('ko','dukjil_correction',{actionKey:'comment',correctionReason:'content_deleted'})).toBe('댓글 삭제로 회수');
 expect(walletHistoryLabel('ko','dukjil_correction',{actionKey:'post',correctionReason:'content_hidden'})).toBe('숨김 처리로 회수');
 expect(walletHistoryLabel('ko','dukjil_correction')).toBe('적립 정정');
});

it('names the invited friend\'s own reward (invite_friend) differently from the inviter\'s invite, in every locale',()=>{
 const seen=new Set<string>();
 for(const locale of APP_LOCALES){
  const friend=walletHistoryLabel(locale,'dukjil_action',{actionKey:'invite_friend'});
  expect(friend,locale).toBeTruthy();expect(friend).not.toBe(walletHistoryLabel(locale,'dukjil_action'));expect(friend).not.toBe(walletHistoryLabel(locale,'dukjil_action',{actionKey:'invite'}));
  seen.add(friend!);
 }
 expect(seen.size).toBeGreaterThanOrEqual(11);
 expect(walletHistoryLabel('ko','dukjil_action',{actionKey:'invite_friend'})).toBe('초대로 가입');
 expect(walletHistoryLabel('ko','dukjil_action',{actionKey:'invite'})).toBe('친구 초대');
});

it('names a check-in row after its fan page when the history carries it (F5), and keeps 출석체크 on an older database',()=>{
 expect(walletHistoryLabel('ko','dukjil_action',{actionKey:'checkin',pageName:'이퓨'})).toBe('이퓨 출석체크');
 expect(walletHistoryLabel('en','dukjil_action',{actionKey:'checkin',pageName:'Elina'})).toBe('Elina check-in');
 expect(walletHistoryLabel('ko','dukjil_action',{actionKey:'checkin',pageName:null})).toBe('출석체크');
 expect(walletHistoryLabel('ko','dukjil_action',{actionKey:'checkin'})).toBe('출석체크');
 expect(walletHistoryLabel('ko','dukjil_action',{actionKey:'post',pageName:'이퓨'})).toBe('글 쓰기');
 for(const locale of APP_LOCALES)expect(walletHistoryLabel(locale,'dukjil_action',{actionKey:'checkin',pageName:'P'}),locale).toContain('P');
});
it('names the B3 payouts and the repost take-back, in every locale',()=>{
 expect(walletHistoryLabel('ko','dukjil_action',{actionKey:'cheer'})).toBe('오늘 응원');
 expect(walletHistoryLabel('ko','dukjil_action',{actionKey:'insta_repost'})).toBe('인스타 리포스트');
 expect(walletHistoryLabel('ko','dukjil_action',{actionKey:'tier_bonus',tier:'Gold'})).toBe('골드 달성 보너스');
 expect(walletHistoryLabel('en','dukjil_action',{actionKey:'tier_bonus',tier:'Platinum'})).toBe('Platinum tier bonus');
 expect(walletHistoryLabel('ko','dukjil_correction',{actionKey:'insta_repost',correctionReason:'insta_repost_revoked'})).toBe('리포스트 회수');
 for(const locale of APP_LOCALES){
  const labels=[walletHistoryLabel(locale,'dukjil_action',{actionKey:'cheer'}),walletHistoryLabel(locale,'dukjil_action',{actionKey:'insta_repost'}),
   walletHistoryLabel(locale,'dukjil_action',{actionKey:'tier_bonus',tier:'Silver'}),walletHistoryLabel(locale,'dukjil_correction',{correctionReason:'insta_repost_revoked'})];
  expect(labels.every(label=>typeof label==='string'&&label.length>0)).toBe(true);
  expect(new Set(labels).size).toBe(4);
 }
});
it('names the four social rewards in every locale',()=>{
 expect(['friend_add','chat','comment_like','comment_reply','ad_click'].map(actionKey=>walletHistoryLabel('ko','dukjil_action',{actionKey}))).toEqual(['친구 추가','대화','댓글 좋아요','답글','광고 클릭']);
 for(const locale of APP_LOCALES)for(const actionKey of ['friend_add','chat','comment_like','comment_reply','ad_click'])expect(walletHistoryLabel(locale,'dukjil_action',{actionKey}),locale).toBeTruthy();
});
