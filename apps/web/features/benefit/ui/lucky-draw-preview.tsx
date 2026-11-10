"use client";
import { createContext, useContext, type ReactNode } from "react";
import type { AppLocale } from "@/i18n/locales";

const LuckyDrawPreviewContext = createContext(false);
export function LuckyDrawPreviewProvider({ preview, children }: { preview: boolean; children: ReactNode }) {
  return <LuckyDrawPreviewContext.Provider value={preview}>{children}</LuckyDrawPreviewContext.Provider>;
}
export function useLuckyDrawPreview() { return useContext(LuckyDrawPreviewContext); }

type Copy = Record<AppLocale, string>;
const title = {
  ko: "미리보기 화면입니다", en: "This is a preview", ja: "プレビュー画面です", "zh-Hans": "这是预览页面", "zh-Hant": "這是預覽頁面", es: "Esta es una vista previa",
  id: "Ini adalah tampilan pratinjau", vi: "Đây là màn hình xem trước", th: "นี่คือหน้าตัวอย่าง", pt: "Esta é uma tela de prévia", fr: "Ceci est un aperçu", ru: "Это экран предпросмотра",
} satisfies Copy;
const enter = {
  ko: "응모하기", en: "Enter", ja: "応募する", "zh-Hans": "参与抽奖", "zh-Hant": "參加抽獎", es: "Participar",
  id: "Ikut serta", vi: "Tham gia", th: "ร่วมลุ้นรางวัล", pt: "Participar", fr: "Participer", ru: "Участвовать",
} satisfies Copy;
const steps = [
  { title: {
      ko: "참여", en: "Enter", ja: "参加", "zh-Hans": "参与", "zh-Hant": "參與", es: "Participar", id: "Ikut", vi: "Tham gia", th: "ร่วม", pt: "Participar", fr: "Participer", ru: "Участие",
    } satisfies Copy,
    body: {
      ko: "응모권으로 선물에 응모해요.", en: "Use tickets to enter for the gift.", ja: "応募券でプレゼントに応募します。", "zh-Hans": "用抽奖券参与礼物抽奖。", "zh-Hant": "用抽獎券參加禮物抽獎。",
      es: "Usa tus entradas para participar por el regalo.", id: "Gunakan tiket untuk ikut serta mendapatkan hadiah.", vi: "Dùng vé để tham gia nhận quà.", th: "ใช้ตั๋วเพื่อร่วมลุ้นของขวัญ",
      pt: "Use ingressos para participar do presente.", fr: "Utilisez des tickets pour participer au cadeau.", ru: "Участвуйте в розыгрыше подарка с помощью билетов.",
    } satisfies Copy },
  { title: {
      ko: "추첨", en: "Draw", ja: "抽選", "zh-Hans": "抽签", "zh-Hant": "抽籤", es: "Sorteo", id: "Undian", vi: "Rút thăm", th: "จับรางวัล", pt: "Sorteio", fr: "Tirage", ru: "Розыгрыш",
    } satisfies Copy,
    body: {
      ko: "응모 기간이 끝나면 당첨자를 뽑아요.", en: "Winners are drawn when the entry period ends.", ja: "応募期間が終わると当選者を抽選します。", "zh-Hans": "参与期结束后抽取中奖者。", "zh-Hant": "參與期結束後抽取中獎者。",
      es: "Los ganadores se sortean al terminar el periodo de participación.", id: "Pemenang diundi setelah masa partisipasi berakhir.", vi: "Người trúng thưởng được rút khi hết thời gian tham gia.", th: "จับรางวัลเมื่อหมดช่วงเวลาร่วมลุ้น",
      pt: "Os vencedores são sorteados quando o período de participação termina.", fr: "Les gagnants sont tirés à la fin de la période de participation.", ru: "Победители определяются после окончания приёма заявок.",
    } satisfies Copy },
  { title: {
      ko: "발표", en: "Result", ja: "発表", "zh-Hans": "公布", "zh-Hant": "公布", es: "Resultado", id: "Pengumuman", vi: "Công bố", th: "ประกาศผล", pt: "Resultado", fr: "Résultat", ru: "Итоги",
    } satisfies Copy,
    body: {
      ko: "결과는 내 응모 내역에서 확인해요.", en: "Check the result in your entries.", ja: "結果は応募履歴で確認できます。", "zh-Hans": "在我的参与记录中查看结果。", "zh-Hant": "在我的參與記錄中查看結果。",
      es: "Consulta el resultado en tus participaciones.", id: "Lihat hasilnya di riwayat partisipasimu.", vi: "Xem kết quả trong lịch sử tham gia của bạn.", th: "ดูผลในประวัติการร่วมลุ้นของคุณ",
      pt: "Veja o resultado nas suas participações.", fr: "Consultez le résultat dans vos participations.", ru: "Результат смотрите в своих заявках.",
    } satisfies Copy },
] as const;

export const luckyDrawPreviewCopy = (locale: AppLocale) => ({
  title: title[locale], enter: enter[locale], steps: steps.map((step) => ({ title: step.title[locale], body: step.body[locale] })),
});
