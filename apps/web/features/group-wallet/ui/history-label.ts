import type {AppLocale} from '@/i18n/locales';
import {capsuleCopy} from '@/features/group-capsule/copy';
import {raffleCopy} from '@/features/group-raffle/copy';
import {groupEarningsCopy} from '@/features/groups/ui/group-earnings-copy';
import {messages as ticketNames} from '@/i18n/catalogs/features__tickets__ui__fan-ticket-history-screen';
import {additionalLocales} from '@/i18n/messages';
import {activityLabel} from '@/features/dukjil-guide/ui/guide-copy';
import type {GuideActivityKey} from '@/features/dukjil-guide/domain/guide-model';
import {walletCopy} from './copy';
import {dukjilText} from '@/features/dukjil/ui/dukjil-copy';
import {fanTierName} from '@/features/rewards/domain/fan-stage';
/** Detail the history API adds for 덕질 rows: which activity earned the points, and why a correction took them back. */
/** pageName: the fan page of a check-in row (F5), so check-ins on several pages the same day read apart; absent on an older database. */
/** tier: the tier a tier_bonus row was paid for (B3), present on those rows only. */
export type WalletHistoryDetail={actionKey?:string|null;correctionReason?:string|null;pageName?:string|null;tier?:'Silver'|'Gold'|'Platinum'|'Diamond'|null};
const GUIDE_ACTIVITIES:ReadonlySet<string>=new Set<GuideActivityKey>(['post','comment','reaction','share','invite','quiz','subscription','live_reserve','live_attend','survey','mission','event_checkin','event_review','proof']);
// The invited friend's own reward (dukjil action invite_friend, 100 P when the friend finishes the entry review); the inviter's reward is `invite`.
const invitedFriend:Record<AppLocale,string>={ko:'초대로 가입',en:'Joined by invitation',ja:'招待で参加','zh-Hans':'通过邀请加入','zh-Hant':'透過邀請加入',es:'Unirse por invitación',id:'Bergabung lewat undangan',vi:'Tham gia nhờ lời mời',th:'เข้าร่วมผ่านคำเชิญ',pt:'Entrada por convite',fr:'Inscription sur invitation',ru:'Вступление по приглашению'};
// B3 payouts: today's cheer for the favorite, the approved Instagram repost, the tier bonus, and an operator's take-back of a repost.
const b3={
 cheer:{ko:'오늘 응원',en:"Today's cheer",ja:'今日の応援','zh-Hans':'今日应援','zh-Hant':'今日應援',es:'Apoyo de hoy',id:'Dukungan hari ini',vi:'Cổ vũ hôm nay',th:'เชียร์วันนี้',pt:'Apoio de hoje',fr:'Soutien du jour',ru:'Поддержка дня'},
 repost:{ko:'인스타 리포스트',en:'Instagram repost',ja:'インスタのリポスト','zh-Hans':'Instagram 转发','zh-Hant':'Instagram 轉發',es:'Republicación en Instagram',id:'Repost Instagram',vi:'Đăng lại trên Instagram',th:'รีโพสต์ Instagram',pt:'Repost no Instagram',fr:'Republication Instagram',ru:'Репост в Instagram'},
 repostReclaimed:{ko:'리포스트 회수',en:'Reclaimed: repost',ja:'リポストの回収','zh-Hans':'转发奖励已收回','zh-Hant':'轉發獎勵已收回',es:'Retirado: republicación',id:'Ditarik: repost',vi:'Thu hồi: đăng lại',th:'เรียกคืน: รีโพสต์',pt:'Retirado: repost',fr:'Repris : republication',ru:'Возвращено: репост'},
 tierBonus:{ko:(t:string)=>`${t} 달성 보너스`,en:(t:string)=>`${t} tier bonus`,ja:(t:string)=>`${t}達成ボーナス`,'zh-Hans':(t:string)=>`${t}达成奖励`,'zh-Hant':(t:string)=>`${t}達成獎勵`,es:(t:string)=>`Bono por llegar a ${t}`,id:(t:string)=>`Bonus mencapai ${t}`,vi:(t:string)=>`Thưởng đạt hạng ${t}`,th:(t:string)=>`โบนัสถึงระดับ ${t}`,pt:(t:string)=>`Bônus por chegar a ${t}`,fr:(t:string)=>`Bonus niveau ${t}`,ru:(t:string)=>`Бонус за уровень ${t}`},
} satisfies Record<string,Record<AppLocale,string|((tier:string)=>string)>>;
// Reclaimed points after a post/comment is deleted or hidden (dukjil_point_corrections.void_reason content_deleted / content_hidden).
const reclaimed={
 post:{ko:'글 삭제로 회수',en:'Reclaimed: post deleted',ja:'投稿の削除により回収','zh-Hans':'因删除帖子而收回','zh-Hant':'因刪除貼文而收回',es:'Retirado por eliminar la publicación',id:'Ditarik karena postingan dihapus',vi:'Thu hồi do xóa bài viết',th:'ถูกเรียกคืนเพราะลบโพสต์',pt:'Retirado por exclusão da publicação',fr:'Repris suite à la suppression de la publication',ru:'Возвращено из-за удаления публикации'},
 comment:{ko:'댓글 삭제로 회수',en:'Reclaimed: comment deleted',ja:'コメントの削除により回収','zh-Hans':'因删除评论而收回','zh-Hant':'因刪除留言而收回',es:'Retirado por eliminar el comentario',id:'Ditarik karena komentar dihapus',vi:'Thu hồi do xóa bình luận',th:'ถูกเรียกคืนเพราะลบคอมเมนต์',pt:'Retirado por exclusão do comentário',fr:'Repris suite à la suppression du commentaire',ru:'Возвращено из-за удаления комментария'},
 hidden:{ko:'숨김 처리로 회수',en:'Reclaimed: content hidden',ja:'非表示により回収','zh-Hans':'因内容被隐藏而收回','zh-Hant':'因內容被隱藏而收回',es:'Retirado por ocultar el contenido',id:'Ditarik karena konten disembunyikan',vi:'Thu hồi do nội dung bị ẩn',th:'ถูกเรียกคืนเพราะเนื้อหาถูกซ่อน',pt:'Retirado por ocultação do conteúdo',fr:'Repris car le contenu a été masqué',ru:'Возвращено из-за скрытия контента'},
} satisfies Record<string,Record<AppLocale,string>>;
// Same names the ticket history screen already shows for these earning sources (ko/en inline, other locales from its catalog).
const names={
 verification:{ko:'팬 인증',en:'Fan verification',...additionalLocales(l=>ticketNames.mcb885a4cb68b[l])},
 liveReservation:{ko:'LIVE 예약',en:'LIVE reservation',...additionalLocales(l=>ticketNames.m09bcaad5a36b[l])},
 liveAttendance:{ko:'LIVE 출석',en:'LIVE attendance',...additionalLocales(l=>ticketNames.m7ec41b9e944f[l])},
 missionDone:{ko:'덕질 완료',en:'Mission completed',...additionalLocales(l=>ticketNames.maa10a34c3969[l])},
 journeyDone:{ko:'여정 완료',en:'Journey completed',...additionalLocales(l=>ticketNames.m3f0d9491846e[l])},
 refund:{ko:'응모권 환급',en:'Ticket refund',...additionalLocales(l=>ticketNames.m17cce492b47c[l])},
 certified:{ko:'인증 완료',en:'Verification approved',...additionalLocales(l=>ticketNames.ma46534c28efb[l])},
} satisfies Record<string,Record<AppLocale,string>>;
/** Name of an activity-based row; null while the activity is unknown (older rows, cheer, new keys) so the caller keeps its generic name. */
function activityName(locale:AppLocale,actionKey:string|null|undefined):string|null {
 if(actionKey==='checkin')return walletCopy(locale).attendance;
 if(actionKey==='invite_friend')return invitedFriend[locale];
 if(actionKey==='cheer')return b3.cheer[locale];
 if(actionKey==='insta_repost')return b3.repost[locale];
 return actionKey&&GUIDE_ACTIVITIES.has(actionKey)?activityLabel(locale,actionKey as GuideActivityKey):null;
}
export function walletHistoryLabel(locale:AppLocale,sourceType:string,detail:WalletHistoryDetail={}):string|null {
 if(sourceType==='dukjil_correction'){
  if(detail.correctionReason==='insta_repost_revoked')return b3.repostReclaimed[locale];
  if(detail.correctionReason==='content_hidden')return reclaimed.hidden[locale];
  if(detail.correctionReason==='content_deleted'&&detail.actionKey==='comment')return reclaimed.comment[locale];
  if(detail.correctionReason==='content_deleted'&&detail.actionKey==='post')return reclaimed.post[locale];
  return groupEarningsCopy(locale).statuses.corrected;
 }
 if(sourceType==='dukjil_proof')return activityName(locale,'proof');
 if(sourceType==='dukjil_action'&&detail.actionKey==='tier_bonus'&&detail.tier)return b3.tierBonus[locale](fanTierName(locale,detail.tier));
 if(sourceType==='dukjil_action'&&detail.actionKey==='checkin'&&detail.pageName)return dukjilText(locale,'dukjilPageTitle',[detail.pageName]);
 if(sourceType==='dukjil_action'){const named=activityName(locale,detail.actionKey);if(named)return named;}
 if(sourceType==='group_check_in')return walletCopy(locale).attendance;
 if(sourceType==='group_exchange')return walletCopy(locale).exchange;
 if(sourceType==='group_capsule')return capsuleCopy(locale).title;
 if(sourceType==='group_raffle_entry'||sourceType==='benefit_entry')return raffleCopy(locale).enter;
 if(sourceType==='group_raffle_refund'||sourceType==='benefit_entry_refund')return names.refund[locale];
 if(sourceType==='passport_verification')return names.verification[locale];
 if(sourceType==='live_reservation')return names.liveReservation[locale];
 if(sourceType==='live_attendance')return names.liveAttendance[locale];
 if(sourceType==='mission_completion')return names.missionDone[locale];
 if(sourceType==='journey_completion')return names.journeyDone[locale];
 if(sourceType==='manual_certification')return names.certified[locale];
 if(sourceType==='group_mission')return groupEarningsCopy(locale).kinds.mission;
 if(sourceType==='activity'||sourceType==='dukjil_action'||sourceType==='live_participation')return groupEarningsCopy(locale).kinds.activity;
 if(sourceType==='exchange'||sourceType==='fan_point_exchange')return walletCopy(locale).exchange;
 return null;
}
