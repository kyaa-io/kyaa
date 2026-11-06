import type {AppLocale} from '@/i18n/locales';
export const eventApprovalCopy:Record<AppLocale,{pending:string;rejected:string;reason:string;notFound:string}>={
 ko:{pending:'승인 대기',rejected:'반려됨',reason:'반려 사유',notFound:'행사를 찾을 수 없어요'},
 en:{pending:'Awaiting approval',rejected:'Rejected',reason:'Reason for rejection',notFound:'Event not found'},
 ja:{pending:'承認待ち',rejected:'差し戻し',reason:'差し戻しの理由',notFound:'イベントが見つかりません'},
 'zh-Hans':{pending:'等待审核',rejected:'未通过',reason:'未通过原因',notFound:'找不到活动'},
 'zh-Hant':{pending:'等待審核',rejected:'未通過',reason:'未通過原因',notFound:'找不到活動'},
 es:{pending:'Pendiente de aprobación',rejected:'Rechazado',reason:'Motivo del rechazo',notFound:'No se encontró el evento'},
 id:{pending:'Menunggu persetujuan',rejected:'Ditolak',reason:'Alasan penolakan',notFound:'Acara tidak ditemukan'},
 vi:{pending:'Đang chờ duyệt',rejected:'Bị từ chối',reason:'Lý do từ chối',notFound:'Không tìm thấy sự kiện'},
 th:{pending:'รอการอนุมัติ',rejected:'ไม่อนุมัติ',reason:'เหตุผลที่ไม่อนุมัติ',notFound:'ไม่พบกิจกรรม'},
 pt:{pending:'Aguardando aprovação',rejected:'Recusado',reason:'Motivo da recusa',notFound:'Evento não encontrado'},
 fr:{pending:'En attente d’approbation',rejected:'Refusé',reason:'Motif du refus',notFound:'Événement introuvable'},
 ru:{pending:'Ожидает одобрения',rejected:'Отклонено',reason:'Причина отказа',notFound:'Событие не найдено'},
};
// Older receipts carry no status: those events were approved before this field existed.
export const isEventOpen=(event:{approvalStatus?:'pending'|'approved'|'rejected'})=>(event.approvalStatus??'approved')==='approved';
export function EventApprovalStatus({locale,status,reason}:{locale:AppLocale;status?:'pending'|'approved'|'rejected';reason?:string|null}){
 const copy=eventApprovalCopy[locale];
 if(status==='pending')return <p data-event-approval='pending'>{copy.pending}</p>;
 if(status!=='rejected')return null;
 return <><p data-event-approval='rejected'>{copy.rejected}</p>{reason&&<dl data-event-approval-reason style={{margin:0}}><dt>{copy.reason}</dt><dd style={{margin:0,overflowWrap:'anywhere'}}>{reason}</dd></dl>}</>;
}
