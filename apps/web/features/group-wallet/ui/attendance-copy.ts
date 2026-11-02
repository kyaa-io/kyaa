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
