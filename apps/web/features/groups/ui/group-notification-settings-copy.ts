import type {AppLocale} from '@/i18n/locales';
const values:Record<AppLocale,readonly string[]>={
 ko:['모임 알림 설정','설정할 모임','모임 공지 받기','일정·행사 소식 받기','당첨·수령 알림 받기','활동·적립 알림 받기','설정 저장'],
 en:['Group notification settings','Group','Group notices','Schedule and event news','Winner and collection updates','Activity and reward updates','Save settings'],
 ja:['グループ通知設定','設定するグループ','グループのお知らせ','予定・イベント情報','当選・受け取りのお知らせ','活動・ポイント獲得のお知らせ','設定を保存'],
 'zh-Hans':['群组通知设置','选择群组','接收群组公告','接收日程和活动消息','接收中奖和领取通知','接收活动和积分通知','保存设置'],
 'zh-Hant':['群組通知設定','選擇群組','接收群組公告','接收日程和活動消息','接收中獎和領取通知','接收活動和積分通知','儲存設定'],
 es:['Notificaciones del grupo','Grupo','Avisos del grupo','Noticias de agenda y eventos','Avisos de premios y recogida','Avisos de actividad y puntos','Guardar ajustes'],
 id:['Pengaturan notifikasi grup','Grup','Pengumuman grup','Kabar jadwal dan acara','Notifikasi kemenangan dan pengambilan','Notifikasi aktivitas dan poin','Simpan pengaturan'],
 vi:['Cài đặt thông báo nhóm','Nhóm','Thông báo của nhóm','Tin lịch và sự kiện','Thông báo trúng thưởng và nhận quà','Thông báo hoạt động và điểm','Lưu cài đặt'],
 th:['การตั้งค่าการแจ้งเตือนกลุ่ม','กลุ่ม','ประกาศของกลุ่ม','ข่าวกำหนดการและกิจกรรม','แจ้งผลรางวัลและการรับของ','แจ้งกิจกรรมและคะแนน','บันทึกการตั้งค่า'],
 pt:['Notificações do grupo','Grupo','Avisos do grupo','Agenda e notícias de eventos','Avisos de prémios e recolha','Avisos de atividade e pontos','Guardar definições'],
 fr:['Notifications du groupe','Groupe','Annonces du groupe','Actualités du calendrier et des événements','Gains et retrait des cadeaux','Activité et points gagnés','Enregistrer'],
 ru:['Уведомления группы','Группа','Объявления группы','Расписание и события','Выигрыши и получение подарков','Активность и начисление баллов','Сохранить'],
};
export function groupNotificationSettingsCopy(locale:AppLocale){const [title,page,notices,events,recipients,activity,save]=values[locale];return {title,page,notices,events,recipients,activity,save};}
