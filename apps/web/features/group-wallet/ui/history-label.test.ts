import {expect,it} from 'vitest';
import {APP_LOCALES} from '@/i18n/locales';
import {walletHistoryLabel} from './history-label';
it('labels known ledger reasons in every locale without inventing an unknown reason',()=>{
 for(const locale of APP_LOCALES)for(const source of ['group_check_in','group_exchange','group_capsule','group_raffle_entry','group_raffle_refund','dukjil_action','group_mission','live_attendance','live_participation','live_reservation','passport_verification','mission_completion','journey_completion','manual_certification','activity','fan_point_exchange'])expect(walletHistoryLabel(locale,source)).toBeTruthy();
 expect(walletHistoryLabel('ko','group_raffle_refund')).toBe('응모권 환급');
 expect(walletHistoryLabel('ko','passport_verification')).toBe('팬 인증');
 expect(walletHistoryLabel('ko','group_mission')).toBe('미션 참여');
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
 expect(walletHistoryLabel('ko','dukjil_proof')).toBe('찐팬 도장 인증');
});
it('keeps the generic name when the activity is unknown (older rows, cheer, unknown keys)',()=>{
 expect(walletHistoryLabel('ko','dukjil_action',{actionKey:null})).toBe('활동 참여');
 expect(walletHistoryLabel('ko','dukjil_action',{actionKey:'cheer'})).toBe('활동 참여');
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
