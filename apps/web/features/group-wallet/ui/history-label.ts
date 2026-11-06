import type {AppLocale} from '@/i18n/locales';
import {capsuleCopy} from '@/features/group-capsule/copy';
import {raffleCopy} from '@/features/group-raffle/copy';
import {groupEarningsCopy} from '@/features/groups/ui/group-earnings-copy';
import {messages as ticketNames} from '@/i18n/catalogs/features__tickets__ui__fan-ticket-history-screen';
import {additionalLocales} from '@/i18n/messages';
import {activityLabel} from '@/features/dukjil-guide/ui/guide-copy';
import type {GuideActivityKey} from '@/features/dukjil-guide/domain/guide-model';
import {walletCopy} from './copy';
/** Detail the history API adds for 덕질 rows: which activity earned the points, and why a correction took them back. */
export type WalletHistoryDetail={actionKey?:string|null;correctionReason?:string|null};
const GUIDE_ACTIVITIES:ReadonlySet<string>=new Set<GuideActivityKey>(['post','comment','reaction','share','invite','quiz','subscription','live_reserve','live_attend','survey','mission','event_checkin','event_review','proof']);
// The invited friend's own reward (dukjil action invite_friend, 100 P when the friend finishes the entry review); the inviter's reward is `invite`.
const invitedFriend:Record<AppLocale,string>={ko:'초대로 가입',en:'Joined by invitation',ja:'招待で参加','zh-Hans':'通过邀请加入','zh-Hant':'透過邀請加入',es:'Unirse por invitación',id:'Bergabung lewat undangan',vi:'Tham gia nhờ lời mời',th:'เข้าร่วมผ่านคำเชิญ',pt:'Entrada por convite',fr:'Inscription sur invitation',ru:'Вступление по приглашению'};
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
 missionDone:{ko:'미션 완료',en:'Mission completed',...additionalLocales(l=>ticketNames.maa10a34c3969[l])},
 journeyDone:{ko:'여정 완료',en:'Journey completed',...additionalLocales(l=>ticketNames.m3f0d9491846e[l])},
 refund:{ko:'응모권 환급',en:'Ticket refund',...additionalLocales(l=>ticketNames.m17cce492b47c[l])},
 certified:{ko:'인증 완료',en:'Verification approved',...additionalLocales(l=>ticketNames.ma46534c28efb[l])},
} satisfies Record<string,Record<AppLocale,string>>;
/** Name of an activity-based row; null while the activity is unknown (older rows, cheer, new keys) so the caller keeps its generic name. */
function activityName(locale:AppLocale,actionKey:string|null|undefined):string|null {
 if(actionKey==='checkin')return walletCopy(locale).attendance;
 if(actionKey==='invite_friend')return invitedFriend[locale];
 return actionKey&&GUIDE_ACTIVITIES.has(actionKey)?activityLabel(locale,actionKey as GuideActivityKey):null;
}
export function walletHistoryLabel(locale:AppLocale,sourceType:string,detail:WalletHistoryDetail={}):string|null {
 if(sourceType==='dukjil_correction'){
  if(detail.correctionReason==='content_hidden')return reclaimed.hidden[locale];
  if(detail.correctionReason==='content_deleted'&&detail.actionKey==='comment')return reclaimed.comment[locale];
  if(detail.correctionReason==='content_deleted'&&detail.actionKey==='post')return reclaimed.post[locale];
  return groupEarningsCopy(locale).statuses.corrected;
 }
 if(sourceType==='dukjil_proof')return activityName(locale,'proof');
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
