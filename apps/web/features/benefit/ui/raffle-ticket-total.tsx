import { FanText } from "@/components/fan-ui/fan-text";
import type { AppLocale } from "@/i18n/locales";

const labels: Record<AppLocale, string> = {
  ko: "이 추첨 누적 응모권 {n}장", en: "Total tickets entered in this draw: {n}",
  ja: "この抽選の累計応募券数 {n}枚", "zh-Hans": "本次抽奖累计投入 {n} 张抽奖券",
  "zh-Hant": "本次抽獎累計投入 {n} 張抽獎券", es: "Boletos usados en este sorteo: {n}",
  id: "Total tiket yang digunakan dalam undian ini: {n}", vi: "Tổng số vé đã dùng cho lượt rút thăm này: {n}",
  th: "บัตรที่ใช้ร่วมการจับรางวัลนี้ทั้งหมด {n} ใบ", pt: "Total de bilhetes usados neste sorteio: {n}",
  fr: "Total des tickets utilisés pour ce tirage : {n}", ru: "Всего билетов в этом розыгрыше: {n}",
  mn: "Энэ сугалаанд ашигласан нийт тасалбар: {n}",
};

export function RaffleTicketTotal({ locale, count }: { locale: AppLocale; count?: number | null }) {
  return count == null ? null : <FanText as="div" role="meta">{labels[locale].replace("{n}", count.toLocaleString(locale))}</FanText>;
}
