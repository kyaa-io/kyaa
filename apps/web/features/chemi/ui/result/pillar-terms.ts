const terms: Record<string, readonly [string, string]> = {
  시주: ["Hour", "Цаг"], "일주 · 나": ["Day · me", "Өдөр · би"], 월주: ["Month", "Сар"], 연주: ["Year", "Жил"],
  십신: ["Ten gods", "Арван шүтээн"], 천간: ["Stem", "Тэнгэрийн иш"], 지지: ["Branch", "Газрын мөчир"],
  지장간: ["Hidden stems", "Далд иш"], "12운성": ["Life stage", "Амьдралын үе"], "12신살": ["Spirit star", "Од"],
  일간: ["Day stem", "Өдрийн иш"], 비견: ["Peer", "Тэнцүү нөхөр"], 겁재: ["Rival", "Өрсөлдөгч"],
  식신: ["Eating god", "Хүнсний шүтээн"], 상관: ["Hurting officer", "Эрхийг сөрөгч"],
  편재: ["Indirect wealth", "Шууд бус баялаг"], 정재: ["Direct wealth", "Шууд баялаг"],
  편관: ["Seven killings", "Долоон сорилт"], 정관: ["Direct officer", "Шууд эрх мэдэл"],
  편인: ["Indirect resource", "Шууд бус түшиг"], 정인: ["Direct resource", "Шууд түшиг"],
  나무: ["Wood", "Мод"], 불: ["Fire", "Гал"], 흙: ["Earth", "Шороо"], 쇠: ["Metal", "Төмөр"], 물: ["Water", "Ус"],
};
export function pillarTerm(value: string, locale?: string) {
  if (locale !== "en" && locale !== "mn") return value;
  return terms[value]?.[locale === "en" ? 0 : 1] ?? value;
}
