import type { AppLocale } from "@/i18n/locales";

const keys = ["soon", "open", "perDraw", "tickets", "prizes", "remaining", "myTickets", "won", "noPrize", "tenWon", "tally", "claim", "close", "again", "skip", "rare"] as const;
type Key = typeof keys[number];
// {n}: a number, {name}: a prize name.
const values: Record<AppLocale, readonly string[]> = {
  ko: ["준비 중", "진행 중", "1회", "응모권 {n}장", "{n}개", "남은 경품", "내 응모권", "{name} 당첨", "이번에는 당첨되지 않았어요.", "10회 중 {n}개 당첨", "{name} {n}개", "수령 방법 확인", "닫기", "한 번 더 뽑기", "결과 바로 보기", "레어"],
  en: ["Coming soon", "Open", "Per draw", "{n} tickets", "{n}", "Prizes left", "My tickets", "You won {name}", "No prize this time.", "{n} of 10 won", "{name} ×{n}", "How to claim", "Close", "Draw again", "Skip to results", "Rare"],
  ja: ["準備中", "開催中", "1回", "応募券{n}枚", "{n}個", "残りの賞品", "自分の応募券", "{name}が当選", "今回ははずれでした。", "10回中{n}個当選", "{name} {n}個", "受け取り方法を確認", "閉じる", "もう一度引く", "結果をすぐ見る", "レア"],
  "zh-Hans": ["准备中", "进行中", "每次", "{n}张抽奖券", "{n}个", "剩余奖品", "我的抽奖券", "抽中{name}", "这次没有中奖。", "10次中{n}个中奖", "{name} {n}个", "查看领取方式", "关闭", "再抽一次", "直接查看结果", "稀有"],
  "zh-Hant": ["準備中", "進行中", "每次", "{n}張抽獎券", "{n}個", "剩餘獎品", "我的抽獎券", "抽中{name}", "這次沒有中獎。", "10次中{n}個中獎", "{name} {n}個", "查看領取方式", "關閉", "再抽一次", "直接查看結果", "稀有"],
  es: ["Próximamente", "Abierto", "Por tirada", "{n} boletos", "{n}", "Premios restantes", "Mis boletos", "Ganaste {name}", "Esta vez no hubo premio.", "{n} de 10 con premio", "{name} ×{n}", "Cómo recibirlo", "Cerrar", "Sacar otra", "Ver resultados", "Raro"],
  id: ["Segera", "Berlangsung", "Per undian", "{n} tiket", "{n}", "Sisa hadiah", "Tiket saya", "Anda menang {name}", "Kali ini tidak menang.", "{n} dari 10 menang", "{name} ×{n}", "Cara klaim", "Tutup", "Undi lagi", "Langsung lihat hasil", "Langka"],
  vi: ["Sắp mở", "Đang diễn ra", "Mỗi lần", "{n} vé", "{n}", "Phần thưởng còn lại", "Vé của tôi", "Bạn trúng {name}", "Lần này chưa trúng.", "Trúng {n}/10", "{name} ×{n}", "Cách nhận", "Đóng", "Rút lần nữa", "Xem ngay kết quả", "Hiếm"],
  th: ["เร็ว ๆ นี้", "กำลังเปิด", "ต่อครั้ง", "ตั๋ว {n} ใบ", "{n} ชิ้น", "รางวัลคงเหลือ", "ตั๋วของฉัน", "ได้รับ {name}", "ครั้งนี้ไม่ถูกรางวัล", "ถูกรางวัล {n} จาก 10", "{name} {n} ชิ้น", "ดูวิธีรับรางวัล", "ปิด", "สุ่มอีกครั้ง", "ดูผลทันที", "แรร์"],
  pt: ["Em breve", "Aberto", "Por sorteio", "{n} bilhetes", "{n}", "Prêmios restantes", "Meus bilhetes", "Você ganhou {name}", "Desta vez sem prêmio.", "{n} de 10 premiados", "{name} ×{n}", "Como receber", "Fechar", "Sortear de novo", "Ver resultados", "Raro"],
  fr: ["Bientôt", "En cours", "Par tirage", "{n} tickets", "{n}", "Lots restants", "Mes tickets", "Vous gagnez {name}", "Pas de lot cette fois.", "{n} sur 10 gagnants", "{name} ×{n}", "Comment le recevoir", "Fermer", "Tirer à nouveau", "Voir les résultats", "Rare"],
  ru: ["Скоро", "Идёт", "За раз", "{n} билет.", "{n} шт.", "Осталось призов", "Мои билеты", "Ваш приз: {name}", "В этот раз без приза.", "Выигрыш: {n} из 10", "{name} ×{n}", "Как получить", "Закрыть", "Ещё раз", "Сразу к результатам", "Редкий"],
};

export function capsuleMachineCopy(locale: AppLocale) {
  const row = values[locale];
  const text = (key: Key) => row[keys.indexOf(key)]!;
  const fill = (key: Key, vars: { n?: number; name?: string }) => text(key).replace("{n}", vars.n === undefined ? "" : vars.n.toLocaleString(locale)).replace("{name}", vars.name ?? "");
  return { text, fill };
}
