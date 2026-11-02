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

export const roomMessageLabel:Record<AppLocale,string>={ko:'메시지',en:'Message',ja:'メッセージ','zh-Hans':'消息','zh-Hant':'訊息',es:'Mensaje',id:'Pesan',vi:'Tin nhắn',th:'ข้อความ',pt:'Mensagem',fr:'Message',ru:'Сообщение'};

export const roomContextCopy:Record<AppLocale,readonly [string,string]>={ko:['참여 회원','인증 아티스트'],en:['Participants','Verified artist'],ja:['参加メンバー','認証済みアーティスト'],'zh-Hans':['参与成员','已认证艺人'],'zh-Hant':['參與成員','已認證藝人'],es:['Participantes','Artista verificado'],id:['Peserta','Artis terverifikasi'],vi:['Thành viên tham gia','Nghệ sĩ đã xác minh'],th:['สมาชิกที่เข้าร่วม','ศิลปินที่ยืนยันแล้ว'],pt:['Participantes','Artista verificado'],fr:['Participants','Artiste vérifié'],ru:['Участники','Подтверждённый артист']};

const roomList:Record<AppLocale,readonly [string,string,string]>={ko:['방을 선택해 대화를 이어가세요.','대화 보기','방 열기'],en:['Choose a room to continue chatting.','View conversation','Open room'],ja:['ルームを選んで会話を続けましょう。','会話を見る','ルームを開く'],'zh-Hans':['选择房间继续聊天。','查看对话','打开房间'],'zh-Hant':['選擇房間繼續聊天。','查看對話','開啟房間'],es:['Elige una sala para seguir conversando.','Ver conversación','Abrir sala'],id:['Pilih ruang untuk melanjutkan percakapan.','Lihat percakapan','Buka ruang'],vi:['Chọn phòng để tiếp tục trò chuyện.','Xem trò chuyện','Mở phòng'],th:['เลือกห้องเพื่อสนทนาต่อ','ดูการสนทนา','เปิดห้อง'],pt:['Escolha uma sala para continuar conversando.','Ver conversa','Abrir sala'],fr:['Choisissez un salon pour poursuivre la conversation.','Voir la conversation','Ouvrir le salon'],ru:['Выберите комнату, чтобы продолжить общение.','Посмотреть переписку','Открыть комнату']};
export const roomListCopy=(locale:AppLocale)=>{const [hint,view,open]=roomList[locale];return {hint,view,open};};
