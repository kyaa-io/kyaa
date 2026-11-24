import { parseAppLocale, type AppLocale } from "@/i18n/locales";

/** 성장 방에서 미니 최애가 반응할 때 하는 말. 최애는 돈·한도·오류 이야기를 하지 않는다(K-2d0844). */
export type RoomLines = {
  tap: readonly [string, string, string];
  pet: string;
  dizzy: string;
  cat: string;
  tea: string;
  lamp: string;
};

const lines = {
  "ko": {
    tap: ["앗, 간지러워.", "불렀어?", "오늘 뭐 했어?"],
    pet: "헤헤, 좀 더 해 줘.",
    dizzy: "어지러워… 살살 눌러 줘.",
    cat: "쉿, 냥이 자는 중이야.",
    tea: "차 식기 전에 같이 마시자.",
    lamp: "불 켜 두니까 아늑하다.",
  },
  get mn() { return this.en; },
  "en": {
    tap: ["Hey, that tickles.", "You called?", "What did you do today?"],
    pet: "Hehe, a little more.",
    dizzy: "So dizzy… gently, please.",
    cat: "Shh, the kitty's asleep.",
    tea: "Let's drink it before it gets cold.",
    lamp: "It's cozy with the lamp on.",
  },
  "ja": {
    tap: ["わっ、くすぐったい。", "呼んだ？", "今日は何してた？"],
    pet: "えへへ、もうちょっと。",
    dizzy: "目が回る…やさしく押してね。",
    cat: "しーっ、ねこが寝てるよ。",
    tea: "冷めないうちに一緒に飲もう。",
    lamp: "明かりをつけると落ち着くね。",
  },
  "zh-Hans": {
    tap: ["哎呀，好痒。", "叫我吗？", "今天做了什么？"],
    pet: "嘿嘿，再摸摸。",
    dizzy: "好晕……轻一点嘛。",
    cat: "嘘，小猫在睡觉。",
    tea: "趁茶还热一起喝吧。",
    lamp: "开着灯好温馨。",
  },
  "zh-Hant": {
    tap: ["哎呀，好癢。", "叫我嗎？", "今天做了什麼？"],
    pet: "嘿嘿，再摸摸。",
    dizzy: "好暈……輕一點嘛。",
    cat: "噓，小貓在睡覺。",
    tea: "趁茶還熱一起喝吧。",
    lamp: "開著燈好溫馨。",
  },
  "es": {
    tap: ["Ay, me haces cosquillas.", "¿Me llamaste?", "¿Qué hiciste hoy?"],
    pet: "Jeje, un poquito más.",
    dizzy: "Qué mareo… más suave.",
    cat: "Shh, el gatito está dormido.",
    tea: "Tomémoslo antes de que se enfríe.",
    lamp: "Con la lámpara encendida está acogedor.",
  },
  "id": {
    tap: ["Aduh, geli.", "Kamu panggil aku?", "Hari ini ngapain aja?"],
    pet: "Hehe, lagi dong.",
    dizzy: "Pusing… pelan-pelan ya.",
    cat: "Sst, kucingnya lagi tidur.",
    tea: "Ayo minum sebelum dingin.",
    lamp: "Lampunya nyala, jadi nyaman.",
  },
  "vi": {
    tap: ["Ái, nhột quá.", "Gọi mình hả?", "Hôm nay bạn làm gì?"],
    pet: "Hì hì, thêm chút nữa.",
    dizzy: "Chóng mặt quá… nhẹ thôi.",
    cat: "Suỵt, mèo đang ngủ.",
    tea: "Uống cùng nhau trước khi trà nguội nhé.",
    lamp: "Bật đèn lên thấy ấm cúng ghê.",
  },
  "th": {
    tap: ["อุ๊ย จั๊กจี้", "เรียกเหรอ?", "วันนี้ทำอะไรมา?"],
    pet: "ฮิฮิ อีกนิดนะ",
    dizzy: "เวียนหัว… เบา ๆ หน่อย",
    cat: "ชู่ว์ แมวกำลังหลับ",
    tea: "ดื่มด้วยกันก่อนชาจะเย็นนะ",
    lamp: "เปิดไฟแล้วอบอุ่นดี",
  },
  "pt": {
    tap: ["Ai, faz cócegas.", "Me chamou?", "O que você fez hoje?"],
    pet: "Hehe, só mais um pouco.",
    dizzy: "Que tontura… com carinho.",
    cat: "Shh, o gatinho está dormindo.",
    tea: "Vamos tomar antes que esfrie.",
    lamp: "Com a luz acesa fica aconchegante.",
  },
  "fr": {
    tap: ["Aïe, ça chatouille.", "Tu m'as appelé ?", "Qu'as-tu fait aujourd'hui ?"],
    pet: "Héhé, encore un peu.",
    dizzy: "J'ai la tête qui tourne… doucement.",
    cat: "Chut, le chaton dort.",
    tea: "Buvons-le avant qu'il refroidisse.",
    lamp: "C'est douillet avec la lampe allumée.",
  },
  "ru": {
    tap: ["Ой, щекотно.", "Звал?", "Что ты сегодня делал?"],
    pet: "Хи-хи, ещё чуть-чуть.",
    dizzy: "Голова кружится… понежнее.",
    cat: "Тсс, котик спит.",
    tea: "Давай выпьем, пока не остыл.",
    lamp: "С лампой так уютно.",
  },
} satisfies Record<AppLocale, RoomLines>;

/**
 * 엘리나는 한국어에서 반존대다(K-3729a7): 기본 부드러운 존댓말, 일부만 반말.
 * 방의 첫 대사(단계별)도 같은 말투로 바꾼다.
 */
const elinaKo = {
  tap: ["앗, 간지러워요.", "불렀어요?", "오늘 뭐 했어요?"],
  pet: "헤헤, 조금만 더 해 줄래?",
  dizzy: "어지러워요… 살살 눌러 줘요.",
  cat: "쉿, 냥이 자는 중이에요.",
  tea: "차 식기 전에 같이 마셔요.",
  lamp: "불 켜 두니까 아늑하지?",
  lineBaby: "여기가 우리 집이에요?",
  lineKid: "저 키 컸죠? 다 덕분이에요.",
  lineStar: "오늘 무대도 지켜봐 줘요.",
  lineWait: "저 키워 줄 사람 없나?",
} as const;

export type StageLineKey = "lineBaby" | "lineKid" | "lineStar" | "lineWait";

export function getRoomLines(locale: string, character: string): RoomLines & Partial<Record<StageLineKey, string>> {
  const parsed = parseAppLocale(locale);
  if (parsed === "ko" && character === "elina") return elinaKo;
  return lines[parsed];
}
