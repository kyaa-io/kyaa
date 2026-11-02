import type { AppLocale } from '@/i18n/locales';
const copy:Record<AppLocale,readonly [string,string,string,string,string]>={
 ko:['아직 대화가 없어요.','입장 조건','팬 인증 완료','{tier} 이상','입장 조건 확인'],
 en:['No messages yet.','Entry requirements','Fan verification completed','{tier} or higher','Check entry requirements'],
 ja:['まだ会話がありません。','入室条件','ファン認証済み','{tier}以上','入室条件を確認'],
 'zh-Hans':['暂无消息。','进入条件','已完成粉丝认证','{tier}及以上','查看进入条件'],
 'zh-Hant':['尚無訊息。','進入條件','已完成粉絲認證','{tier}及以上','查看進入條件'],
 es:['Aún no hay mensajes.','Requisitos de acceso','Verificación de fan completada','{tier} o superior','Ver requisitos'],
 id:['Belum ada pesan.','Syarat masuk','Verifikasi penggemar selesai','{tier} atau lebih tinggi','Lihat syarat masuk'],
 vi:['Chưa có tin nhắn.','Điều kiện vào phòng','Đã xác minh người hâm mộ','Từ {tier} trở lên','Xem điều kiện'],
 th:['ยังไม่มีข้อความ','เงื่อนไขเข้าห้อง','ยืนยันแฟนแล้ว','{tier} ขึ้นไป','ดูเงื่อนไขเข้าห้อง'],
 pt:['Ainda não há mensagens.','Requisitos de entrada','Verificação de fã concluída','{tier} ou superior','Ver requisitos'],
 fr:['Aucun message pour le moment.','Conditions d’accès','Vérification fan effectuée','{tier} ou supérieur','Voir les conditions'],
 ru:['Пока нет сообщений.','Условия входа','Проверка фаната пройдена','{tier} и выше','Посмотреть условия'],
};
export function roomEntryCopy(locale:AppLocale){const [empty,title,verified,minimum,check]=copy[locale];return {empty,title,verified,minimum,check};}
