import type {AppLocale} from '@/i18n/locales';
const values:Record<AppLocale,readonly string[]>={
 ko:['모임 알림 설정','설정할 모임','모임 공지 받기','일정·행사 소식 받기','당첨·수령 알림 받기','활동·적립 알림 받기','설정 저장','알림 설정을 저장하지 못했어요. 선택한 내용은 유지돼요.','다시 저장'],
 en:['Group notification settings','Group','Group notices','Schedule and event news','Winner and collection updates','Activity and reward updates','Save settings','Could not save notification settings. Your choices are kept.','Save again'],
 ja:['グループ通知設定','設定するグループ','グループのお知らせ','予定・イベント情報','当選・受け取りのお知らせ','活動・ポイント獲得のお知らせ','設定を保存','通知設定を保存できませんでした。選択内容は保持されています。','再保存'],
 'zh-Hans':['群组通知设置','选择群组','接收群组公告','接收日程和活动消息','接收中奖和领取通知','接收活动和积分通知','保存设置','未能保存通知设置。已保留您的选择。','重新保存'],
 'zh-Hant':['群組通知設定','選擇群組','接收群組公告','接收日程和活動消息','接收中獎和領取通知','接收活動和積分通知','儲存設定','未能儲存通知設定。已保留您的選擇。','重新儲存'],
 es:['Notificaciones del grupo','Grupo','Avisos del grupo','Noticias de agenda y eventos','Avisos de premios y recogida','Avisos de actividad y puntos','Guardar ajustes','No se pudieron guardar los ajustes. Se conservan tus opciones.','Guardar de nuevo'],
 id:['Pengaturan notifikasi grup','Grup','Pengumuman grup','Kabar jadwal dan acara','Notifikasi kemenangan dan pengambilan','Notifikasi aktivitas dan poin','Simpan pengaturan','Pengaturan gagal disimpan. Pilihan Anda tetap tersimpan.','Simpan lagi'],
 vi:['Cài đặt thông báo nhóm','Nhóm','Thông báo của nhóm','Tin lịch và sự kiện','Thông báo trúng thưởng và nhận quà','Thông báo hoạt động và điểm','Lưu cài đặt','Không thể lưu cài đặt. Lựa chọn của bạn được giữ lại.','Lưu lại'],
 th:['การตั้งค่าการแจ้งเตือนกลุ่ม','กลุ่ม','ประกาศของกลุ่ม','ข่าวกำหนดการและกิจกรรม','แจ้งผลรางวัลและการรับของ','แจ้งกิจกรรมและคะแนน','บันทึกการตั้งค่า','บันทึกการตั้งค่าไม่สำเร็จ ตัวเลือกของคุณยังคงอยู่','บันทึกอีกครั้ง'],
 pt:['Notificações do grupo','Grupo','Avisos do grupo','Agenda e notícias de eventos','Avisos de prémios e recolha','Avisos de atividade e pontos','Guardar definições','Não foi possível guardar. As suas escolhas foram mantidas.','Guardar novamente'],
 fr:['Notifications du groupe','Groupe','Annonces du groupe','Actualités du calendrier et des événements','Gains et retrait des cadeaux','Activité et points gagnés','Enregistrer','Impossible d’enregistrer. Vos choix sont conservés.','Réenregistrer'],
 ru:['Уведомления группы','Группа','Объявления группы','Расписание и события','Выигрыши и получение подарков','Активность и начисление баллов','Сохранить','Не удалось сохранить настройки. Ваш выбор сохранён.','Сохранить снова'],
};
export function groupNotificationSettingsCopy(locale:AppLocale){const [title,page,notices,events,recipients,activity,save,saveFailed,retrySave]=values[locale];return {title,page,notices,events,recipients,activity,save,saveFailed,retrySave};}
