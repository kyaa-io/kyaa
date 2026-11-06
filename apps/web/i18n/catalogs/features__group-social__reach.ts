import type { TranslatedMessage } from "../messages";

export const messages = {
  "notEligible": {
    "ja": "同じページに参加したファンや友だちに送れます",
    "zh-Hans": "可以发送给加入同一页面的粉丝或好友",
    "zh-Hant": "可以傳送給加入同一頁面的粉絲或好友",
    "es": "Puedes escribir a amigos y fans de la misma página",
    "id": "Kamu bisa mengirim ke teman dan penggemar di halaman yang sama",
    "vi": "Bạn có thể nhắn cho bạn bè và fan cùng trang",
    "th": "ส่งได้ถึงเพื่อนและแฟนที่เข้าร่วมเพจเดียวกัน",
    "pt": "Você pode enviar para amigos e fãs da mesma página",
    "fr": "Vous pouvez écrire aux amis et aux fans de la même page",
    "ru": "Можно писать друзьям и фанатам с той же страницы"
  },
  "recipientOff": {
    "ja": "相手がメッセージをオフにしています",
    "zh-Hans": "对方已关闭消息",
    "zh-Hant": "對方已關閉訊息",
    "es": "Tiene los mensajes desactivados",
    "id": "Dia menonaktifkan pesan",
    "vi": "Người này đã tắt tin nhắn",
    "th": "อีกฝ่ายปิดรับข้อความอยู่",
    "pt": "A pessoa desativou as mensagens",
    "fr": "Cette personne a désactivé les messages",
    "ru": "Этот человек отключил сообщения"
  },
  "friendsOnly": {
    "ja": "友だちからの申請のみ受け付けています",
    "zh-Hans": "只接受好友的消息申请",
    "zh-Hant": "只接受好友的訊息申請",
    "es": "Solo acepta solicitudes de amigos",
    "id": "Hanya menerima permintaan dari teman",
    "vi": "Chỉ nhận yêu cầu từ bạn bè",
    "th": "รับคำขอจากเพื่อนเท่านั้น",
    "pt": "Só aceita solicitações de amigos",
    "fr": "N’accepte que les demandes de ses amis",
    "ru": "Принимает запросы только от друзей"
  },
  "limit": {
    "ja": "今日送れる申請をすべて使いました",
    "zh-Hans": "今天的消息申请已用完",
    "zh-Hant": "今天的訊息申請已用完",
    "es": "Ya usaste las solicitudes de hoy",
    "id": "Permintaan hari ini sudah habis",
    "vi": "Bạn đã dùng hết yêu cầu hôm nay",
    "th": "ใช้คำขอของวันนี้ครบแล้ว",
    "pt": "Você já usou as solicitações de hoje",
    "fr": "Vous avez utilisé vos demandes du jour",
    "ru": "Запросы на сегодня закончились"
  },
  "pending": {
    "ja": "相手の承認を待っています",
    "zh-Hans": "正在等待对方接受",
    "zh-Hant": "正在等待對方接受",
    "es": "Esperando a que acepte",
    "id": "Menunggu dia menerima",
    "vi": "Đang chờ người này chấp nhận",
    "th": "กำลังรออีกฝ่ายตอบรับ",
    "pt": "Aguardando a pessoa aceitar",
    "fr": "En attente de son acceptation",
    "ru": "Ждём, пока примут запрос"
  },
  "retryLater": {
    "ja": "まだ再度申請できません",
    "zh-Hans": "暂时还不能再次申请",
    "zh-Hant": "暫時還不能再次申請",
    "es": "Aún no puedes volver a pedirlo",
    "id": "Belum bisa meminta lagi",
    "vi": "Bạn chưa thể yêu cầu lại",
    "th": "ยังขอใหม่ไม่ได้",
    "pt": "Você ainda não pode pedir de novo",
    "fr": "Vous ne pouvez pas encore redemander",
    "ru": "Повторный запрос пока недоступен"
  },
  "expand": {
    "ja": "全画面で見る",
    "zh-Hans": "全屏查看",
    "zh-Hant": "全螢幕檢視",
    "es": "Ver en pantalla completa",
    "id": "Buka layar penuh",
    "vi": "Xem toàn màn hình",
    "th": "ดูแบบเต็มหน้าจอ",
    "pt": "Abrir em tela cheia",
    "fr": "Ouvrir en plein écran",
    "ru": "Открыть на весь экран"
  },
  "myRank": {
    "ja": "自分の順位",
    "zh-Hans": "我的排名",
    "zh-Hant": "我的排名",
    "es": "Mi posición",
    "id": "Peringkatku",
    "vi": "Thứ hạng của tôi",
    "th": "อันดับของฉัน",
    "pt": "Minha posição",
    "fr": "Mon rang",
    "ru": "Моё место"
  },
  "acceptFriend": {
    "ja": "友だち申請を承認",
    "zh-Hans": "接受好友申请",
    "zh-Hant": "接受好友邀請",
    "es": "Aceptar solicitud de amistad",
    "id": "Terima permintaan pertemanan",
    "vi": "Chấp nhận lời mời kết bạn",
    "th": "ยอมรับคำขอเป็นเพื่อน",
    "pt": "Aceitar pedido de amizade",
    "fr": "Accepter la demande d’ami",
    "ru": "Принять запрос в друзья"
  }
} as const satisfies Record<string, TranslatedMessage>;
