import type {AppLocale} from '@/i18n/locales';
const values:Record<AppLocale,readonly [string,string,string,string,string,string,string]>={
 ko:['일정 취소','취소 사유','참여자가 확인할 수 있는 사유를 입력해 주세요.','취소 전 참가 신청·예약 처리와 알림 범위를 확인해야 합니다. 확정 전 지급·환불을 약속하지 않습니다.','일정 취소 확인','연결할 적립 활동','연결 안 함'],
 en:['Cancel event','Cancellation reason','Enter a reason participants can read.','Before cancelling, check participation, reservations and notification scope. Payments or refunds are not promised before confirmation.','Confirm event cancellation','Linked reward mission','No linked mission'],
 ja:['イベント中止','中止理由','参加者に表示する理由を入力してください。','中止前に参加申請・予約の扱いと通知範囲を確認してください。確定前に支払いや返金は約束しません。','イベント中止を確認','連携するポイントミッション','連携なし'],
 'zh-Hans':['取消活动','取消原因','请输入参与者可查看的原因。','取消前请确认报名、预约处理和通知范围。确认前不承诺付款或退款。','确认取消活动','关联积分任务','不关联'],
 'zh-Hant':['取消活動','取消原因','請輸入參與者可查看的原因。','取消前請確認報名、預約處理和通知範圍。確認前不承諾付款或退款。','確認取消活動','關聯點數任務','不關聯'],
 es:['Cancelar evento','Motivo de cancelación','Indica un motivo que puedan leer los participantes.','Antes de cancelar, comprueba las inscripciones, reservas y notificaciones. No se prometen pagos ni reembolsos antes de la confirmación.','Confirmar cancelación','Misión de puntos vinculada','Sin vincular'],
 id:['Batalkan acara','Alasan pembatalan','Masukkan alasan yang dapat dibaca peserta.','Sebelum membatalkan, periksa pendaftaran, reservasi, dan cakupan notifikasi. Pembayaran atau pengembalian dana tidak dijanjikan sebelum konfirmasi.','Konfirmasi pembatalan','Misi poin terkait','Tidak ditautkan'],
 vi:['Hủy sự kiện','Lý do hủy','Nhập lý do để người tham gia xem.','Trước khi hủy, kiểm tra đăng ký, đặt chỗ và phạm vi thông báo. Không hứa thanh toán hoặc hoàn tiền trước khi xác nhận.','Xác nhận hủy sự kiện','Nhiệm vụ điểm liên kết','Không liên kết'],
 th:['ยกเลิกกิจกรรม','เหตุผลการยกเลิก','ระบุเหตุผลที่ผู้เข้าร่วมสามารถอ่านได้','ก่อนยกเลิก ให้ตรวจสอบการสมัคร การจอง และขอบเขตการแจ้งเตือน ไม่มีการรับรองการจ่ายเงินหรือคืนเงินก่อนยืนยัน','ยืนยันการยกเลิก','ภารกิจคะแนนที่เชื่อมโยง','ไม่เชื่อมโยง'],
 pt:['Cancelar evento','Motivo do cancelamento','Informe um motivo que os participantes possam ler.','Antes de cancelar, confira inscrições, reservas e notificações. Não há promessa de pagamentos ou reembolsos antes da confirmação.','Confirmar cancelamento','Missão de pontos vinculada','Sem vínculo'],
 fr:['Annuler l’événement','Motif d’annulation','Indiquez un motif visible par les participants.','Avant d’annuler, vérifiez les inscriptions, réservations et notifications. Aucun paiement ni remboursement n’est promis avant confirmation.','Confirmer l’annulation','Mission de points liée','Aucun lien'],
 ru:['Отменить событие','Причина отмены','Укажите причину, которую увидят участники.','Перед отменой проверьте заявки, бронирования и уведомления. Выплаты или возвраты не обещаются до подтверждения.','Подтвердить отмену','Связанная миссия с баллами','Без связи'],
};
export function eventSourceCopy(locale:AppLocale){const [cancelTitle,reason,reasonPlaceholder,policy,cancelConfirm,linkedMission,noMission]=values[locale];return{cancelTitle,reason,reasonPlaceholder,policy,cancelConfirm,linkedMission,noMission};}
