import type { AppLocale } from "@/i18n/locales";
const labels={
 ko:['친구·메시지','아직 표시할 친구가 없어요.','친구 해제','차단','대화 요청 허용','친구에게만','메시지 받지 않기','내 메시지','프로필','대화 요청','메시지를 보낼 수 없어요.'],
 en:['Friends & messages','No friends to show yet.','Unfriend','Block','Allow message requests','Friends only','No messages','My message','Profile','Message request','You cannot send messages.'],
 ja:['友だち・メッセージ','表示する友だちはまだいません。','友だち解除','ブロック','メッセージ申請を許可','友だちのみ','メッセージを受け取らない','自分のメッセージ','プロフィール','メッセージ申請','メッセージを送れません。'],
 'zh-Hans':['好友与消息','暂无可显示的好友。','解除好友','屏蔽','允许消息申请','仅好友','不接收消息','我的消息','个人资料','消息申请','无法发送消息。'],
 'zh-Hant':['好友與訊息','暫無可顯示的好友。','解除好友','封鎖','允許訊息申請','僅好友','不接收訊息','我的訊息','個人資料','訊息申請','無法傳送訊息。'],
 es:['Amigos y mensajes','Aún no hay amigos.','Eliminar amistad','Bloquear','Permitir solicitudes','Solo amigos','No recibir mensajes','Mi mensaje','Perfil','Solicitud de mensaje','No puedes enviar mensajes.'],
 id:['Teman dan pesan','Belum ada teman.','Hapus pertemanan','Blokir','Izinkan permintaan pesan','Hanya teman','Tidak menerima pesan','Pesan saya','Profil','Permintaan pesan','Anda tidak dapat mengirim pesan.'],
 vi:['Bạn bè và tin nhắn','Chưa có bạn bè.','Hủy kết bạn','Chặn','Cho phép yêu cầu nhắn tin','Chỉ bạn bè','Không nhận tin nhắn','Tin nhắn của tôi','Hồ sơ','Yêu cầu nhắn tin','Bạn không thể gửi tin nhắn.'],
 th:['เพื่อนและข้อความ','ยังไม่มีเพื่อน','เลิกเป็นเพื่อน','บล็อก','อนุญาตคำขอข้อความ','เฉพาะเพื่อน','ไม่รับข้อความ','ข้อความของฉัน','โปรไฟล์','คำขอข้อความ','คุณไม่สามารถส่งข้อความได้'],
 pt:['Amigos e mensagens','Ainda não há amigos.','Desfazer amizade','Bloquear','Permitir solicitações','Somente amigos','Não receber mensagens','Minha mensagem','Perfil','Solicitação de mensagem','Você não pode enviar mensagens.'],
 fr:['Amis et messages','Aucun ami à afficher.','Retirer des amis','Bloquer','Autoriser les demandes','Amis uniquement','Aucun message','Mon message','Profil','Demande de message','Vous ne pouvez pas envoyer de messages.'],
 ru:['Друзья и сообщения','Друзей пока нет.','Удалить из друзей','Заблокировать','Разрешить запросы сообщений','Только друзья','Не получать сообщения','Моё сообщение','Профиль','Запрос сообщения','Вы не можете отправить сообщение.'],
} satisfies Record<AppLocale,string[]>;
const keys=['title','empty','unfriend','block','requests','friends','none','mine','profile','messageRequest','cannotSend'] as const;
export const socialCopy=(locale:AppLocale)=>Object.fromEntries(keys.map((k,i)=>[k,labels[locale][i]])) as Record<typeof keys[number],string>;

export const incomingMessageRequest:Record<AppLocale,string>={ko:'받은 대화 요청',en:'Incoming message request',ja:'受信したメッセージ申請','zh-Hans':'收到的消息申请','zh-Hant':'收到的訊息申請',es:'Solicitud de mensaje recibida',id:'Permintaan pesan masuk',vi:'Yêu cầu nhắn tin đã nhận',th:'คำขอข้อความที่ได้รับ',pt:'Solicitação de mensagem recebida',fr:'Demande de message reçue',ru:'Входящий запрос сообщения'};

export const recentConversationCopy:Record<AppLocale,string>={ko:'최근 대화',en:'Recent conversations',ja:'最近の会話','zh-Hans':'最近对话','zh-Hant':'最近對話',es:'Conversaciones recientes',id:'Percakapan terbaru',vi:'Trò chuyện gần đây',th:'การสนทนาล่าสุด',pt:'Conversas recentes',fr:'Conversations récentes',ru:'Недавние разговоры'};

export const socialNavigationCopy:Record<AppLocale,readonly [string,string,string]>={ko:['설정','받은 요청','보낸 요청'],en:['Settings','Received','Sent'],ja:['設定','受信申請','送信申請'],'zh-Hans':['设置','收到申请','发出申请'],'zh-Hant':['設定','收到邀請','送出邀請'],es:['Ajustes','Recibidas','Enviadas'],id:['Pengaturan','Diterima','Dikirim'],vi:['Cài đặt','Đã nhận','Đã gửi'],th:['ตั้งค่า','ได้รับ','ส่งแล้ว'],pt:['Configurações','Recebidas','Enviadas'],fr:['Paramètres','Reçues','Envoyées'],ru:['Настройки','Входящие','Отправленные']};

export const socialSaveCopy:Record<AppLocale,string>={ko:'설정 저장',en:'Save settings',ja:'設定を保存','zh-Hans':'保存设置','zh-Hant':'儲存設定',es:'Guardar ajustes',id:'Simpan pengaturan',vi:'Lưu cài đặt',th:'บันทึกการตั้งค่า',pt:'Salvar configurações',fr:'Enregistrer les paramètres',ru:'Сохранить настройки'};

