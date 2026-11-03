"use client";
import {useRef,useState} from 'react';
import {z} from 'zod';
import type {AppLocale} from '@/i18n/locales';
import {groupEventSchema,type GroupEvent} from '@/server/group-activities/domain';
import {FanAction} from '@/components/fan-ui/fan-action';
import {useGroupRequest} from './use-group-resource';
import {groupsCopy} from './copy';
import {managementCopy} from './management-copy';
import {activitiesCopy} from './activities-copy';
import {eventSourceCopy} from "./event-source-copy";
import styles from './group-event-source.module.css';
export const eventSaveReceipt=z.union([z.object({event:groupEventSchema}),z.object({id:z.uuid()})]);
const statuses:Record<AppLocale,readonly [string,string,string,string,string,string,string]>={
 ko:['일정 공개·취소','일정 공개','행사 후기·참여 확인','후기 등록됨','후기 미등록','참석 확인됨','참석 미확인'],
 en:['Publish or cancel event','Publish event','Event review and attendance','Review saved','No review yet','Attendance confirmed','Attendance unconfirmed'],
 ja:['イベント公開・中止','イベントを公開','感想・参加確認','感想登録済み','感想未登録','参加確認済み','参加未確認'],
 'zh-Hans':['活动公开与取消','公开活动','活动评价与出席确认','评价已保存','尚未评价','出席已确认','出席未确认'],
 'zh-Hant':['活動公開與取消','公開活動','活動心得與出席確認','心得已儲存','尚未填寫心得','出席已確認','出席未確認'],
 es:['Publicar o cancelar evento','Publicar evento','Reseña y asistencia','Reseña guardada','Sin reseña','Asistencia confirmada','Asistencia sin confirmar'],
 id:['Terbitkan atau batalkan acara','Terbitkan acara','Ulasan dan kehadiran','Ulasan tersimpan','Belum ada ulasan','Kehadiran dikonfirmasi','Kehadiran belum dikonfirmasi'],
 vi:['Công bố hoặc hủy sự kiện','Công bố sự kiện','Đánh giá và tham dự','Đã lưu đánh giá','Chưa có đánh giá','Đã xác nhận tham dự','Chưa xác nhận tham dự'],
 th:['เผยแพร่หรือยกเลิกกิจกรรม','เผยแพร่กิจกรรม','รีวิวและการเข้าร่วม','บันทึกรีวิวแล้ว','ยังไม่มีรีวิว','ยืนยันการเข้าร่วมแล้ว','ยังไม่ยืนยันการเข้าร่วม'],
 pt:['Publicar ou cancelar evento','Publicar evento','Avaliação e presença','Avaliação salva','Sem avaliação','Presença confirmada','Presença não confirmada'],
 fr:['Publier ou annuler un événement','Publier l’événement','Avis et présence','Avis enregistré','Aucun avis','Présence confirmée','Présence non confirmée'],
 ru:['Опубликовать или отменить событие','Опубликовать событие','Отзыв и посещение','Отзыв сохранён','Отзыв ещё не оставлен','Посещение подтверждено','Посещение не подтверждено'],
};
export function EventLifecyclePanel({pageId,event,locale,onEdit,onSaved}:{pageId:string;event:GroupEvent;locale:AppLocale;onEdit:()=>void;onSaved:()=>void}){
 const auth=useGroupRequest(),t=groupsCopy(locale),c=activitiesCopy(locale),m=managementCopy(locale),copy=statuses[locale],fields=eventSourceCopy(locale);
 const [busy,setBusy]=useState(false),[failed,setFailed]=useState(false),[saved,setSaved]=useState<'published'|'cancelled'|null>(null),[reason,setReason]=useState(event.cancellationReason??''),operation=useRef<{key:string;id:string}|undefined>(undefined);
 async function changeState(state:'published'|'cancelled'){if(busy||saved||(state==='published'&&event.state!=='draft')||(state==='cancelled'&&event.state==='cancelled'))return;
  const input={expectedRevision:event.revision,title:event.title,description:event.description,startsAt:event.startsAt,endsAt:event.endsAt,opensAt:event.opensAt,closesAt:event.closesAt,location:event.location,capacity:event.capacity,requiresApproval:event.requiresApproval,state,...(state==='cancelled'?{cancellationReason:reason}:{})};
  const key=JSON.stringify(input);if(operation.current?.key!==key)operation.current={key,id:crypto.randomUUID()};setBusy(true);setFailed(false);
  try{eventSaveReceipt.parse(await auth.request(`/api/groups/${pageId}/events/${event.id}`,{method:'PATCH',body:JSON.stringify({...input,requestId:operation.current.id})}));operation.current=undefined;setSaved(state);onSaved();}catch{setFailed(true);}finally{setBusy(false);}}
 return <section className={styles.section} data-source-id='JhfMg'><h2>{copy[0]}</h2><div className={styles.row}><h3>{event.title}</h3><p>{saved==='published'?c.published:saved==='cancelled'?fields.cancelTitle:event.state==='draft'?c.draft:event.state==='published'?c.published:event.state==='cancelled'?fields.cancelTitle:c.closed}</p>{event.cancellationReason!=null&&<p data-event-cancellation-reason>{event.cancellationReason}</p>}</div><div className={styles.actions}>{event.state==='draft'&&<FanAction className={styles.primary} variant='primary' ariaBusy={busy} disabled={busy||Boolean(saved)} onClick={()=>void changeState('published')}>{copy[1]}</FanAction>}<FanAction className={styles.editAction} disabled={busy} onClick={onEdit}>{locale==='ko'?'일정 수정':m.manage}</FanAction></div>
 {event.state!=='cancelled'&&<form className={styles.cancelForm} onSubmit={e=>{e.preventDefault();void changeState('cancelled');}}><h3>{fields.cancelTitle}</h3><label>{fields.reason}<textarea value={reason} maxLength={1000} placeholder={fields.reasonPlaceholder} disabled={busy||Boolean(saved)} onChange={e=>setReason(e.target.value)}/></label><p>{fields.policy}</p><FanAction className={styles.cancelAction} type='submit' ariaBusy={busy} disabled={busy||Boolean(saved)}>{fields.cancelConfirm}</FanAction></form>}{failed&&<p role='alert'>{t.error}</p>}</section>;
}
export function EventParticipationSummary({locale,reviewed,checkedIn,canReview,onReview}:{locale:AppLocale;reviewed:boolean;checkedIn:boolean;canReview:boolean;onReview:()=>void}){
 const c=activitiesCopy(locale),m=managementCopy(locale),copy=statuses[locale];
 return <section className={styles.section} data-source-id='nlql7'><h2>{copy[2]}</h2><div className={styles.row}><h3>{reviewed?copy[3]:copy[4]}</h3>{reviewed&&locale==='ko'&&<p>연결된 행사에서 후기를 확인할 수 있어요.</p>}<FanAction className={styles.reviewAction} disabled={!canReview} onClick={onReview}>{reviewed?(locale==='ko'?'후기 수정':m.manage):c.review}</FanAction></div><div className={styles.row}><h3>{checkedIn?copy[5]:copy[6]}</h3></div></section>;
}
