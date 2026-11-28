import type { AppLocale } from "../locales";

/**
 * 응모 직후 '오늘 기회 늘리기' 3단계 카드와 '내일 다시 오면'(GROWTH-ONBOARD-RETAIN-1128), 앱 안 브라우저 응모 안내.
 * 13개 언어를 모두 직접 쓴다(래플 긴 문구 표는 ko·en만 있어 다른 언어는 영어로 보였다). 확률 숫자(+1·+3)는 언어와 상관없어 화면에서 붙인다.
 */
export const raffleNextStepsKeys = ["title", "pick", "pickDo", "attend", "attendDo", "invite", "inviteDo", "done", "tomorrow", "streak", "opens", "inApp", "copyLink", "copied"] as const;
export type RaffleNextStepsKey = (typeof raffleNextStepsKeys)[number];
type Copy = Record<RaffleNextStepsKey, string>;

export const raffleNextSteps = {
  ko: { title: "오늘 기회 늘리기", pick: "최애 고르기", pickDo: "고르기", attend: "오늘 출석", attendDo: "출석", invite: "친구 초대", inviteDo: "초대", done: "완료", tomorrow: "내일 출석하면 +1", streak: "{n}일 연속 출석", opens: "{time} 열려요", inApp: "오른쪽 위 ··· → 브라우저에서 열기", copyLink: "링크 복사", copied: "링크를 복사했어요" },
  en: { title: "Boost your odds today", pick: "Pick your favorite", pickDo: "Pick", attend: "Check in today", attendDo: "Check in", invite: "Invite a friend", inviteDo: "Invite", done: "Done", tomorrow: "Check in tomorrow for +1", streak: "{n}-day streak", opens: "Opens {time}", inApp: "Tap ··· (top right) → Open in browser", copyLink: "Copy link", copied: "Link copied" },
  ja: { title: "今日の当選チャンスを増やそう", pick: "推しを選ぶ", pickDo: "選ぶ", attend: "今日の出席", attendDo: "出席", invite: "友達を招待", inviteDo: "招待", done: "完了", tomorrow: "明日出席すると +1", streak: "{n}日連続出席", opens: "{time}に開きます", inApp: "右上の ··· →「ブラウザで開く」", copyLink: "リンクをコピー", copied: "コピーしました" },
  "zh-Hans": { title: "今天增加中奖机会", pick: "选择你的本命", pickDo: "选择", attend: "今日签到", attendDo: "签到", invite: "邀请好友", inviteDo: "邀请", done: "已完成", tomorrow: "明天签到再 +1", streak: "连续签到 {n} 天", opens: "{time} 开启", inApp: "点右上角 ··· →“在浏览器中打开”", copyLink: "复制链接", copied: "已复制链接" },
  "zh-Hant": { title: "今天增加中獎機會", pick: "選擇你的本命", pickDo: "選擇", attend: "今日簽到", attendDo: "簽到", invite: "邀請好友", inviteDo: "邀請", done: "已完成", tomorrow: "明天簽到再 +1", streak: "連續簽到 {n} 天", opens: "{time} 開啟", inApp: "點右上角 ··· →「在瀏覽器中開啟」", copyLink: "複製連結", copied: "已複製連結" },
  es: { title: "Aumenta hoy tus probabilidades", pick: "Elige a tu favorito", pickDo: "Elegir", attend: "Check-in de hoy", attendDo: "Check-in", invite: "Invita a un amigo", inviteDo: "Invitar", done: "Hecho", tomorrow: "Haz check-in mañana: +1", streak: "Racha de {n} días", opens: "Se abre {time}", inApp: "Toca ··· (arriba a la derecha) → Abrir en el navegador", copyLink: "Copiar enlace", copied: "Enlace copiado" },
  id: { title: "Tambah peluangmu hari ini", pick: "Pilih bias-mu", pickDo: "Pilih", attend: "Check-in hari ini", attendDo: "Check-in", invite: "Ajak teman", inviteDo: "Ajak", done: "Selesai", tomorrow: "Check-in besok untuk +1", streak: "Beruntun {n} hari", opens: "Dibuka {time}", inApp: "Ketuk ··· (kanan atas) → Buka di browser", copyLink: "Salin tautan", copied: "Tautan disalin" },
  vi: { title: "Tăng cơ hội trúng hôm nay", pick: "Chọn thần tượng của bạn", pickDo: "Chọn", attend: "Điểm danh hôm nay", attendDo: "Điểm danh", invite: "Mời bạn bè", inviteDo: "Mời", done: "Xong", tomorrow: "Điểm danh ngày mai để +1", streak: "Chuỗi {n} ngày", opens: "Mở lúc {time}", inApp: "Chạm ··· (góc trên bên phải) → Mở bằng trình duyệt", copyLink: "Sao chép liên kết", copied: "Đã sao chép liên kết" },
  th: { title: "เพิ่มโอกาสถูกรางวัลวันนี้", pick: "เลือกศิลปินที่ชอบ", pickDo: "เลือก", attend: "เช็กอินวันนี้", attendDo: "เช็กอิน", invite: "ชวนเพื่อน", inviteDo: "ชวน", done: "เสร็จแล้ว", tomorrow: "เช็กอินพรุ่งนี้รับ +1", streak: "ต่อเนื่อง {n} วัน", opens: "เปิด {time}", inApp: "แตะ ··· (มุมขวาบน) → เปิดในเบราว์เซอร์", copyLink: "คัดลอกลิงก์", copied: "คัดลอกลิงก์แล้ว" },
  pt: { title: "Aumente suas chances hoje", pick: "Escolha seu favorito", pickDo: "Escolher", attend: "Check-in de hoje", attendDo: "Check-in", invite: "Convide um amigo", inviteDo: "Convidar", done: "Feito", tomorrow: "Faça check-in amanhã: +1", streak: "Sequência de {n} dias", opens: "Abre {time}", inApp: "Toque em ··· (canto superior direito) → Abrir no navegador", copyLink: "Copiar link", copied: "Link copiado" },
  fr: { title: "Augmentez vos chances aujourd’hui", pick: "Choisissez votre favori", pickDo: "Choisir", attend: "Check-in du jour", attendDo: "Check-in", invite: "Invitez un ami", inviteDo: "Inviter", done: "Fait", tomorrow: "Check-in demain : +1", streak: "Série de {n} jours", opens: "Ouvre {time}", inApp: "Touchez ··· (en haut à droite) → Ouvrir dans le navigateur", copyLink: "Copier le lien", copied: "Lien copié" },
  ru: { title: "Повысьте шансы сегодня", pick: "Выберите любимого артиста", pickDo: "Выбрать", attend: "Отметка за сегодня", attendDo: "Отметиться", invite: "Пригласите друга", inviteDo: "Пригласить", done: "Готово", tomorrow: "Отметьтесь завтра: +1", streak: "Серия: {n} дн.", opens: "Откроется {time}", inApp: "Нажмите ··· (справа вверху) → Открыть в браузере", copyLink: "Копировать ссылку", copied: "Ссылка скопирована" },
  mn: { title: "Өнөөдөр боломжоо нэм", pick: "Дуртай уран бүтээлчээ сонгох", pickDo: "Сонгох", attend: "Өнөөдрийн ирц", attendDo: "Ирц", invite: "Найзаа урих", inviteDo: "Урих", done: "Болсон", tomorrow: "Маргааш ирц бүртгүүлбэл +1", streak: "{n} өдөр дараалсан", opens: "{time}-д нээгдэнэ", inApp: "Баруун дээд буланд ··· → Хөтөч дээр нээх", copyLink: "Холбоос хуулах", copied: "Холбоосыг хууллаа" },
} satisfies Record<AppLocale, Copy>;

export function raffleNextStepsText(locale: AppLocale, key: RaffleNextStepsKey, values: Record<string, string | number> = {}): string {
  return Object.entries(values).reduce((text, [name, value]) => text.replace(`{${name}}`, String(value)), raffleNextSteps[locale][key]);
}
