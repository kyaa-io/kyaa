import type { AppLocale } from '@/i18n/locales';
export const eventParticipationCopy:Record<AppLocale,readonly [string,string]>={
 ko:['행사 참여','주최'],en:['Event participation','Hosted by'],ja:['イベント参加','主催'],
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
