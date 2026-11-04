import type { AppLocale } from '@/i18n/locales';
const copy: Record<AppLocale, readonly [string,string,string,string,string]> = {
 ko:['도장 하나, 오늘의 기록','매일 출석하면 10P','이번 출석 기록','받은 포인트','출석 도장'],
 en:['A stamp for today','Check in daily for 10P','Check-in record','Points earned','Check-in stamps'],
 ja:['スタンプで残す今日の記録','毎日の出席で10P','出席記録','獲得ポイント','出席スタンプ'],
 'zh-Hans':['用印章记录今天','每天签到得10P','签到记录','已获积分','签到印章'],
 'zh-Hant':['用印章記錄今天','每天簽到得10P','簽到記錄','已獲積分','簽到印章'],
 es:['Un sello para hoy','10P por registrarte cada día','Registro de asistencia','Puntos obtenidos','Sellos de asistencia'],
 id:['Stempel untuk hari ini','Check-in setiap hari untuk 10P','Catatan check-in','Poin diperoleh','Stempel presensi'],
 vi:['Một dấu cho hôm nay','Điểm danh mỗi ngày nhận 10P','Lịch sử điểm danh','Điểm đã nhận','Dấu điểm danh'],
 th:['ตราประทับบันทึกวันนี้','เช็กอินทุกวันรับ 10P','ประวัติเช็กอิน','คะแนนที่ได้รับ','ตราเช็กอิน'],
 pt:['Um carimbo para hoje','10P por check-in diário','Registro de presença','Pontos recebidos','Carimbos de presença'],
 fr:['Un tampon pour aujourd’hui','10P par présence quotidienne','Historique de présence','Points gagnés','Tampons de présence'],
 ru:['Штамп за сегодня','10P за ежедневное посещение','История посещений','Получено баллов','Штампы посещений'],
};
export function attendanceCopy(locale: AppLocale) { const [title,daily,record,earned,stamps]=copy[locale]; return {title,daily,record,earned,stamps}; }
const firstStamp: Record<AppLocale,string> = {ko:'오늘 첫 도장을 찍어요',en:'Get your first stamp today',ja:'今日、最初のスタンプを押しましょう','zh-Hans':'今天盖下第一枚印章','zh-Hant':'今天蓋下第一枚印章',es:'Consigue tu primer sello hoy',id:'Dapatkan stempel pertamamu hari ini',vi:'Nhận dấu đầu tiên hôm nay',th:'รับตราประทับแรกวันนี้',pt:'Ganhe seu primeiro carimbo hoje',fr:'Obtenez votre premier tampon aujourd’hui',ru:'Получите первый штамп сегодня'};
export function attendanceFirstStampLabel(locale: AppLocale) { return firstStamp[locale]; }
const recordLink: Record<AppLocale,string> = {ko:'내 출석 기록 보기',en:'View my check-in record',ja:'出席記録を見る','zh-Hans':'查看签到记录','zh-Hant':'查看簽到記錄',es:'Ver mi registro de asistencia',id:'Lihat catatan check-in',vi:'Xem lịch sử điểm danh',th:'ดูประวัติเช็กอิน',pt:'Ver o meu registo de presença',fr:'Voir mon historique de présence',ru:'Моя история посещений'};
export function attendanceRecordLabel(locale: AppLocale) { return recordLink[locale]; }
const pendingTitle: Record<AppLocale,string> = {ko:'요청을 확인하고 있어요',en:'Checking your request',ja:'リクエストを確認しています','zh-Hans':'正在确认请求','zh-Hant':'正在確認請求',es:'Comprobando tu solicitud',id:'Memeriksa permintaanmu',vi:'Đang kiểm tra yêu cầu',th:'กำลังตรวจสอบคำขอ',pt:'A verificar o seu pedido',fr:'Vérification de votre demande',ru:'Проверяем ваш запрос'};
export function walletPendingTitle(locale: AppLocale) { return pendingTitle[locale]; }
