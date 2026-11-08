import type { AppLocale } from "@/i18n/locales";
import type { NotificationItem } from "../domain/notification-model";

/** 알림함 패널·`/notifications` 문구(plan-ux r6 6.5). 문장 템플릿은 언어마다 어순이 달라 종류별 전체 문장으로 둔다. */
type Copy = {
  title: string; readAll: string; settings: string; close: string; filter: string;
  chips: { all: string; favorite: string; stamp: string; friend: string; system: string };
  today: string; empty: string; chipEmpty: string; loadError: string; retry: string; readFailed: string;
  action: string; expand: string; collapse: string; unread: (n: number) => string; signIn: string; more: string;
  stampBundle: (n: number) => string; bundle: (title: string, rest: number) => string;
  /** {a} 주체, {t} 대상. 대상이 없으면 `…NoTarget`. */
  said: {
    reply: string; replyNoTarget: string; post: string; postNoTarget: string; reaction: string; reactionNoTarget: string;
    friendRequest: string; dmRequest: string; dm: string; official: string; officialNoTarget: string;
  };
};

const copy: Record<AppLocale, Copy> = {
  ko: {
    title: "알림", readAll: "모두 읽음", settings: "알림 설정", close: "닫기", filter: "알림 종류",
    chips: { all: "전체", favorite: "최애", stamp: "스탬프·포인트", friend: "친구", system: "시스템" },
    today: "오늘", empty: "도착한 알림이 없습니다.", chipEmpty: "이 종류의 알림이 없습니다.", loadError: "알림을 불러오지 못했습니다.", retry: "다시 시도", readFailed: "읽음 표시를 저장하지 못했어요",
    action: "입력", expand: "펼치기", collapse: "접기", unread: (n) => `읽지 않음 ${n}`, signIn: "로그인하면 받은 알림이 여기에 쌓입니다.", more: "더 보기",
    stampBundle: (n) => `스탬프 ${n}개가 발급됐습니다`, bundle: (t, n) => `${t} 외 ${n}개`,
    said: {
      reply: "{a}님이 ‘{t}’에 댓글을 남겼습니다", replyNoTarget: "{a}님이 내 글에 댓글을 남겼습니다",
      post: "{a}님이 ‘{t}’ 글을 올렸습니다", postNoTarget: "{a}님이 새 글을 올렸습니다",
      reaction: "{a}님이 ‘{t}’에 반응했습니다", reactionNoTarget: "{a}님이 내 글에 반응했습니다",
      friendRequest: "{a}님이 친구 요청을 보냈습니다", dmRequest: "{a}님이 메시지 요청을 보냈습니다", dm: "{a}님이 메시지를 보냈습니다",
      official: "{a}님이 ‘{t}’ 소식을 올렸습니다", officialNoTarget: "{a}님이 새 소식을 올렸습니다",
    },
  },
  en: {
    title: "Notifications", readAll: "Mark all read", settings: "Notification settings", close: "Close", filter: "Notification type",
    chips: { all: "All", favorite: "Favorite", stamp: "Stamps & points", friend: "Friends", system: "System" },
    today: "Today", empty: "No notifications yet.", chipEmpty: "No notifications of this type.", loadError: "We couldn't load notifications.", retry: "Try again", readFailed: "Couldn't mark it as read",
    action: "Enter", expand: "Expand", collapse: "Collapse", unread: (n) => `Unread ${n}`, signIn: "Sign in to see your notifications here.", more: "Show more",
    stampBundle: (n) => `You received ${n} stamps`, bundle: (t, n) => `${t} and ${n} more`,
    said: {
      reply: "{a} commented on “{t}”", replyNoTarget: "{a} commented on your post",
      post: "{a} posted “{t}”", postNoTarget: "{a} shared a new post",
      reaction: "{a} reacted to “{t}”", reactionNoTarget: "{a} reacted to your post",
      friendRequest: "{a} sent you a friend request", dmRequest: "{a} sent you a message request", dm: "{a} sent you a message",
      official: "{a} posted the update “{t}”", officialNoTarget: "{a} posted a new update",
    },
  },
  ja: {
    title: "通知", readAll: "すべて既読", settings: "通知設定", close: "閉じる", filter: "通知の種類",
    chips: { all: "すべて", favorite: "推し", stamp: "スタンプ・ポイント", friend: "友達", system: "システム" },
    today: "今日", empty: "通知はまだありません。", chipEmpty: "この種類の通知はありません。", loadError: "通知を読み込めませんでした。", retry: "再試行", readFailed: "既読にできませんでした",
    action: "入力", expand: "開く", collapse: "閉じる", unread: (n) => `未読 ${n}`, signIn: "ログインすると届いた通知がここに表示されます。", more: "もっと見る",
    stampBundle: (n) => `スタンプが${n}個発行されました`, bundle: (t, n) => `${t} ほか${n}件`,
    said: {
      reply: "{a}さんが「{t}」にコメントしました", replyNoTarget: "{a}さんがあなたの投稿にコメントしました",
      post: "{a}さんが「{t}」を投稿しました", postNoTarget: "{a}さんが新しい投稿をしました",
      reaction: "{a}さんが「{t}」に反応しました", reactionNoTarget: "{a}さんがあなたの投稿に反応しました",
      friendRequest: "{a}さんから友達申請が届きました", dmRequest: "{a}さんからメッセージリクエストが届きました", dm: "{a}さんからメッセージが届きました",
      official: "{a}さんがお知らせ「{t}」を投稿しました", officialNoTarget: "{a}さんが新しいお知らせを投稿しました",
    },
  },
  "zh-Hans": {
    title: "通知", readAll: "全部已读", settings: "通知设置", close: "关闭", filter: "通知类型",
    chips: { all: "全部", favorite: "本命", stamp: "印章·积分", friend: "好友", system: "系统" },
    today: "今天", empty: "还没有通知。", chipEmpty: "没有此类通知。", loadError: "无法加载通知。", retry: "重试", readFailed: "未能标记为已读",
    action: "填写", expand: "展开", collapse: "收起", unread: (n) => `未读 ${n}`, signIn: "登录后，收到的通知会显示在这里。", more: "查看更多",
    stampBundle: (n) => `已发放 ${n} 枚印章`, bundle: (t, n) => `${t} 等 ${n} 条`,
    said: {
      reply: "{a} 评论了“{t}”", replyNoTarget: "{a} 评论了你的帖子",
      post: "{a} 发布了“{t}”", postNoTarget: "{a} 发布了新帖子",
      reaction: "{a} 回应了“{t}”", reactionNoTarget: "{a} 回应了你的帖子",
      friendRequest: "{a} 向你发送了好友请求", dmRequest: "{a} 向你发送了消息请求", dm: "{a} 给你发送了消息",
      official: "{a} 发布了动态“{t}”", officialNoTarget: "{a} 发布了新动态",
    },
  },
  "zh-Hant": {
    title: "通知", readAll: "全部已讀", settings: "通知設定", close: "關閉", filter: "通知類型",
    chips: { all: "全部", favorite: "本命", stamp: "印章·點數", friend: "好友", system: "系統" },
    today: "今天", empty: "還沒有通知。", chipEmpty: "沒有此類通知。", loadError: "無法載入通知。", retry: "重試", readFailed: "未能標記為已讀",
    action: "填寫", expand: "展開", collapse: "收合", unread: (n) => `未讀 ${n}`, signIn: "登入後，收到的通知會顯示在這裡。", more: "查看更多",
    stampBundle: (n) => `已發放 ${n} 枚印章`, bundle: (t, n) => `${t} 等 ${n} 則`,
    said: {
      reply: "{a} 留言於「{t}」", replyNoTarget: "{a} 在你的貼文留言",
      post: "{a} 發布了「{t}」", postNoTarget: "{a} 發布了新貼文",
      reaction: "{a} 回應了「{t}」", reactionNoTarget: "{a} 回應了你的貼文",
      friendRequest: "{a} 向你送出好友邀請", dmRequest: "{a} 向你送出訊息請求", dm: "{a} 傳送了訊息給你",
      official: "{a} 發布了消息「{t}」", officialNoTarget: "{a} 發布了新消息",
    },
  },
  es: {
    title: "Notificaciones", readAll: "Marcar todo leído", settings: "Ajustes de notificaciones", close: "Cerrar", filter: "Tipo de notificación",
    chips: { all: "Todo", favorite: "Favorito", stamp: "Sellos y puntos", friend: "Amigos", system: "Sistema" },
    today: "Hoy", empty: "Aún no hay notificaciones.", chipEmpty: "No hay notificaciones de este tipo.", loadError: "No pudimos cargar las notificaciones.", retry: "Reintentar", readFailed: "No se pudo marcar como leída",
    action: "Completar", expand: "Desplegar", collapse: "Contraer", unread: (n) => `Sin leer ${n}`, signIn: "Inicia sesión para ver aquí tus notificaciones.", more: "Ver más",
    stampBundle: (n) => `Recibiste ${n} sellos`, bundle: (t, n) => `${t} y ${n} más`,
    said: {
      reply: "{a} comentó en “{t}”", replyNoTarget: "{a} comentó tu publicación",
      post: "{a} publicó “{t}”", postNoTarget: "{a} hizo una nueva publicación",
      reaction: "{a} reaccionó a “{t}”", reactionNoTarget: "{a} reaccionó a tu publicación",
      friendRequest: "{a} te envió una solicitud de amistad", dmRequest: "{a} te envió una solicitud de mensaje", dm: "{a} te envió un mensaje",
      official: "{a} publicó la noticia “{t}”", officialNoTarget: "{a} publicó una noticia",
    },
  },
  id: {
    title: "Notifikasi", readAll: "Tandai semua dibaca", settings: "Pengaturan notifikasi", close: "Tutup", filter: "Jenis notifikasi",
    chips: { all: "Semua", favorite: "Favorit", stamp: "Stempel & poin", friend: "Teman", system: "Sistem" },
    today: "Hari ini", empty: "Belum ada notifikasi.", chipEmpty: "Tidak ada notifikasi jenis ini.", loadError: "Notifikasi gagal dimuat.", retry: "Coba lagi", readFailed: "Gagal menandai sebagai dibaca",
    action: "Isi", expand: "Buka", collapse: "Tutup", unread: (n) => `Belum dibaca ${n}`, signIn: "Masuk untuk melihat notifikasi Anda di sini.", more: "Lihat lainnya",
    stampBundle: (n) => `${n} stempel diterbitkan`, bundle: (t, n) => `${t} dan ${n} lainnya`,
    said: {
      reply: "{a} mengomentari “{t}”", replyNoTarget: "{a} mengomentari postingan Anda",
      post: "{a} memposting “{t}”", postNoTarget: "{a} membuat postingan baru",
      reaction: "{a} menanggapi “{t}”", reactionNoTarget: "{a} menanggapi postingan Anda",
      friendRequest: "{a} mengirim permintaan pertemanan", dmRequest: "{a} mengirim permintaan pesan", dm: "{a} mengirim pesan",
      official: "{a} memposting kabar “{t}”", officialNoTarget: "{a} memposting kabar baru",
    },
  },
  vi: {
    title: "Thông báo", readAll: "Đánh dấu đã đọc hết", settings: "Cài đặt thông báo", close: "Đóng", filter: "Loại thông báo",
    chips: { all: "Tất cả", favorite: "Yêu thích", stamp: "Tem & điểm", friend: "Bạn bè", system: "Hệ thống" },
    today: "Hôm nay", empty: "Chưa có thông báo.", chipEmpty: "Không có thông báo loại này.", loadError: "Không thể tải thông báo.", retry: "Thử lại", readFailed: "Không thể đánh dấu đã đọc",
    action: "Nhập", expand: "Mở rộng", collapse: "Thu gọn", unread: (n) => `Chưa đọc ${n}`, signIn: "Đăng nhập để xem thông báo của bạn tại đây.", more: "Xem thêm",
    stampBundle: (n) => `Đã cấp ${n} tem`, bundle: (t, n) => `${t} và ${n} thông báo khác`,
    said: {
      reply: "{a} đã bình luận về “{t}”", replyNoTarget: "{a} đã bình luận bài viết của bạn",
      post: "{a} đã đăng “{t}”", postNoTarget: "{a} đã đăng bài mới",
      reaction: "{a} đã bày tỏ cảm xúc với “{t}”", reactionNoTarget: "{a} đã bày tỏ cảm xúc với bài viết của bạn",
      friendRequest: "{a} đã gửi lời mời kết bạn", dmRequest: "{a} đã gửi yêu cầu nhắn tin", dm: "{a} đã gửi tin nhắn cho bạn",
      official: "{a} đã đăng tin “{t}”", officialNoTarget: "{a} đã đăng tin mới",
    },
  },
  th: {
    title: "การแจ้งเตือน", readAll: "อ่านทั้งหมด", settings: "ตั้งค่าการแจ้งเตือน", close: "ปิด", filter: "ประเภทการแจ้งเตือน",
    chips: { all: "ทั้งหมด", favorite: "เมนของฉัน", stamp: "แสตมป์·พอยต์", friend: "เพื่อน", system: "ระบบ" },
    today: "วันนี้", empty: "ยังไม่มีการแจ้งเตือน", chipEmpty: "ไม่มีการแจ้งเตือนประเภทนี้", loadError: "โหลดการแจ้งเตือนไม่ได้", retry: "ลองอีกครั้ง", readFailed: "ทำเครื่องหมายว่าอ่านแล้วไม่ได้",
    action: "กรอก", expand: "ขยาย", collapse: "ย่อ", unread: (n) => `ยังไม่อ่าน ${n}`, signIn: "เข้าสู่ระบบเพื่อดูการแจ้งเตือนของคุณที่นี่", more: "ดูเพิ่ม",
    stampBundle: (n) => `ได้รับแสตมป์ ${n} ดวง`, bundle: (t, n) => `${t} และอีก ${n} รายการ`,
    said: {
      reply: "{a} แสดงความคิดเห็นใน “{t}”", replyNoTarget: "{a} แสดงความคิดเห็นในโพสต์ของคุณ",
      post: "{a} โพสต์ “{t}”", postNoTarget: "{a} โพสต์ใหม่",
      reaction: "{a} แสดงความรู้สึกต่อ “{t}”", reactionNoTarget: "{a} แสดงความรู้สึกต่อโพสต์ของคุณ",
      friendRequest: "{a} ส่งคำขอเป็นเพื่อน", dmRequest: "{a} ส่งคำขอส่งข้อความ", dm: "{a} ส่งข้อความถึงคุณ",
      official: "{a} โพสต์ข่าว “{t}”", officialNoTarget: "{a} โพสต์ข่าวใหม่",
    },
  },
  pt: {
    title: "Notificações", readAll: "Marcar tudo como lido", settings: "Configurações de notificação", close: "Fechar", filter: "Tipo de notificação",
    chips: { all: "Tudo", favorite: "Favorito", stamp: "Selos e pontos", friend: "Amigos", system: "Sistema" },
    today: "Hoje", empty: "Ainda não há notificações.", chipEmpty: "Não há notificações deste tipo.", loadError: "Não foi possível carregar as notificações.", retry: "Tentar novamente", readFailed: "Não foi possível marcar como lida",
    action: "Preencher", expand: "Expandir", collapse: "Recolher", unread: (n) => `Não lidas ${n}`, signIn: "Entre para ver suas notificações aqui.", more: "Ver mais",
    stampBundle: (n) => `Você recebeu ${n} selos`, bundle: (t, n) => `${t} e mais ${n}`,
    said: {
      reply: "{a} comentou em “{t}”", replyNoTarget: "{a} comentou na sua publicação",
      post: "{a} publicou “{t}”", postNoTarget: "{a} fez uma nova publicação",
      reaction: "{a} reagiu a “{t}”", reactionNoTarget: "{a} reagiu à sua publicação",
      friendRequest: "{a} enviou um pedido de amizade", dmRequest: "{a} enviou um pedido de mensagem", dm: "{a} enviou uma mensagem",
      official: "{a} publicou a notícia “{t}”", officialNoTarget: "{a} publicou uma notícia",
    },
  },
  fr: {
    title: "Notifications", readAll: "Tout marquer comme lu", settings: "Réglages des notifications", close: "Fermer", filter: "Type de notification",
    chips: { all: "Tout", favorite: "Favori", stamp: "Tampons et points", friend: "Amis", system: "Système" },
    today: "Aujourd’hui", empty: "Aucune notification pour l’instant.", chipEmpty: "Aucune notification de ce type.", loadError: "Impossible de charger les notifications.", retry: "Réessayer", readFailed: "Impossible de marquer comme lu",
    action: "Remplir", expand: "Déplier", collapse: "Replier", unread: (n) => `Non lues ${n}`, signIn: "Connectez-vous pour voir vos notifications ici.", more: "Voir plus",
    stampBundle: (n) => `${n} tampons ont été délivrés`, bundle: (t, n) => `${t} et ${n} autres`,
    said: {
      reply: "{a} a commenté « {t} »", replyNoTarget: "{a} a commenté votre publication",
      post: "{a} a publié « {t} »", postNoTarget: "{a} a publié un nouveau message",
      reaction: "{a} a réagi à « {t} »", reactionNoTarget: "{a} a réagi à votre publication",
      friendRequest: "{a} vous a envoyé une demande d’ami", dmRequest: "{a} vous a envoyé une demande de message", dm: "{a} vous a envoyé un message",
      official: "{a} a publié l’actualité « {t} »", officialNoTarget: "{a} a publié une actualité",
    },
  },
  ru: {
    title: "Уведомления", readAll: "Прочитать все", settings: "Настройки уведомлений", close: "Закрыть", filter: "Тип уведомлений",
    chips: { all: "Все", favorite: "Фаворит", stamp: "Штампы и баллы", friend: "Друзья", system: "Система" },
    today: "Сегодня", empty: "Уведомлений пока нет.", chipEmpty: "Уведомлений этого типа нет.", loadError: "Не удалось загрузить уведомления.", retry: "Повторить", readFailed: "Не удалось отметить как прочитанное",
    action: "Заполнить", expand: "Развернуть", collapse: "Свернуть", unread: (n) => `Непрочитанные ${n}`, signIn: "Войдите, чтобы видеть здесь уведомления.", more: "Показать ещё",
    stampBundle: (n) => `Выдано штампов: ${n}`, bundle: (t, n) => `${t} и ещё ${n}`,
    said: {
      reply: "{a} оставил(а) комментарий к «{t}»", replyNoTarget: "{a} оставил(а) комментарий к вашему посту",
      post: "{a} опубликовал(а) «{t}»", postNoTarget: "{a} опубликовал(а) новый пост",
      reaction: "{a} отреагировал(а) на «{t}»", reactionNoTarget: "{a} отреагировал(а) на ваш пост",
      friendRequest: "{a} отправил(а) запрос в друзья", dmRequest: "{a} отправил(а) запрос на переписку", dm: "{a} отправил(а) вам сообщение",
      official: "{a} опубликовал(а) новость «{t}»", officialNoTarget: "{a} опубликовал(а) новость",
    },
  },
};

export const inboxCopy = (locale: AppLocale): Copy => copy[locale] ?? copy.en;

const sentenceKey: Partial<Record<NotificationItem["kind"], [keyof Copy["said"], keyof Copy["said"] | null]>> = {
  content_reply: ["reply", "replyNoTarget"],
  artist_comment: ["reply", "replyNoTarget"],
  friend_post: ["post", "postNoTarget"],
  friend_reaction: ["reaction", "reactionNoTarget"],
  official_post: ["official", "officialNoTarget"],
  fan_friend_request: ["friendRequest", null],
  fan_dm_request: ["dmRequest", null],
  fan_dm_message: ["dm", null],
};

/** 주체가 있는 종류의 1줄 문장. 주체가 없거나(차단·익명·사람 없는 종류) 템플릿이 없으면 null → 서버 제목을 쓴다. */
export function actorSentence(locale: AppLocale, kind: NotificationItem["kind"], actor: string | null | undefined, target: string | null) {
  const keys = sentenceKey[kind];
  if (!keys || !actor) return null;
  const said = inboxCopy(locale).said;
  const template = target || !keys[1] ? said[keys[0]] : said[keys[1]];
  return template.replace("{a}", actor).replace("{t}", target ?? "");
}
