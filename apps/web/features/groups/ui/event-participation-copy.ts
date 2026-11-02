import type { AppLocale } from '@/i18n/locales';
export const eventParticipationCopy:Record<AppLocale,readonly [string,string]>={
 ko:['행사 상세','주최'],en:['Event participation','Hosted by'],ja:['イベント参加','主催'],
 'zh-Hans':['活动参与','主办方'],'zh-Hant':['活動參與','主辦單位'],es:['Participación en el evento','Organiza'],
 id:['Partisipasi acara','Penyelenggara'],vi:['Tham gia sự kiện','Đơn vị tổ chức'],th:['เข้าร่วมกิจกรรม','ผู้จัด'],
 pt:['Participação no evento','Organização'],fr:['Participation à l’événement','Organisation'],ru:['Участие в мероприятии','Организатор'],
};

export const eventActionCopy:Record<AppLocale,readonly [string,string,string,string,string,string,string,string,string,string]>={
 ko:['입장할 때','내 티켓을 현장에 보여주세요.','내 QR 티켓 보기','현장에서','현장 미션','현장에 있는 QR을 스캔해요.','현장 QR 스캔','행사 후','후기','함께한 이야기를 남겨요.'],
 en:['At entry','Show your ticket at the venue.','View my QR ticket','At the venue','On-site mission','Scan the QR code at the venue.','Scan venue QR','After the event','Review','Share your experience.'],
 ja:['入場時','会場でチケットを提示してください。','マイQRチケットを見る','会場で','会場ミッション','会場のQRコードを読み取ります。','会場QRを読み取る','イベント後','感想','参加した感想を残しましょう。'],
 'zh-Hans':['入场时','请在现场出示票券。','查看我的二维码票','在现场','现场任务','扫描现场的二维码。','扫描现场二维码','活动后','评价','分享你的活动体验。'],
 'zh-Hant':['入場時','請在現場出示票券。','查看我的QR票券','在現場','現場任務','掃描現場的QR碼。','掃描現場QR碼','活動後','心得','分享你的活動體驗。'],
 es:['Al entrar','Muestra tu entrada en el recinto.','Ver mi entrada QR','En el recinto','Misión presencial','Escanea el QR del recinto.','Escanear QR del recinto','Después del evento','Reseña','Comparte tu experiencia.'],
 id:['Saat masuk','Tunjukkan tiket di lokasi.','Lihat tiket QR saya','Di lokasi','Misi di lokasi','Pindai kode QR di lokasi.','Pindai QR lokasi','Setelah acara','Ulasan','Bagikan pengalamanmu.'],
 vi:['Khi vào cửa','Xuất trình vé tại địa điểm.','Xem vé QR của tôi','Tại địa điểm','Nhiệm vụ tại chỗ','Quét mã QR tại địa điểm.','Quét QR tại chỗ','Sau sự kiện','Đánh giá','Chia sẻ trải nghiệm của bạn.'],
 th:['เมื่อเข้างาน','แสดงบัตรที่สถานที่จัดงาน','ดูบัตร QR ของฉัน','ที่สถานที่จัดงาน','ภารกิจหน้างาน','สแกน QR ที่สถานที่จัดงาน','สแกน QR หน้างาน','หลังงาน','รีวิว','แบ่งปันประสบการณ์ของคุณ'],
 pt:['Na entrada','Mostre seu ingresso no local.','Ver meu ingresso QR','No local','Missão presencial','Leia o QR no local.','Ler QR do local','Após o evento','Avaliação','Compartilhe sua experiência.'],
 fr:['À l’entrée','Présentez votre billet sur place.','Voir mon billet QR','Sur place','Mission sur place','Scannez le QR sur place.','Scanner le QR sur place','Après l’événement','Avis','Partagez votre expérience.'],
 ru:['На входе','Покажите билет на месте.','Открыть мой QR-билет','На месте','Задание на месте','Отсканируйте QR-код на месте.','Сканировать QR-код','После мероприятия','Отзыв','Поделитесь впечатлениями.'],
};

export const eventStateCopy:Record<AppLocale,readonly [string,string,string,string,string,string]>={
 ko:['참가 신청을 확인하고 있어요. 승인 후 티켓이 표시돼요.','행사 신청이 마감되었어요','지금은 이 행사에 신청할 수 없어요.','행사가 취소되었어요','이 행사는 진행되지 않아요.','승인 대기'],
 en:['Your application is being reviewed. Your ticket will appear after approval.','Applications are closed','You can no longer apply for this event.','Event cancelled','This event will not take place.','Awaiting approval'],
 ja:['参加申請を確認中です。承認後にチケットが表示されます。','参加受付は終了しました','現在、このイベントには申し込めません。','イベントは中止されました','このイベントは開催されません。','承認待ち'],
 'zh-Hans':['正在审核你的报名。通过后将显示票券。','报名已截止','现在无法报名此活动。','活动已取消','此活动将不再举行。','等待批准'],
 'zh-Hant':['正在審核你的報名。通過後將顯示票券。','報名已截止','現在無法報名此活動。','活動已取消','此活動將不再舉行。','等待核准'],
 es:['Tu solicitud está en revisión. La entrada aparecerá cuando se apruebe.','Inscripciones cerradas','Ya no puedes inscribirte en este evento.','Evento cancelado','Este evento no se celebrará.','Pendiente de aprobación'],
 id:['Pendaftaranmu sedang ditinjau. Tiket akan muncul setelah disetujui.','Pendaftaran ditutup','Kamu tidak dapat mendaftar acara ini sekarang.','Acara dibatalkan','Acara ini tidak akan berlangsung.','Menunggu persetujuan'],
 vi:['Đơn đăng ký đang được xem xét. Vé sẽ hiển thị sau khi được duyệt.','Đã đóng đăng ký','Bạn không thể đăng ký sự kiện này lúc này.','Sự kiện đã bị hủy','Sự kiện này sẽ không diễn ra.','Chờ phê duyệt'],
 th:['กำลังตรวจสอบคำขอเข้าร่วม บัตรจะแสดงหลังได้รับอนุมัติ','ปิดรับสมัครแล้ว','ไม่สามารถสมัครเข้าร่วมกิจกรรมนี้ได้ในขณะนี้','กิจกรรมถูกยกเลิก','กิจกรรมนี้จะไม่จัดขึ้น','รอการอนุมัติ'],
 pt:['Sua inscrição está em análise. O ingresso aparecerá após a aprovação.','Inscrições encerradas','Não é mais possível se inscrever neste evento.','Evento cancelado','Este evento não será realizado.','Aguardando aprovação'],
 fr:['Votre inscription est en cours d’examen. Le billet apparaîtra après validation.','Inscriptions closes','Vous ne pouvez plus vous inscrire à cet événement.','Événement annulé','Cet événement n’aura pas lieu.','En attente de validation'],
 ru:['Ваша заявка рассматривается. Билет появится после одобрения.','Приём заявок закрыт','На это мероприятие больше нельзя подать заявку.','Мероприятие отменено','Это мероприятие не состоится.','Ожидает одобрения'],
};

export const eventCheckInCopy:Record<AppLocale,readonly [string,string,string]>={
 ko:['현장 참여 완료','체크인이 완료됐어요. 현장 미션을 확인해 보세요.','미션 보기'],
 en:['Checked in','You’re checked in. Explore the on-site missions.','View missions'],
 ja:['チェックイン完了','チェックインが完了しました。会場ミッションを確認しましょう。','ミッションを見る'],
 'zh-Hans':['现场签到完成','签到成功。查看现场任务吧。','查看任务'],
 'zh-Hant':['現場報到完成','已完成報到。查看現場任務吧。','查看任務'],
 es:['Registro de llegada completado','Ya has registrado tu llegada. Consulta las misiones presenciales.','Ver misiones'],
 id:['Check-in selesai','Kamu sudah check-in. Lihat misi di lokasi.','Lihat misi'],
 vi:['Đã điểm danh tại chỗ','Bạn đã điểm danh. Hãy xem các nhiệm vụ tại chỗ.','Xem nhiệm vụ'],
 th:['เช็กอินเรียบร้อย','เช็กอินแล้ว ดูภารกิจหน้างานได้เลย','ดูภารกิจ'],
 pt:['Check-in concluído','Seu check-in foi concluído. Confira as missões no local.','Ver missões'],
 fr:['Présence confirmée','Votre présence est confirmée. Découvrez les missions sur place.','Voir les missions'],
 ru:['Присутствие подтверждено','Вы отметились на месте. Посмотрите доступные задания.','Посмотреть задания'],
};
