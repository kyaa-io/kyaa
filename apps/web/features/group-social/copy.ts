import type { AppLocale } from "@/i18n/locales";
const labels={
 ko:['친구·메시지','아직 표시할 친구가 없어요.','친구 해제','차단','공개 프로필','대화 요청 허용','친구에게만','메시지 받지 않기','내 메시지','프로필','대화 요청','메시지를 보낼 수 없어요.'],
 en:['Friends & messages','No friends to show yet.','Unfriend','Block','Public profile','Allow message requests','Friends only','No messages','My message','Profile','Message request','You cannot send messages.'],
 ja:['友だち・メッセージ','表示する友だちはまだいません。','友だち解除','ブロック','公開プロフィール','メッセージ申請を許可','友だちのみ','メッセージを受け取らない','自分のメッセージ','プロフィール','メッセージ申請','メッセージを送れません。'],
 'zh-Hans':['好友与消息','暂无可显示的好友。','解除好友','屏蔽','公开个人资料','允许消息申请','仅好友','不接收消息','我的消息','个人资料','消息申请','无法发送消息。'],
 'zh-Hant':['好友與訊息','暫無可顯示的好友。','解除好友','封鎖','公開個人資料','允許訊息申請','僅好友','不接收訊息','我的訊息','個人資料','訊息申請','無法傳送訊息。'],
 es:['Amigos y mensajes','Aún no hay amigos.','Eliminar amistad','Bloquear','Perfil público','Permitir solicitudes','Solo amigos','No recibir mensajes','Mi mensaje','Perfil','Solicitud de mensaje','No puedes enviar mensajes.'],
 id:['Teman dan pesan','Belum ada teman.','Hapus pertemanan','Blokir','Profil publik','Izinkan permintaan pesan','Hanya teman','Tidak menerima pesan','Pesan saya','Profil','Permintaan pesan','Anda tidak dapat mengirim pesan.'],
 vi:['Bạn bè và tin nhắn','Chưa có bạn bè.','Hủy kết bạn','Chặn','Hồ sơ công khai','Cho phép yêu cầu nhắn tin','Chỉ bạn bè','Không nhận tin nhắn','Tin nhắn của tôi','Hồ sơ','Yêu cầu nhắn tin','Bạn không thể gửi tin nhắn.'],
 th:['เพื่อนและข้อความ','ยังไม่มีเพื่อน','เลิกเป็นเพื่อน','บล็อก','โปรไฟล์สาธารณะ','อนุญาตคำขอข้อความ','เฉพาะเพื่อน','ไม่รับข้อความ','ข้อความของฉัน','โปรไฟล์','คำขอข้อความ','คุณไม่สามารถส่งข้อความได้'],
 pt:['Amigos e mensagens','Ainda não há amigos.','Desfazer amizade','Bloquear','Perfil público','Permitir solicitações','Somente amigos','Não receber mensagens','Minha mensagem','Perfil','Solicitação de mensagem','Você não pode enviar mensagens.'],
 fr:['Amis et messages','Aucun ami à afficher.','Retirer des amis','Bloquer','Profil public','Autoriser les demandes','Amis uniquement','Aucun message','Mon message','Profil','Demande de message','Vous ne pouvez pas envoyer de messages.'],
 ru:['Друзья и сообщения','Друзей пока нет.','Удалить из друзей','Заблокировать','Открытый профиль','Разрешить запросы сообщений','Только друзья','Не получать сообщения','Моё сообщение','Профиль','Запрос сообщения','Вы не можете отправить сообщение.'],
} satisfies Record<AppLocale,string[]>;
const keys=['title','empty','unfriend','block','publicProfile','requests','friends','none','mine','profile','messageRequest','cannotSend'] as const;
export const socialCopy=(locale:AppLocale)=>Object.fromEntries(keys.map((k,i)=>[k,labels[locale][i]])) as Record<typeof keys[number],string>;

export const incomingMessageRequest:Record<AppLocale,string>={ko:'받은 대화 요청',en:'Incoming message request',ja:'受信したメッセージ申請','zh-Hans':'收到的消息申请','zh-Hant':'收到的訊息申請',es:'Solicitud de mensaje recibida',id:'Permintaan pesan masuk',vi:'Yêu cầu nhắn tin đã nhận',th:'คำขอข้อความที่ได้รับ',pt:'Solicitação de mensagem recebida',fr:'Demande de message reçue',ru:'Входящий запрос сообщения'};
