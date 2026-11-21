import type { AppLocale } from "@/i18n/locales";

const words: Record<AppLocale, string> = {
  ko: "끌림|편안함|대화|부딪칠 때|잔잔해요|보통이에요|강한 편이에요|가장 강한 연결|해|달|수성|금성|화성|네 가지로 보면|누구와 볼까요?|{name}와 보기|오늘 무료 1번",
  en: "Attraction|Comfort|Conversation|Friction|Subtle|Moderate|Strong|Closest aspects|Sun|Moon|Mercury|Venus|Mars|Four ways to look|Who is it with?|See with {name}|1 free today",
  ja: "惹かれ合い|安心感|会話|衝突|穏やか|ほどほど|強め|主なアスペクト|太陽|月|水星|金星|火星|4つの見方|だれと見る?|{name}と見る|今日は1回無料",
  "zh-Hans": "吸引力|舒适感|沟通|摩擦|轻微|适中|较强|主要相位|太阳|月亮|水星|金星|火星|从四个方面看|想和谁看?|和{name}一起看|今日免费1次",
  "zh-Hant": "吸引力|舒適感|溝通|摩擦|輕微|適中|較強|主要相位|太陽|月亮|水星|金星|火星|從四個方面看|想和誰看?|和{name}一起看|今日免費1次",
  es: "Atracción|Comodidad|Conversación|Fricción|Leve|Moderada|Intensa|Aspectos principales|Sol|Luna|Mercurio|Venus|Marte|En cuatro claves|¿Con quién?|Ver con {name}|1 gratis hoy",
  fr: "Attirance|Aisance|Communication|Tension|Faible|Modérée|Forte|Aspects principaux|Soleil|Lune|Mercure|Vénus|Mars|En quatre points|Avec qui ?|Voir avec {name}|1 gratuit aujourd'hui",
  id: "Ketertarikan|Kenyamanan|Percakapan|Gesekan|Ringan|Sedang|Kuat|Aspek utama|Matahari|Bulan|Merkurius|Venus|Mars|Dari empat sisi|Dengan siapa?|Lihat dengan {name}|1 gratis hari ini",
  pt: "Atração|Conforto|Conversa|Atrito|Leve|Moderado|Forte|Aspectos principais|Sol|Lua|Mercúrio|Vênus|Marte|Em quatro pontos|Com quem?|Ver com {name}|1 grátis hoje",
  ru: "Притяжение|Комфорт|Общение|Трение|Слабое|Умеренное|Сильное|Основные аспекты|Солнце|Луна|Меркурий|Венера|Марс|Четыре стороны|С кем смотреть?|Смотреть с {name}|1 бесплатно сегодня",
  th: "แรงดึงดูด|ความสบายใจ|การสื่อสาร|ความขัดแย้ง|เล็กน้อย|ปานกลาง|เด่นชัด|มุมสัมพันธ์หลัก|อาทิตย์|จันทร์|พุธ|ศุกร์|อังคาร|มองสี่ด้าน|ดูกับใคร?|ดูกับ {name}|วันนี้ฟรี 1 ครั้ง",
  vi: "Sức hút|Sự thoải mái|Trò chuyện|Xung đột|Nhẹ|Vừa phải|Mạnh|Các góc chính|Mặt Trời|Mặt Trăng|Sao Thủy|Sao Kim|Sao Hỏa|Bốn góc nhìn|Xem với ai?|Xem với {name}|Hôm nay miễn phí 1 lần",
};

export function matchCopy(locale: AppLocale) {
  const labels = words[locale].split("|");
  const planets = Object.fromEntries(["Sun", "Moon", "Mercury", "Venus", "Mars"].map((body, i) => [body, labels[i + 8]]));
  return {
    domains: labels.slice(0, 4),
    strengths: labels.slice(4, 7),
    aspects: labels[7],
    planets,
    fourWays: labels[13],
    who: labels[14],
    seeWith: (name: string) => labels[15].replace("{name}", name),
    freeToday: labels[16],
  };
}
