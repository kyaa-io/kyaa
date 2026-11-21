import type { AppLocale } from "@/i18n/locales";

/** 팬페이지 채팅방. 탭 이름, 크리에이터 표시, 입장 알림, 입장 조건, 전송 제한, 접속 표시, 읽은 위치·읽음, 메시지 메뉴, 첨부 제한. */
const keys = ["title", "creator", "entered", "open", "verifiedOnly", "loginOnly", "rateLimited", "online", "unreadLine", "read", "newMessages", "menu", "deleteTitle", "mediaLimit", "uploading"] as const;
const values: Record<AppLocale, readonly string[]> = {
  ko: ["채팅방", "크리에이터", "{name} 입장 중", "채팅방 가기", "팬인증한 팬만 들어올 수 있습니다.", "로그인하면 들어올 수 있습니다.", "잠시 후 다시 보내 주세요.", "접속 중", "여기까지 읽었습니다", "읽음", "새 메시지", "메시지 메뉴", "메시지를 삭제할까요?", "사진은 8MB, 영상은 50MB·60초까지 보낼 수 있습니다.", "올리는 중"],
  en: ["Chat", "Creator", "{name} is here now", "Open chat", "Only verified fans can join.", "Log in to join.", "Please wait a moment before sending again.", "Online", "New messages", "Read", "New messages", "Message menu", "Delete this message?", "Photos up to 8 MB, videos up to 50 MB and 60 seconds.", "Uploading"],
  ja: ["チャット", "クリエイター", "{name}が入場中", "チャットへ", "ファン認証をしたファンだけが参加できます。", "ログインすると参加できます。", "少し待ってから送信してください。", "接続中", "ここまで読みました", "既読", "新しいメッセージ", "メッセージメニュー", "このメッセージを削除しますか？", "写真は8MB、動画は50MB・60秒まで送れます。", "アップロード中"],
  "zh-Hans": ["聊天室", "创作者", "{name} 正在页面中", "去聊天", "仅限已认证粉丝加入。", "登录后即可加入。", "请稍后再发送。", "在线", "以上为已读消息", "已读", "新消息", "消息菜单", "要删除这条消息吗？", "照片最大 8MB，视频最大 50MB、60 秒。", "上传中"],
  "zh-Hant": ["聊天室", "創作者", "{name} 正在頁面中", "去聊天", "僅限已認證粉絲加入。", "登入後即可加入。", "請稍後再傳送。", "在線", "以上為已讀訊息", "已讀", "新訊息", "訊息選單", "要刪除這則訊息嗎？", "照片最大 8MB，影片最大 50MB、60 秒。", "上傳中"],
  es: ["Chat", "Creador", "{name} está aquí", "Abrir chat", "Solo pueden entrar fans verificados.", "Inicia sesión para entrar.", "Espera un momento antes de volver a enviar.", "En línea", "Mensajes nuevos", "Leído", "Mensajes nuevos", "Menú del mensaje", "¿Eliminar este mensaje?", "Fotos de hasta 8 MB; videos de hasta 50 MB y 60 segundos.", "Subiendo"],
  id: ["Obrolan", "Kreator", "{name} sedang di sini", "Buka obrolan", "Hanya penggemar terverifikasi yang bisa masuk.", "Masuk untuk bergabung.", "Tunggu sebentar sebelum mengirim lagi.", "Online", "Pesan baru", "Dibaca", "Pesan baru", "Menu pesan", "Hapus pesan ini?", "Foto maksimal 8 MB; video maksimal 50 MB dan 60 detik.", "Mengunggah"],
  vi: ["Phòng chat", "Nhà sáng tạo", "{name} đang ở đây", "Mở chat", "Chỉ fan đã xác minh mới vào được.", "Đăng nhập để tham gia.", "Vui lòng đợi một chút rồi gửi lại.", "Trực tuyến", "Tin nhắn mới", "Đã đọc", "Tin nhắn mới", "Menu tin nhắn", "Xóa tin nhắn này?", "Ảnh tối đa 8 MB; video tối đa 50 MB và 60 giây.", "Đang tải lên"],
  th: ["แชต", "ครีเอเตอร์", "{name} อยู่ที่นี่", "เปิดแชต", "เฉพาะแฟนที่ยืนยันแล้วเท่านั้นที่เข้าได้", "เข้าสู่ระบบเพื่อเข้าร่วม", "โปรดรอสักครู่แล้วส่งอีกครั้ง", "ออนไลน์", "ข้อความใหม่", "อ่านแล้ว", "ข้อความใหม่", "เมนูข้อความ", "ลบข้อความนี้ไหม", "รูปไม่เกิน 8 MB วิดีโอไม่เกิน 50 MB และ 60 วินาที", "กำลังอัปโหลด"],
  pt: ["Chat", "Criador", "{name} está aqui", "Abrir chat", "Só fãs verificados podem entrar.", "Entre para participar.", "Aguarde um momento antes de enviar de novo.", "Online", "Novas mensagens", "Lida", "Novas mensagens", "Menu da mensagem", "Excluir esta mensagem?", "Fotos de até 8 MB; vídeos de até 50 MB e 60 segundos.", "Enviando"],
  fr: ["Chat", "Créateur", "{name} est là", "Ouvrir le chat", "Réservé aux fans vérifiés.", "Connectez-vous pour participer.", "Patientez un instant avant de renvoyer.", "En ligne", "Nouveaux messages", "Lu", "Nouveaux messages", "Menu du message", "Supprimer ce message ?", "Photos jusqu’à 8 Mo ; vidéos jusqu’à 50 Mo et 60 secondes.", "Envoi en cours"],
  ru: ["Чат", "Автор", "{name} сейчас здесь", "Открыть чат", "Только для подтверждённых фанатов.", "Войдите, чтобы участвовать.", "Подождите немного и отправьте снова.", "Онлайн", "Новые сообщения", "Прочитано", "Новые сообщения", "Меню сообщения", "Удалить это сообщение?", "Фото до 8 МБ; видео до 50 МБ и 60 секунд.", "Загрузка"],
};

export function chatCopy(locale: AppLocale) {
  return Object.fromEntries(keys.map((key, index) => [key, values[locale][index]])) as Record<(typeof keys)[number], string>;
}
