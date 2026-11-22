import { parseAppLocale, type AppLocale } from "@/i18n/locales";

/** 추가 판 문구 한 벌(짝 맞추기·최애 런 공통). 추가 판 수는 두 게임 모두 '남은 수'로 적는다(사용자 11/22 23:04). */
const keys = ["title", "points", "left", "count", "confirm", "cancel", "close", "short", "earn", "cta", "allUsed", "myEmpty"] as const;
export type ExtraPlayCopy = Record<(typeof keys)[number], string>;

const table: Record<AppLocale, readonly string[]> = {
  ko: ["{cost}P로 한 판 더", "포인트", "남은 추가 판", "{n}번", "{cost}P 쓰고 시작", "그만하기", "닫기", "포인트가 {n}P 모자라요", "덕질 미션에서 모으기",
    "{cost}P로 한 판 더", "오늘 추가 판 3번을 모두 썼어요", "내 기록은 아직 없어요."],
  en: ["1 more game for {cost}P", "Points", "Extra games left", "{n}", "Spend {cost}P and start", "Not now", "Close", "You're {n}P short", "Earn points in fan missions",
    "1 more game for {cost}P", "You've used all 3 extra games today", "You have no score yet."],
  ja: ["{cost}Pでもう1回", "ポイント", "残りの追加回数", "{n}回", "{cost}P使って始める", "やめる", "閉じる", "{n}P足りません", "推し活ミッションで貯める",
    "{cost}Pでもう1回", "今日の追加3回を使い切りました", "まだ自分の記録がありません。"],
  "zh-Hans": ["花{cost}P再玩1局", "积分", "剩余追加次数", "{n}次", "花{cost}P开始", "算了", "关闭", "还差{n}P", "通过应援任务攒积分",
    "花{cost}P再玩1局", "今天的3次追加已用完", "你还没有成绩。"],
  "zh-Hant": ["花{cost}P再玩1局", "點數", "剩餘追加次數", "{n}次", "花{cost}P開始", "算了", "關閉", "還差{n}P", "透過應援任務累積點數",
    "花{cost}P再玩1局", "今天的3次追加已用完", "你還沒有成績。"],
  es: ["1 partida más por {cost}P", "Puntos", "Partidas extra restantes", "{n}", "Usar {cost}P y empezar", "Ahora no", "Cerrar", "Te faltan {n}P", "Gana puntos en misiones de fan",
    "1 partida más por {cost}P", "Ya usaste las 3 partidas extra de hoy", "Aún no tienes puntuación."],
  id: ["1 permainan lagi dengan {cost}P", "Poin", "Sisa permainan tambahan", "{n}", "Pakai {cost}P dan mulai", "Nanti saja", "Tutup", "Poinmu kurang {n}P", "Kumpulkan poin di misi fan",
    "1 permainan lagi dengan {cost}P", "3 permainan tambahan hari ini sudah habis", "Kamu belum punya skor."],
  vi: ["Thêm 1 ván với {cost}P", "Điểm", "Lượt chơi thêm còn lại", "{n}", "Dùng {cost}P và bắt đầu", "Để sau", "Đóng", "Bạn còn thiếu {n}P", "Kiếm điểm trong nhiệm vụ fan",
    "Thêm 1 ván với {cost}P", "Bạn đã dùng hết 3 lượt chơi thêm hôm nay", "Bạn chưa có thành tích."],
  th: ["เล่นอีก 1 รอบด้วย {cost}P", "พอยต์", "รอบเพิ่มที่เหลือ", "{n} รอบ", "ใช้ {cost}P แล้วเริ่ม", "ไว้ก่อน", "ปิด", "พอยต์ยังขาด {n}P", "สะสมพอยต์จากภารกิจแฟน",
    "เล่นอีก 1 รอบด้วย {cost}P", "วันนี้ใช้รอบเพิ่มครบ 3 รอบแล้ว", "คุณยังไม่มีสถิติ"],
  pt: ["Mais 1 partida por {cost}P", "Pontos", "Partidas extras restantes", "{n}", "Usar {cost}P e começar", "Agora não", "Fechar", "Faltam {n}P", "Ganhe pontos nas missões de fã",
    "Mais 1 partida por {cost}P", "Você usou as 3 partidas extras de hoje", "Você ainda não tem pontuação."],
  fr: ["1 partie de plus pour {cost}P", "Points", "Parties bonus restantes", "{n}", "Utiliser {cost}P et commencer", "Pas maintenant", "Fermer", "Il vous manque {n}P", "Gagnez des points dans les missions fan",
    "1 partie de plus pour {cost}P", "Vous avez utilisé les 3 parties bonus du jour", "Vous n'avez pas encore de score."],
  ru: ["Ещё 1 игра за {cost}P", "Баллы", "Осталось доп. игр", "{n}", "Потратить {cost}P и начать", "Не сейчас", "Закрыть", "Не хватает {n}P", "Собирайте баллы в фан-миссиях",
    "Ещё 1 игра за {cost}P", "Все 3 доп. игры на сегодня использованы", "У вас пока нет результата."],
};

export function getExtraPlayCopy(locale: string, cost = 0): ExtraPlayCopy {
  const row = table[parseAppLocale(locale)];
  return Object.fromEntries(keys.map((key, index) => [key, row[index].replaceAll("{cost}", String(cost))])) as ExtraPlayCopy;
}

export function fillCount(pattern: string, n: number) {
  return pattern.replaceAll("{n}", String(n));
}
