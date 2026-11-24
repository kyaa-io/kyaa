import { parseAppLocale, type AppLocale } from "@/i18n/locales";

/** 추가 판 문구 한 벌(짝 맞추기·최애 런 공통). 추가 판 수는 두 게임 모두 '남은 수'로 적는다(사용자 11/22 23:04). */
const keys = ["title", "points", "left", "count", "confirm", "cancel", "close", "short", "earn", "cta", "allUsed", "myEmpty"] as const;
export type ExtraPlayCopy = Record<(typeof keys)[number], string>;

const pointsTable: Record<AppLocale, readonly string[]> = {
  ko: ["{cost}P로 한 판 더", "포인트", "남은 추가 판", "{n}번", "{cost}P 쓰고 시작", "그만하기", "닫기", "포인트가 {n}P 모자라요", "덕질 미션에서 모으기",
    "{cost}P로 한 판 더", "오늘 추가 판 3번을 모두 썼어요", "내 기록은 아직 없어요."],
  mn: ["{cost}P-ээр 1 тоглолт нэмэх", "Оноо", "Үлдсэн нэмэлт тоглолт", "{n}", "{cost}P зарцуулаад эхлэх", "Одоо биш", "Хаах", "{n}P дутуу байна", "Фэн даалгавраас оноо цуглуулах",
    "{cost}P-ээр 1 тоглолт нэмэх", "Өнөөдрийн 3 нэмэлт тоглолтоо бүгдийг ашигласан", "Танд одоогоор оноо алга."],
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

const mileageTable: Record<AppLocale, readonly string[]> = {
  ko: ["{cost}M로 한 판 더", "마일리지", "남은 추가 판", "{n}번", "{cost}M 쓰고 시작", "그만하기", "닫기", "마일리지가 {n}M 모자라요", "덕질 미션에서 모으기",
    "{cost}M로 한 판 더", "오늘 추가 판 3번을 모두 썼어요", "내 기록은 아직 없어요."],
  mn: ["{cost}M-ээр дахин тоглох", "Миль", "Үлдсэн нэмэлт тоглолт", "{n}", "{cost}M зарцуулж эхлэх", "Болих", "Хаах", "{n}M дутуу байна", "Фэний даалгавраар миль цуглуулах",
    "{cost}M-ээр дахин тоглох", "Өнөөдрийн 3 нэмэлт тоглолтоо ашигласан", "Одоогоор оноо байхгүй."],
  en: ["1 more game for {cost}M", "Mileage", "Extra games left", "{n}", "Spend {cost}M and start", "Not now", "Close", "You're {n}M short", "Earn mileage in fan missions",
    "1 more game for {cost}M", "You've used all 3 extra games today", "You have no score yet."],
  ja: ["{cost}Mでもう1回", "マイル", "残りの追加回数", "{n}回", "{cost}M使って始める", "やめる", "閉じる", "{n}M足りません", "推し活ミッションで貯める",
    "{cost}Mでもう1回", "今日の追加3回を使い切りました", "まだ自分の記録がありません。"],
  "zh-Hans": ["花{cost}M再玩1局", "里程", "剩余追加次数", "{n}次", "花{cost}M开始", "算了", "关闭", "还差{n}M", "通过应援任务攒里程",
    "花{cost}M再玩1局", "今天的3次追加已用完", "你还没有成绩。"],
  "zh-Hant": ["花{cost}M再玩1局", "里程", "剩餘追加次數", "{n}次", "花{cost}M開始", "算了", "關閉", "還差{n}M", "透過應援任務累積里程",
    "花{cost}M再玩1局", "今天的3次追加已用完", "你還沒有成績。"],
  es: ["1 partida más por {cost}M", "Millas", "Partidas extra restantes", "{n}", "Usar {cost}M y empezar", "Ahora no", "Cerrar", "Te faltan {n}M", "Gana millas en misiones de fan",
    "1 partida más por {cost}M", "Ya usaste las 3 partidas extra de hoy", "Aún no tienes puntuación."],
  id: ["1 permainan lagi dengan {cost}M", "Mileage", "Sisa permainan tambahan", "{n}", "Pakai {cost}M dan mulai", "Nanti saja", "Tutup", "Mileage kamu kurang {n}M", "Kumpulkan mileage di misi fan",
    "1 permainan lagi dengan {cost}M", "3 permainan tambahan hari ini sudah habis", "Kamu belum punya skor."],
  vi: ["Thêm 1 ván với {cost}M", "Dặm", "Lượt chơi thêm còn lại", "{n}", "Dùng {cost}M và bắt đầu", "Để sau", "Đóng", "Bạn còn thiếu {n}M", "Kiếm dặm trong nhiệm vụ fan",
    "Thêm 1 ván với {cost}M", "Bạn đã dùng hết 3 lượt chơi thêm hôm nay", "Bạn chưa có thành tích."],
  th: ["เล่นอีก 1 รอบด้วย {cost}M", "ไมล์", "รอบเพิ่มที่เหลือ", "{n} รอบ", "ใช้ {cost}M แล้วเริ่ม", "ไว้ก่อน", "ปิด", "ไมล์ยังขาด {n}M", "สะสมไมล์จากภารกิจแฟน",
    "เล่นอีก 1 รอบด้วย {cost}M", "วันนี้ใช้รอบเพิ่มครบ 3 รอบแล้ว", "คุณยังไม่มีสถิติ"],
  pt: ["Mais 1 partida por {cost}M", "Milhas", "Partidas extras restantes", "{n}", "Usar {cost}M e começar", "Agora não", "Fechar", "Faltam {n}M", "Ganhe milhas nas missões de fã",
    "Mais 1 partida por {cost}M", "Você usou as 3 partidas extras de hoje", "Você ainda não tem pontuação."],
  fr: ["1 partie de plus pour {cost}M", "Miles", "Parties bonus restantes", "{n}", "Utiliser {cost}M et commencer", "Pas maintenant", "Fermer", "Il vous manque {n}M", "Gagnez des miles dans les missions fan",
    "1 partie de plus pour {cost}M", "Vous avez utilisé les 3 parties bonus du jour", "Vous n'avez pas encore de score."],
  ru: ["Ещё 1 игра за {cost}M", "Мили", "Осталось доп. игр", "{n}", "Потратить {cost}M и начать", "Не сейчас", "Закрыть", "Не хватает {n}M", "Собирайте мили в фан-миссиях",
    "Ещё 1 игра за {cost}M", "Все 3 доп. игры на сегодня использованы", "У вас пока нет результата."],
};

export function extraGameUnit(cost: number) {
  return [10, 30, 50, 100].includes(cost) ? "M" : "P";
}

export function getExtraPlayCopy(locale: string, cost = 0, unit = extraGameUnit(cost)): ExtraPlayCopy {
  const row = (unit === "M" ? mileageTable : pointsTable)[parseAppLocale(locale)];
  return Object.fromEntries(keys.map((key, index) => [key, row[index].replaceAll("{cost}", String(cost))])) as ExtraPlayCopy;
}

export function fillCount(pattern: string, n: number) {
  return pattern.replaceAll("{n}", String(n));
}
